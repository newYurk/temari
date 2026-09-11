import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "/workspace/screenshots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: "no-preference",
});

async function shot(name, url, laid, viewport) {
  const page = await context.newPage();
  if (viewport) await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  page.on("pageerror", (err) => console.error("pageerror", name, err.message));
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: (q) => {
          const reduce = String(q).includes("prefers-reduced-motion");
          return {
            matches: reduce ? false : false,
            media: q,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
              return false;
            },
          };
        },
      });
    } catch {
      /* ignore */
    }
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  if (url.includes("kiku=1")) {
    await page.waitForFunction(
      () => typeof window.__temari?.freezeKagari === "function" && window.__temari.kagari()?.n > 0,
      null,
      { timeout: 20000 },
    );
    await page.evaluate((n) => {
      const t = window.__temari;
      if (n < 0) t.freezeKagari(t.kagari().n);
      else t.freezeKagari(n);
    }, laid);
    await page.waitForTimeout(700);
    console.log(name, JSON.stringify(await page.evaluate(() => window.__temari.kagari())));
  } else {
    await page.waitForTimeout(2800);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.close();
  console.log("wrote", name);
}

await shot("kiku-uw-title", "http://127.0.0.1:8080/", 0);
await shot("kiku-uw-star", "http://127.0.0.1:8080/?kiku=1", 16);
await shot("kiku-uw-two", "http://127.0.0.1:8080/?kiku=1", 32);
await shot("kiku-uw-done", "http://127.0.0.1:8080/?kiku=1", -1);
await shot("kiku-uw-desktop", "http://127.0.0.1:8080/?kiku=1", 32, {
  width: 1280,
  height: 800,
});

await browser.close();
console.log("done");
