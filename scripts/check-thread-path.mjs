import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://127.0.0.1:4173/").replace(/\/?$/, "/");
const out = "screenshots/thread-path-2026-09-16";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}lab.html`);
  const stage = page.locator("#thread-view");
  const waitStep = step => page.locator(`#sphere[data-step="${step}"]`).waitFor();
  const passed = async () => assert.equal(await page.locator("#validation").getAttribute("data-status"), "passed");
  const frame = name => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await waitStep(8);
  await passed();
  assert.equal(await stage.getAttribute("data-span-count"), "29");
  assert.equal(await stage.getAttribute("data-visible-spans"), "29");
  const initialFrame = await stage.screenshot();
  const length = await page.locator("#length-total").innerText();
  await frame("complete");
  await page.locator("#restart").click();
  await waitStep(0);
  assert.equal(await stage.getAttribute("data-visible-spans"), "0");
  await frame("before-thread");
  for (let step = 1; step <= 8; step++) {
    await page.locator("#next").click();
    await waitStep(step);
    assert.equal(await stage.getAttribute("data-visible-spans"), String(step === 8 ? 29 : 2 + step * 3));
    assert.equal(await page.locator("#length-total").innerText(), length, "playback retains the same full path");
    if (step === 1) await frame("first-stitch");
  }
  assert.deepEqual(await stage.screenshot(), initialFrame, "sequential playback and direct final view agree");
  assert.equal(await page.locator("#next").isDisabled(), true);
  await page.locator("#side").click();
  await frame("side");
  await page.locator("#closeup").click();
  assert.equal(await stage.getAttribute("data-inside"), "true");
  assert.equal(await page.locator("#length-total").innerText(), length, "camera and transparency retain physical length");
  await frame("catch-inside-close");
  await page.locator("#inside").uncheck();
  await page.waitForFunction(() => document.querySelector("#thread-view").dataset.inside === "false");
  await frame("catch-opaque-close");
  await page.locator("#front").click();
  await page.locator(".view-settings summary").click();
  for (let center = 0; center < 6; center++) {
    await page.selectOption("#center", String(center));
    await page.waitForFunction(c => document.querySelector("#sphere").dataset.center === String(c), center);
    for (const reverse of [true, false]) {
      await page.locator("#reverse").setChecked(reverse);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await passed();
      assert.equal(await page.locator("#length-total").innerText(), length, "equivalent centers and handedness retain length");
    }
  }
  for (const circumference of [180, 230, 360]) {
    await page.locator("#circumference").fill(String(circumference));
    await page.waitForFunction(c => document.querySelector("#circumference-value").textContent === `${c/10} см`, circumference);
    await passed();
  }
  await page.locator("#circumference").fill("230");
  await page.selectOption("#center", "0");
  await page.locator(".view-settings summary").click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no overflow at ${width}`);
    const size = await stage.boundingBox();
    assert.ok(size.width >= 270 && Math.abs(size.width - size.height) < 1, `usable square canvas at ${width}`);
    await frame(`mobile-${width}`);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, base, errors, screenshots: out, length, centers: 6, viewports: [1440, 390, 320] }));
} finally {
  await browser.close();
}
