import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { polePositions } from './division';
import { jiwariNormals } from './jiwari';
import { C8_THREAD_FIXTURE, createC8ThreadCoupon } from './c8-thread-coupon';
import { C8_UWAGAKE_FIXTURE, createC8UwagakeCoupon, type C8UwagakeCouponInput } from './c8-uwagake-coupon';
import { evaluateCurve, validateThreadCoupon } from './thread-geometry';
import type { C8ThreadCoupon, ThreadCrossing, ThreadCurve } from './thread-path';
import type { MarkingVector as V } from './local-marking';

const dot = (a: V, b: V) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V, k: number) => a.map(x => x * k) as unknown as V;
const unit = (a: V) => scale(a, 1 / Math.hypot(...a));
const distance = (a: V, b: V) => Math.hypot(...a.map((x, i) => x - b[i]));
const controls = (curve: ThreadCurve) => curve.kind === 'arc' ? [curve.from, curve.to] : curve.controls;
const rotate = ([x, y, z]: V): V => [(x + 8 * y + 4 * z) / 9, (8 * x + y - 4 * z) / 9, (-4 * x + 4 * y - 7 * z) / 9];
function fixture(center: V = [0, 1, 0], handedness: 1 | -1 = 1): C8UwagakeCouponInput {
  const circles = jiwariNormals('c8').map((normal, i) => ({ id: `circle-${i}`, normal }));
  const first = circles.find(x => Math.abs(dot(center, x.normal)) < 1e-12)!;
  return { center, circles, firstRay: { circleId: first.id, tangent: unit(cross(first.normal, center)) }, handedness,
    circumferenceMm: 230, innerMm: 5, outerMm: 20 };
}

/** Independent plane-root oracle for finite targets lying in an origin plane.
 * It does not use the crossing validator's projected 2D Newton solver. */
function planeCrossings(coupon: C8ThreadCoupon, crossing: ThreadCrossing) {
  const target = coupon.spans.find(s => s.id === crossing.target.id) ?? coupon.supports.find(s => s.id === crossing.target.id)!;
  const targetStart = evaluateCurve(target.curve, 0), targetEnd = evaluateCurve(target.curve, 1);
  const normal = unit(cross(targetStart, targetEnd));
  assert.ok(controls(target.curve).every(p => Math.abs(dot(p, normal)) < 1e-9), 'Target must stay in its origin plane.');
  const totalAngle = Math.atan2(Math.hypot(...cross(unit(targetStart), unit(targetEnd))), dot(unit(targetStart), unit(targetEnd)));
  const directionAngle = (p: V) => Math.atan2(dot(normal, cross(unit(targetStart), unit(p))), dot(unit(targetStart), unit(p)));
  let previousAngle = -1;
  for (let i = 0; i <= 128; i++) { const angle = directionAngle(evaluateCurve(target.curve, i / 128)); assert.ok(angle > previousAngle); previousAngle = angle; }
  const result: { position: number; targetT: number; radialDifferenceMm: number }[] = [];
  for (const window of crossing.working) {
    const index = coupon.spans.findIndex(s => s.id === window.spanId), span = coupon.spans[index];
    const roots: number[] = [];
    for (let k = 0; k < 256; k++) {
      let lo = window.t0 + (window.t1 - window.t0) * k / 256;
      let hi = window.t0 + (window.t1 - window.t0) * (k + 1) / 256;
      let a = dot(evaluateCurve(span.curve, lo), normal);
      const b = dot(evaluateCurve(span.curve, hi), normal);
      if (Math.abs(a) < 1e-10) roots.push(lo);
      if (Math.abs(b) < 1e-10) roots.push(hi);
      if (a * b >= 0) continue;
      for (let n = 0; n < 45; n++) {
        const mid = (lo + hi) / 2, value = dot(evaluateCurve(span.curve, mid), normal);
        if (a * value <= 0) hi = mid; else { lo = mid; a = value; }
      }
      roots.push((lo + hi) / 2);
    }
    for (const t of roots) {
      const p = evaluateCurve(span.curve, t), pu = unit(p), start = unit(targetStart);
      const angle = Math.atan2(dot(normal, cross(start, pu)), dot(start, pu));
      let targetT = angle / totalAngle;
      if (target.curve.kind === 'bezier' && targetT > 0 && targetT < 1) {
        let lo = 0, hi = 1;
        for (let n = 0; n < 45; n++) { const mid = (lo + hi) / 2; if (directionAngle(evaluateCurve(target.curve, mid)) < angle) lo = mid; else hi = mid; }
        targetT = (lo + hi) / 2;
      }
      const position = index + t;
      if (targetT <= crossing.target.t0 + 1e-8 || targetT >= crossing.target.t1 - 1e-8) continue;
      if (result.some(x => Math.abs(x.position - position) < 1e-7)) continue;
      result.push({ position, targetT, radialDifferenceMm: Math.hypot(...p) - Math.hypot(...evaluateCurve(target.curve, targetT)) });
    }
  }
  return result;
}

describe('two continuous engineering uwagake rounds', () => {
  it('contains one start and finish, sixteen chronological catches, and the explicit seam bundle', () => {
    const c = createC8UwagakeCoupon(fixture());
    assert.equal(c.fixture.rounds, 2);
    assert.deepEqual(c.operations.map(op => op.kind), ['start', ...Array.from({ length: 16 }, () => ['lay', 'catch']).flat(), 'transfer', 'finish']);
    assert.deepEqual(c.operations.filter(op => op.kind === 'catch').map(op => op.step), Array.from({ length: 16 }, (_, i) => i + 1));
    assert.deepEqual(c.operations.flatMap(op => op.spanIds), c.spans.map(s => s.id));
    assert.ok(c.spans.every(s => s.threadId === c.threadId));
    assert.equal(c.spans[0].step, 0);
    assert.ok(c.operations.slice(-2).every(op => op.step === 16));
    for (let i = 1; i < c.spans.length; i++) {
      assert.ok(distance(evaluateCurve(c.spans[i - 1].curve, 1), evaluateCurve(c.spans[i].curve, 0)) < 1e-10);
      assert.ok(c.spans[i].step >= c.spans[i - 1].step);
    }
    assert.ok(distance(evaluateCurve(c.spans[0].curve, 0), evaluateCurve(c.spans.at(-1)!.curve, 1)) > 2 * c.threadRadiusMm);
    for (const step of [8, 10, 12, 14, 16]) {
      const capture = c.captures!.find(x => x.id === `capture-${step}`)!;
      assert.equal(capture.targets.length, step === 8 ? 2 : step === 16 ? 4 : 3);
    }
    const seam = c.captures!.find(x => x.id === 'capture-16')!;
    const departure = c.operations.find(x => x.step === 9 && x.kind === 'lay')!.spanIds.find(id => c.spans.find(s => s.id === id)!.zone === 'surface')!;
    const crossing = c.crossings!.find(x => seam.overCrossingIds.includes(x.id) && x.target.id === departure)!;
    assert.equal(c.operations.find(x => x.id === crossing.opId)!.kind, 'lay');
    assert.equal(c.operations.find(x => x.id === crossing.opId)!.step, 16);
    assert.ok(c.assumptions.some(x => x.includes('equilibrium')));
    for (const step of [8, 10, 12, 14]) {
      const bite = c.operations.find(x => x.step === step && x.kind === 'catch')!;
      const departure = c.operations.find(x => x.step === step + 1 && x.kind === 'lay')!;
      assert.equal(bite.spanIds.length, 4);
      assert.equal(c.spans.find(s => s.id === departure.spanIds[0])!.zone, 'piercing');
      assert.ok(Math.hypot(...evaluateCurve(c.spans.find(s => s.id === bite.spanIds.at(-1))!.curve, 1)) < c.bodyRadiusMm - c.threadRadiusMm);
    }
  });

  it('retains the baseline through the sixth catch and retargets only the seventh catch exit', () => {
    const input = fixture(), baseline = createC8ThreadCoupon(input), c = createC8UwagakeCoupon(input);
    assert.deepEqual(c.spans.slice(0, 22), baseline.spans.slice(0, 22));
    assert.notDeepEqual(c.spans[22].curve, baseline.spans[22].curve);
  });

  it('independently proves finite over then under of the same previously laid targets', () => {
    for (const circumferenceMm of [180, 230, 360]) {
      const c = createC8UwagakeCoupon({ ...fixture(), circumferenceMm });
      for (const capture of c.captures!) for (const target of capture.targets) {
        const under = c.crossings!.find(x => capture.underCrossingIds.includes(x.id) && x.target.id === target.id)!;
        const below = planeCrossings(c, under);
        assert.equal(below.length, 1, JSON.stringify({ circumferenceMm, crossing: under.id, below }));
        const isSupport = target.id.startsWith('support-');
        const radius = isSupport ? c.supports.find(s => s.id === target.id)!.radiusMm : c.threadRadiusMm;
        assert.ok(below[0].radialDifferenceMm < -c.threadRadiusMm - radius - .01);
        if (isSupport) continue;
        const over = c.crossings!.find(x => capture.overCrossingIds.includes(x.id) && x.target.id === target.id)!;
        assert.deepEqual(over.target, under.target);
        const above = planeCrossings(c, over);
        assert.equal(above.length, 1, JSON.stringify({ circumferenceMm, crossing: over.id, above }));
        assert.ok(above[0].radialDifferenceMm > 2 * c.threadRadiusMm + .01);
        assert.ok(above[0].position < below[0].position);
        const old = c.spans.find(s => s.id === target.id)!;
        assert.ok(c.operations.find(op => op.id === old.opId)!.order < c.operations.find(op => op.id === over.opId)!.order);
      }
    }
  });

  it('names and independently checks extra crossings separately from bundle capture', () => {
    const expected = [
      'extra-seam8-under-incoming', 'extra-departure9-over-incoming',
      ...[9, 11, 13, 15].map(step => `extra-departure${step}-over-support`),
      ...[11, 13, 15].map(step => `extra-emergence${step}-over-old-incoming`),
      'extra-final-approach-over-old-incoming', 'extra-final-return-under-current-incoming',
      'extra-finish-under-old-flank', 'extra-finish-under-new-flank',
    ];
    for (const circumferenceMm of [180, 230, 360]) {
      const c = createC8UwagakeCoupon({ ...fixture(), circumferenceMm });
      const extras = c.crossings!.filter(x => x.id.startsWith('extra-'));
      assert.deepEqual(extras.map(x => x.id), expected);
      for (const crossing of extras) {
        assert.ok(c.captures!.every(capture => ![...capture.overCrossingIds, ...capture.underCrossingIds].includes(crossing.id)));
        const points = planeCrossings(c, crossing);
        assert.equal(points.length, 1, JSON.stringify({ circumferenceMm, id: crossing.id, points }));
        const targetRadius = c.supports.find(s => s.id === crossing.target.id)?.radiusMm ?? c.threadRadiusMm;
        const signed = points[0].radialDifferenceMm * (crossing.pass === 'over' ? 1 : -1);
        assert.ok(signed > c.threadRadiusMm + targetRadius + .01);
      }
    }
  });

  it('preserves all geometry and declarations under joint rotations at six C8 centers and both hands', () => {
    for (const center of polePositions('c8')) for (const handedness of [1, -1] as const) {
      const input = fixture(center, handedness), a = createC8UwagakeCoupon(input);
      const b = createC8UwagakeCoupon({ ...input, center: rotate(center), circles: input.circles.map(x => ({ ...x, normal: rotate(x.normal) })), firstRay: { ...input.firstRay, tangent: rotate(input.firstRay.tangent) } });
      assert.deepEqual(a.operations, b.operations); assert.deepEqual(a.crossings, b.crossings); assert.deepEqual(a.captures, b.captures);
      for (const [i, s] of a.spans.entries()) {
        controls(s.curve).forEach((p, k) => assert.ok(distance(rotate(p), controls(b.spans[i].curve)[k]) < 1e-10));
        if (s.corridor) assert.ok(distance(rotate(s.corridor.centerMm), b.spans[i].corridor!.centerMm) < 1e-10);
      }
      for (const [i, s] of a.supports.entries()) controls(s.curve).forEach((p, k) => assert.ok(distance(rotate(p), controls(b.supports[i].curve)[k]) < 1e-10));
      assert.equal(validateThreadCoupon(b).status, 'passed');
    }
  });

  it('passes body, support, self, G1, radius-curvature and crossing checks at all sampled circumferences', () => {
    // A discrete 10 mm grid, not an interval-wide proof.
    for (let circumferenceMm = 180; circumferenceMm <= 360; circumferenceMm += 10) {
      for (const center of polePositions('c8')) for (const handedness of [1, -1] as const) {
        const c = createC8UwagakeCoupon({ ...fixture(center, handedness), circumferenceMm });
        const v = validateThreadCoupon(c);
        assert.equal(v.status, 'passed', JSON.stringify({ circumferenceMm, center, handedness, diagnostics: v.diagnostics }));
        assert.ok(v.minSelfGapMm > .05); assert.ok(v.minSupportGapMm > .1); assert.ok(v.maxCurvatureTimesRadius < .7);
        assert.ok(v.lengthMm.surface > 0 && v.lengthMm.piercing > 0 && v.lengthMm.buried > 0);
        assert.ok(Math.abs(v.lengthMm.total - v.lengthMm.surface - v.lengthMm.piercing - v.lengthMm.buried) < 1e-9);
      }
    }
  });

  it('scales every physical dimension including piercing corridors and fixed tails', () => {
    const input = fixture(), a = createC8UwagakeCoupon(input);
    const twice = (obj: Record<string, number>) => Object.fromEntries(Object.entries(obj).map(([key, x]) => [key, 2 * x]));
    const b = createC8UwagakeCoupon({ ...input, circumferenceMm: 460, innerMm: 10, outerMm: 40, threadFixture: twice(C8_THREAD_FIXTURE), uwagakeFixture: twice(C8_UWAGAKE_FIXTURE) });
    for (const [i, s] of a.spans.entries()) {
      controls(s.curve).forEach((p, k) => assert.ok(distance(scale(p, 2), controls(b.spans[i].curve)[k]) < 1e-10));
      if (s.corridor) {
        assert.ok(distance(scale(s.corridor.centerMm, 2), b.spans[i].corridor!.centerMm) < 1e-10);
        assert.ok(Math.abs(s.corridor.radiusMm * 2 - b.spans[i].corridor!.radiusMm) < 1e-10);
        assert.ok(Math.abs(s.corridor.maxDepthMm * 2 - b.spans[i].corridor!.maxDepthMm) < 1e-10);
      }
    }
    for (const [i, s] of a.supports.entries()) controls(s.curve).forEach((p, k) => assert.ok(distance(scale(p, 2), controls(b.supports[i].curve)[k]) < 1e-10));
  });

  it('does not silently repair nonfinite dimensions, overlapping ramps or a too-small bundle wrap', () => {
    for (const x of [0, -1, NaN, Infinity]) assert.throws(() => createC8UwagakeCoupon({ ...fixture(), uwagakeFixture: { wrapTopMm: x } }), RangeError);
    assert.throws(() => createC8UwagakeCoupon({ ...fixture(), uwagakeFixture: { finalSeamApproachRampMm: 30 } }), RangeError);
    const c = createC8UwagakeCoupon({ ...fixture(), uwagakeFixture: { wrapHalfWidthMm: 2 } });
    assert.equal(c.fixture.wrapHalfWidthMm, 2);
    assert.notEqual(validateThreadCoupon(c).status, 'passed');
  });
});
