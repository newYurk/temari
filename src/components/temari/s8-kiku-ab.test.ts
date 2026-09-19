import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planS8Kiku } from './s8-kiku';
import { planS8AB, nameS8Thread, interThreadClearance, checkS8AB } from './s8-kiku-ab';
import type { C8ThreadCoupon, PointMm } from './thread-path';

const distance = (a: PointMm, b: PointMm) => Math.hypot(...a.map((x, i) => x - b[i]));
const line = (id: string, from: PointMm, to: PointMm): C8ThreadCoupon => ({
  kind: 'engineering-thread-path', bodyRadiusMm: 1, threadId: id, threadRadiusMm: .2,
  spans: [{ id: `${id}:span`, threadId: id, opId: `${id}:lay`, step: 1, zone: 'surface',
    curve: { kind: 'bezier', controls: [from, from.map((v, i) => v + (to[i] - v) / 3) as unknown as PointMm,
      from.map((v, i) => v + 2 * (to[i] - v) / 3) as unknown as PointMm, to] } }],
  supports: [], marks: [], fixture: {}, assumptions: [],
  operations: [{ id: `${id}:lay`, order: id === 'A' ? 1 : 2, step: 1, kind: 'lay', spanIds: [`${id}:span`] }],
});

describe('S8 two independent working sets', () => {
  it('preserves the original default plan and rejects invalid phase', () => {
    const a = planS8Kiku({ stage: 'round' }), ab = planS8AB();
    assert.deepEqual(a.windows, ab.A.windows);
    assert.deepEqual(a.tips, ab.A.tips);
    assert.throws(() => planS8Kiku({ phase: 2 as 0 }), RangeError);
  });
  it('starts B on the next real S8 ray, exchanging the inner and outer roles', () => {
    const { A, B } = planS8AB();
    for (let i = 0; i < 8; i++) {
      const target = A.tips[(i + 1) % 8], actual = B.tips[i];
      const tangent = (p: PointMm): PointMm => { const n = Math.hypot(p[0], p[2]); return [p[0] / n, 0, p[2] / n]; };
      assert.ok(distance(tangent(actual.markMm), tangent(target.markMm)) < 1e-12);
      assert.notEqual(actual.role, target.role);
    }
  });
  it('places all eight lower marks at the GT14 projected radius, not the old hand-drawn radius', () => {
    const { A, B } = planS8AB();
    const marks = [...A.tips, ...B.tips].filter(t => t.role === 'lower');
    assert.equal(marks.length, 8);
    for (const t of marks) assert.ok(Math.abs(Math.hypot(t.markMm[0], t.markMm[2]) / A.R - Math.sin(Math.PI / 3)) < 1e-12);
  });
  it('keeps row growth towards the equator for both phases', () => {
    for (const phase of [0, 1] as const) {
      const p = planS8Kiku({ phase, stage: 'row2' });
      for (const c of p.catches.filter(c => c.row === 1)) {
        const next = p.markOf(c), first = p.tips[c.tip].markMm;
        assert.ok(Math.acos(next[1] / p.R) > Math.acos(first[1] / p.R));
      }
    }
  });
  it('namespaces operations and material without moving a single point', () => {
    const base = line('A', [-1, 3, 0], [1, 3, 0]), before = structuredClone(base);
    const b = nameS8Thread(base, 'B', 20);
    assert.deepEqual(base, before);
    assert.deepEqual(b.spans[0].curve, base.spans[0].curve);
    assert.equal(b.spans[0].threadId, b.threadId);
    assert.equal(b.operations[0].order, 21);
    assert.equal(b.operations[0].spanIds[0], b.spans[0].id);
    assert.notEqual(b.spans[0].id, base.spans[0].id);
  });
  it('certifies positive cross-thread clearance using both physical radii', () => {
    const a = line('A', [-1, 3, 0], [1, 3, 0]), b = line('B', [0, 3.5, -1], [0, 3.5, 1]);
    const result = interThreadClearance(a, b);
    assert.equal(result.status, 'passed');
    assert.ok(result.lowerMm > .0999 && result.upperMm < .1001);
    assert.deepEqual(interThreadClearance(b, a).status, result.status);
  });
  it('rejects intersecting volumes even when center lines do not touch', () => {
    const a = line('A', [-1, 3, 0], [1, 3, 0]), b = line('B', [0, 3.2, -1], [0, 3.2, 1]);
    assert.equal(interThreadClearance(a, b).status, 'failed');
    b.spans[0].zone = 'buried';
    assert.equal(interThreadClearance(a, b).status, 'failed', 'hidden tails are not exempt');
  });
  it('does not accept exact touching as certified positive clearance', () => {
    const a = line('A', [-1, 3, 0], [1, 3, 0]), b = line('B', [0, 3.4, -1], [0, 3.4, 1]);
    assert.notEqual(interThreadClearance(a, b).status, 'passed');
    assert.throws(() => interThreadClearance(a, b, NaN), RangeError);
  });
  it('rejects missing composition crossings and accidental reuse of one thread identity', () => {
    const a = line('A', [-1, 3, 0], [1, 3, 0]), b = line('B', [0, 3.5, -1], [0, 3.5, 1]);
    assert.equal(checkS8AB(a, b).status, 'failed');
    assert.throws(() => checkS8AB(a, a), RangeError);
  });
});
