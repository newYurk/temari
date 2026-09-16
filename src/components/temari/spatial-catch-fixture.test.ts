import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jiwariNormals } from './jiwari';
import { createC8UwagakeCoupon, type C8UwagakeCouponInput } from './c8-uwagake-coupon';
import { curveDerivative, evaluateCurve } from './thread-geometry';
import { createSpatialCatchFixture } from './spatial-catch-fixture';
import type { PointMm, ThreadCurve } from './thread-path';

const norm = (a: PointMm) => Math.hypot(...a);
const distance = (a: PointMm, b: PointMm) => Math.hypot(...a.map((x, i) => x - b[i]));
const unit = (a: PointMm) => a.map(x => x / norm(a)) as unknown as PointMm;
const rotate = ([x, y, z]: PointMm): PointMm => [(x + 8 * y + 4 * z) / 9, (8 * x + y - 4 * z) / 9, (-4 * x + 4 * y - 7 * z) / 9];
function input(circumferenceMm = 230, handedness: 1 | -1 = 1): C8UwagakeCouponInput {
  const circles = jiwariNormals('c8').map((normal, i) => ({ id: `circle-${i}`, normal }));
  const first = circles.find(circle => Math.abs(circle.normal[1]) < 1e-12)!;
  return { center: [0, 1, 0], circles, firstRay: { circleId: first.id, tangent: unit([-first.normal[2], 0, first.normal[0]]) }, handedness,
    circumferenceMm, innerMm: 5, outerMm: 20 };
}
function joined(a: ThreadCurve, b: ThreadCurve) {
  assert.ok(distance(evaluateCurve(a, 1), evaluateCurve(b, 0)) < 1e-10);
  assert.ok(distance(unit(curveDerivative(a, 1)), unit(curveDerivative(b, 0))) < 1e-9);
}

describe('spatial catch source adapter, not a craft correctness certificate', () => {
  it('uses chronological operations and distinguishes the frozen bite from its emergence in the next lay', () => {
    const coupon = createC8UwagakeCoupon(input()), fixture = createSpatialCatchFixture(coupon);
    assert.equal(fixture.coupon, coupon);
    const lay = coupon.operations.find(op => op.step === 10 && op.kind === 'lay')!;
    const catchOp = coupon.operations.find(op => op.step === 10 && op.kind === 'catch')!;
    const nextLay = coupon.operations.find(op => op.step === 11 && op.kind === 'lay')!;
    const previousCatch = coupon.operations.find(op => op.step === 9 && op.kind === 'catch')!;
    assert.equal(fixture.free[0].sourceSpanId, lay.spanIds[0]);
    assert.equal(fixture.fixed[0].opId, catchOp.id);
    assert.equal(fixture.fixed.at(-1)!.opId, nextLay.id);
    assert.equal(fixture.fixed.at(-1)!.step, 11);
    assert.deepEqual(fixture.adjacentCatchSpans.map(span => span.id), previousCatch.spanIds);
    assert.deepEqual(fixture.previousSpans, coupon.spans.filter(span => coupon.operations.find(op => op.id === span.opId)!.order < lay.order));
    assert.ok(fixture.adjacentCatchSpans.every(span => fixture.previousSpans.includes(span)));
    assert.equal(fixture.previousSupports, coupon.supports);
    assert.deepEqual(fixture.targets.map(target => target.id), fixture.capture.targets.map(target => target.id));
    assert.equal(fixture.targets.filter(target => target.kind === 'thread').length, 2);
    assert.equal(fixture.targets.filter(target => target.kind === 'support').length, 1);
  });

  it('retains exact source geometry and G1 across every split and join', () => {
    const coupon = createC8UwagakeCoupon(input()), before = structuredClone(coupon);
    const fixture = createSpatialCatchFixture(coupon);
    assert.deepEqual(coupon, before, 'the adapter may not mutate the C8 construction');
    const fragments = [...fixture.free, ...fixture.fixed];
    for (const fragment of fragments) {
      const source = coupon.spans.find(span => span.id === fragment.sourceSpanId)!;
      assert.equal(fragment.opId, source.opId);
      assert.ok(fragment.t0 >= 0 && fragment.t1 <= 1 && fragment.t1 > fragment.t0);
      for (let k = 0; k <= 20; k++) {
        const t = k / 20, sourceT = fragment.t0 + (fragment.t1 - fragment.t0) * t;
        assert.ok(distance(evaluateCurve(fragment.curve, t), evaluateCurve(source.curve, sourceT)) < 1e-10);
      }
    }
    for (let i = 1; i < fragments.length; i++) joined(fragments[i - 1].curve, fragments[i].curve);
    joined(fixture.adjacentCatchSpans.at(-1)!.curve, fixture.freeCurves[0]);
    assert.equal(fixture.free.at(-1)!.sourceSpanId, fixture.fixed[0].sourceSpanId);
    assert.equal(fixture.free.at(-1)!.t1, fixture.fixed[0].t0);
  });

  it('puts guarded ports at the full working radius, separating exterior from the fixed needle route', () => {
    for (const circumference of [180, 230, 360]) for (const handedness of [1, -1] as const) {
      const fixture = createSpatialCatchFixture(createC8UwagakeCoupon(input(circumference, handedness)));
      assert.equal(fixture.portRadiusMm, fixture.bodyRadiusMm + fixture.threadRadiusMm + 0.01);
      for (const port of [fixture.entry, fixture.exit]) {
        assert.ok(Math.abs(norm(port.positionMm) - fixture.portRadiusMm) < 1e-9);
        assert.ok(Math.abs(norm(port.tangent) - 1) < 1e-12);
      }
      for (const curve of fixture.freeCurves) for (let k = 0; k <= 40; k++)
        assert.ok(norm(evaluateCurve(curve, k / 40)) >= fixture.portRadiusMm - 1e-9);
      for (const curve of fixture.fixedCurves) for (let k = 0; k <= 40; k++)
        assert.ok(norm(evaluateCurve(curve, k / 40)) <= fixture.portRadiusMm + 1e-9);
      const entrySource = fixture.coupon.spans.find(span => span.id === fixture.entry.sourceSpanId)!;
      const exitSource = fixture.coupon.spans.find(span => span.id === fixture.exit.sourceSpanId)!;
      assert.ok(norm(evaluateCurve(entrySource.curve, fixture.entry.t - 1e-5)) > fixture.portRadiusMm);
      assert.ok(norm(evaluateCurve(entrySource.curve, fixture.entry.t + 1e-5)) < fixture.portRadiusMm);
      assert.ok(norm(evaluateCurve(exitSource.curve, fixture.exit.t - 1e-5)) < fixture.portRadiusMm);
      assert.ok(norm(evaluateCurve(exitSource.curve, fixture.exit.t + 1e-5)) > fixture.portRadiusMm);
    }
  });

  it('rotates the extracted ports and every restricted curve with the complete marking frame', () => {
    const source = input();
    const a = createSpatialCatchFixture(createC8UwagakeCoupon(source));
    const b = createSpatialCatchFixture(createC8UwagakeCoupon({ ...source, center: rotate(source.center),
      circles: source.circles.map(circle => ({ ...circle, normal: rotate(circle.normal) })),
      firstRay: { ...source.firstRay, tangent: rotate(source.firstRay.tangent) } }));
    const af = [...a.free, ...a.fixed], bf = [...b.free, ...b.fixed];
    assert.equal(af.length, bf.length);
    for (let i = 0; i < af.length; i++) {
      assert.ok(Math.abs(af[i].t0 - bf[i].t0) < 1e-10);
      assert.ok(Math.abs(af[i].t1 - bf[i].t1) < 1e-10);
      for (let k = 0; k <= 8; k++) assert.ok(distance(rotate(evaluateCurve(af[i].curve, k / 8)), evaluateCurve(bf[i].curve, k / 8)) < 1e-9);
    }
  });

  it('discovers source IDs instead of relying on the current span numbering', () => {
    const coupon = createC8UwagakeCoupon(input());
    const spanIds = new Map(coupon.spans.map((span, i) => [span.id, `renamed-thread-${i}`]));
    const opIds = new Map(coupon.operations.map((op, i) => [op.id, `renamed-operation-${i}`]));
    const supportIds = new Map(coupon.supports.map((support, i) => [support.id, `renamed-support-${i}`]));
    const targetId = (id: string) => spanIds.get(id) ?? supportIds.get(id)!;
    coupon.spans = coupon.spans.map(span => ({ ...span, id: spanIds.get(span.id)!, opId: opIds.get(span.opId)! }));
    coupon.operations = coupon.operations.map(op => ({ ...op, id: opIds.get(op.id)!, spanIds: op.spanIds.map(id => spanIds.get(id)!), captureIds: op.captureIds?.map(targetId) }));
    coupon.supports = coupon.supports.map(support => ({ ...support, id: supportIds.get(support.id)! }));
    coupon.captures = coupon.captures!.map(capture => ({ ...capture, opId: opIds.get(capture.opId)!, targets: capture.targets.map(target => ({ ...target, id: targetId(target.id) })) }));
    const fixture = createSpatialCatchFixture(coupon);
    assert.ok(fixture.free.every(fragment => fragment.sourceSpanId.startsWith('renamed-thread-')));
    assert.ok(fixture.targets.every(target => target.id.startsWith('renamed-')));
  });

  it('rejects missing operations, invalid port guards and a future capture target', () => {
    const coupon = createC8UwagakeCoupon(input());
    assert.throws(() => createSpatialCatchFixture(coupon, 0), RangeError);
    assert.throws(() => createSpatialCatchFixture(coupon, 1), RangeError);
    const missing = structuredClone(coupon);
    missing.operations = missing.operations.filter(op => !(op.step === 10 && op.kind === 'catch'));
    assert.throws(() => createSpatialCatchFixture(missing), /requires one catch/);
    const future = structuredClone(coupon);
    const capture = future.captures!.find(item => item.opId === future.operations.find(op => op.step === 10 && op.kind === 'catch')!.id)!;
    capture.targets[1].id = future.operations.find(op => op.step === 11 && op.kind === 'lay')!.spanIds.at(-1)!;
    assert.throws(() => createSpatialCatchFixture(future), /must already exist/);
  });
});
