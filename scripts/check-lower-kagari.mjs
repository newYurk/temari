import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:4174/').replace(/\/?$/, '/');
const out = 'screenshots/lower-kagari-2026-09-16';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}lab.html#spatial-catch`);
  await page.locator('#spatial-view[data-status]').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('#spatial-view').getAttribute('data-reference-status'), 'passed');
  // Rejected refined geometry must never be silently replaced by the coarse passing path.
  assert.equal(await page.locator('#spatial-view').getAttribute('data-status'), 'rejected');
  assert.match(await page.locator('#spatial-status').innerText(), /не принята/);
  assert.equal(await page.locator('#spatial-labels text').count(), 2);
  await page.locator('#spatial-view').screenshot({ path: `${out}/reference-top.png` });
  await page.locator('#spatial-side').click();
  await page.locator('#spatial-view').screenshot({ path: `${out}/reference-side.png` });
  await page.locator('#spatial-inside').uncheck();
  await page.locator('#spatial-view').screenshot({ path: `${out}/reference-opaque.png` });
  await page.locator('#spatial-inside').check();
  await page.locator('#spatial-front').click();
  await page.locator('#spatial-after').click();
  assert.equal(await page.locator('#spatial-view').getAttribute('data-view'), 'computed');
  assert.equal(await page.locator('#spatial-after').getAttribute('aria-pressed'), 'true');
  await page.locator('#spatial-view').screenshot({ path: `${out}/rejected-top.png` });
  await page.locator('#spatial-before').click();
  assert.equal(await page.locator('#spatial-view').getAttribute('data-view'), 'reference');
  await page.locator('#spatial-contacts').uncheck();
  assert.equal(await page.locator('#spatial-labels text').count(), 0);
  await page.locator('#spatial-contacts').check();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
    await page.locator('#spatial-catch').screenshot({ path: `${out}/reference-${width}.png` });
  }
  await page.goto(`${base}design.html#lower-chidori`);
  assert.equal(await page.locator('#lower-chidori').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const broken = await page.locator('a[href^="#"]').evaluateAll(links => links.filter(a => a.hash.length > 1 && !document.getElementById(decodeURIComponent(a.hash.slice(1)))).map(a => a.hash));
  assert.deepEqual(broken, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ base, out, reference: 'passed', computed: 'rejected as required', browserErrors: errors }));
} finally { await browser.close(); }
