import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { pointNeedleChannelClearance, segmentNeedleChannelClearance,
  type ChannelPointMm, type NeedleChannelDomain } from './needle-channel-clearance.ts';

const domain: NeedleChannelDomain = { sphereCenterMm: [0, 0, 0], bodyRadiusMm: 2,
  entryMm: [0, 0, -2], exitMm: [0, 0, 2], channelRadiusMm: .5, threadRadiusMm: .25 };
const near = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

describe('assigned conservative spatial needle channel', () => {
  it('uses the union of eroded primitives, with exact smooth point gradients', () => {
    for (const point of [[3, 1, 0], [.1, .1, 0]] as ChannelPointMm[]) {
      const result = pointNeedleChannelClearance(point, domain);
      assert.equal(result.geometry, 'conservative-eroded-union');
      near(result.gapMm, Math.max(Math.hypot(...point) - 2.25, .25 - Math.hypot(point[0], point[1])));
      assert.equal(result.gradientStatus, 'smooth');
      for (let d = 0; d < 3; d++) {
        const h = 1e-6, plus = [...point] as [number, number, number], minus = [...plus] as [number, number, number];
        plus[d]! += h; minus[d]! -= h;
        const derivative = (pointNeedleChannelClearance(plus, domain).gapMm - pointNeedleChannelClearance(minus, domain).gapMm) / (2 * h);
        near(result.gradient![d]!, derivative);
      }
    }
  });

  it('does not invent a differentiable normal at a branch switch or the channel axis', () => {
    const crossing = pointNeedleChannelClearance([1.25, 0, 0], domain);
    near(crossing.gapMm, -1);
    assert.equal(crossing.branch, 'switch');
    assert.equal(crossing.gradientStatus, 'nondifferentiable');
    assert.equal(crossing.gradient, null);
    const axis = pointNeedleChannelClearance([0, 0, 0], domain);
    assert.equal(axis.branch, 'channel');
    assert.equal(axis.gradientStatus, 'nondifferentiable');
    assert.equal(axis.gradient, null);
  });

  it('finds forbidden interior points even though both segment endpoints are clear', () => {
    const a: ChannelPointMm = [0, 0, 0], b: ChannelPointMm = [3, 0, 0];
    assert.ok(pointNeedleChannelClearance(a, domain).gapMm > 0);
    assert.ok(pointNeedleChannelClearance(b, domain).gapMm > 0);
    // Along x, g=max(x-2.25,.25-x), whose exact minimum is -1 at x=1.25.
    const result = segmentNeedleChannelClearance(a, b, domain, { toleranceMm: 1e-6 });
    assert.equal(result.status, 'resolved');
    assert.equal(result.clearance, 'outside-domain');
    assert.ok(result.lowerBoundMm <= -1 && result.upperBoundMm >= -1);
    assert.ok(result.accuracyMm <= 1e-6);
    near(result.witness.t, 1.25 / 3, 1e-6);
    near(result.gapMm, pointNeedleChannelClearance(result.witness.pointMm, domain).gapMm);
  });

  it('bounds both a passage through the sphere and an exterior-only segment', () => {
    const through = segmentNeedleChannelClearance([0, 0, -3], [0, 0, 3], domain,
      { toleranceMm: .01, maxEvaluations: 2049 });
    assert.equal(through.status, 'resolved'); assert.equal(through.clearance, 'clear');
    assert.ok(through.lowerBoundMm <= .25 && through.upperBoundMm >= .25);
    const outside = segmentNeedleChannelClearance([-1, 0, 3], [1, 0, 3], domain,
      { toleranceMm: 1e-4, maxEvaluations: 2049 });
    assert.equal(outside.status, 'resolved'); assert.equal(outside.clearance, 'clear');
    assert.ok(outside.lowerBoundMm <= .75 && outside.upperBoundMm >= .75);
  });

  it('reports insufficient sampling as unresolved instead of accepting the endpoints', () => {
    const result = segmentNeedleChannelClearance([0, 0, 0], [3, 0, 0], domain, { maxEvaluations: 2 });
    assert.equal(result.status, 'unresolved'); assert.equal(result.reason, 'budget');
    assert.equal(result.clearance, 'unresolved');
    assert.ok(result.lowerBoundMm <= -1 && result.upperBoundMm >= -1);
    const point = segmentNeedleChannelClearance([3, 0, 0], [3, 0, 0], domain);
    assert.equal(point.status, 'resolved'); assert.equal(point.evaluations, 1);
    near(point.gapMm, .75);
  });

  it('is covariant under rotation and translation without changing its input', () => {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), .73);
    const shift = new Vector3(4, -7, 2);
    const transform = (p: ChannelPointMm): ChannelPointMm => new Vector3(...p).applyQuaternion(rotation).add(shift).toArray();
    const transformed = { ...domain, sphereCenterMm: transform(domain.sphereCenterMm),
      entryMm: transform(domain.entryMm), exitMm: transform(domain.exitMm) };
    const point: ChannelPointMm = [3, 1, 0], original = structuredClone(domain);
    const a = pointNeedleChannelClearance(point, domain), b = pointNeedleChannelClearance(transform(point), transformed);
    near(a.gapMm, b.gapMm);
    const expectedGradient = new Vector3(...a.gradient!).applyQuaternion(rotation);
    assert.ok(expectedGradient.distanceTo(new Vector3(...b.gradient!)) < 1e-10);
    const segment = segmentNeedleChannelClearance(transform([0, 0, 0]), transform([3, 0, 0]), transformed, { toleranceMm: 1e-6 });
    assert.equal(segment.status, 'resolved'); assert.equal(segment.clearance, 'outside-domain');
    assert.ok(segment.lowerBoundMm <= -1 && segment.upperBoundMm >= -1);
    assert.deepEqual(domain, original);
  });

  it('rejects a channel too narrow for the thread, undefined axes and invalid numerical budgets', () => {
    for (const channelRadiusMm of [0, .1, .25, NaN, Infinity]) {
      assert.throws(() => pointNeedleChannelClearance([0, 0, 0], { ...domain, channelRadiusMm }), RangeError);
    }
    assert.throws(() => pointNeedleChannelClearance([0, 0, 0], { ...domain, exitMm: domain.entryMm }), RangeError);
    assert.throws(() => pointNeedleChannelClearance([NaN, 0, 0], domain), RangeError);
    for (const maxEvaluations of [1, -1, 2.5, NaN, Infinity]) {
      assert.throws(() => segmentNeedleChannelClearance([0, 0, 0], [3, 0, 0], domain, { maxEvaluations }), RangeError);
    }
    assert.throws(() => segmentNeedleChannelClearance([0, 0, 0], [3, 0, 0], domain, { toleranceMm: 0 }), RangeError);
  });
});
