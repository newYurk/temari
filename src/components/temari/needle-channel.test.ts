import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNeedleChannel, type NeedleChannelInput } from './needle-channel';
import { curveDerivative, evaluateCurve } from './thread-geometry';
import type { MarkingSupport, PointMm, ThreadCurve } from './thread-path';

const near = (actual: number, expected: number, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`);
const pointNear = (a: PointMm, b: PointMm, tolerance = 1e-10) =>
  a.forEach((v, i) => near(v, b[i], tolerance));
const norm = (p: PointMm) => Math.hypot(...p);
const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const line = (from: PointMm, to: PointMm): ThreadCurve => ({ kind: 'bezier', controls: [from,
  from.map((v, i) => v + (to[i] - v) / 3) as unknown as PointMm,
  from.map((v, i) => v + 2 * (to[i] - v) / 3) as unknown as PointMm, to] });
const straightSupport = (from: PointMm, to: PointMm, radiusMm = .05): MarkingSupport =>
  ({ id: 'finite-mark', circleId: 'engineering-mark', radiusMm, curve: line(from, to) });
const symmetric = (width = 4): NeedleChannelInput => {
  const y = Math.sqrt(100 - width ** 2 / 4);
  return { R: 10, layerThickness: .5, rNeedle: .15, rThread: .1,
    entry: [-width / 2, y, 0], exit: [width / 2, y, 0],
    supports: [straightSupport([0, 10.05, -2], [0, 10.05, 2])] };
};

describe('straight nominal-sphere needle channel: analytic engineering controls', () => {
  it('uses the sagitta formula and a single collinear curve for the needle and yarn axis', () => {
    const input = symmetric(), channel = buildNeedleChannel(input);
    const expectedDepth = 10 - Math.sqrt(100 - 4 ** 2 / 4);
    near(channel.chordDepthMm, expectedDepth);
    near(channel.axis.lengthMm, 4);
    assert.equal(channel.spans.length, 1);
    assert.equal(channel.spans[0].zone, 'piercing');
    for (const t of [0, .1, .25, .5, .9, 1]) {
      pointNear(evaluateCurve(channel.spans[0].curve, t), [-2 + 4 * t, input.entry[1], 0]);
      pointNear(curveDerivative(channel.spans[0].curve, t), [4, 0, 0]);
    }
    pointNear(channel.ports.entry.positionMm, input.entry);
    pointNear(channel.ports.exit.positionMm, input.exit);
    pointNear(channel.ports.entry.tangent, channel.axis.direction);
    pointNear(channel.ports.exit.tangent, channel.axis.direction);
    near(norm(channel.ports.entry.positionMm), input.R);
    near(norm(channel.ports.exit.positionMm), input.R);
  });

  it('passes a wide finite-support engineering geometry without accepting mechanics or a craft recipe', () => {
    const channel = buildNeedleChannel(symmetric());
    assert.equal(channel.geometry, 'passed');
    assert.equal(channel.mechanics, 'unresolved');
    const gap = 10.05 - Math.sqrt(96);
    near(channel.supportChecks[0].needle.lowerMm!, gap - .05 - .15);
    near(channel.supportChecks[0].needle.upperMm!, gap - .05 - .15);
    near(channel.supportChecks[0].thread.upperMm!, gap - .05 - .1);
    near(channel.coreClearance.needleMm, Math.sqrt(96) - .15 - 9.5);
    assert.equal(channel.exposure.threadMiddle, 'fully-inside');
    assert.equal(channel.exposure.exposedNearPorts, true);
    assert.ok(channel.assumptions.some(s => s.includes('No dimensions') && s.includes('GT14')));
    assert.ok(channel.diagnostics.some(d => d.code === 'material-not-assigned'));
    assert.ok(channel.diagnostics.some(d => d.code === 'post-withdrawal-shape-unmodelled'));
    assert.ok(!('restLengthMm' in channel));
  });

  it('rejects the narrow channel colliding with marking material despite a permitted soft layer', () => {
    const input = symmetric(1), channel = buildNeedleChannel(input);
    assert.equal(channel.coreClearance.needle, 'passed');
    assert.equal(channel.coreClearance.thread, 'passed');
    assert.equal(channel.geometry, 'rejected');
    assert.equal(channel.supportChecks[0].needle.status, 'rejected');
    assert.equal(channel.supportChecks[0].thread.status, 'rejected');
    assert.ok(channel.supportChecks[0].thread.witness!.clearanceMm < -.08);
    assert.equal(channel.exposure.threadMiddle, 'partly-exposed');
    // More permitted matrix penetration cannot silently erase a marking collision.
    assert.equal(buildNeedleChannel({ ...input, layerThickness: 5 }).geometry, 'rejected');
  });

  it('retains partial exposure with no support and never substitutes a deeper U', () => {
    const input = { ...symmetric(1), supports: [] }, channel = buildNeedleChannel(input);
    assert.equal(channel.geometry, 'passed');
    assert.equal(channel.mechanics, 'unresolved');
    assert.equal(channel.exposure.threadMiddle, 'partly-exposed');
    near(channel.chordDepthMm, 10 - Math.sqrt(99.75));
    near(channel.exposure.threadMiddleOutermostRadiusMm, Math.sqrt(99.75) + .1);
    assert.ok(channel.chordDepthMm < input.rThread);
    for (const t of [0, .25, .5, .75, 1]) near(evaluateCurve(channel.spans[0].curve, t)[1], input.entry[1]);
  });

  it('rejects hard-core penetration and leaves exact core contact unresolved', () => {
    const input = { ...symmetric(), rNeedle: .1, supports: [] };
    const touchingLayer = 10 - Math.sqrt(96) + .1;
    const tangent = buildNeedleChannel({ ...input, layerThickness: touchingLayer });
    near(tangent.coreClearance.threadMm, 0);
    assert.equal(tangent.geometry, 'unresolved');
    assert.equal(tangent.coreClearance.thread, 'unresolved');
    assert.equal(buildNeedleChannel({ ...input, layerThickness: touchingLayer - .01 }).geometry, 'rejected');
    assert.equal(buildNeedleChannel({ ...input, layerThickness: touchingLayer + .01 }).geometry, 'passed');
    assert.equal(buildNeedleChannel({ ...input, entry: [-10, 0, 0], exit: [10, 0, 0] }).geometry, 'rejected');
  });

  it('checks needle and thread envelopes independently, including yarn wider than the shaft', () => {
    const input = symmetric();
    const largerNeedle = buildNeedleChannel({ ...input, rNeedle: .25 });
    assert.equal(largerNeedle.supportChecks[0].needle.status, 'rejected');
    assert.equal(largerNeedle.supportChecks[0].thread.status, 'passed');
    assert.equal(largerNeedle.geometry, 'rejected');
    const largerYarn = buildNeedleChannel({ ...input, rNeedle: .1, rThread: .25 });
    assert.equal(largerYarn.supportChecks[0].needle.status, 'passed');
    assert.equal(largerYarn.supportChecks[0].thread.status, 'rejected');
    assert.ok(largerYarn.diagnostics.some(d => d.code === 'bore-enlargement-unmodelled'));
    assert.equal(largerYarn.mechanics, 'unresolved');
  });

  it('uses finite supports rather than colliding with their infinite line extensions', () => {
    const input = symmetric(), y = input.entry[1];
    const finite = buildNeedleChannel({ ...input, supports: [straightSupport([0, y, 2], [0, y, 3])] });
    assert.equal(finite.geometry, 'passed');
    near(finite.supportChecks[0].thread.lowerMm!, 2 - .05 - .1);
    near(finite.supportChecks[0].thread.witness!.supportParameter, 0);
    const actuallyCrossing = buildNeedleChannel({ ...input, supports: [straightSupport([0, y, -2], [0, y, 3])] });
    assert.equal(actuallyCrossing.geometry, 'rejected');
    near(actuallyCrossing.supportChecks[0].thread.upperMm!, -.15);
  });

  it('bounds the exact minimum to a finite spherical arc and supplies actual evaluated witnesses', () => {
    const input = symmetric(), radius = 10.05, angle = .2;
    const support: MarkingSupport = { id: 'finite-arc', circleId: 'engineering-mark', radiusMm: .05,
      curve: { kind: 'arc', from: [0, radius * Math.cos(angle), -radius * Math.sin(angle)],
        to: [0, radius * Math.cos(angle), radius * Math.sin(angle)] } };
    const channel = buildNeedleChannel({ ...input, supports: [support] });
    const exact = radius - input.entry[1] - support.radiusMm - input.rThread;
    const gap = channel.supportChecks[0].thread, witness = gap.witness!;
    assert.equal(channel.geometry, 'passed');
    assert.ok(gap.lowerMm! <= exact + 1e-12);
    assert.ok(gap.upperMm! >= exact - 1e-12);
    assert.ok(gap.upperMm! - gap.lowerMm! < 2e-4);
    pointNear(witness.supportPointMm, evaluateCurve(support.curve, witness.supportParameter));
    pointNear(witness.channelPointMm, evaluateCurve(channel.spans[0].curve, witness.channelParameter));
    near(witness.centerlineDistanceMm, norm(sub(witness.supportPointMm, witness.channelPointMm)));
    near(witness.clearanceMm, witness.centerlineDistanceMm - support.radiusMm - input.rThread);
  });

  it('rejects curved-support penetration only with an actual curve witness', () => {
    const input = symmetric(), y = input.entry[1] + .14;
    // y(t) = y + .4(2t-1)^2, z(t) = 4t-2: exact minimum at t=1/2.
    const support: MarkingSupport = { id: 'curved-mark', circleId: 'engineering-mark', radiusMm: .05,
      curve: { kind: 'bezier', controls: [[0, y + .4, -2], [0, y - .4 / 3, -2 / 3],
        [0, y - .4 / 3, 2 / 3], [0, y + .4, 2]] } };
    const channel = buildNeedleChannel({ ...input, supports: [support] });
    const gap = channel.supportChecks[0].thread;
    assert.equal(gap.status, 'rejected');
    assert.ok(gap.lowerMm! <= -.01 + 1e-12);
    near(gap.upperMm!, -.01);
    pointNear(gap.witness!.supportPointMm, evaluateCurve(support.curve, gap.witness!.supportParameter));
    assert.ok(gap.witness!.clearanceMm < -channel.toleranceMm);
  });

  it('does not accept a tangent marking contact', () => {
    const input = symmetric(), y = input.entry[1] + .15;
    const touching = buildNeedleChannel({ ...input, rNeedle: .1,
      supports: [straightSupport([0, y, -2], [0, y, 2])] });
    assert.equal(touching.geometry, 'unresolved');
    assert.equal(touching.supportChecks[0].thread.status, 'unresolved');
    near(touching.supportChecks[0].thread.upperMm!, 0);
    assert.equal(touching.supportChecks[0].refinements, 3);
  });

  it('leaves an exhausted support sampling budget unresolved and serializable', () => {
    const support: MarkingSupport = { id: 'excessive-arc', circleId: 'engineering-mark', radiusMm: .05,
      curve: { kind: 'arc', from: [1e9, 0, 0], to: [0, 1e9, 0] } };
    const channel = buildNeedleChannel({ ...symmetric(), supports: [support] });
    assert.equal(channel.geometry, 'unresolved');
    assert.equal(channel.supportChecks[0].thread.status, 'unresolved');
    assert.equal(channel.supportChecks[0].needle.status, 'unresolved');
    assert.equal(channel.supportChecks[0].thread.lowerMm, null);
    assert.equal(channel.supportChecks[0].thread.upperMm, null);
    assert.equal(channel.supportChecks[0].thread.witness, null);
    assert.deepEqual(JSON.parse(JSON.stringify(channel)), channel);
  });

  it('is covariant under rigid rotation and length scaling including tolerance', () => {
    const input = symmetric(), original = buildNeedleChannel(input);
    const rotate = ([x, y, z]: PointMm): PointMm => [(.36 * x - .48 * y + .8 * z), (.8 * x + .6 * y), (-.48 * x + .64 * y + .6 * z)];
    const transform = (p: PointMm): PointMm => rotate(p).map(v => 3 * v) as unknown as PointMm;
    const supports = input.supports.map(s => ({ ...s, radiusMm: s.radiusMm * 3,
      curve: s.curve.kind === 'arc' ? { kind: 'arc' as const, from: transform(s.curve.from), to: transform(s.curve.to) }
        : { kind: 'bezier' as const, controls: s.curve.controls.map(transform) as unknown as [PointMm, PointMm, PointMm, PointMm] } }));
    const changed = buildNeedleChannel({ ...input, R: 30, layerThickness: 1.5, rNeedle: .45, rThread: .3,
      toleranceMm: original.toleranceMm * 3, entry: transform(input.entry), exit: transform(input.exit), supports });
    assert.equal(changed.geometry, original.geometry);
    near(changed.chordDepthMm, original.chordDepthMm * 3);
    near(changed.coreClearance.needleMm, original.coreClearance.needleMm * 3);
    near(changed.supportChecks[0].needle.lowerMm!, original.supportChecks[0].needle.lowerMm! * 3);
    near(changed.supportChecks[0].thread.upperMm!, original.supportChecks[0].thread.upperMm! * 3);
    pointNear(changed.axis.direction, rotate(original.axis.direction));
    pointNear(changed.ports.entry.positionMm, transform(original.ports.entry.positionMm));
  });

  it('rejects malformed or off-sphere input instead of silently projecting or inventing a route', () => {
    const input = symmetric();
    for (const patch of [{ R: 0 }, { rNeedle: -1 }, { rThread: NaN }, { layerThickness: -1 },
      { layerThickness: 10 }, { toleranceMm: 0 }, { rNeedle: 10 }, { id: ' ' }, { threadId: '' },
      { entry: [0, 9.99, 0] }, { exit: input.entry }, { entry: [Infinity, 0, 0] }])
      assert.throws(() => buildNeedleChannel({ ...input, ...patch } as NeedleChannelInput), RangeError);
    assert.throws(() => buildNeedleChannel({ ...input, supports: [input.supports[0], input.supports[0]] }), /unique IDs/);
    assert.throws(() => buildNeedleChannel({ ...input, supports: [{ ...input.supports[0], radiusMm: -1 }] }), RangeError);
    const invalidArc: MarkingSupport = { ...input.supports[0], curve: { kind: 'arc', from: [0, 10, 0], to: [0, -10, 0] } };
    assert.throws(() => buildNeedleChannel({ ...input, supports: [invalidArc] }), /explicit route/);
    assert.throws(() => buildNeedleChannel({ ...input, supports: [{ ...invalidArc, curve: { kind: 'arc', from: [0, 10, 0], to: [0, 0, 9] } }] }), /same positive radius/);
  });

  it('preserves inputs and returns a serializable geometry contract with explicit limitations', () => {
    const input = symmetric(), before = JSON.stringify(input), channel = buildNeedleChannel(input);
    assert.equal(JSON.stringify(input), before);
    const parsed = JSON.parse(JSON.stringify(channel));
    assert.deepEqual(parsed, channel);
    assert.equal(channel.assumptions.some(s => s.includes('endpoint balls')), true);
    assert.equal(channel.assumptions.some(s => s.includes('not an empty needle bore')), true);
    assert.notEqual(channel.ports.entry.positionMm, input.entry);
  });
});
