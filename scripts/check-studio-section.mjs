import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const out = 'screenshots/s8-section-2026-09-16';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Цвет 3', exact: true }).click();
  await page.evaluate(() => { window.__temari.showExample(); window.__temari.packKiku(); });
  await page.waitForFunction(() => window.__temari.kagari().laid === 96);
  await page.waitForTimeout(400); // Initial studio framing precedes the fixed comparison camera.
  const state = await page.evaluate(() => window.__temari.kagari());
  for (const [name, point] of [
    ['center', [0, 1, 0]],
    ['outer', [Math.sqrt(3) / 2, .5, 0]],
    ['side', [1, .25, .2]],
  ]) {
    await page.evaluate(v => { window.__temari.face(...v); window.__temari.dolly(1.7); }, point);
    await page.waitForTimeout(250); // Camera, React and WebGL settle after the probe change.
    assert.equal(await page.evaluate(() => window.__temari.kagari().laid), state.laid);
    await page.screenshot({ path: `${out}/after-${name}.png` });
  }
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.evaluate(() => { window.__temari.face(0, 1, 0); window.__temari.dolly(3.5); });
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${out}/after-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ base, passed: true, errors, screenshots: out, laid: state.laid }));
} finally { await browser.close(); }
