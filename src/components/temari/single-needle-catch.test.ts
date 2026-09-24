import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSingleNeedleCatch } from './single-needle-catch';
import type { PointMm, ThreadCurve } from './thread-path';

const wide = buildSingleNeedleCatch('clearance-control', 60);
const narrow = buildSingleNeedleCatch('narrow', 60);
const shortSupply = buildSingleNeedleCatch('clearance-control', 40);
const extraSupply = buildSingleNeedleCatch('clearance-control', 80);
const impossibleSupply = buildSingleNeedleCatch('clearance-control', 121);
const dot = (a: PointMm, b: PointMm) => a.reduce((s, v, i) => s + v * b[i], 0);
const sub = (a: PointMm, b: PointMm): PointMm => a.map((v, i) => v - b[i]) as unknown as PointMm;
const norm = (p: PointMm) => Math.hypot(...p);
const unit = (p: PointMm): PointMm => p.map(v => v / norm(p)) as unknown as PointMm;
const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`);
const pointNear = (a: PointMm, b: PointMm, tolerance = 1e-9) =>
  a.forEach((v, i) => near(v, b[i], tolerance));
const controls = (curve: ThreadCurve) => {
  assert.equal(curve.kind, 'bezier', 'this fixture prescribes cubic pieces');
  if (curve.kind !== 'bezier') throw new Error('Expected cubic');
  return curve.controls;
};
// Independent low-degree Bernstein evaluation, not the production curve/length helpers.
const weighted = (points: readonly PointMm[], weights: readonly number[]): PointMm =>
  [0, 1, 2].map(axis => points.reduce((sum, p, i) => sum + weights[i] * p[axis], 0)) as unknown as PointMm;
const point = (curve: ThreadCurve, t: number) => {
  const u = 1 - t;
  return weighted(controls(curve), [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3]);
};
const derivatives = (curve: ThreadCurve, t: number) => {
  const p = controls(curve), d = [sub(p[1], p[0]), sub(p[2], p[1]), sub(p[3], p[2])];
  return { velocity: weighted(d, [3 * (1 - t) ** 2, 6 * t * (1 - t), 3 * t * t]),
    acceleration: weighted([sub(d[1], d[0]), sub(d[2], d[1])], [6 * (1 - t), 6 * t]) };
};
const curvature = (curve: ThreadCurve, t: number) => {
  const { velocity: v, acceleration: a } = derivatives(curve, t);
  const cross: PointMm = [v[1] * a[2] - v[2] * a[1], v[2] * a[0] - v[0] * a[2], v[0] * a[1] - v[1] * a[0]];
  return norm(cross) / norm(v) ** 3;
};
// Composite Simpson is independent of the production adaptive length integration.
const length = (curve: ThreadCurve, count = 4096) => {
  let sum = norm(derivatives(curve, 0).velocity) + norm(derivatives(curve, 1).velocity);
  for (let i = 1; i < count; i++) sum += (i % 2 ? 4 : 2) * norm(derivatives(curve, i / count).velocity);
  return sum / (3 * count);
};

describe('single needle catch: independent geometry and material checks', () => {
  it('admits the wide engineering geometry while retaining unresolved mechanics and open craft acceptance', () => {
    assert.equal(wide.geometryStatus, 'passed');
    assert.equal(wide.channel.geometry, 'passed');
    assert.equal(wide.checks.validation.status, 'passed');
    assert.equal(wide.material.status, 'conserved');
    assert.equal(wide.status, 'unresolved');
    assert.equal(wide.mechanics, 'unresolved');
    assert.equal(wide.craftAcceptance, 'open');
    assert.ok(wide.assumptions.some(s => s.includes('NOT a replacement')));
  });

  it('rejects narrow support penetration even when its material supply balances', () => {
    assert.equal(narrow.material.status, 'conserved');
    assert.equal(narrow.geometryStatus, 'rejected');
    assert.equal(narrow.status, 'rejected');
    const witness = narrow.channel.supportChecks[0].thread.witness!;
    assert.equal(narrow.channel.supportChecks[0].thread.status, 'rejected');
    const actualGap = norm(sub(witness.channelPointMm, witness.supportPointMm))
      - narrow.parameters.rThread - narrow.supports[0].radiusMm;
    near(witness.clearanceMm, actualGap);
    assert.ok(actualGap < -narrow.channel.toleranceMm);
    assert.ok(narrow.checks.validation.diagnostics.some(d => d.code === 'support-penetration'));
  });

  it('uses one physical thread and the same straight curve, sphere ports, and oriented G1 joins', () => {
    for (const fixture of [wide, narrow]) {
      const middle = fixture.spans[1];
      assert.deepEqual(middle.curve, fixture.channel.spans[0].curve);
      assert.equal(new Set([...fixture.spans, ...fixture.channel.spans].map(s => s.threadId)).size, 1);
      const entry = fixture.channel.ports.entry, exit = fixture.channel.ports.exit;
      near(norm(entry.positionMm), fixture.parameters.R);
      near(norm(exit.positionMm), fixture.parameters.R);
      pointNear(point(middle.curve, 0), entry.positionMm);
      pointNear(point(middle.curve, 1), exit.positionMm);
      const delta = sub(exit.positionMm, entry.positionMm);
      for (const t of [0, .125, .5, .875, 1]) {
        pointNear(point(middle.curve, t), weighted([entry.positionMm, exit.positionMm], [1 - t, t]));
        pointNear(derivatives(middle.curve, t).velocity, delta);
      }
      pointNear(unit(delta), entry.tangent);
      pointNear(unit(delta), exit.tangent);
      for (let i = 1; i < fixture.spans.length; i++) {
        const before = fixture.spans[i - 1].curve, after = fixture.spans[i].curve;
        pointNear(point(before, 1), point(after, 0));
        pointNear(unit(derivatives(before, 1).velocity), unit(derivatives(after, 0).velocity));
      }
      const width = norm(delta);
      near(fixture.channel.chordDepthMm,
        fixture.parameters.R - Math.sqrt(fixture.parameters.R ** 2 - width ** 2 / 4));
    }
  });

  it('balances 60 mm against independently integrated geometry and a finite remaining reservoir', () => {
    for (const fixture of [wide, narrow]) {
      const measured = fixture.spans.reduce((sum, span) => sum + length(span.curve), 0);
      near(measured, 60, 1e-7);
      near(fixture.geometryLengthMm, measured, 1e-7);
      const state = fixture.material.nextState!;
      near(state.placedLengthMm, measured, 1e-7);
      near(state.placedLengthMm + state.reservoirMm, state.totalMaterialMm, 1e-7);
      near(state.reservoirMm, fixture.parameters.totalMaterialMm - 60);
      assert.equal(fixture.materialContract.lengthModel, 'inextensible-kinematic');
      assert.ok(fixture.materialContract.toleranceMm > 0);
      assert.equal(fixture.boundaries.start.materialCoordinateMm, 0);
      near(fixture.boundaries.end.materialCoordinateMm!, measured, 1e-7);
      assert.equal(fixture.boundaries.end.prescribedMaterialCoordinateMm, 60);
    }
  });

  it('rejects insufficient 40 mm and over-reservoir 121 mm without deforming the prescribed base', () => {
    const measuredBase = wide.spans.slice(0, 3).reduce((sum, s) => sum + length(s.curve), 0);
    assert.ok(measuredBase > 40 && measuredBase < 60);
    for (const fixture of [shortSupply, impossibleSupply]) {
      assert.equal(fixture.material.status, 'rejected');
      assert.equal(fixture.material.nextState, null);
      assert.equal(fixture.status, 'rejected');
      assert.equal(fixture.boundaries.end.materialCoordinateMm, null);
      assert.equal(fixture.boundaries.end.prescribedMaterialCoordinateMm, fixture.parameters.suppliedLengthMm);
      assert.deepEqual(fixture.spans.slice(0, 3).map(s => s.curve), wide.spans.slice(0, 3).map(s => s.curve));
      assert.deepEqual(fixture.channel.ports, wide.channel.ports);
    }
    assert.equal(shortSupply.spans.length, 3, 'insufficient feed cannot create a negative-length tail');
    near(shortSupply.geometryLengthMm, measuredBase, 1e-7);
    assert.ok(shortSupply.material.mismatchMm! > 0);
    assert.ok(shortSupply.material.diagnostics.some(d => d.code === 'material-length-mismatch'));
    assert.ok(impossibleSupply.material.reservoirAfterMm! < 0);
    assert.ok(impossibleSupply.material.diagnostics.some(d => d.code === 'negative-reservoir'));
  });

  it('puts 20 mm of additional feed only into the straight tail and moves its held boundary', () => {
    assert.equal(extraSupply.material.status, 'conserved');
    assert.equal(extraSupply.geometryStatus, 'passed');
    assert.equal(extraSupply.status, 'unresolved');
    assert.deepEqual(extraSupply.spans.slice(0, 3), wide.spans.slice(0, 3));
    assert.deepEqual(extraSupply.channel, wide.channel);
    const oldTail = wide.spans[3].curve, newTail = extraSupply.spans[3].curve;
    pointNear(point(oldTail, 0), point(newTail, 0));
    near(length(newTail) - length(oldTail), 20, 1e-8);
    near(norm(sub(extraSupply.boundaries.end.positionMm, wide.boundaries.end.positionMm)), 20);
    near(extraSupply.material.reservoirAfterMm!, wide.material.reservoirAfterMm! - 20);
    near(extraSupply.geometryLengthMm - wide.geometryLengthMm, 20, 1e-7);
    for (const t of [0, .25, .5, .75, 1]) {
      near(curvature(newTail, t), 0, 1e-10);
      pointNear(point(newTail, t), weighted([point(newTail, 0), point(newTail, 1)], [1 - t, t]));
    }
  });

  it('certifies no extra nominal-sphere entries of exterior centerlines by tangent half-spaces', () => {
    for (const fixture of [wide, narrow, extraSupply]) {
      const R = fixture.parameters.R;
      for (const [index, port] of [[0, fixture.channel.ports.entry.positionMm],
        [2, fixture.channel.ports.exit.positionMm]] as const) {
        // The complete Bezier is in its controls' convex hull. A sphere is
        // inside the opposite half-space, so these inequalities cover every t.
        const planeDistances = controls(fixture.spans[index].curve).map(p => dot(sub(p, port), port) / R);
        assert.ok(planeDistances.every(d => d >= -1e-12));
        assert.equal(planeDistances.filter(d => d > 1e-10).length, 3);
      }
      const tail = fixture.spans[3].curve, start = point(tail, 0), end = point(tail, 1);
      assert.ok(norm(start) > R);
      assert.ok(dot(start, sub(end, start)) >= 0, 'straight tail moves monotonically away from the sphere');
      assert.equal(fixture.checks.additionalEntry, false);
      near(fixture.checks.outsideMinimumRadiusMm, R);
    }
  });

  it('checks the curvature certificate against independent evaluated derivatives, without mistaking its upper bound for a measured value', () => {
    for (const fixture of [wide, narrow]) {
      const bound = fixture.checks.curvature, r = fixture.parameters.rThread;
      assert.equal(bound.status, 'certified');
      assert.ok(bound.minSpeedBound > 0);
      assert.ok(bound.upper < 1, 'the selected finite tube must retain local regularity');
      let sampledMaximum = 0;
      for (const { curve } of fixture.spans) for (let i = 0; i <= 2048; i++) {
        const at = i / 2048;
        assert.ok(norm(derivatives(curve, at).velocity) >= bound.minSpeedBound - 1e-9);
        sampledMaximum = Math.max(sampledMaximum, r * curvature(curve, at));
      }
      assert.ok(sampledMaximum <= bound.upper + 1e-10);
      const witness = r * curvature(fixture.spans[bound.argmax.curve].curve, bound.argmax.t);
      near(witness, bound.lower, 1e-10);
      assert.ok(bound.lower <= bound.upper);
    }
  });
});
