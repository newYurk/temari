import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const out = 'screenshots/taut-contact-2026-09-16';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}lab.html#contact-benchmark`);
  const contact = page.locator('#contact-benchmark');
  await page.locator('#sphere[data-step="16"]').waitFor();
  const c8 = await page.locator('#length-total').innerText();
  for (const scenario of ['one', 'two', 'three']) {
    await page.selectOption('#contact-supports', scenario);
    for (const diameter of [.2, .4, .6]) {
      await page.locator('#contact-diameter').fill(String(diameter));
      let fixedLength;
      for (const clearance of [.1, .35, .5]) {
        await page.locator('#contact-clearance').fill(String(clearance));
        const data = await contact.evaluate(e => ({ ...e.dataset }));
        assert.equal(data.status, 'passed', JSON.stringify(data));
        assert.equal(Number(data.diameter), diameter);
        assert.equal(Number(data.clearance), clearance);
        const length = Number(data.length), reference = Number(data.referenceLength);
        assert.ok(reference > length && length > 0);
        if (fixedLength !== undefined) assert.equal(length, fixedLength, 'comparison margin does not alter actual contact');
        fixedLength = length;
        const widths = await page.locator('#contact-tight .working-thread').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('stroke-width'))));
        assert.ok(widths.length >= 2 && widths.every(w => w === diameter), 'the exact path and contact arcs use the physical diameter');
        assert.equal(await page.locator('#length-total').innerText(), c8);
        assert.equal(await page.locator('#thread-view').getAttribute('data-span-count'), '89');
        results.push({ scenario, diameter, clearance, length, reference });
      }
    }
    await page.locator('#contact-diameter').fill('0.4');
    await page.locator('#contact-clearance').fill('0.35');
    await contact.screenshot({ path: `${out}/${scenario}.png` });
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    await contact.screenshot({ path: `${out}/mobile-${width}.png` });
  }
  await contact.locator('summary').click();
  await page.getByRole('link', { name: 'Модель и её границы', exact: true }).click();
  await page.locator('#contact-model').waitFor({ state: 'visible' });
  assert.match(page.url(), /design\.html#contact-model$/);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#contact-model').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${out}/design-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, base, cases: results.length, errors, screenshots: out, sample: results[13] }));
} finally { await browser.close(); }
