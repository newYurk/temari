import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLowerKagariFixture, LOWER_KAGARI_DIMENSIONS, type LowerKagariDimensions } from './lower-kagari';
import { curveDerivative, evaluateCurve, polynomialRoots01, validateThreadCoupon } from './thread-geometry';
import type { PointMm, ThreadCurve } from './thread-path';

const norm = (a: PointMm) => Math.hypot(...a);
const dot = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: PointMm, b: PointMm): PointMm => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: PointMm, k: number): PointMm => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: PointMm) => scale(a, 1 / norm(a));
const distance = (a: PointMm, b: PointMm) => Math.hypot(...a.map((x, i) => x - b[i]));
const rotate = ([x, y, z]: PointMm): PointMm => [(x + 8 * y + 4 * z) / 9, (8 * x + y - 4 * z) / 9, (-4 * x + 4 * y - 7 * z) / 9];
const signedAngle = (a: PointMm, b: PointMm, normal: PointMm) => Math.atan2(dot(normal, cross(unit(a), unit(b))), dot(unit(a), unit(b)));

/** Independent finite plane-root oracle; does not use projected Newton crossings. */
function planeRoots(curve: ThreadCurve, normal: PointMm) {
  if (curve.kind === 'bezier') {
    const [a, b, c, d] = curve.controls.map(point => dot(point, normal));
    return polynomialRoots01([a, 3 * (b - a), 3 * (c - 2 * b + a), d - 3 * c + 3 * b - a]);
  }
  const start = unit(curve.from), tangent = unit(curveDerivative(curve, 0));
  const angle = Math.atan2(norm(cross(start, unit(curve.to))), dot(start, unit(curve.to)));
  const base = Math.atan2(-dot(start, normal), dot(tangent, normal));
  return [-2, -1, 0, 1, 2].map(k => (base + k * Math.PI) / angle).filter(t => t >= 0 && t <= 1);
}

describe('isolated lower backbite engineering fixture', () => {
  it('enters on the forward side, passes beneath the marking and exits on the previous side', () => {
    const f = createLowerKagariFixture(), q = f.frame.progress, v = f.frame.outward;
    assert.ok(dot(f.incomingStart.positionMm, q) < 0 && dot(f.incomingStart.positionMm, v) < 0);
    assert.ok(dot(f.entry.positionMm, q) > 0);
    assert.ok(dot(f.exit.positionMm, q) < 0);
    assert.ok(dot(f.next.positionMm, q) > 0 && dot(f.next.positionMm, v) < 0);
    assert.ok(norm(evaluateCurve(f.fixed[0], 1)) + f.threadRadiusMm < f.bodyRadiusMm);
    assert.ok(dot(unit(curveDerivative(f.fixed[0], 1)), q) < -0.999999);
    for (let k = 0; k < 100; k++) assert.ok(dot(evaluateCurve(f.fixed[0], k / 100), q) > 0);
    for (let k = 1; k <= 100; k++) assert.ok(dot(evaluateCurve(f.fixed[1], k / 100), q) < 0);
  });

  it('keeps one continuous G1 thread and explicit guarded entry/exit ports', () => {
    const f = createLowerKagariFixture(), curves = [...f.incoming, ...f.fixed, ...f.looseOutgoing];
    for (let i = 1; i < curves.length; i++) {
      assert.ok(distance(evaluateCurve(curves[i - 1], 1), evaluateCurve(curves[i], 0)) < 1e-11);
      assert.ok(distance(unit(curveDerivative(curves[i - 1], 1)), unit(curveDerivative(curves[i], 0))) < 1e-10);
    }
    for (const port of [f.entry, f.exit]) {
      assert.ok(Math.abs(norm(port.positionMm) - f.bodyRadiusMm - f.threadRadiusMm - f.portGuardMm) < 1e-11);
      assert.ok(Math.abs(norm(port.tangent) - 1) < 1e-12);
    }
    assert.equal(f.coupon.spans.length, curves.length);
    assert.equal(f.coupon.operations.flatMap(op => op.spanIds).length, curves.length);
  });

  it('has exactly one finite outgoing-over-incoming X, with enough space for both yarn radii', () => {
    const f = createLowerKagariFixture(), target = f.incomingTarget.curve;
    assert.equal(target.kind, 'arc');
    const start = evaluateCurve(target, 0), end = evaluateCurve(target, 1), normal = unit(cross(start, end));
    const angle = signedAngle(start, end, normal);
    const roots: { position: number; targetT: number; gap: number }[] = [];
    f.looseOutgoing.forEach((curve, index) => {
      for (const t of planeRoots(curve, normal)) {
        const p = evaluateCurve(curve, t), targetT = signedAngle(start, p, normal) / angle;
        if (targetT < 0 || targetT > 1) continue;
        roots.push({ position: index + t, targetT, gap: norm(p) - norm(evaluateCurve(target, targetT)) - 2 * f.threadRadiusMm });
      }
    });
    assert.equal(roots.length, 1);
    assert.ok(roots[0].position > 0 && roots[0].position < f.looseOutgoing.length);
    assert.ok(roots[0].targetT > 0 && roots[0].targetT < 1);
    assert.ok(roots[0].gap > 0.1);
    // The real finite marking spans this intersection; it is not trimmed away.
    const p = evaluateCurve(target, roots[0].targetT), mark = f.markingSupport.curve;
    const markStart = evaluateCurve(mark, 0), markEnd = evaluateCurve(mark, 1);
    const markNormal = unit(cross(markStart, markEnd));
    const markT = signedAngle(markStart, p, markNormal) / signedAngle(markStart, markEnd, markNormal);
    assert.ok(markT > 0 && markT < 1);
  });

  it('passes complete geometry, thickness and declared-crossing validation for both directions and three sphere sizes', () => {
    for (const circumferenceMm of [180, 230, 360]) for (const handedness of [1, -1] as const) {
      const f = createLowerKagariFixture({ circumferenceMm, handedness });
      const result = validateThreadCoupon(f.coupon);
      assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
      assert.ok(result.maxCurvatureTimesRadius < 0.9);
      assert.ok(result.minSelfGapMm > 0 && result.minSupportGapMm > 0);
      assert.equal(f.coupon.crossings!.length, 4);
    }
  });

  it('rotates with its local frame and scales every dimension including radii and port guard', () => {
    const f = createLowerKagariFixture();
    const rotated = createLowerKagariFixture({ radial: rotate(f.frame.radial), outward: rotate(f.frame.outward) });
    const twice = Object.fromEntries(Object.entries(LOWER_KAGARI_DIMENSIONS).map(([key, value]) => [key, value * 2])) as LowerKagariDimensions;
    const scaled = createLowerKagariFixture(twice);
    const curves = [...f.incoming, ...f.fixed, ...f.looseOutgoing, f.markingSupport.curve];
    const turned = [...rotated.incoming, ...rotated.fixed, ...rotated.looseOutgoing, rotated.markingSupport.curve];
    const large = [...scaled.incoming, ...scaled.fixed, ...scaled.looseOutgoing, scaled.markingSupport.curve];
    for (let i = 0; i < curves.length; i++) for (let k = 0; k <= 20; k++) {
      assert.ok(distance(rotate(evaluateCurve(curves[i], k / 20)), evaluateCurve(turned[i], k / 20)) < 1e-9);
      assert.ok(distance(scale(evaluateCurve(curves[i], k / 20), 2), evaluateCurve(large[i], k / 20)) < 1e-9);
    }
    assert.equal(validateThreadCoupon(scaled.coupon, 0.01).status, 'passed');
  });

  it('rejects invalid local frames and dimensions instead of repairing them', () => {
    assert.throws(() => createLowerKagariFixture({ outward: [0, 1, 0] }), RangeError);
    assert.throws(() => createLowerKagariFixture({ halfBiteMm: 0.1 }), RangeError);
    assert.throws(() => createLowerKagariFixture({ portGuardMm: 0 }), RangeError);
    assert.throws(() => createLowerKagariFixture({ looseRiseMm: 12 }), RangeError);
    assert.throws(() => createLowerKagariFixture({ markingRadiusMm: NaN }), RangeError);
  });
});
