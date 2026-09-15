import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "/workspace/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function waitKagari(page) {
  await page.waitForFunction(
    () => typeof window.__temari?.freezeKagari === "function" && window.__temari.kagari()?.n > 0,
    null,
    { timeout: 25000 },
  );
}

const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (err) => console.error("pageerror", err.message));

await page.goto("http://127.0.0.1:8080/", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/kiku-scoop-title.png` });
console.log("title");

await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await waitKagari(page);

await page.evaluate(() => window.__temari.freezeKagari(1));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/kiku-scoop-one-leg.png` });
console.log("one-leg", JSON.stringify(await page.evaluate(() => window.__temari.kagari())));

await page.evaluate(() => window.__temari.freezeKagari(2));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/kiku-scoop-petal.png` });
console.log("petal", JSON.stringify(await page.evaluate(() => window.__temari.kagari())));

await page.evaluate(() => window.__temari.freezeKagari(8));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/kiku-scoop-round.png` });
console.log("round", JSON.stringify(await page.evaluate(() => window.__temari.kagari())));

await browser.close();
console.log("done");
