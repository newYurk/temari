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
    const touch = tag !== 'desktop';
    const page = await browser.newPage({
      viewport: { width: w, height: h }, reducedMotion: 'reduce', hasTouch: touch, isMobile: touch,
    });
    page.on('pageerror', e => errors.push(tag + ': ' + e.message));
    const activate = (locator) => touch ? locator.tap() : locator.click();
    const state = () => page.evaluate(() => window.__temari.kagari());
    const openPanel = async (name, title) => {
      await activate(page.getByRole('button', { name, exact: true }));
      const panel = page.getByRole('dialog', { name: title, exact: true });
      await panel.waitFor();
      assert.equal(await panel.evaluate(el => el instanceof HTMLDialogElement && el.matches(':modal')), true);
      return panel;
    };
    const closePanel = async (panel) => {
      await activate(panel.getByRole('button', { name: 'Закрыть панель', exact: true }));
      await panel.waitFor({ state: 'hidden' });
    };
    const preparePole = async () => {
      const panel = await openPanel('Узор', 'Узор и разметка');
      await activate(panel.getByRole('button', { name: 'Узоры', exact: true }));
      await activate(panel.getByRole('button', { name: 'Кику здесь', exact: true }));
      await panel.waitFor({ state: 'hidden' });
    };
    const reselectKiku = async () => {
      const before = await state();
      const panel = await openPanel('Узор', 'Узор и разметка');
      await activate(panel.getByRole('button', { name: 'Узоры', exact: true }));
      const kiku = panel.getByRole('button', { name: 'Кику', exact: true });
      assert.equal(await kiku.getAttribute('aria-pressed'), 'true');
      await activate(kiku);
      assert.deepEqual(await state(), before, tag + ': selecting the current motif cannot sew or restart');
      if (await panel.isVisible()) await closePanel(panel);
    };
    await page.goto(base);
    await page.getByRole('button', { name: 'Узор', exact: true }).waitFor();
    await page.waitForFunction(() => window.__temari?.kagari);
    const finishedGroup = (set) => page.waitForFunction((expectedSet) => {
      const k = window.__temari.kagari();
      return k.set === expectedSet && k.n > 0 && k.laid === k.n && !k.playing;
    }, set, { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: out + '/' + tag + '-1-workshop.png', animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' overflow');
    await preparePole();
    await page.waitForTimeout(800);
    const status = await page.locator('[role=status]').innerText();
    const k1 = await state();
    console.log(tag, 'after quick:', JSON.stringify(status), JSON.stringify(k1).slice(0, 160));
    assert.match(status, /Метки готовы/);
    assert.equal(k1.n, 0, tag + ': preparation does not sew');
    await page.screenshot({ path: out + '/' + tag + '-2-ready-north.png', animations: 'disabled' });
    await reselectKiku();
    // Two working threads, as the control pattern asks for: the palette holds
    // the one in hand, and what is already sewn keeps its own.
    const colours = ['Красная нить', 'Золотая нить', 'Светлая нить', 'Тёмная нить', 'Синяя нить'];
    const pickColour = async (panel, name) => {
      const colour = panel.getByRole('button', { name: new RegExp('^' + name) });
      await activate(colour);
      assert.equal(await panel.isVisible(), true, tag + ': picking keeps the threads dialog open');
      assert.equal(await colour.getAttribute('aria-pressed'), 'true', tag + ': ' + name + ' is selectable');
      const box = await colour.boundingBox();
      assert.ok(box && box.width >= 40 && box.height >= 40, tag + ': ' + name + ' retains its touch target');
      const swatches = await panel.getByRole('button', { name: /^(Красная|Золотая|Светлая|Тёмная|Синяя) нить/ }).evaluateAll(buttons => {
        return buttons.map(button => {
          const r = button.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        });
      });
      assert.equal(swatches.length, 5, tag + ': one working palette');
      for (const [i, swatch] of swatches.entries()) {
        assert.ok(Math.abs(swatch.y - swatches[0].y) <= 1, tag + ': colors form one horizontal row');
        assert.ok(swatch.width >= 40 && swatch.height >= 40, tag + ': all color targets remain usable');
        assert.ok(swatch.x >= 0 && swatch.right <= w && swatch.y >= 0 && swatch.bottom <= h,
          tag + ': every color fits the viewport');
        if (i) assert.ok(swatch.x >= swatches[i - 1].right, tag + ': color targets do not overlap');
      }
    };
    let threads = await openPanel('Нити', 'Нити и основа');
    await activate(threads.getByRole('button', { name: 'Нить 1', exact: true }));
    for (const name of colours) await pickColour(threads, name);
    await pickColour(threads, 'Золотая нить');
    const handA = await state();
    assert.equal(handA.hand, 1, tag + ': the palette holds the thread in hand');
    assert.equal(handA.pair[0], 1, tag + ': before the first group, the hand holds the first thread');
    await closePanel(threads);
    await activate(page.getByRole('button', { name: 'Начать кику', exact: true }));
    await page.getByRole('button', { name: 'Вышиваем…', exact: true }).waitFor();
    for (const name of ['Булавки', 'Отменить', 'Вышиваем…']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).evaluate(button =>
        button instanceof HTMLButtonElement && button.disabled), true, tag + ': ' + name + ' is natively disabled while sewing');
    }
    assert.equal(await page.getByRole('button', { name: 'Отменить', exact: true }).getAttribute('aria-pressed'), null);
    await finishedGroup(0);
    await page.screenshot({ path: out + '/' + tag + '-3-sewing-north.png', animations: 'disabled' });
    assert.equal((await page.evaluate(() => window.__temari.kagari())).planColor, 1,
      tag + ': the first group is sewn in that thread');
    await reselectKiku();
    threads = await openPanel('Нити', 'Нити и основа');
    await activate(threads.getByRole('button', { name: 'Нить 2', exact: true }));
    for (const name of colours) await pickColour(threads, name);
    const handB = await state();
    assert.equal(handB.pair[1], 4, tag + ': picking now paints the second thread');
    assert.equal(handB.pair[0], 1, tag + ': the first thread is untouched');
    assert.equal(handB.planColor, 1, tag + ': what is laid is not repainted');
    await activate(threads.getByRole('button', { name: 'Нить 1', exact: true }));
    await pickColour(threads, 'Красная нить');
    const editedA = await state();
    assert.deepEqual(editedA.pair, [0, 4], tag + ': the explicit target paints only thread 1');
    assert.equal(editedA.planColor, 1, tag + ': changing thread 1 cannot repaint its laid stitches');
    assert.equal(editedA.laid, handB.laid);
    assert.equal(editedA.n, handB.n);
    await pickColour(threads, 'Золотая нить');
    await activate(threads.getByRole('button', { name: 'Нить 2', exact: true }));
    await pickColour(threads, 'Синяя нить');
    const beforeBase = await state();
    await activate(threads.getByRole('button', { name: 'Основа', exact: true }));
    const baseColour = threads.getByRole('button', { name: 'Цвет основы 3', exact: true });
    await activate(baseColour);
    assert.equal(await baseColour.getAttribute('aria-pressed'), 'true');
    const afterBase = await state();
    for (const key of ['laid', 'n', 'kept', 'set', 'layers', 'planColor', 'keptColors']) {
      assert.deepEqual(afterBase[key], beforeBase[key], tag + ': base painting preserves sewn ' + key);
    }
    assert.deepEqual(afterBase.pair, [1, 4], tag + ': a contrasting base leaves the working pair unchanged');
    await closePanel(threads);

    // A laid group goes back whole — the first thing a hand reaches for.
    await activate(page.getByRole('button', { name: 'Вторая группа', exact: true }));
    await finishedGroup(1);
    const two = await page.evaluate(() => window.__temari.kagari());
    assert.equal(two.set, 1, tag + ': the second group is laid');
    assert.equal(two.planColor, 4, tag + ': the second group is sewn in the second thread');
    assert.deepEqual(two.keptColors, [1], tag + ': the first group kept its own thread');
    await reselectKiku();
    const rowsPanel = await openPanel('Узор', 'Узор и разметка');
    await activate(rowsPanel.getByRole('button', { name: 'Узоры', exact: true }));
    const rows = rowsPanel.getByRole('group', { name: 'Сколько рядов вышить', exact: true });
    for (const name of ['1', '2', '3', 'всё']) {
      assert.equal(await rows.getByRole('button', { name, exact: true }).isEnabled(), true);
    }
    await activate(rows.getByRole('button', { name: '2', exact: true }));
    assert.deepEqual(await state(), two, tag + ': choosing a row count does not sew');
    await activate(rows.getByRole('button', { name: '1', exact: true }));
    await closePanel(rowsPanel);
    assert.equal(await page.getByRole('group', { name: 'Сколько рядов вышить', exact: true }).count(), 0);
    const undo = page.getByRole('button', { name: 'Отменить', exact: true });
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await undo.getAttribute('aria-pressed'), null, tag + ': undo never acts as a toggle');
    await activate(undo);
    await finishedGroup(0);
    const undone = await page.evaluate(() => window.__temari.kagari());
    assert.equal(undone.set, 0, tag + ': «Отменить» takes the group back');
    assert.equal(undone.kept, 0, tag + ': the first group stays under the needle');
    assert.equal(undone.laid, undone.n, tag + ': the flower is left complete, not mid-stitch');
    await activate(page.getByRole('button', { name: 'Вторая группа', exact: true }));
    await finishedGroup(1);
    // Turn the south pole to the viewer, prepare it with one tap.
    const k = await page.evaluate(() => window.__temari.kagari());
    const northSewn = k.kept + k.laid;
    assert.ok(northSewn > 0, tag + ': the north flower is sewn');
    const facing = () => page.evaluate(() => window.__temari.kagari().pole);
    const north = page.getByRole('button', { name: 'Показать север', exact: true });
    if (await north.count()) {
      await activate(north);
      await page.waitForFunction(() => window.__temari.kagari().pole === 0);
    }
    await activate(page.getByRole('button', { name: 'Показать юг', exact: true }));
    await page.waitForFunction(() => window.__temari.kagari().pole === 1);
    assert.equal(await facing(), 1, tag + ': the south pole faces the viewer');
    const before = await page.evaluate(() => window.__temari.kagari());
    await preparePole();
    await page.waitForTimeout(800);
    const k2 = await page.evaluate(() => window.__temari.kagari());
    // Turning the ball and preparing the south pole both keep the north flower.
    assert.equal(before.kept, northSewn, tag + ': turning keeps the north flower');
    assert.equal(k2.pole, 1); assert.equal(k2.kept, northSewn, tag + ': preparing the south keeps it'); assert.equal(k2.n, 0);
    console.log(tag, 'south before:', JSON.stringify(before).slice(0, 120), 'after:', JSON.stringify(k2).slice(0, 160), JSON.stringify(await page.locator('[role=status]').innerText()));
    await page.screenshot({ path: out + '/' + tag + '-4-ready-south.png', animations: 'disabled' });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('OK');
} finally { await browser.close(); }
