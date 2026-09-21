import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8860/';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__temari);
  await page.evaluate(() => window.__temari.enterStudio());
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__temari.face(0, 1, 0); window.__temari.setCraft('pin'); });
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2, y = box.y + box.height * .4;
  const state = () => page.evaluate(() => ({
    pan: window.__temari.pan(), orientation: window.__temari.orientation(),
    omega: window.__temari.omega(), pins: window.__temari.pins(),
  }));
  const settled = async () => {
    await page.waitForFunction(() => window.__temari.pan() < .005);
  };
  const initial = await state();
  for (const end of ['mouseup', 'option-first', 'cancel', 'capture-loss', 'blur']) {
    await page.mouse.move(x, y);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(x + 100, y - 50, { steps: 12 });
    const held = await state();
    assert.ok(held.pan > .05, `${end}: Option drag translates`);
    assert.deepEqual(held.orientation, initial.orientation, `${end}: no rotation`);
    await page.waitForTimeout(250);
    assert.ok(Math.abs((await state()).pan - held.pan) < .0001, `${end}: held away from centre`);
    if (end === 'option-first') {
      await page.keyboard.up('Alt');
      await page.mouse.move(x + 140, y - 80, { steps: 4 });
      assert.deepEqual((await state()).orientation, initial.orientation, 'no mid-gesture rotation');
    }
    if (end === 'mouseup') {
      mkdirSync('screenshots/option-pan', { recursive: true });
      await page.screenshot({ path: 'screenshots/option-pan/held.png' });
    }
    if (end === 'cancel') await canvas.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
    if (end === 'capture-loss') await canvas.evaluate(el => el.releasePointerCapture(1));
    if (end === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await settled();
    const after = await state();
    assert.deepEqual(after.orientation, initial.orientation, `${end}: no spin on release`);
    assert.equal(after.omega, 0);
    assert.equal(after.pins, initial.pins, `${end}: no accidental pin`);
    console.log(`${end}: held=${held.pan.toFixed(3)}, returned=${after.pan.toFixed(4)}`);
  }
  await page.screenshot({ path: 'screenshots/option-pan/returned.png' });
  await page.keyboard.down('Alt');
  await page.mouse.click(x, y);
  await page.keyboard.up('Alt');
  assert.equal((await state()).pins, initial.pins, 'Option-click is not a crafting tap');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y, { steps: 12 });
  assert.notDeepEqual((await state()).orientation, initial.orientation, 'ordinary drag still rotates');
  assert.ok((await state()).pan < .005, 'ordinary drag does not pan');
  await page.mouse.up();
  assert.deepEqual(errors, []);
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touchPage = await mobile.newPage();
  touchPage.on('pageerror', error => errors.push(error.message));
  await touchPage.goto(base);
  await touchPage.waitForFunction(() => window.__temari);
  await touchPage.evaluate(() => window.__temari.enterStudio());
  await touchPage.waitForTimeout(500);
  const cdp = await mobile.newCDPSession(touchPage);
  // Above the palette: both contacts must land on the canvas, not UI buttons.
  assert.equal(await touchPage.evaluate(() => [145, 245].every(x =>
    document.elementFromPoint(x, 220)?.tagName === 'CANVAS')), true);
  for (let round = 1; round <= 2; round++) {
    const before = await touchPage.evaluate(() => window.__temari.orientation());
    for (let step = 0; step <= 12; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: step ? 'touchMove' : 'touchStart',
        touchPoints: [{ x: 145 + step * 6, y: 220, id: 1 }, { x: 245 + step * 6, y: 220, id: 2 }],
      });
      await touchPage.waitForTimeout(16);
    }
    assert.ok(await touchPage.evaluate(() => window.__temari.pan()) > .05, 'two fingers still translate');
    assert.deepEqual(await touchPage.evaluate(() => window.__temari.orientation()), before);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touchPage.waitForFunction(() => window.__temari.pan() < .005);
  }
  assert.deepEqual(errors, []);
  console.log('Option/Alt pan: ok');
} finally {
  await browser.close();
}
