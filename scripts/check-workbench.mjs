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
    await page.getByRole("button", { name: "Цвет 3", exact: true }).click();
    await page.getByRole("button", { name: "К вышивке", exact: true }).click();
    for (const name of ["Без сетки", "S8 · простая", "C8", "C10", "Булавки", "Линии эскиза", "Отменить"]) {
      assert.equal(await page.getByRole("button", { name, exact: true }).isVisible(), true, name);
    }
    assert.match(await page.getByRole("status").innerText(), /Нажмите на шар/);
    await page.getByRole("button", { name: "Линии эскиза", exact: true }).click({ force: true });
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
      return { height: canvas.height, bottom: canvas.bottom,
        hintTop: document.querySelector('[role="status"]').getBoundingClientRect().top };
    });
    assert.ok(fit.height >= 230, `usable sphere area at ${width}: ${fit.height}`);
    assert.ok(fit.bottom <= fit.hintTop + 1, `controls don't cover canvas at ${width}`);
    await page.screenshot({ path: `${out}/marking-${width}.png` });
    await page.getByRole("button", { name: "Вышивка", exact: true }).click();
    const kiku = page.getByRole("button", { name: "Кику", exact: true });
    assert.equal(await kiku.getAttribute("aria-disabled"), "true");
    await kiku.click({ force: true });
    assert.match(await page.getByRole("status").innerText(), /Рецепт кику для C8 ещё не реализован/);
    await page.screenshot({ path: `${out}/embroidery-${width}.png` });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, viewports: [1280, 390, 320], screenshots: out, errors }));
} finally {
  await browser.close();
}
