import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { pointNeedleChannelClearance, segmentNeedleChannelClearance, minimumNeedleChannelClearance,
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

describe('whole-segment channel minimum and envelope derivatives', () => {
  const finiteDifference = (a: ChannelPointMm, b: ChannelPointMm, d: NeedleChannelDomain, epsilon = 1e-5) => {
    const result = minimumNeedleChannelClearance(a, b, d);
    assert.equal(result.status, 'resolved'); assert.equal(result.gradientStatus, 'smooth');
    for (const end of [0, 1]) for (let k = 0; k < 3; k++) {
      const plus = [[...a], [...b]] as [number, number, number][];
      const minus = [[...a], [...b]] as [number, number, number][];
      plus[end][k] += epsilon; minus[end][k] -= epsilon;
      const fd = (minimumNeedleChannelClearance(plus[0], plus[1], d).gapMm
        - minimumNeedleChannelClearance(minus[0], minus[1], d).gapMm) / (2 * epsilon);
      near((end === 0 ? result.gradientA : result.gradientB)![k], fd, 3e-6);
    }
    return result;
  };

  it('has the analytic rim minimum and mixed endpoint derivatives', () => {
    // At z=1, sqrt(x²+1)+x=R+a=2.5 gives x=1.05 and g=-.8.
    // The translated minimum has dz derivative z/(R+a)=.4; dx derivative 0.
    const result = finiteDifference([0, 0, 1], [3, 0, 1], domain);
    near(result.gapMm, -.8); near(result.witness.t, .35);
    near(result.gradientA![0], 0); near(result.gradientB![0], 0);
    near(result.gradientA![2], .26); near(result.gradientB![2], .14);
    assert.ok(result.lowerBoundMm <= -.8 && result.upperBoundMm >= -.8);
  });

  it('corrects the persistent sampled-gradient error on a real first-visit segment', () => {
    // Segment 4 of the saved 80-iteration first-visit diagnostic; no acceptance
    // of that failed geometry is implied by checking this derivative.
    const a: ChannelPointMm = [-24.040567834961465, 18.56892978797637, -23.003107306211042];
    const b: ChannelPointMm = [-25.463236770352626, 19.400116724409198, -22.10281905773214];
    const d: NeedleChannelDomain = { sphereCenterMm: [0, 0, 0], bodyRadiusMm: 38.197186342054884,
      entryMm: [-23.385520724078976, 18.48045130914528, -23.88755710246754],
      exitMm: [-23.887557102467536, 18.48045130914528, -23.385520724078983],
      channelRadiusMm: .405, threadRadiusMm: .355 };
    const result = finiteDifference(a, b, d);
    near(result.gapMm, -.25528104359451786, 1e-9);
    const translated = new Vector3(...result.gradientA!).add(new Vector3(...result.gradientB!));
    const delta = new Vector3(...b).sub(new Vector3(...a));
    near(translated.dot(delta), 0, 1e-9);
    const sampled = segmentNeedleChannelClearance(a, b, d, { toleranceMm: 1e-5 });
    assert.ok(Math.abs(sampled.gapMm - result.gapMm) < 1e-5);
    assert.ok(new Vector3(...sampled.witness.evaluation.gradient!).distanceTo(translated) > .7,
      'small error in the sampled value does not justify its single-branch gradient');
    assert.ok(result.gapMm >= sampled.lowerBoundMm && result.gapMm <= sampled.upperBoundMm);
  });

  it('handles exterior stationary points and one-sided endpoint minima', () => {
    const interior = finiteDifference([-1, 0, 3], [1, 0, 3], domain);
    near(interior.gapMm, .75); near(interior.witness.t, .5);
    assert.deepEqual(interior.gradientA, [0, 0, .5]);
    const endpoint = finiteDifference([3, 0, 0], [4, 0, 0], domain);
    near(endpoint.gapMm, .75); near(endpoint.witness.t, 0);
    assert.deepEqual(endpoint.gradientA, [1, 0, 0]);
    assert.deepEqual(endpoint.gradientB, [0, 0, 0]);
  });

  it('resolves clearance without inventing derivatives for ties, flat minima or degeneracies', () => {
    for (const [a, b] of [
      [[-3, 0, 0], [3, 0, 0]], // two distinct rim minima
      [[0, 0, -3], [0, 0, 3]], // flat slack channel on its axis
      [[1.25, 0, -.5], [1.25, 0, .5]], // tangent branch switch
      [[1.25, 0, 0], [3, 0, 0]], // branch switch at the endpoint
      [[3, 0, 0], [3, 0, 0]], // coincident endpoints
    ] as [ChannelPointMm, ChannelPointMm][]) {
      const result = minimumNeedleChannelClearance(a, b, domain);
      assert.equal(result.status, 'resolved');
      assert.equal(result.gradientStatus, 'unresolved');
      assert.equal(result.gradientA, null); assert.equal(result.gradientB, null);
    }
    const slack = minimumNeedleChannelClearance([0, 0, -3], [0, 0, 3], domain);
    near(slack.gapMm, .25); assert.ok(slack.lowerBoundMm > 0);
    const pair = minimumNeedleChannelClearance([-3, 0, 0], [3, 0, 0], domain);
    near(pair.gapMm, -1); assert.equal(pair.reason, 'tied-minima');
  });

  it('preserves scalar/gradient covariance under rigid motion and scale', () => {
    const a: ChannelPointMm = [0, 0, 1], b: ChannelPointMm = [3, 0, 1];
    const original = structuredClone({ a, b, domain });
    const reference = minimumNeedleChannelClearance(a, b, domain);
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), .73);
    for (const scale of [.001, 1, 1000]) {
      const shift = new Vector3(4, -7, 2).multiplyScalar(scale);
      const transform = (p: ChannelPointMm): ChannelPointMm => new Vector3(...p).applyQuaternion(rotation).multiplyScalar(scale).add(shift).toArray();
      const transformed = { ...domain, sphereCenterMm: transform(domain.sphereCenterMm), entryMm: transform(domain.entryMm),
        exitMm: transform(domain.exitMm), bodyRadiusMm: domain.bodyRadiusMm * scale,
        channelRadiusMm: domain.channelRadiusMm * scale, threadRadiusMm: domain.threadRadiusMm * scale };
      const result = minimumNeedleChannelClearance(transform(a), transform(b), transformed);
      assert.equal(result.status, 'resolved'); assert.equal(result.gradientStatus, 'smooth');
      near(result.gapMm / scale, reference.gapMm); near(result.witness.t, reference.witness.t);
      for (const key of ['gradientA', 'gradientB'] as const) {
        assert.ok(new Vector3(...reference[key]!).applyQuaternion(rotation).distanceTo(new Vector3(...result[key]!)) < 1e-8);
      }
    }
    assert.deepEqual({ a, b, domain }, original);
  });

  it('agrees with independently bounded full-segment minima', () => {
    const cases: [ChannelPointMm, ChannelPointMm][] = [
      [[-3, 0, 0], [3, 0, 0]], [[0, 0, -3], [0, 0, 3]], [[-1, 0, 3], [1, 0, 3]],
      [[0, 0, 1], [3, 0, 1]], [[1.25, 0, -.5], [1.25, 0, .5]],
      [[.1, .2, 2.8], [2, -.5, -.3]], [[1, 1, 1], [-1, .5, -2]],
    ];
    for (const [a, b] of cases) {
      const result = minimumNeedleChannelClearance(a, b, domain);
      const independent = segmentNeedleChannelClearance(a, b, domain, { toleranceMm: 1e-5, maxEvaluations: 2049 });
      assert.ok(result.gapMm >= independent.lowerBoundMm - 1e-10);
      assert.ok(result.gapMm <= independent.upperBoundMm + 1e-10);
      assert.ok(result.lowerBoundMm <= independent.upperBoundMm && result.upperBoundMm >= independent.lowerBoundMm);
    }
  });
});
