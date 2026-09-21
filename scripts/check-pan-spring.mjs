import assert from 'node:assert/strict';
import { chromium } from 'playwright';
// Usage: node scripts/check-pan-spring.mjs [baseUrl]
// Two fingers move the ball off centre; when they lift, it springs back.
// The spring once stopped working: the tap hit-test wrote the ball's position
// into the vector the spring returns to, so a panned ball stayed where it was.
const base = (process.argv[2] ?? 'http://127.0.0.1:4174/').replace(/\/?$/, '/');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Кику здесь', exact: true }).waitFor();
  await page.waitForFunction(() => window.__temari?.pan);
  await page.waitForTimeout(800);
  const box = await page.locator('canvas').boundingBox();
  assert.ok(box, 'the sphere canvas is visible');
  // Start to the right of the palette and above the action buttons.
  const cx = box.x + box.width * 0.65, cy = box.y + box.height * 0.3;
  assert.equal(await page.evaluate(({ cx, cy }) =>
    [cx - 50, cx + 50].every(x => document.elementFromPoint(x, cy) === document.querySelector('canvas')),
  { cx, cy }), true, 'both touches start on the canvas, not on a control');
  const cdp = await context.newCDPSession(page);
  const touch = (type, dx) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: cx - 50 + dx, y: cy, id: 1 }, { x: cx + 50 + dx, y: cy, id: 2 }],
  });
  for (const round of [1, 2]) {
    await touch('touchStart', 0);
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', -i * 8);
      await page.waitForTimeout(16);
    }
    const held = await page.evaluate(() => window.__temari.pan());
    await touch('touchEnd', 0);
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => window.__temari.pan());
    console.log(`round ${round}: offset while held ${held.toFixed(3)}, after release ${after.toFixed(4)}`);
    assert.ok(held > 0.05, `round ${round}: two fingers move the ball`);
    assert.ok(after < 0.005, `round ${round}: released, the ball springs back to the centre`);
  }
  assert.deepEqual(errors, []);
  console.log('pan spring: ok');
} finally {
  await browser.close();
}
