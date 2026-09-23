import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { buildSingleNeedleCatch } from '../src/components/temari/single-needle-catch.ts';

// Run against an existing server; this never starts/stops servers or uses user tabs.
// node --import tsx scripts/check-needle-channel-ui.mjs --base=http://127.0.0.1:4177/ --out=screenshots/needle-channel-control
// Chrome is required. Exports, reports and selected screenshots remain in the ignored output directory.
const root = resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
assert.ok(args.every(arg => /^--(?:base|out)=.+/.test(arg)), 'Supported options: --base=URL --out=DIR');
const out = resolve(root, args.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'screenshots/needle-channel-control');
const url = new URL(args.find(arg => arg.startsWith('--base='))?.slice(7) ?? 'http://127.0.0.1:4177/');
url.searchParams.set('upper-bundle', '1'); url.searchParams.set('control', 'needle');
const base = url.href, hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { base, tests: [], failures: [] };
await mkdir(out, { recursive: true });
const expected = new Map(['clearance-control', 'narrow'].flatMap(caseId => [60, 40].map(feed =>
  [`${caseId}-${feed}`, JSON.parse(JSON.stringify(buildSingleNeedleCatch(caseId, feed)))])));
function sameNumbers(a, b, path = '') {
  if (typeof a === 'number' && typeof b === 'number') {
    assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9, `${path}: ${a} != ${b}`); return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) sameNumbers(a[key], b[key], `${path}/${key}`);
  } else assert.equal(a, b, path);
}
const numbers = text => text.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function rendered(page) {
  await page.evaluate(() => new Promise(resolve => {
    let left = 8; const frame = () => --left ? requestAnimationFrame(frame) : resolve(); requestAnimationFrame(frame);
  }));
}
async function pixelDifference(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const decode = async data => {
      const image = await createImageBitmap(new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext('2d');
      context.drawImage(image, 0, 0); image.close(); return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const before = await decode(a), after = await decode(b);
    if (before.width !== after.width || before.height !== after.height) throw new Error('Canvas dimensions changed between paired images.');
    let changed = 0, sum = 0;
    for (let i = 0; i < before.data.length; i += 4) {
      const d = [0, 1, 2].reduce((s, c) => s + Math.abs(before.data[i + c] - after.data[i + c]), 0);
      if (d > 15) changed++; sum += d;
    }
    return { changedFraction: changed / (before.width * before.height), meanChannelDifference: sum / (before.width * before.height * 3) };
  }, [a.toString('base64'), b.toString('base64')]);
}
async function sectionCheck(page, model, needle) {
  await button(page, 'Сечение').click(); await button(page, needle ? 'Игла' : 'Нить').click();
  const svg = page.getByRole('img', { name: 'Сечение прямого канала в миллиметрах' });
  const paths = await svg.locator(':scope > path').evaluateAll(nodes => nodes.map(n => ({
    d: n.getAttribute('d'), width: n.getAttribute('stroke-width'), cap: n.getAttribute('stroke-linecap'), colour: n.getAttribute('stroke'),
  })));
  assert.equal(paths.length, 6);
  const { R, widthMm, layerThickness, rThread, rNeedle } = model.parameters;
  const depth = R - Math.sqrt(R * R - widthMm * widthMm / 4);
  sameNumbers(numbers(paths[4].d), [widthMm / 2, depth, -widthMm / 2], 'section/capsule-axis');
  sameNumbers(Number(paths[4].width), 2 * (needle ? rNeedle : rThread), 'section/capsule-diameter');
  assert.equal(paths[4].cap, needle ? 'round' : 'butt'); assert.equal(paths[4].colour, needle ? '#777e88' : '#e8b020');
  for (const [path, radius] of [[paths[2], R], [paths[3], R - layerThickness]]) {
    const points = numbers(path.d); assert.equal(points.length, 322);
    for (let i = 0; i < points.length; i += 2) {
      const [x, y] = points.slice(i, i + 2);
      assert.ok(Math.abs(x * x + (R - y) ** 2 - radius * radius) < 1e-8, 'section boundary must follow its declared sphere');
    }
  }
  const circles = await svg.locator(':scope > circle').evaluateAll(nodes => nodes.map(n =>
    ['cx', 'cy', 'r'].map(name => Number(n.getAttribute(name)))));
  sameNumbers(circles, [[0, -.1, .1], [widthMm / 2, depth, .045], [-widthMm / 2, depth, .045]], 'section/marking-and-ports');
}
async function downloadCheck(page, model, name, result) {
  const event = page.waitForEvent('download'); await button(page, 'Скачать данные').click();
  const download = await event, file = `${out}/${name}.json`; await download.saveAs(file);
  const artifact = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(artifact.kind, 'single-needle-catch-diagnostic'); assert.equal(artifact.version, 1);
  sameNumbers(artifact.model, model, 'export/model');
  assert.equal(new Set(artifact.model.spans.map(s => s.threadId)).size, 1);
  assert.equal(artifact.model.channel.spans[0].threadId, artifact.model.spans[0].threadId);
  assert.deepEqual(artifact.model.channel.spans[0].curve, artifact.model.spans.find(s => s.zone === 'piercing').curve);
  assert.ok(['build', 'development-startup'].includes(artifact.source.mode));
  const differences = [];
  for (const scope of ['model', 'renderer']) {
    assert.equal(artifact.source[scope].digest, hash(JSON.stringify(artifact.source[scope].files)));
    for (const f of artifact.source[scope].files) if (hash(await readFile(resolve(root, f.path))) !== f.sha256) differences.push(f.path);
  }
  assert.equal(artifact.source.dependencies, hash(await readFile(resolve(root, 'package-lock.json'))));
  result.sourceDifferences.push(...differences);
  result.exports.push({ file, caseId: model.caseId, feed: model.parameters.suppliedLengthMm,
    status: model.status, geometry: model.geometryStatus, material: model.material.status, sourceMode: artifact.source.mode });
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 844]]) {
    const r = { width, height, errors: [], consoleErrors: [], sourceDifferences: [], exports: [] }; report.tests.push(r);
    const page = await browser.newPage({ viewport: { width, height }, acceptDownloads: true, reducedMotion: 'reduce' });
    page.on('pageerror', e => r.errors.push(e.message)); page.on('console', e => { if (e.type() === 'error') r.consoleErrors.push(e.text()); });
    await page.addInitScript(() => {
      localStorage.setItem('temari-v1', JSON.stringify({ v: 2, division: 'c10', paletteId: 'matsu', selectedColor: 3, fills: [2], solved: [] }));
      localStorage.setItem('needle-qa-sentinel', 'unchanged'); window.__needleQASaved = JSON.stringify({ ...localStorage });
    });
    try {
      await page.goto(base, { waitUntil: 'load', timeout: 60000 });
      await page.getByRole('region', { name: 'Контроль прямого игольного прохода' }).waitFor(); await page.locator('canvas').waitFor();
      for (const caseId of ['clearance-control', 'narrow']) for (const feed of [60, 40]) {
        const model = expected.get(`${caseId}-${feed}`);
        await button(page, caseId === 'narrow' ? 'Узкий 2 мм' : 'Контроль 11 мм').click();
        await page.getByRole('combobox', { name: 'Подача материала' }).selectOption(String(feed));
        const status = await page.getByRole('status').innerText();
        assert.equal(status.includes('Контроль отклонён.'), model.status === 'rejected');
        assert.equal(status.includes('Геометрия проверена. Механика не рассчитана.'), model.status === 'unresolved');
        const balance = await page.locator('[aria-label="Баланс материала"] dt').evaluateAll(nodes =>
          Object.fromEntries(nodes.map(n => [n.textContent, n.nextElementSibling.textContent])));
        assert.equal(balance['Баланс'], model.material.status === 'conserved' ? 'Сходится' : 'Не сходится');
        const numeric = text => Number(text.replace(/\s|мм/g, '').replace(',', '.'));
        assert.ok(Math.abs(numeric(balance['Показанный участок, включая свободный конец']) - model.geometryLengthMm) < .00051);
        assert.ok(Math.abs(numeric(balance['В запасе вне изображения']) - model.material.reservoirAfterMm) < .00051);
        await downloadCheck(page, model, `export-${caseId}-${feed}-${width}`, r);
        await sectionCheck(page, model, false); await sectionCheck(page, model, true);
        if (feed === 60 && ((caseId === 'clearance-control' && width === 1440) || (caseId === 'narrow' && width === 390))) {
          await page.screenshot({ path: `${out}/section-${caseId}-needle-${width}.png`, animations: 'disabled' });
          await button(page, 'Нить').click();
          await page.screenshot({ path: `${out}/section-${caseId}-thread-${width}.png`, animations: 'disabled' });
        }
      }
      r.sectionAnalyticChecks = true;
      await button(page, 'Контроль 11 мм').click(); await page.getByRole('combobox', { name: 'Подача материала' }).selectOption('60');
      await button(page, 'Нить').click(); await button(page, 'Шар').click();
      for (const name of ['Полюс', 'Крупно', 'Сбоку']) { await button(page, name).click(); assert.equal(await button(page, name).getAttribute('aria-pressed'), 'true'); }
      await rendered(page); const solid = await page.locator('canvas').screenshot();
      await button(page, 'Прозрачная мари').click(); await rendered(page); const transparent = await page.locator('canvas').screenshot();
      r.transparencyPixels = await pixelDifference(page, solid, transparent);
      assert.ok(r.transparencyPixels.changedFraction > .01, 'Transparency must affect actual rendered pixels.');
      await button(page, 'Игла').click(); await rendered(page); const needle = await page.locator('canvas').screenshot();
      r.needleThreadPixels = await pixelDifference(page, transparent, needle);
      assert.ok(r.needleThreadPixels.changedFraction > .001, 'Needle view must differ from the whole yarn path.');
      assert.ok((await page.locator('[aria-label="Легенда контроля"]').innerText()).includes('Игла · только участок канала'));
      if (width === 390) for (const [name, image] of [['solid', solid], ['transparent', transparent], ['needle', needle]]) {
        await writeFile(`${out}/canvas-wide-${name}-${width}.png`, image);
      }
      await button(page, 'Нить').click(); await rendered(page);
      r.legendAboveCanvas = await page.evaluate(() => {
        const legend = document.querySelector('[aria-label="Легенда контроля"]'), canvas = document.querySelector('canvas');
        const z = e => Number(getComputedStyle(e).zIndex) || 0;
        let canvasZ = 0; for (let e = canvas; e && e !== legend.parentElement; e = e.parentElement) canvasZ = Math.max(canvasZ, z(e));
        return z(legend) > canvasZ;
      });
      assert.equal(r.legendAboveCanvas, true);
      r.layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > innerWidth, canvasHeight: document.querySelector('canvas').getBoundingClientRect().height }));
      assert.equal(r.layout.overflow, false); assert.ok(r.layout.canvasHeight > 150);
      assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage }) === window.__needleQASaved), true);
      await page.screenshot({ path: `${out}/wide-transparent-${width}.png`, animations: 'disabled' });
      if (width === 390) {
        const hrefs = await page.locator('a').evaluateAll(nodes => nodes.map(n => n.href)); r.links = [];
        const linkPage = await browser.newPage({ viewport: { width, height } });
        try {
          for (const href of hrefs) {
            const response = await linkPage.goto(href, { waitUntil: 'load' }); assert.equal(response.status(), 200);
            const target = new URL(href);
            if (target.hash) assert.equal(await linkPage.locator(`[id="${decodeURIComponent(target.hash.slice(1))}"]`).count(), 1, `Missing anchor: ${href}`);
            else if (target.searchParams.get('upper-bundle') === '1') await linkPage.getByRole('region', { name: 'Контроль трёх верхних подхватов' }).waitFor();
            else await linkPage.locator('canvas').waitFor();
            assert.equal(await linkPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            if (target.hash) await linkPage.screenshot({ path: `${out}/design-needle-channel-${width}.png`, animations: 'disabled' });
            r.links.push(href);
          }
        } finally { await linkPage.close(); }
      }
      assert.deepEqual([...new Set(r.sourceDifferences)], [], 'Served provenance is stale; rebuild/restart before accepting this run.');
    } catch (error) {
      r.failure = String(error); report.failures.push({ width, error: String(error) });
    } finally { await page.close(); }
    if (r.errors.length || r.consoleErrors.length) report.failures.push({ width, errors: r.errors, consoleErrors: r.consoleErrors });
    console.log(JSON.stringify(r));
  }
} finally { await browser.close(); await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ finished: true, failures: report.failures }));
if (report.failures.length) process.exitCode = 1;
