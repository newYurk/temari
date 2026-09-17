import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
// Usage: node scripts/check-quick-kiku.mjs [baseUrl] [outDir]
const base = (process.argv[2] ?? 'http://127.0.0.1:4174/').replace(/\/?$/, '/');
const out = process.argv[3] ?? 'screenshots/quick-kiku';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  for (const [w, h, tag] of [[1280, 900, 'desktop'], [390, 844, 'phone'], [320, 640, 'narrow']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(tag + ': ' + e.message));
    await page.goto(base);
    await page.getByRole('button', { name: 'К вышивке' }).click();
    const quick = page.getByRole('button', { name: 'Кику здесь' });
    await quick.waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: out + '/' + tag + '-1-workshop.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' overflow');
    await quick.click();
    await page.waitForTimeout(800);
    const status = await page.locator('[role=status]').innerText();
    const k1 = await page.evaluate(() => window.__temari.kagari());
    console.log(tag, 'after quick:', JSON.stringify(status), JSON.stringify(k1).slice(0, 160));
    assert.match(status, /Метки готовы/);
    await page.screenshot({ path: out + '/' + tag + '-2-ready-north.png' });
    await page.getByRole('button', { name: /Начать кику/ }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: out + '/' + tag + '-3-sewing-north.png' });
    // A laid group goes back whole — the first thing a hand reaches for.
    await page.getByRole('button', { name: /Вторая группа/ }).click();
    await page.waitForTimeout(2600);
    const two = await page.evaluate(() => window.__temari.kagari());
    assert.equal(two.set, 1, tag + ': the second group is laid');
    await page.getByRole('button', { name: /Отменить/ }).click();
    await page.waitForTimeout(500);
    const undone = await page.evaluate(() => window.__temari.kagari());
    assert.equal(undone.set, 0, tag + ': «Отменить» takes the group back');
    assert.equal(undone.kept, 0, tag + ': the first group stays under the needle');
    assert.equal(undone.laid, undone.n, tag + ': the flower is left complete, not mid-stitch');
    await page.getByRole('button', { name: /Вторая группа/ }).click();
    await page.waitForTimeout(2600);
    // Turn the south pole to the viewer, prepare it with one tap.
    const k = await page.evaluate(() => window.__temari.kagari());
    const northSewn = k.kept + k.laid;
    assert.ok(northSewn > 0, tag + ': the north flower is sewn');
    const facing = () => page.evaluate(() => window.__temari.kagari().pole);
    for (let i = 0; i < 4 && (await facing()) !== 1; i++) {
      await page.getByRole('button', { name: /Показать юг|Показать север/ }).click();
      await page.waitForFunction(() => window.__temari.kagari().pole === 1, null, { timeout: 4000 }).catch(() => {});
    }
    assert.equal(await facing(), 1, tag + ': the south pole faces the viewer');
    const before = await page.evaluate(() => window.__temari.kagari());
    await quick.click();
    await page.waitForTimeout(800);
    const k2 = await page.evaluate(() => window.__temari.kagari());
    // Turning the ball and preparing the south pole both keep the north flower.
    assert.equal(before.kept, northSewn, tag + ': turning keeps the north flower');
    assert.equal(k2.pole, 1); assert.equal(k2.kept, northSewn, tag + ': preparing the south keeps it'); assert.equal(k2.n, 0);
    console.log(tag, 'south before:', JSON.stringify(before).slice(0, 120), 'after:', JSON.stringify(k2).slice(0, 160), JSON.stringify(await page.locator('[role=status]').innerText()));
    await page.screenshot({ path: out + '/' + tag + '-4-ready-south.png' });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('OK');
} finally { await browser.close(); }
