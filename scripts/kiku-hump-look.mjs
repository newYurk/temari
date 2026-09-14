import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "/workspace/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (err) => console.error("pageerror", err.message));

async function waitKagari() {
  await page.waitForFunction(
    () => typeof window.__temari?.freezeKagari === "function" && window.__temari.kagari()?.n > 0,
    null,
    { timeout: 25000 },
  );
}

async function freeze(n) {
  await page.evaluate((laid) => window.__temari.freezeKagari(laid), n);
  await page.waitForTimeout(180);
}

async function grazing() {
  await page.mouse.move(195, 360);
  await page.mouse.down();
  await page.mouse.move(195, 430, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(450);
}

async function info() {
  return page.evaluate(() => window.__temari.kagari());
}

await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await waitKagari();
const k = await info();
console.log("ready", JSON.stringify(k));

await freeze(2);
console.log("n2", JSON.stringify(await info()));
await page.screenshot({ path: `${out}/kiku-hump-v-pole.png` });
await grazing();
await page.screenshot({ path: `${out}/kiku-hump-v-grazing.png` });

await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await waitKagari();
await freeze(4);
console.log("n4", JSON.stringify(await info()));
await grazing();
await page.screenshot({ path: `${out}/kiku-hump-a0-grazing.png` });

await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await waitKagari();
await freeze(8);
console.log("n8", JSON.stringify(await info()));
await grazing();
await page.screenshot({ path: `${out}/kiku-hump-setA-grazing.png` });

await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await waitKagari();
await freeze(k.n);
await page.evaluate(() => {
  const t = window.__temari;
  for (let i = 0; i < 24; i++) {
    const before = t.kagari().layers;
    t.fillKiku();
    t.freezeKagari(t.kagari().n);
    if (t.kagari().layers === before) break;
  }
});
await page.waitForTimeout(250);
console.log("max", JSON.stringify(await info()));
await grazing();
await page.screenshot({ path: `${out}/kiku-hump-pack-grazing.png` });
await page.screenshot({ path: `${out}/kiku-hump-pack-pole.png` });

await browser.close();
console.log("done");
