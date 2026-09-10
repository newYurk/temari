#!/usr/bin/env node
/**
 * Visual gate for maki wrap. Title-with-kiku is not a wrap check.
 * Shots: title, studio Нет (default color), studio Нет after beige wrap.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.WRAP_LOOK_URL || "http://127.0.0.1:8080/";
const out = "/workspace/screenshots";
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
const sewBtn = page.getByRole("button", { name: "Нить", exact: true });
if (await sewBtn.count()) await sewBtn.click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/look-sew.png` });

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);
const beige = page.getByRole("button", { name: "Цвет базы 2" });
if (await beige.count()) await beige.click();
await page.getByRole("button", { name: "Намотать базу" }).click();
await page.waitForTimeout(1400);
if (await netBtn.count()) await netBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/look-beige.png` });

await browser.close();
console.log("wrote look-title.png look-net.png look-sew.png look-beige.png");
