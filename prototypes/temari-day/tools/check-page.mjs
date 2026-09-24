// One headless check of the built page (own Chrome, no window): desktop light and phone dark,
// console errors, horizontal scroll, sewing at ×3, shelf after reload, the ideas tab.
//   node prototypes/temari-day/tools/check-page.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(here + 'shots', { recursive: true });
// The artifact host wraps the page in its own skeleton; do the same locally.
const page0 = readFileSync(here + 'out/temari-day.html', 'utf8');
writeFileSync(here + 'out/check.html', '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>' + page0 + '</body></html>');
const url = 'file://' + here + 'out/check.html';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
for (const [name, vp, scheme] of [['desk-light', { width: 1440, height: 900 }, 'light'], ['phone-dark', { width: 390, height: 844 }, 'dark']]) {
  const page = await browser.newPage({ viewport: vp, colorScheme: scheme });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth, day: document.getElementById('cw-name').textContent, threeLoaded: document.getElementById('fallback').hidden, steps: document.querySelectorAll('.step').length }));
  await page.screenshot({ path: `${here}shots/${name}.png`, fullPage: true });
  await page.click('#speed'); await page.click('#sew'); await page.waitForTimeout(3000);
  const midDone = await page.evaluate(() => document.querySelectorAll('.step.done').length);
  await page.click('#finish'); await page.waitForTimeout(300);
  await page.click('#to-shelf'); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1500);
  const shelf = await page.evaluate(() => document.querySelectorAll('.shelf a').length);
  await page.click('#tab-ideas'); await page.waitForTimeout(300);
  const ideasScroll = await page.evaluate(() => document.documentElement.scrollWidth);
  // «Образец»: the sample order gives the seal; all of A before B does not, and nothing marks the error.
  await page.click('#tab-game'); await page.waitForTimeout(200);
  const sample = await page.evaluate(() => {
    const rows = +document.getElementById('game-sub').textContent.match(/по (\d+) кругов/)[1];
    return { rows };
  });
  const order = await page.evaluate(() => [...document.querySelectorAll('#view-day tbody tr')].map((tr) => [...tr.querySelectorAll('td .sw')].map((sw) => sw.textContent.trim())));
  for (const [a, b] of order) {
    await page.click(`#chips-a .chip:has-text("${a}")`);
    await page.click(`#chips-b .chip:has-text("${b}")`);
  }
  const good = await page.evaluate(() => ({ seal: !document.getElementById('seal').hidden, status: document.getElementById('game-status').textContent }));
  await page.screenshot({ path: `${here}shots/${name}-game-right.png`, fullPage: true });
  await page.click('#restart');
  for (const [a] of order) await page.click(`#chips-a .chip:has-text("${a}")`);
  for (const [, b] of order) await page.click(`#chips-b .chip:has-text("${b}")`);
  const bad = await page.evaluate(() => ({ seal: !document.getElementById('seal').hidden, status: document.getElementById('game-status').textContent }));
  await page.screenshot({ path: `${here}shots/${name}-game-wrong.png`, fullPage: true });
  const gameScroll = await page.evaluate(() => document.documentElement.scrollWidth);
  report.push({ name, ...info, midDone, shelfAfterReload: shelf, ideasScroll, game: { rows: sample.rows, rightOrder: good, allABeforeB: bad, scrollWidth: gameScroll }, errors });
  await page.close();
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
