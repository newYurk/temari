import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { buildUpperBundle } from '../src/components/temari/upper-bundle.ts';
import { sampleCurve } from '../src/components/temari/thread-geometry.ts';
import { Vector3 } from 'three';

// Run against an already built/served tree (this script never starts or stops servers):
// node --import tsx scripts/check-upper-bundle-ui.mjs --base=http://127.0.0.1:4177/ --out=screenshots/upper-bundle
// Chrome is required. Each viewport uses a separate headless browser context; user tabs/storage are untouched.
const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
assert.ok(args.every(arg => /^--(?:base|out)=.+/.test(arg)), 'Supported options: --base=URL --out=DIR');
const out = resolve(root, args.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'screenshots/upper-bundle');
const url = new URL(args.find(arg => arg.startsWith('--base='))?.slice(7) ?? 'http://127.0.0.1:4177/');
url.searchParams.set('upper-bundle', '1');
const base = url.href;
const needleUrl = new URL(base); needleUrl.searchParams.set('control', 'needle');
await mkdir(out, { recursive: true });
const expected = buildUpperBundle();
const report = { base, tests: [], failures: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const hash = data => createHash('sha256').update(data).digest('hex');
function sameNumbers(a, b, path = '') {
  if (typeof a === 'number' && typeof b === 'number') { assert.ok(Math.abs(a - b) < 1e-10, `${path}: cross-runtime float mismatch ${a} vs ${b}`); return; }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) sameNumbers(a[key], b[key], `${path}/${key}`);
  } else assert.equal(a, b, path);
}
// Wait for actual WebGL frames, not merely the React aria-pressed update.
async function rendered(page) {
  await page.evaluate(() => new Promise(resolve => {
    let remaining = 8;
    const frame = () => --remaining ? requestAnimationFrame(frame) : resolve();
    requestAnimationFrame(frame);
  }));
}
async function pixelDifference(page, before, after) {
  return page.evaluate(async ([a, b]) => {
    const pixels = async data => {
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext('2d');
      context.drawImage(image, 0, 0); image.close();
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const left = await pixels(a), right = await pixels(b);
    if (left.width !== right.width || left.height !== right.height) throw new Error('Canvas dimensions changed between modes.');
    let changed = 0, totalDifference = 0;
    for (let i = 0; i < left.data.length; i += 4) {
      const d = [0, 1, 2].reduce((sum, c) => sum + Math.abs(left.data[i + c] - right.data[i + c]), 0);
      if (d > 15) changed++;
      totalDifference += d;
    }
    return { changedFraction: changed / (left.width * left.height), meanChannelDifference: totalDifference / (left.width * left.height * 3) };
  }, [before.toString('base64'), after.toString('base64')]);
}
try {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 844]]) {
    const r = { width, height, errors: [], consoleErrors: [], sourceDifferences: [] }; report.tests.push(r);
    const page = await browser.newPage({ viewport: { width, height }, acceptDownloads: true, reducedMotion: 'reduce' });
    page.on('pageerror', e => r.errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') r.consoleErrors.push(e.text()); });
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        delayed = null;
        postMessage(message, ...rest) {
          window.__qaWorkerPosted = structuredClone(message);
          if (window.__qaDelayNextWorker) {
            window.__qaDelayNextWorker = false;
            this.delayed = setTimeout(() => super.postMessage(message, ...rest), 5000);
            return;
          }
          return super.postMessage(message, ...rest);
        }
        terminate() {
          if (this.delayed !== null) { clearTimeout(this.delayed); window.__qaCancelledBeforePost = true; }
          return super.terminate();
        }
      };
      localStorage.setItem('temari-v1', JSON.stringify({ v: 2, division: 'c10', paletteId: 'matsu', selectedColor: 3, fills: [2], solved: [] }));
      window.__qaSave = localStorage.getItem('temari-v1');
    });
    try {
      await page.goto(base, { waitUntil: 'load', timeout: 60000 });
      await page.getByRole('region', { name: 'Контроль трёх верхних подхватов' }).waitFor();
      await page.locator('canvas').waitFor();
      await page.getByRole('button', { name: 'Схема', exact: true }).click();
      const normal = new Vector3(...expected.focusMm).normalize();
      const down = normal.clone().multiplyScalar(normal.y).sub(new Vector3(0, 1, 0)).normalize();
      const right = new Vector3().crossVectors(down, normal).normalize();
      for (const count of [1, 2, 3]) {
        await page.locator('select').selectOption(String(count));
        const visiblePaths = await page.locator('svg[aria-label^="Три визита"] > g > path').evaluateAll(nodes => nodes.map(n => n.getAttribute('d')));
        const expectedPaths = expected.visits.slice(0, count).flatMap(v => expected.spans.filter(s => v.spanIds.includes(s.id)).map(s =>
          sampleCurve(s.curve, .002).points.map((point, i) => `${i ? 'L' : 'M'}${[new Vector3(...point).dot(right), new Vector3(...point).dot(down)].join(',')}`).join(' ')));
        assert.equal(visiblePaths.length, expectedPaths.length);
        const numbers = d => d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
        visiblePaths.forEach((path, i) => sameNumbers(numbers(path), numbers(expectedPaths[i]), `map/count-${count}/path-${i}`));
        assert.equal(await page.locator('[aria-label="Цвета визитов"] > div').count(), count);
      }
      r.displayedMapExact = true;
      const smallBox = await page.locator('svg[aria-label^="Три визита"]').getAttribute('viewBox');
      await page.getByRole('button', { name: 'Полные пролёты', exact: true }).click();
      const fullBox = await page.locator('svg[aria-label^="Три визита"]').getAttribute('viewBox');
      assert.notEqual(smallBox, fullBox); r.mapViewBoxes = [smallBox, fullBox];
      await page.getByRole('button', { name: 'Крупно острие', exact: true }).click();
      if (width === 1440) await page.screenshot({ path: `${out}/ui-map-${width}.png`, animations: 'disabled' });
      await page.getByRole('button', { name: 'Шар', exact: true }).click();
      for (const name of ['Полюс', 'Крупно', 'Сбоку']) {
        const button = page.getByRole('button', { name, exact: true }); await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
      }
      await rendered(page);
      const solidPixels = await page.locator('canvas').screenshot();
      await page.getByRole('button', { name: 'Прозрачная мари', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Прозрачная мари', exact: true }).getAttribute('aria-pressed'), 'true');
      await rendered(page);
      const transparentPixels = await page.locator('canvas').screenshot();
      r.transparencyPixels = await pixelDifference(page, solidPixels, transparentPixels);
      assert.ok(r.transparencyPixels.changedFraction > .01, 'Changing transparency must change actual rendered pixels.');
      if (width === 390) {
        await writeFile(`${out}/canvas-solid-side-${width}.png`, solidPixels);
        await writeFile(`${out}/canvas-transparent-side-${width}.png`, transparentPixels);
      }
      r.legendAboveCanvas = await page.evaluate(() => {
        const legend = document.querySelector('[aria-label="Цвета визитов"]');
        const canvas = document.querySelector('canvas');
        const z = element => Number(getComputedStyle(element).zIndex) || 0;
        let canvasZ = 0;
        for (let e = canvas; e && e !== legend.parentElement; e = e.parentElement) canvasZ = Math.max(canvasZ, z(e));
        return z(legend) > canvasZ;
      });
      assert.equal(r.legendAboveCanvas, true, 'The visit legend must remain above the 3D canvas.');
      // Delay only this isolated test browser's first worker request to exercise cancellation reliably.
      await page.evaluate(() => { window.__qaDelayNextWorker = true; });
      await page.getByRole('button', { name: 'Проверить исходный путь', exact: true }).click();
      await page.getByRole('button', { name: 'Остановить проверку', exact: true }).click();
      await page.getByRole('button', { name: 'Проверить исходный путь', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.__qaCancelledBeforePost), true);
      assert.equal(await page.getByRole('status').innerText().then(t => t.includes('Проверяются')), false);
      r.workerCancellation = true;
      await page.getByRole('button', { name: 'Проверить исходный путь', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('Проверка выявила недопустимую геометрию.'), null, { timeout: 120000 });
      r.status = await page.getByRole('status').innerText();
      const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Скачать данные', exact: true }).click();
      const d = await downloaded, file = `${out}/ui-export-${width}.json`; await d.saveAs(file);
      const artifact = JSON.parse(await readFile(file, 'utf8'));
      sameNumbers(artifact.bundle, JSON.parse(JSON.stringify(expected))); assert.equal(artifact.audit.status, 'rejected');
      assert.deepEqual(await page.evaluate(() => window.__qaWorkerPosted.bundle), artifact.bundle);
      assert.ok(['build', 'development-startup'].includes(artifact.source.mode));
      r.sourceMode = artifact.source.mode;
      for (const scope of ['model', 'renderer']) {
        assert.equal(artifact.source[scope].digest, hash(JSON.stringify(artifact.source[scope].files)));
        for (const f of artifact.source[scope].files) if (hash(await readFile(`${root}/${f.path}`)) !== f.sha256) r.sourceDifferences.push(f.path);
      }
      assert.equal(artifact.source.dependencies, hash(await readFile(`${root}/package-lock.json`)));
      assert.deepEqual(r.sourceDifferences, [], 'Served provenance must match current sources for this audit. Rebuild/restart a stale server.');
      r.download = file; r.auditStatus = artifact.audit.status;
      r.failedVisitPairs = artifact.audit.betweenVisits.filter(p => p.clearance.status === 'failed').length;
      r.layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        canvas: { width: document.querySelector('canvas').getBoundingClientRect().width, height: document.querySelector('canvas').getBoundingClientRect().height } }));
      assert.equal(r.layout.overflow, false); assert.ok(r.layout.canvas.height > 150);
      assert.equal(await page.evaluate(() => localStorage.getItem('temari-v1') === window.__qaSave), true,
        'the diagnostic page must not overwrite existing workshop settings');
      r.screenshot = `${out}/ui-transparent-side-${width}.png`; await page.screenshot({ path: r.screenshot, animations: 'disabled' });
      await page.getByRole('button', { name: 'Шар', exact: true }).click();
      await page.getByRole('button', { name: 'Крупно', exact: true }).click();
      await rendered(page);
      if (width === 390) await page.screenshot({ path: `${out}/ui-solid-close-${width}.png`, animations: 'disabled' });

      await page.goto(needleUrl.href, { waitUntil: 'load', timeout: 60000 });
      await page.getByRole('region', { name: 'Контроль прямого игольного прохода' }).waitFor();
      await page.locator('canvas').waitFor();
      await page.getByRole('button', { name: 'Рассчитать прямой проход', exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')]
        .some(node => node.textContent?.includes('Прямой расчёт сошёлся; физическая приёмка не выдана.')), null, { timeout: 120000 });
      assert.equal(await page.getByRole('button', { name: 'Результат расчёта', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.match(await page.getByRole('definition').allTextContents().then(values => values.join(' ')), /converged/);
      const needleDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Скачать данные', exact: true }).click();
      const needleArtifactPath = `${out}/needle-export-${width}.json`;
      await (await needleDownload).saveAs(needleArtifactPath);
      const needleArtifact = JSON.parse(await readFile(needleArtifactPath, 'utf8'));
      assert.equal(needleArtifact.version, 2);
      assert.equal(needleArtifact.equilibrium.result.status, 'converged');
      assert.equal(needleArtifact.equilibrium.passageAudit.status, 'passed');
      assert.equal(needleArtifact.equilibrium.geometryInspection.threads[0].mesh.foldedFaces, 0);
      assert.equal(needleArtifact.equilibrium.physicalAcceptance, 'not-certified');
      assert.equal(needleArtifact.equilibrium.result.materialLedger.length, 1);
      assert.equal(needleArtifact.equilibrium.result.materialLedger[0].threadId,
        needleArtifact.equilibrium.route.threadId);
      for (const scope of ['model', 'renderer']) {
        assert.equal(needleArtifact.source[scope].digest, hash(JSON.stringify(needleArtifact.source[scope].files)));
        for (const f of needleArtifact.source[scope].files)
          if (hash(await readFile(`${root}/${f.path}`)) !== f.sha256) r.sourceDifferences.push(f.path);
      }
      await rendered(page);
      r.needleScreenshot = `${out}/needle-resolved-${width}.png`;
      await page.screenshot({ path: r.needleScreenshot, animations: 'disabled' });
      await page.getByRole('button', { name: 'Узкий 2 мм', exact: true }).click();
      await page.getByRole('button', { name: 'Результат расчёта', exact: true }).waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Рассчитать прямой проход', exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')]
        .some(node => node.textContent?.includes('Расчёт остановлен входной геометрией.')), null, { timeout: 120000 });
      assert.match(await page.getByRole('region', { name: 'Контроль прямого игольного прохода' }).innerText(),
        /отклонённая коллизия, красная/);
      r.needleRejectedScreenshot = `${out}/needle-rejected-${width}.png`;
      await page.screenshot({ path: r.needleRejectedScreenshot, animations: 'disabled' });
      r.needleControl = {
        acceptedControl: needleArtifact.equilibrium.physicalAcceptance,
        narrowControl: 'rejected-preflight',
      };
      r.needleLayout = await page.evaluate(() => ({ width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        canvasHeight: document.querySelector('canvas').getBoundingClientRect().height }));
      assert.equal(r.needleLayout.overflow, false);
      assert.ok(r.needleLayout.canvasHeight > 150);
    } catch (e) { r.failure = String(e); report.failures.push({ width, error: String(e) }); }
    if (r.errors.length || r.consoleErrors.length) report.failures.push({ width, errors: r.errors, consoleErrors: r.consoleErrors });
    await page.close(); console.log(JSON.stringify(r));
  }
} finally {
  await browser.close(); await writeFile(`${out}/ui-report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ finished: true, failures: report.failures }));
if (report.failures.length) process.exitCode = 1;
