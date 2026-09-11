import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "/workspace/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function waitKagari(page) {
  await page.waitForFunction(
    () => typeof window.__temari?.freezeKagari === "function" && window.__temari.kagari()?.n > 0,
    null,
    { timeout: 20000 },
  );
}

async function freezeAll(page) {
  await page.evaluate(() => {
    const t = window.__temari;
    t.freezeKagari(t.kagari().n);
  });
  await page.waitForTimeout(280);
}

async function info(page) {
  return page.evaluate(() => {
    const k = window.__temari.kagari();
    const fill = document.querySelector('[aria-label="Залить"]');
    const r = fill?.getBoundingClientRect();
    return {
      ...k,
      hint: document.querySelector("[aria-live]")?.textContent?.trim() ?? "",
      fillDisabled: fill?.getAttribute("aria-disabled") === "true" || fill?.hasAttribute("disabled"),
      fill: fill
        ? {
            x: Math.round(r.x),
            right: Math.round(r.right),
            inView: r.right <= 390 + 1 && r.left >= -1 && r.width > 0,
          }
        : null,
    };
  });
}

async function equator(page) {
  await page.mouse.move(195, 360);
  await page.mouse.down();
  await page.mouse.move(195, 560, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function grazing(page) {
  await page.mouse.move(195, 360);
  await page.mouse.down();
  await page.mouse.move(195, 430, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (err) => console.error("pageerror", err.message));

await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await waitKagari(page);
await freezeAll(page);
console.log("a0", JSON.stringify(await info(page)));
await page.screenshot({ path: `${out}/kiku-pack-a0-pole.png` });
await equator(page);
await page.screenshot({ path: `${out}/kiku-pack-a0-eq.png` });

await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await waitKagari(page);
await freezeAll(page);
await page.getByRole("button", { name: "Кику" }).click();
await page.waitForTimeout(400);
await freezeAll(page);
console.log("star", JSON.stringify(await info(page)));
await page.screenshot({ path: `${out}/kiku-pack-star-pole.png` });
await equator(page);
await page.screenshot({ path: `${out}/kiku-pack-star-eq.png` });

await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await waitKagari(page);
await freezeAll(page);
await page.getByRole("button", { name: "Кику" }).click();
await page.waitForTimeout(400);
await freezeAll(page);
for (let i = 0; i < 10; i++) {
  const before = await info(page);
  await page.getByRole("button", { name: "Залить" }).click();
  await page.waitForTimeout(80);
  await freezeAll(page);
  const after = await info(page);
  if (after.layers === before.layers && after.n === before.n) break;
}
console.log("max", JSON.stringify(await info(page)));
await page.screenshot({ path: `${out}/kiku-pack-max-pole.png` });
await grazing(page);
await page.screenshot({ path: `${out}/kiku-pack-max-grazing.png` });
await equator(page);
await page.screenshot({ path: `${out}/kiku-pack-max-eq.png` });

await page.goto("http://127.0.0.1:8080/", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/kiku-pack-title.png` });

await page.setViewportSize({ width: 1280, height: 800 });
await page.goto("http://127.0.0.1:8080/?kiku=1", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await waitKagari(page);
await freezeAll(page);
await page.getByRole("button", { name: "Кику" }).click();
await page.waitForTimeout(400);
await freezeAll(page);
for (let i = 0; i < 10; i++) {
  const before = await info(page);
  await page.getByRole("button", { name: "Залить" }).click();
  await page.waitForTimeout(80);
  await freezeAll(page);
  const after = await info(page);
  if (after.layers === before.layers && after.n === before.n) break;
}
await page.screenshot({ path: `${out}/kiku-pack-desktop.png` });

await browser.close();
console.log("done");
