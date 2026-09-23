import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:4173/";
const out = process.argv[3] ?? "screenshots/pins";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const failures = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__temari?.pinState);
  await page.getByRole("button", { name: "Узор", exact: true }).waitFor();
  await page.getByRole("button", { name: "Булавки", exact: true }).waitFor();
  const state = () => page.evaluate(() => window.__temari.pinState());
  const frame = () => page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const tapPin = async (index) => {
    await frame();
    const point = await page.evaluate((i) => window.__temari.projectPin(i), index);
    assert.ok(point, `pin ${index} exists`);
    await page.mouse.click(point.x, point.y);
    await frame();
  };
  const tool = (name) => page.getByRole("button", { name, exact: true });
  assert.equal((await state()).jiwariOn, false);
  assert.equal(await tool("Выбрать узор").isEnabled(), true);
  assert.equal(await tool("Линии").count(), 0, "empty sketch offers pattern selection");
  assert.equal(await tool("Отменить").evaluate((button) => button instanceof HTMLButtonElement && button.disabled), true);
  assert.equal(await tool("Отменить").getAttribute("aria-pressed"), null, "undo is not a toggle");
  await frame();
  const canvas = await page.locator("canvas").boundingBox();
  assert.ok(canvas);
  const x = canvas.x + canvas.width / 2;
  const y = canvas.y + canvas.height / 2;
  await page.mouse.click(x - 45, y - 25);
  await page.waitForFunction(() => window.__temari.pins() === 1);
  assert.equal(await tool("Линии").evaluate((button) => button instanceof HTMLButtonElement && button.disabled), true);
  assert.match(await tool("Линии").getAttribute("title") ?? "", /две булавки/);
  assert.equal(await tool("Выбрать узор").count(), 0);
  await page.mouse.click(x + 55, y + 20);
  await page.waitForFunction(() => window.__temari.pins() === 2);
  assert.equal((await state()).arcs, 0, "placing pins must not draw");
  assert.equal((await state()).active, null);
  assert.equal(await tool("Линии").isEnabled(), true);
  assert.equal(await tool("Отменить").isEnabled(), true);
  assert.equal(await tool("Отменить").getAttribute("aria-pressed"), null);
  await page.mouse.move(canvas.x + canvas.width - 20, 80);
  await page.screenshot({ path: `${out}/two-pins-no-grid.png`, animations: "disabled" });

  await tapPin(0);
  assert.equal((await state()).count, 1, "one click on a raised head removes the pin");
  assert.equal((await state()).arcs, 0);
  await tool("Отменить").click();
  assert.equal((await state()).count, 2);

  await tool("Линии").click();
  await tapPin(0);
  assert.equal((await state()).active, 0);
  assert.equal((await state()).arcs, 0);
  await tapPin(1);
  assert.equal((await state()).arcs, 1);
  assert.equal((await state()).count, 2);
  assert.equal((await state()).sewn, 0, "free sketch cannot create hidden kiku slots");
  await page.mouse.move(canvas.x + canvas.width - 20, 80);
  await page.screenshot({ path: `${out}/separate-sketch-line.png`, animations: "disabled" });
  await tool("Отменить").click();
  assert.equal((await state()).arcs, 0, "sketch undo uses line history");
  await tapPin(1);
  assert.equal((await state()).arcs, 1);
  await tool("Булавки").click();
  await tapPin(0);
  assert.equal((await state()).count, 1);
  assert.equal((await state()).arcs, 1, "removing a temporary pin preserves the drawn line");
  await tool("Отменить").click();
  assert.equal((await state()).count, 2);

  // A gradual drag consists of small moves; its total travel must suppress taps.
  await page.mouse.move(x, y - 60);
  await page.mouse.down();
  await page.mouse.move(x + 40, y - 60, { steps: 20 });
  await page.mouse.up();
  assert.equal((await state()).count, 2, "a slow drag rotates, without adding a pin");
  assert.equal((await state()).arcs, 1);
  assert.deepEqual(failures, []);
  console.log("PASS actual sphere/head clicks: pin add/remove/undo, separate sketch/undo, slow drag.");
  console.log(`Screenshots: ${out}`);
} finally {
  await browser.close();
}
