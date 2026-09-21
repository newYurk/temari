import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:8860/";
const out = resolve("screenshots/kiku-review-2026-09-21");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  const states = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("?kiku=1", base).href);
  await page.waitForFunction(() => typeof window.__temari?.packKiku === "function");
  for (const [name, rounds, laid, face] of [
    ["first-stitch", 1, 1, [0, 1, 0]],
    ["first-group", 1, 8, [0, 1, 0]],
    ["first-round", 1, 16, [0, 1, 0]],
    ["third-round", 3, 48, [0, 1, 0]],
    ["third-round-silhouette", 3, 48, [0, 0.4, 1]],
    ["ten-rounds", 10, 160, [0, 1, 0]],
    ["ten-rounds-silhouette", 10, 160, [0, 0.4, 1]],
  ]) {
    await page.evaluate(({ rounds, laid, face }) => {
      const t = window.__temari;
      t.setColor(2);
      t.packKiku(rounds);
      t.freezeKagari(laid);
      t.face(...face);
      t.dolly(4.3);
    }, { rounds, laid, face });
    await page.waitForFunction((expected) => window.__temari.kagari().laid === expected, laid);
    await page.waitForTimeout(500);
    states.push({ name, state: await page.evaluate(() => window.__temari.kagari()) });
    await page.screenshot({ path: resolve(out, `${name}.png`) });
  }
  writeFileSync(resolve(out, "states.json"), JSON.stringify({ base, states, errors }, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Captured ${states.length} stages in ${out}. Screenshots require visual review; this is not craft acceptance.`);
} finally {
  await browser.close();
}
