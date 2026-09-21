import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://127.0.0.1:4173/").replace(/\/?$/, "/");
const out = "screenshots/workbench-2026-09-16";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  for (const [width, height] of [[1280, 900], [390, 844], [320, 640]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole("button", { name: "Кику здесь", exact: true }).waitFor();
    for (let i = 1; i <= 5; i++) {
      const colour = page.getByRole("button", { name: `Цвет основы ${i}`, exact: true });
      await colour.click();
      assert.equal(await colour.getAttribute("aria-pressed"), "true", `base colour ${i} at ${width}`);
    }
    const wrapColor = page.getByRole("button", { name: "Цвет основы 3", exact: true });
    await wrapColor.click();
    assert.equal(await wrapColor.getAttribute("aria-pressed"), "true");
    for (const name of ["Без сетки", "S8 · простая", "C8", "C10", "Булавки", "Линии", "Распустить"]) {
      assert.equal(await page.getByRole("button", { name, exact: true }).isVisible(), true, name);
    }
    assert.match(await page.getByRole("status").innerText(), /Нажмите на шар/);
    const lines = page.getByRole("button", { name: "Линии", exact: true });
    assert.equal(await lines.getAttribute("aria-disabled"), "true");
    await lines.click({ force: true });
    assert.match(await page.getByRole("status").innerText(), /две булавки/);
    await page.getByRole("button", { name: "C8", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "C8", exact: true }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Как читать разметку" }).click();
    const dialog = page.getByRole("dialog");
    assert.equal(await dialog.isVisible(), true);
    assert.match(await dialog.innerText(), /Булавки — временные метки/);
    assert.equal(await page.evaluate(() => {
      const d = document.querySelector("dialog");
      return d.scrollWidth <= d.clientWidth && d.getBoundingClientRect().bottom <= innerHeight;
    }), true, `help fit at ${width}`);
    await page.screenshot({ path: `${out}/help-${width}.png` });
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.getByRole("button", { name: "C8", exact: true }).getAttribute("aria-pressed"), "true");
    // Repeat selection must leave the active grid in place.
    await page.getByRole("button", { name: "C8", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__temari.pinState().jiwariOn), true);
    await page.waitForTimeout(300); // ResizeObserver + WebGL layout settles before the frame.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const fit = await page.evaluate(() => {
      const canvas = document.querySelector("canvas").getBoundingClientRect();
      const dock = document.querySelector('[aria-label="Этап работы"]').parentElement.parentElement.getBoundingClientRect();
      return { height: canvas.height, bottom: canvas.bottom,
        dockTop: dock.top };
    });
    assert.ok(fit.height >= 230, `usable sphere area at ${width}: ${fit.height}`);
    assert.ok(fit.bottom <= fit.dockTop + 1, `bottom controls don't cover canvas at ${width}`);
    await page.screenshot({ path: `${out}/marking-${width}.png` });
    await page.getByRole("button", { name: "Вышивка", exact: true }).click();
    const kiku = page.getByRole("button", { name: "Кику", exact: true });
    assert.equal(await kiku.getAttribute("aria-disabled"), "true");
    await kiku.click({ force: true });
    assert.match(await page.getByRole("status").innerText(), /Рецепт кику для C8 ещё не реализован/);
    assert.equal(await page.evaluate(() => window.__temari.kagari().n), 0);
    await page.screenshot({ path: `${out}/embroidery-${width}.png` });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, viewports: [1280, 390, 320], screenshots: out, errors }));
} finally {
  await browser.close();
}
