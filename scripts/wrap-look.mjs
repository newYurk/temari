#!/usr/bin/env node
/**
 * Visual gate for maki wrap. See public/design.html §6.
 * look-net = studio Пряжа + Нет: crossings, NOT a meridian fan, no felt.
 * A covered accordion still fails. Title-with-kiku is not a wrap check.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.WRAP_LOOK_URL || "http://127.0.0.1:8080/";
const out = new URL("../screenshots", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (err) => console.error("pageerror", err.message));

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/look-title.png` });

await page.getByRole("button", { name: "Намотать базу" }).click();
await page.waitForTimeout(2800);
const netBtn = page.getByRole("button", { name: "Нет" });
if (await netBtn.count()) await netBtn.click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/look-net.png` });

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);
const beige = page.getByRole("button", { name: "Цвет базы 2" });
if (await beige.count()) await beige.click();
await page.getByRole("button", { name: "Намотать базу" }).click();
await page.waitForTimeout(1400);
if (await netBtn.count()) await netBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/look-beige.png` });

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);
const white = page.getByRole("button", { name: "Цвет базы 3" });
if (await white.count()) await white.click();
await page.getByRole("button", { name: "Намотать базу" }).click();
await page.waitForTimeout(1400);
if (await netBtn.count()) await netBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/look-white.png` });

await browser.close();
console.log("wrote look-title.png look-net.png look-beige.png look-white.png");
