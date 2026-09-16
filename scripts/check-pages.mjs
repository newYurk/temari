import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://127.0.0.1:4173/").replace(/\/?$/, "/");
const out = "screenshots/local-geometry-2026-09-16";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const failures = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => failures.push(error.message));
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.goto(`${base}lab.html`);
  await page.locator('#sphere[data-step="16"]').waitFor();
  assert.equal(await page.locator("#sphere text").count(), 8);
  await page.screenshot({ path: `${out}/lab-desktop.png`, fullPage: true });
  for (let center = 0; center < 6; center++) {
    await page.selectOption("#center", String(center));
    await page.waitForFunction(c => document.querySelector("#sphere").dataset.center === String(c), center);
    assert.equal(await page.locator("#sphere text").count(), 8);
    assert.equal(
      await page.locator("#sphere").getAttribute("data-center"),
      String(center),
    );
  }
  await page.getByRole("button", { name: "Сбоку", exact: true }).click();
  await page.screenshot({ path: `${out}/lab-side.png`, fullPage: true });
  await page.getByRole("button", { name: "На центр", exact: true }).click();
  await page.locator("#circumference").fill("320");
  await page.waitForFunction(() => document.querySelector("#circumference-value").textContent === "32 см");
  assert.equal(await page.locator("#circumference-value").innerText(), "32 см");
  await page.locator(".view-settings summary").click();
  await page.locator("#reverse").check();
  await page.locator("#step").fill("1");
  await page.locator('#sphere[data-step="1"]').waitFor();
  assert.match(await page.locator("#progress").innerText(), /1 → 2$/);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await overflow(), false, `lab overflow at ${width}px`);
  }
  await page.screenshot({ path: `${out}/lab-mobile.png`, fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.waitForFunction(() => window.__temari?.enterStudio);
  await page.getByRole("button", { name: "К вышивке", exact: true }).click();
  await page.getByRole("button", { name: "C8", exact: true }).click();
  await page.getByRole("button", { name: "Вышивка", exact: true }).click();
  const kiku = page.getByRole("button", { name: "Кику", exact: true });
  assert.equal(await kiku.getAttribute("aria-disabled"), "true");
  await kiku.click({ force: true });
  assert.match(
    await page.locator('[aria-live="polite"]').innerText(),
    /Рецепт кику для C8 ещё не реализован/,
  );
  assert.equal(await page.evaluate(() => window.__temari.kagari().n), 0);
  for (const name of ["Хоси", "Хиси", "Оби"]) {
    assert.equal(
      await page
        .getByRole("button", { name, exact: true })
        .getAttribute("aria-disabled"),
      "true",
    );
  }
  await page.screenshot({ path: `${out}/c8-unavailable-desktop.png` });
  await page.getByRole("button", { name: "Разметка", exact: true }).click();
  await page.getByRole("button", { name: "C10", exact: true }).click();
  await page.getByRole("button", { name: "Вышивка", exact: true }).click();
  assert.equal(await kiku.getAttribute("aria-disabled"), "true");
  await kiku.click({ force: true });
  assert.match(
    await page.locator('[aria-live="polite"]').innerText(),
    /Рецепт кику для C10 ещё не реализован/,
  );

  await page.goto(`${base}?kiku=1`);
  await page.waitForFunction(() => window.__temari?.kagari().n > 0);
  await page.evaluate(() => {
    window.__temari.freezeKagari(0);
    window.__temari.setColor(1);
    window.__temari.freezeKagari(1);
    window.__temari.face(0, 1, 0);
  });
  await page.waitForTimeout(200); // Let React and the WebGL frame reflect the frozen state.
  assert.equal(await page.evaluate(() => window.__temari.kagari().laid), 1);
  await page.screenshot({ path: `${out}/simple-first.png` });
  await page.evaluate(() =>
    window.__temari.freezeKagari(window.__temari.kagari().n),
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/simple-a1.png` });
  await page.getByRole("button", { name: "Кику", exact: true }).click();
  await page.evaluate(() =>
    window.__temari.freezeKagari(window.__temari.kagari().n),
  );
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__temari.kagari().set), 1);
  await page.screenshot({ path: `${out}/simple-a1-b1.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await overflow(), false, "game mobile overflow");
  await page.screenshot({ path: `${out}/simple-mobile.png` });

  await page.goto(`${base}design/?check=1#status`);
  await page.waitForURL(/design\.html\?check=1#status$/);
  assert.equal(await overflow(), false, "documentation mobile overflow");
  await page.screenshot({ path: `${out}/design-mobile.png`, fullPage: true });
  assert.deepEqual(failures, [], "browser errors");
  console.log(
    JSON.stringify({ base, screenshots: out, errors: failures, passed: true }),
  );
} finally {
  await browser.close();
}
