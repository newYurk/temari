import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://127.0.0.1:4173/").replace(/\/?$/, "/");
const out = process.argv[3] ?? "screenshots/workbench-2026-09-16";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  for (const [width, height] of [[1280, 900], [390, 844], [320, 640]]) {
    const touch = width < 768;
    const page = await browser.newPage({
      viewport: { width, height }, reducedMotion: "reduce", hasTouch: touch, isMobile: touch,
    });
    page.on("pageerror", (e) => errors.push(e.message));
    const activate = (locator) => touch ? locator.tap() : locator.click();
    const openPanel = async (name, title) => {
      await activate(page.getByRole("button", { name, exact: true }));
      const panel = page.getByRole("dialog", { name: title, exact: true });
      await panel.waitFor();
      assert.equal(await panel.evaluate(el => el instanceof HTMLDialogElement && el.matches(":modal")), true);
      return panel;
    };
    const closePanel = async (panel) => {
      await activate(panel.getByRole("button", { name: "Закрыть панель", exact: true }));
      await panel.waitFor({ state: "hidden" });
    };
    await page.goto(base);
    await page.getByRole("button", { name: "Узор", exact: true }).waitFor();
    await page.waitForFunction(() => window.__temari?.pinState);
    const threads = await openPanel("Нити", "Нити и основа");
    await activate(threads.getByRole("button", { name: "Основа", exact: true }));
    for (let i = 1; i <= 5; i++) {
      const colour = threads.getByRole("button", { name: `Цвет основы ${i}`, exact: true });
      await activate(colour);
      assert.equal(await colour.getAttribute("aria-pressed"), "true", `base colour ${i} at ${width}`);
      assert.equal(await threads.isVisible(), true, "base palette stays open");
    }
    const wrapColor = threads.getByRole("button", { name: "Цвет основы 3", exact: true });
    await activate(wrapColor);
    assert.equal(await wrapColor.getAttribute("aria-pressed"), "true");
    const swatches = await threads.getByRole("button", { name: /^Цвет основы \d$/ }).evaluateAll(buttons =>
      buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
      }));
    assert.equal(swatches.length, 5, "one base palette");
    for (const [i, swatch] of swatches.entries()) {
      assert.ok(Math.abs(swatch.y - swatches[0].y) <= 1, "base colors form one horizontal row");
      assert.ok(swatch.x >= 0 && swatch.right <= width && swatch.y >= 0 && swatch.bottom <= height,
        `base swatch ${i + 1} fits at ${width}`);
      if (i) assert.ok(swatch.x >= swatches[i - 1].right, "base color targets do not overlap");
    }
    await activate(threads.getByRole("button", { name: "Нить", exact: true }));
    assert.equal(await threads.getByRole("button", { name: /^Золотая нить/ }).isVisible(), true);
    assert.equal(await threads.getByRole("button", { name: /^Цвет основы / }).count(), 0, "only one target palette is shown");
    await closePanel(threads);
    for (const name of ["Узор", "Нити", "Ещё", "Булавки", "Выбрать узор", "Отменить"]) {
      assert.equal(await page.getByRole("button", { name, exact: true }).isVisible(), true, name);
    }
    assert.match(await page.getByRole("status").innerText(), /Выберите узор или поставьте булавки/);
    assert.equal(await page.getByRole("button", { name: "Выбрать узор", exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole("button", { name: "Линии", exact: true }).count(), 0);
    let pattern = await openPanel("Узор", "Узор и разметка");
    await activate(pattern.getByRole("button", { name: "Разметка", exact: true }));
    for (const name of ["Без сетки", "S8 · простая", "C8", "C10"]) {
      assert.equal(await pattern.getByRole("button", { name, exact: true }).isVisible(), true, name);
    }
    await activate(pattern.getByRole("button", { name: "C8", exact: true }));
    assert.equal(await pattern.getByRole("button", { name: "C8", exact: true }).getAttribute("aria-pressed"), "true");
    await closePanel(pattern);

    const more = await openPanel("Ещё", "Действия");
    const originalDialog = await more.elementHandle();
    assert.ok(originalDialog);
    await activate(more.getByRole("button", { name: "Справка", exact: true }));
    await page.getByRole("dialog", { name: "Как читать разметку", exact: true }).waitFor();
    assert.equal(await originalDialog.evaluate(el => el.isConnected && el.matches(":modal")), true, "help reuses the same modal");
    const dialog = page.locator("dialog[open]");
    assert.equal(await dialog.count(), 1);
    assert.equal(await dialog.getByRole("link", { name: "Подробнее о разметке и вышивке →", exact: true }).getAttribute("href"),
      "./design.html#jiwari");
    assert.match(await dialog.innerText(), /Булавки — временные метки/);
    assert.equal(await page.evaluate(() => {
      const d = document.querySelector("dialog");
      return d.scrollWidth <= d.clientWidth && d.getBoundingClientRect().bottom <= innerHeight;
    }), true, `help fit at ${width}`);
    await page.screenshot({ path: `${out}/help-${width}.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: "Ещё", exact: true }).evaluate(el => el === document.activeElement), true);
    await originalDialog.dispose();
    pattern = await openPanel("Узор", "Узор и разметка");
    await activate(pattern.getByRole("button", { name: "Разметка", exact: true }));
    assert.equal(await pattern.getByRole("button", { name: "C8", exact: true }).getAttribute("aria-pressed"), "true");
    // Repeat selection must leave the active grid in place.
    await activate(pattern.getByRole("button", { name: "C8", exact: true }));
    assert.equal(await page.evaluate(() => window.__temari.pinState().jiwariOn), true);
    await closePanel(pattern);
    await page.waitForTimeout(300); // ResizeObserver + WebGL layout settles before the frame.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const canvas = await page.locator("canvas").boundingBox();
    assert.ok(canvas);
    assert.ok(canvas.height >= 230, `usable sphere area at ${width}: ${canvas.height}`);
    assert.ok((await page.evaluate(() => window.__temari.pinState())).count >= 2, "C8 supplies marking pins");
    for (const name of ["Узор", "Нити", "Ещё", "Булавки", "Отменить", "Линии"]) {
      const control = await page.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(control);
      assert.ok(canvas.y + canvas.height <= control.y + 1, `${name} does not cover the canvas at ${width}`);
    }
    await page.screenshot({ path: `${out}/marking-${width}.png`, animations: "disabled" });
    pattern = await openPanel("Узор", "Узор и разметка");
    await activate(pattern.getByRole("button", { name: "Узоры", exact: true }));
    const kiku = pattern.getByRole("button", { name: "Кику", exact: true });
    assert.equal(await kiku.evaluate(button => button instanceof HTMLButtonElement && button.disabled), true);
    assert.match(await kiku.innerText(), /Нужна S8/);
    assert.equal(await page.evaluate(() => window.__temari.kagari().n), 0);
    await page.screenshot({ path: `${out}/embroidery-${width}.png`, animations: "disabled" });
    await closePanel(pattern);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, viewports: [1280, 390, 320], screenshots: out, errors }));
} finally {
  await browser.close();
}
