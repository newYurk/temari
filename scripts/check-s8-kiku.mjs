import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Usage: node scripts/check-s8-kiku.mjs [baseUrl] [outDir] [stages]
const base = (process.argv[2] ?? 'http://127.0.0.1:4174/').replace(/\/?$/, '/');
const out = process.argv[3] ?? 'screenshots/s8-kiku-2026-09-16';
const stages = (process.argv[4] ?? 'stitch,round').split(',');
await mkdir(out, { recursive: true });
const setStep = (page, value) => page.locator('#s8-step').evaluate((input, v) => {
  input.value = String(v); input.dispatchEvent(new Event('input', { bubbles: true }));
}, value);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], report = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}lab.html#s8-kiku`);
  const view = page.locator('#s8-view');
  for (const stage of stages) {
    await page.locator(`#s8-stage-${stage}`).click();
    await page.locator(`#s8-view[data-stage="${stage}"][data-status]`).waitFor({ timeout: stage === 'row2' ? 3600000 : stage === 'round' ? 1800000 : 600000 });
    const status = await view.getAttribute('data-status');
    const levels = await page.locator('#s8-levels li').allTextContents();
    const windows = await page.locator('#s8-windows li').allTextContents();
    report[stage] = { status, statusText: await page.locator('#s8-status').innerText(), levels, windows };
    assert.equal(levels.length, stage === 'row2' ? 12 : 6, `${stage}: five ladder levels and the probe-density check per round are reported`);
    // The page must not claim acceptance that the computation did not report.
    if (status === 'accepted') assert.doesNotMatch(report[stage].statusText, /Не принято/);
    else assert.match(report[stage].statusText, /Не принято|не завершён/);
    for (const v of ['flower', 'lower', 'upper', 'side']) {
      await page.locator(`#s8-view-${v}`).click();
      assert.equal(await view.getAttribute('data-view'), v);
      await view.screenshot({ path: `${out}/${stage}-${v}.png` });
    }
    await page.locator('#s8-view-flower').click();
    // Stepping back hides later operations without recomputing the geometry.
    const all = Number(await view.getAttribute('data-shown-spans'));
    await setStep(page, 1);
    const first = Number(await view.getAttribute('data-shown-spans'));
    assert.ok(first > 0 && first < all, `${stage}: step 1 shows a prefix of the thread`);
    await view.screenshot({ path: `${out}/${stage}-step1.png` });
    const max = await page.locator('#s8-step').getAttribute('max');
    await setStep(page, max);
    assert.equal(Number(await view.getAttribute('data-shown-spans')), all);
    await page.locator('#s8-inside').check();
    await page.locator('#s8-view-lower').click();
    await view.screenshot({ path: `${out}/${stage}-lower-inside.png` });
    await page.locator('#s8-inside').uncheck();
    await page.locator('#s8-view-flower').click();
  }
  await page.locator('#s8-stage-stitch').click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
    await page.locator('#s8-kiku').screenshot({ path: `${out}/section-${width}.png` });
  }
  const broken = await page.locator('a[href^="#"]').evaluateAll(links => links.filter(a => a.hash.length > 1 && !document.getElementById(decodeURIComponent(a.hash.slice(1)))).map(a => a.hash));
  assert.deepEqual(broken, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ base, out, report, browserErrors: errors }, null, 1));
} finally { await browser.close(); }
