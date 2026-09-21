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
    const quick = page.getByRole('button', { name: 'Кику здесь', exact: true });
    await quick.waitFor();
    await page.waitForFunction(() => window.__temari?.kagari);
    const finishedGroup = (set) => page.waitForFunction((expectedSet) => {
      const k = window.__temari.kagari();
      return k.set === expectedSet && k.n > 0 && k.laid === k.n && !k.playing;
    }, set, { timeout: 60000 });
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
    // Two working threads, as the control pattern asks for: the palette holds
    // the one in hand, and what is already sewn keeps its own.
    const colours = ['Красная нить', 'Золотая нить', 'Светлая нить', 'Тёмная нить', 'Синяя нить'];
    const pickColour = async (name) => {
      const colour = page.getByRole('button', { name: new RegExp('^' + name) });
      await colour.click();
      assert.equal(await colour.getAttribute('aria-pressed'), 'true', tag + ': ' + name + ' is selectable');
      const box = await colour.boundingBox();
      assert.ok(box && box.width >= 40 && box.height >= 40, tag + ': ' + name + ' retains its touch target');
      await page.waitForTimeout(150);
      const fit = await colour.evaluate((button) => {
        const target = button.getBoundingClientRect();
        const palette = button.closest('aside').firstElementChild.getBoundingClientRect();
        const hint = document.querySelector('[role="status"]').getBoundingClientRect();
        const dock = document.querySelector('[aria-label="Этап работы"]').parentElement.parentElement.getBoundingClientRect();
        return {
          targetVisible: target.top >= palette.top && target.bottom <= palette.bottom,
          clearsHint: palette.top >= hint.bottom,
          clearsDock: palette.bottom <= dock.top + 1,
        };
      });
      assert.deepEqual(fit, { targetVisible: true, clearsHint: true, clearsDock: true },
        tag + ': ' + name + ' is not clipped or covered by the hint or dock');
    };
    for (const name of colours) await pickColour(name);
    await pickColour('Золотая нить');
    const handA = await page.evaluate(() => window.__temari.kagari());
    assert.equal(handA.hand, 1, tag + ': the palette holds the thread in hand');
    assert.equal(handA.pair[0], 1, tag + ': before the first group, the hand holds the first thread');
    await page.getByRole('button', { name: /Начать кику/ }).click();
    await finishedGroup(0);
    await page.screenshot({ path: out + '/' + tag + '-3-sewing-north.png' });
    assert.equal((await page.evaluate(() => window.__temari.kagari())).planColor, 1,
      tag + ': the first group is sewn in that thread');
    // With the group finished the hand has taken the second thread.
    for (const name of colours) await pickColour(name);
    const handB = await page.evaluate(() => window.__temari.kagari());
    assert.equal(handB.pair[1], 4, tag + ': picking now paints the second thread');
    assert.equal(handB.pair[0], 1, tag + ': the first thread is untouched');
    assert.equal(handB.planColor, 1, tag + ': what is laid is not repainted');

    // A laid group goes back whole — the first thing a hand reaches for.
    await page.getByRole('button', { name: /Вторая группа/ }).click();
    await finishedGroup(1);
    const two = await page.evaluate(() => window.__temari.kagari());
    assert.equal(two.set, 1, tag + ': the second group is laid');
    assert.equal(two.planColor, 4, tag + ': the second group is sewn in the second thread');
    assert.deepEqual(two.keptColors, [1], tag + ': the first group kept its own thread');
    await page.getByRole('button', { name: 'Распустить', exact: true }).click();
    await finishedGroup(0);
    const undone = await page.evaluate(() => window.__temari.kagari());
    assert.equal(undone.set, 0, tag + ': «Распустить» takes the group back');
    assert.equal(undone.kept, 0, tag + ': the first group stays under the needle');
    assert.equal(undone.laid, undone.n, tag + ': the flower is left complete, not mid-stitch');
    await page.getByRole('button', { name: /Вторая группа/ }).click();
    await finishedGroup(1);
    // Turn the south pole to the viewer, prepare it with one tap.
    const k = await page.evaluate(() => window.__temari.kagari());
    const northSewn = k.kept + k.laid;
    assert.ok(northSewn > 0, tag + ': the north flower is sewn');
    const facing = () => page.evaluate(() => window.__temari.kagari().pole);
    const north = page.getByRole('button', { name: 'Показать север', exact: true });
    if (await north.count()) {
      await north.click();
      await page.waitForFunction(() => window.__temari.kagari().pole === 0);
    }
    await page.getByRole('button', { name: 'Показать юг', exact: true }).click();
    await page.waitForFunction(() => window.__temari.kagari().pole === 1);
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
