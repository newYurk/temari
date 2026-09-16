import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://127.0.0.1:4173/").replace(/\/?$/, "/");
const out = "screenshots/uwagake-row2-2026-09-16";
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
  await waitStep(16);
  await passed();
  const spanCount = Number(await stage.getAttribute("data-span-count"));
  assert.ok(spanCount > 29, "two rounds contain a continuous additional path");
  assert.equal(await stage.getAttribute("data-visible-spans"), String(spanCount));
  const initialFrame = await stage.screenshot();
  const length = await page.locator("#length-total").innerText();
  await frame("complete");
  await page.locator("#restart").click();
  await waitStep(0);
  assert.equal(await stage.getAttribute("data-visible-spans"), "0");
  await frame("before-thread");
  let previousVisible = 0;
  for (let step = 1; step <= 16; step++) {
    await page.locator("#next").click();
    await waitStep(step);
    const visible = Number(await stage.getAttribute("data-visible-spans"));
    assert.ok(visible > previousVisible && visible <= spanCount, "each step adds its actual path prefix");
    previousVisible = visible;
    assert.equal(await page.locator("#length-total").innerText(), length, "playback retains the same full path");
    if (step === 1) await frame("first-stitch");
    if (step === 8) {
      assert.ok(await stage.getAttribute("data-capture-id"), "first round closes with a capture before continuing");
      await frame("first-round-transition");
    }
    if (step === 10) {
      assert.ok(Number(await stage.getAttribute("data-capture-targets")) >= 3, "second upper bite captures the previous branches and marking");
      await frame("second-round-catch");
    }
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
  await page.locator("#second-catch").click();
  await waitStep(10);
  assert.equal(await stage.getAttribute("data-inside"), "true");
  const highlighted = await stage.screenshot();
  await page.locator("#targets").uncheck();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.notDeepEqual(await stage.screenshot(), highlighted, "captured branches can be located visually");
  assert.equal(await page.locator("#length-total").innerText(), length);
  await page.locator("#targets").check();
  await frame("second-capture-inside-close");
  await page.locator("#step").fill("16");
  await waitStep(16);
  await page.locator("#inside").uncheck();
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
