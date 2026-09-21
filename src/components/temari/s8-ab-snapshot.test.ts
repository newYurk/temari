import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { assertS8ABSnapshot, firstS8ABPass, projectAB, renderABOverview, type S8ABSnapshot } from '../../../scripts/lib/s8-ab-diagram';
import { checkS8AB } from './s8-kiku-ab';
import { validateThreadCoupon } from './thread-geometry';

const root = resolve(import.meta.dirname, '../../..');
const data: S8ABSnapshot = JSON.parse(readFileSync(join(root, 'public/fixtures/s8-ab.json'), 'utf8'));
const pass = firstS8ABPass(data);

describe('shared S8 AB numerical snapshot and illustrations', () => {
  it('is current and never promotes a diagnostic calculation to accepted', () => {
    assert.doesNotThrow(() => assertS8ABSnapshot(data, root));
    const invalid = structuredClone(data);
    if (invalid.version === 1) invalid.status = 'accepted';
    else invalid.ab1Verdict = 'accepted';
    invalid.acceptance.B.status = 'unresolved';
    assert.throws(() => assertS8ABSnapshot(invalid, root), /requires both/);
  });
  it('rejects stale or structurally incomplete snapshots', () => {
    assert.throws(() => assertS8ABSnapshot({ ...data, source: { ...data.source, digest: 'stale' } }, root), /changed/);
    const incomplete = structuredClone(data);
    if (incomplete.version === 1) incomplete.checks = [];
    else incomplete.ab1Checks = [];
    assert.throws(() => assertS8ABSnapshot(incomplete, root), /Invalid/);
  });
  it('checks each displayed working thread independently after namespacing', () => {
    for (const coupon of [pass.A, pass.B]) {
      const result = validateThreadCoupon(coupon, .001);
      assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
    }
  });
  it('reproduces the reported inter-thread check from the exact displayed curves', () => {
    assert.deepEqual(checkS8AB(pass.A, pass.B), pass.checks[4]);
  });
  it('uses distinct chronological material identities, with B laid after the end of A', () => {
    assert.notEqual(pass.A.threadId, pass.B.threadId);
    assert.ok(pass.B.operations[0].order > pass.A.operations.at(-1)!.order);
    for (const c of [pass.A, pass.B]) assert.ok(c.spans.every(s => s.threadId === c.threadId));
  });
  it('projects all lower marks using the same sphere scale and leaves the source untouched', () => {
    const before = JSON.stringify(data);
    const R = pass.A.bodyRadiusMm;
    const marks = [...pass.marks.A, ...pass.marks.B].filter(t => t.role === 'lower');
    for (const mark of marks) {
      const p = projectAB(mark.markMm, R);
      assert.ok(Math.abs(Math.hypot(p[0] - 100, p[1] - 100) - 78 * Math.sin(Math.PI / 3)) < 1e-9);
    }
    renderABOverview(data);
    assert.equal(JSON.stringify(data), before);
  });
  it('keeps the document overview identical to its generator and labels the limited scope', () => {
    const html = readFileSync(join(root, 'public/design.html'), 'utf8');
    assert.ok(html.includes(renderABOverview(data)));
    const block = renderABOverview(data);
    assert.match(block, /data-thread="A"/); assert.match(block, /data-thread="B"/);
    assert.match(block, /Вторые ряды здесь не показаны/);
    assert.match(html, /Хоси · схема обхода пяти точек/);
    assert.doesNotMatch(block, /M100 36 L110 90/);
  });
});
