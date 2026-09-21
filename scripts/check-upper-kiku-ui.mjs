import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

// Usage: node scripts/check-upper-kiku-ui.mjs [baseUrl] [outDir] [--idle-only]
// One cancelled start and one complete real worker run; no per-viewport solves.
const base = new URL(process.argv[2] ?? "http://127.0.0.1:8867/");
const out = resolve(process.argv[3] ?? "screenshots/upper-control");
const idleOnly = process.argv.includes("--idle-only");
const root = fileURLToPath(new URL("../", import.meta.url));
const controlUrl = new URL(base);
controlUrl.searchParams.set("upper-kiku", "1");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const timeout = 30 * 60 * 1000;
const views = ["Полюс", "Крупно", "Сбоку"];
const report = {
  base: base.href, controlUrl: controlUrl.href, startedAt: new Date().toISOString(),
  mode: idleOnly ? "idle-only" : "real-worker",
  timeoutMs: timeout, checks: [], workers: [], progress: [], errors: [], failures: [],
};
await mkdir(out, { recursive: true });
const sourceHashes = new Map(await Promise.all(
  (await readdir(resolve(root, "src"), { recursive: true }))
    .filter(path => /\.(ts|tsx)$/.test(path))
    .map(async path => [`src/${path}`, sha256(await readFile(resolve(root, "src", path)))]),
));
const lockHash = sha256(await readFile(resolve(root, "package-lock.json")));
const saveReport = () => writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
const browser = await chromium.launch({ channel: "chrome", headless: true });
report.chrome = browser.version();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 }, hasTouch: true, reducedMotion: "reduce",
});
const page = await context.newPage();
const recordErrors = p => {
  p.on("pageerror", error => report.errors.push(error.message));
  p.on("console", message => {
    if (message.type() === "error") report.errors.push(message.text());
  });
};
recordErrors(page);
page.on("worker", worker => {
  const record = { url: worker.url(), createdAt: new Date().toISOString() };
  report.workers.push(record);
  worker.on("close", () => { record.closedAt = new Date().toISOString(); });
});
const button = (p, name) => p.getByRole("button", { name, exact: true });
const activate = (p, locator) => p.viewportSize().width < 500 ? locator.tap() : locator.click();
const frame = async p => {
  await p.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return false;
    const r = canvas.getBoundingClientRect(), parent = canvas.parentElement.getBoundingClientRect();
    return r.width > 0 && r.height > 0 &&
      Math.abs(r.width - parent.width) < 1 && Math.abs(r.height - parent.height) < 1;
  });
  await p.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
};
const storage = p => p.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]),
));
let saved;
const check = async (name, fn) => {
  try {
    await fn();
    report.checks.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    report.failures.push({ name, error: error.stack ?? String(error) });
    console.error(`FAIL ${name}: ${error.message}`);
  }
  await saveReport();
};
const unchanged = async (p, phase) => {
  assert.deepEqual(await storage(p), saved, `${phase}: ordinary localStorage is byte-for-byte unchanged`);
};
const nativeDisabled = async locator => {
  assert.equal(await locator.evaluate(el => el instanceof HTMLButtonElement && el.disabled), true);
};
const shot = async (p, name) => {
  await frame(p);
  await p.screenshot({ path: resolve(out, `${name}.png`), animations: "disabled" });
};
const isolated = async p => {
  await p.getByText("Верхний клин · контроль, не принятая кику", { exact: true }).waitFor();
  for (const name of ["Узор", "Нити", "Ещё", "Булавки", "Отменить", "Выбрать узор", "Начать кику"]) {
    assert.equal(await button(p, name).count(), 0, `normal action ${name} must not leak into the control`);
  }
  assert.equal(await p.getByRole("navigation").count(), 0);
  assert.equal(await p.getByRole("dialog").count(), 0);
  assert.equal(await p.locator("canvas").count(), 1);
  assert.equal(await p.getByRole("alert").count(), 0);
};
const layout = async (p, tag) => {
  await frame(p);
  const measurements = await p.locator("canvas").evaluate(canvas => {
    const r = canvas.getBoundingClientRect();
    const main = canvas.closest("section");
    const header = main.querySelector("header").getBoundingClientRect();
    const panel = main.querySelector('[role="status"]').parentElement.getBoundingClientRect();
    const probes = [0.15, 0.5, 0.85].flatMap(y => [0.15, 0.5, 0.85].map(x =>
      document.elementFromPoint(r.left + r.width * x, r.top + r.height * y) === canvas));
    return {
      canvas: { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom },
      headerBottom: header.bottom, panelTop: panel.top,
      clear: probes.every(Boolean),
      fits: r.left >= 0 && r.right <= innerWidth + 1 && panel.bottom <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
    };
  });
  report.layouts ??= {};
  report.layouts[tag] = measurements;
  assert.ok(measurements.canvas.height >= 200, `${tag}: meaningful canvas height`);
  assert.ok(measurements.canvas.y >= measurements.headerBottom - 1);
  assert.ok(measurements.canvas.bottom <= measurements.panelTop + 1, `${tag}: controls cannot cover canvas`);
  assert.equal(measurements.clear, true, `${tag}: all nine canvas hit tests are clear`);
  assert.equal(measurements.fits, true, `${tag}: no viewport overflow`);
  for (const control of await p.locator("button, a, summary").all()) {
    if (!(await control.isVisible())) continue;
    await control.scrollIntoViewIfNeeded();
    const accessible = await control.evaluate(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 1 &&
        r.top >= 0 && r.bottom <= innerHeight + 1 && (hit === el || el.contains(hit));
    });
    assert.equal(accessible, true, `${tag}: reachable ${await control.innerText()}`);
    if (await control.isEnabled()) await control.click({ trial: true });
  }
  await p.getByRole("status").evaluate(el => { el.parentElement.scrollTop = 0; });
};
const cameraShots = async (p, tag, compare = false) => {
  const hashes = [];
  for (const [index, name] of views.entries()) {
    await activate(p, button(p, name));
    for (const other of views) {
      assert.equal(await button(p, other).getAttribute("aria-pressed"), String(other === name));
    }
    await shot(p, `${tag}-${["pole", "close", "side"][index]}`);
    hashes.push(sha256(await p.locator("canvas").screenshot({ animations: "disabled" })));
    await unchanged(p, `${tag}/${name}`);
  }
  if (compare) assert.equal(new Set(hashes).size, 3, "all three camera presets change the rendered canvas");
};
const normalSmoke = async p => {
  await button(p, "Узор").waitFor();
  assert.equal(await p.getByText("Верхний клин · контроль, не принятая кику", { exact: true }).count(), 0);
  assert.equal(await button(p, "Рассчитать").count(), 0);
  for (const name of ["Узор", "Нити", "Ещё", "Булавки", "Отменить"]) {
    assert.equal(await button(p, name).count(), 1);
  }
  await button(p, "Узор").click();
  const dialog = p.getByRole("dialog", { name: "Узор и разметка", exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.evaluate(el => el.matches(":modal")), true);
  await p.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
};
const returnToOrdinary = async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Вернуться к вышивке", exact: true }).click();
  await check("return to ordinary UI without overwriting saved work", async () => {
    await normalSmoke(page);
    await shot(page, "ordinary-after");
    await writeFile(resolve(out, "ordinary-storage-after.json"), JSON.stringify(await storage(page), null, 2) + "\n");
    await unchanged(page, "returning");
  });
};

const run = async () => {
  await page.goto(base.href);
  await normalSmoke(page);
  await page.waitForFunction(() => window.__temari?.pinState);
  const canvas = await page.locator("canvas").boundingBox();
  assert.ok(canvas);
  for (const [dx, dy] of [[-30, -20], [40, 25]]) {
    await page.mouse.click(canvas.x + canvas.width / 2 + dx, canvas.y + canvas.height / 2 + dy);
  }
  await page.waitForFunction(() => window.__temari.pins() === 2);
  saved = await storage(page);
  assert.ok(JSON.parse(saved["temari-v1"]).pins.length >= 2, "use a genuine nonempty ordinary UI save");
  await writeFile(resolve(out, "ordinary-storage-before.json"), JSON.stringify(saved, null, 2) + "\n");
  await shot(page, "ordinary-before");
  const disabledGate = new URL(base);
  disabledGate.searchParams.set("upper-kiku", "0");
  await page.goto(disabledGate.href);
  await check("disabled query gate leaves ordinary UI and save unchanged", async () => {
    await normalSmoke(page);
    await unchanged(page, "disabled gate");
  });
  await page.goto(controlUrl.href);
  await isolated(page);
  await check("initial control, disabled actions and saved-state isolation", async () => {
    await nativeDisabled(button(page, "Скачать расчёт"));
    await nativeDisabled(button(page, "Только первый ряд"));
    assert.equal(await button(page, "Рассчитать").isEnabled(), true);
    assert.equal(report.workers.length, 0, "visiting does not auto-start computation");
    await unchanged(page, "visiting");
    await layout(page, "desktop-idle");
    await cameraShots(page, "desktop-idle");
  });

  for (const [width, height, tag] of [[390, 844, "phone"], [320, 640, "narrow"]]) {
    const mobile = await browser.newContext({
      viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: "reduce",
      storageState: { cookies: [], origins: [{
        origin: base.origin, localStorage: Object.entries(saved).map(([name, value]) => ({ name, value })),
      }] },
    });
    try {
      const p = await mobile.newPage();
      recordErrors(p);
      let workers = 0;
      p.on("worker", () => { workers++; });
      await p.goto(controlUrl.href);
      await isolated(p);
      await check(`${tag}: true mobile idle layout and touch cameras, no calculation`, async () => {
        await nativeDisabled(button(p, "Скачать расчёт"));
        await nativeDisabled(button(p, "Только первый ряд"));
        await layout(p, `${tag}-idle`);
        await cameraShots(p, `${tag}-idle`);
        assert.equal(workers, 0);
        await unchanged(p, tag);
      });
    } finally { await mobile.close(); }
  }

  if (idleOnly) {
    await check("idle-only mode launches zero workers", async () => {
      assert.equal(report.workers.length, 0);
    });
    await returnToOrdinary();
    return;
  }

  await button(page, "Рассчитать").click();
  await button(page, "Остановить").waitFor();
  await button(page, "Остановить").click();
  await check("cancel terminates worker without result or save mutation", async () => {
    await button(page, "Рассчитать").waitFor();
    assert.equal(await page.getByRole("status").innerText(), "Расчёт остановлен. Результата нет.");
    await nativeDisabled(button(page, "Скачать расчёт"));
    await nativeDisabled(button(page, "Только первый ряд"));
    await unchanged(page, "cancelling");
  });

  const began = Date.now();
  await button(page, "Рассчитать").click();
  await button(page, "Остановить").waitFor();
  await nativeDisabled(button(page, "Скачать расчёт"));
  await nativeDisabled(button(page, "Только первый ряд"));
  console.log("REAL worker started; timeout 30 minutes. No additional per-viewport calculations.");
  let previous = "", heartbeat = began;
  while (await button(page, "Остановить").count()) {
    assert.ok(Date.now() - began < timeout, "real worker exceeded the 30-minute timeout");
    assert.equal(await page.getByRole("alert").count(), 0, "worker/rendering alert");
    await unchanged(page, "calculating");
    const message = await page.getByRole("status").innerText();
    if (message !== previous) {
      report.progress.push({ elapsedMs: Date.now() - began, message });
      console.log(`${Math.round((Date.now() - began) / 1000)}s ${message}`);
      previous = message;
      await saveReport();
    }
    if (Date.now() - heartbeat >= 60000) {
      console.log(`Worker still active: ${Math.round((Date.now() - began) / 1000)}s`);
      heartbeat = Date.now();
    }
    await delay(2000);
  }
  report.calculationMs = Date.now() - began;
  assert.equal(await page.getByRole("alert").count(), 0,
    `worker/rendering error: ${await page.getByRole("alert").allTextContents()}`);
  assert.equal(await button(page, "Скачать расчёт").isEnabled(), true, "real result must be exportable");
  const downloaded = page.waitForEvent("download");
  await button(page, "Скачать расчёт").click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), "upper-kiku-diagnostic.json");
  const artifact = resolve(out, "upper-kiku-diagnostic.json");
  await download.saveAs(artifact);
  assert.equal(await download.failure(), null);
  const snapshot = JSON.parse(await readFile(artifact, "utf8"));
  report.actual = {
    resultStatus: snapshot.result.status, geometryStatus: snapshot.result.geometryStatus,
    topologyStatus: snapshot.result.topologyStatus, mesh: snapshot.mesh,
    source: snapshot.source, diagnostics: snapshot.result.diagnostics,
  };

  await check("export schema, build provenance and finite mesh metrics", async () => {
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.source.mode, "build");
    assert.equal(snapshot.source.dependencies, lockHash);
    for (const [name, entry] of [["model", "upper-kiku.ts"], ["renderer", "thread-path-mesh.ts"]]) {
      const source = snapshot.source[name];
      assert.ok(source.files.some(file => file.path === `src/components/temari/${entry}`));
      assert.equal(new Set(source.files.map(file => file.path)).size, source.files.length);
      assert.equal(source.digest, sha256(JSON.stringify(source.files)));
      for (const file of source.files) assert.equal(file.sha256, sourceHashes.get(file.path), file.path);
    }
    assert.equal(snapshot.result.model, "upper-whole-span-v1");
    assert.deepEqual(snapshot.result.factors, [1.5, 2, 2.5]);
    assert.equal(snapshot.result.rows.length, 2);
    assert.equal(snapshot.result.levels.length, 3);
    assert.equal(snapshot.result.levels.reduce((n, level) => n + level.rows.length * 2, 0), 12);
    assert.ok(["unresolved", "rejected"].includes(snapshot.result.status), "full acceptance must never be passed");
    assert.equal(snapshot.result.topologyStatus, "partial");
    assert.ok(["passed", "unresolved", "failed"].includes(snapshot.result.geometryStatus));
    assert.ok(["passed", "unresolved"].includes(snapshot.mesh.status));
    assert.ok(Number.isFinite(snapshot.mesh.bodyGapMm));
    assert.ok(Number.isFinite(snapshot.mesh.envelopeErrorMm) && snapshot.mesh.envelopeErrorMm >= 0);
    if (snapshot.mesh.status === "passed") {
      assert.ok(snapshot.mesh.bodyGapMm > 0);
      assert.deepEqual(snapshot.mesh.diagnostics, []);
    } else assert.ok(snapshot.mesh.diagnostics.length > 0);
  });
  await check("row-major ladder freezes finest earlier material and couples current I/O at the same level", async () => {
    const levels = snapshot.result.levels;
    const finest = levels.at(-1);
    assert.equal(finest.factor, 2.5);
    const earlier = finest.rows[0].coupon;
    for (const level of levels) {
      assert.equal(level.rows[0].fixedEarlierFactor, null);
      assert.equal(level.rows[1].fixedEarlierFactor, finest.factor);
      assert.deepEqual(level.rows[1].incoming.supports, levels[0].rows[1].incoming.supports,
        `${level.factor}: earlier material cannot change between resolutions`);
      for (const row of level.rows) {
        assert.deepEqual(
          row.outgoing.supports.filter(support => support.id !== "current-incoming"),
          row.incoming.supports,
        );
        const current = row.outgoing.supports.find(support => support.id === "current-incoming");
        assert.ok(current, `${level.factor}/row${row.visit.row}: outgoing carries its current incoming support`);
        assert.deepEqual(current.piecesMm,
          row.incoming.result.curves.filter(curve => curve.kind === "bezier").map(curve => curve.controls),
          "outgoing must use the incoming result of this same resolution");
      }
      for (const operation of earlier.operations) {
        const pieces = earlier.spans.filter(span => span.opId === operation.id && span.curve.kind === "bezier")
          .map(span => span.curve.controls);
        assert.ok(pieces.length > 0, `${operation.id}: expected earlier cubic support`);
        const support = level.rows[1].incoming.supports.find(support => support.id === operation.id);
        assert.ok(support, `${level.factor}: earlier operation ${operation.id} is recorded`);
        assert.deepEqual(support.piecesMm, pieces, "earlier support must equal row1 finest geometry");
      }
    }
    report.fixedEarlierFactor = finest.factor;
  });
  await check("display reports actual solver/mesh status without craft acceptance", async () => {
    assert.match(await page.getByRole("status").innerText(), /Полная ремесленная топология не подтверждена/);
    await page.locator("summary").click();
    const details = await page.locator("details").innerText();
    assert.ok(details.includes(`Геометрия: ${snapshot.result.geometryStatus}; сетка: ${snapshot.mesh.status}`));
    assert.ok(details.includes(`${snapshot.source.model.digest.slice(0, 12)} (build)`));
    assert.ok(details.includes("Это не приёмка мастером."));
    for (const diagnostic of [...snapshot.result.diagnostics, ...snapshot.mesh.diagnostics]) {
      assert.ok(details.includes(diagnostic), diagnostic);
    }
    await shot(page, "desktop-diagnostics");
    await page.locator("summary").click();
  });
  await check("row toggle changes rendered geometry and preserves the diagnostic result", async () => {
    await button(page, "Крупно").click();
    await frame(page);
    const both = sha256(await page.locator("canvas").screenshot());
    await button(page, "Только первый ряд").click();
    assert.equal(await button(page, "Показать второй ряд").getAttribute("aria-pressed"), "true");
    await shot(page, "desktop-row1-close");
    const row1 = sha256(await page.locator("canvas").screenshot());
    assert.notEqual(row1, both, "actual row visibility, not merely button label");
    await button(page, "Показать второй ряд").click();
    assert.equal(await button(page, "Только первый ряд").getAttribute("aria-pressed"), "false");
    await unchanged(page, "row toggle");
  });
  for (const [width, height, tag] of [[1280, 900, "desktop"], [390, 844, "phone"], [320, 640, "narrow"]]) {
    await page.setViewportSize({ width, height });
    await check(`${tag}: completed result layout and three camera renders`, async () => {
      await isolated(page);
      await layout(page, `${tag}-result`);
      await cameraShots(page, tag, true);
    });
  }
  await check("one cancelled worker plus exactly one full rerun, all terminated", async () => {
    assert.equal(report.workers.length, 2);
    assert.ok(report.workers.every(worker => worker.url.includes("upper-kiku.worker-") && worker.closedAt));
    await unchanged(page, "completed calculation/export/cameras");
  });
  await returnToOrdinary();
};
try {
  await run();
} catch (error) {
  report.failures.push({ name: "scenario", error: error.stack ?? String(error) });
  console.error(error);
  if (!page.isClosed()) await shot(page, "failure");
} finally {
  report.finishedAt = new Date().toISOString();
  report.passed = report.failures.length === 0 && report.errors.length === 0;
  await browser.close();
  await saveReport();
}
console.log(JSON.stringify({
  passed: report.passed, checks: report.checks.length, failures: report.failures,
  errors: report.errors, calculationMs: report.calculationMs,
  actual: report.actual && { ...report.actual, source: report.actual.source.model.digest },
  artifacts: out,
}, null, 2));
if (!report.passed) process.exitCode = 1;
