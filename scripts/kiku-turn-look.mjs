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

await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForFunction(
  () => typeof window.__temari?.freezeKagari === "function" && window.__temari.kagari()?.n > 0,
  null,
  { timeout: 25000 },
);

await page.getByRole("button", { name: "Кику" }).click();
await page.waitForTimeout(250);
await page.evaluate(() => {
  const t = window.__temari;
  t.freezeKagari(t.kagari().n);
  for (let i = 0; i < 24; i++) {
    const before = t.kagari().layers;
    t.fillKiku();
    t.freezeKagari(t.kagari().n);
    if (t.kagari().layers === before) break;
  }
});
await page.waitForTimeout(400);

const info = await page.evaluate(() => {
  const t = window.__temari;
  return {
    kagari: t.kagari(),
    pins: t.pins(),
    dump: typeof t.pinDump === "function" ? t.pinDump() : null,
  };
});
console.log("packed", JSON.stringify(info, null, 2));

await page.evaluate(() => {
  window.__temari.face(0, 1, 0);
  window.__temari.dolly(1.22);
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/kiku-turn-pole.png` });
console.log("pole");

const outer = info.dump?.find((p) => String(p.id).startsWith("kiku-0-"));
if (outer) {
  await page.evaluate((p) => {
    window.__temari.face(p[0], p[1], p[2]);
    window.__temari.dolly(1.22);
  }, outer.p);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/kiku-turn-outer.png` });
  console.log("outer", outer.id, outer.p);
} else {
  console.log("no outer pin");
}

await page.evaluate(() => {
  window.__temari.face(0, 1, 0);
  window.__temari.dolly(1.6);
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/kiku-turn-pole-mid.png` });

await browser.close();
console.log("done");
