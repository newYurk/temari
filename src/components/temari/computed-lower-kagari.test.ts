import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLowerKagari } from './computed-lower-kagari';
import { createLowerKagariFixture } from './lower-kagari';
import { curveDerivative, evaluateCurve } from './thread-geometry';
import type { PointMm } from './thread-path';

const result = computeLowerKagari();
const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const pointNear = (a: PointMm, b: PointMm, tolerance = 1e-9) => a.forEach((v, i) => near(v, b[i], tolerance));
const unit = (p: PointMm): PointMm => p.map(v => v / Math.hypot(...p)) as unknown as PointMm;

describe('computed lower kagari: full-path and refinement acceptance', () => {
  it('accepts only a model-resolved ladder whose every resolution passes independent checks', () => {
    assert.equal(result.checks.seed.status, 'passed');
    // spans >= seed length / min bend radius, then x1.5 and x2: derived, not tuned.
    const minimum = Math.ceil(result.metrics.seedLengthMm / result.metrics.minBendRadiusMm);
    assert.equal(result.metrics.minimumSpans, minimum);
    assert.deepEqual(result.checks.resolutions.map(c => c.controlCount), [1, 1.5, 2].map(f => Math.ceil(minimum * f) + 3));
    for (const check of result.checks.resolutions) {
      assert.ok(check.resolved);
      assert.equal(check.result.status, 'converged');
      assert.ok(check.restarts >= 1 && check.settleMoveMm <= 1e-4, `${check.restarts} ${check.settleMoveMm}`);
      assert.equal(check.validation.status, 'passed', JSON.stringify(check.validation.diagnostics));
      assert.equal(check.curvature.status, 'certified');
      assert.ok(check.curvature.upper < 1 && check.validation.maxCurvatureTimesRadius < 1);
      // The bend constraint is active, not vacuous: the exit port bends at the limit.
      const limit = check.result.metrics.curvatureLimit;
      near(limit, .8);
      assert.ok(check.curvature.upper >= limit - 1e-3 && check.curvature.upper <= limit + .02);
      assert.ok(check.result.reactions.some(r => r.kind === 'curvature' && r.parameter === 0));
      assert.ok(check.result.metrics.minRelativeSpeedBound > .9);
    }
    assert.equal(result.status, 'accepted', result.diagnostics.join(' '));
    assert.deepEqual(result.diagnostics, []);
    const last = result.checks.resolutions.at(-1)!;
    assert.equal(result.result, last.result); assert.equal(result.checks.candidate, last.validation);
    assert.equal(result.coupon.spans.filter(s => s.opId === 'lower-outgoing').length, last.controlCount - 3);
  });

  it('flags the former 10/12-control meshes as under-resolved even though both now pass', () => {
    // Before the thick-rope formulation 12 controls failed with r*kappa ~ 39.
    const coarse = computeLowerKagari({}, { controlCounts: [10, 12] });
    for (const check of coarse.checks.resolutions) {
      assert.equal(check.result.status, 'converged');
      assert.equal(check.validation.status, 'passed');
      assert.ok(check.curvature.upper < 1);
      assert.equal(check.resolved, false);
    }
    assert.equal(coarse.status, 'unresolved');
    assert.ok(coarse.diagnostics.some(d => d.includes('under-resolved')));
  });

  it('preserves all incoming and needle geometry and checks the complete thread', () => {
    const source = createLowerKagariFixture();
    assert.deepEqual(result.fixture.incoming, source.incoming);
    assert.deepEqual(result.fixture.fixed, source.fixed);
    assert.deepEqual(result.fixture.coupon, source.coupon);
    assert.deepEqual(result.coupon.spans.filter(s => s.opId !== 'lower-outgoing'),
      source.coupon.spans.filter(s => s.opId !== 'lower-outgoing'));
    assert.deepEqual(result.coupon.supports, source.coupon.supports);
    assert.deepEqual(result.coupon.operations.slice(0, 2), source.coupon.operations.slice(0, 2));
    assert.equal(result.coupon.operations.filter(op => op.kind === 'start').length, 1);
    assert.equal(result.coupon.operations.filter(op => op.kind === 'finish').length, 1);
  });

  it('keeps fixed endpoint positions and G1 directions without a rendering repair', () => {
    const outgoing = result.coupon.spans.filter(s => s.opId === 'lower-outgoing');
    pointNear(evaluateCurve(outgoing[0].curve, 0), result.fixture.exit.positionMm);
    pointNear(evaluateCurve(outgoing.at(-1)!.curve, 1), result.fixture.next.positionMm);
    pointNear(unit(curveDerivative(outgoing[0].curve, 0)), result.fixture.exit.tangent);
    pointNear(unit(curveDerivative(outgoing.at(-1)!.curve, 1)), result.fixture.next.tangent);
    assert.deepEqual(outgoing.map(s => s.curve), result.result.curves);
    for (const check of result.checks.resolutions) assert.ok(!check.validation.diagnostics
      .some(d => d.code === 'tangent-discontinuity' || d.code === 'path-discontinuity'));
  });

  it('retains finite crossing declarations and evaluates them on the new outgoing spans', () => {
    const ids = result.coupon.spans.filter(s => s.opId === 'lower-outgoing').map(s => s.id);
    const crosses = result.coupon.crossings!;
    assert.equal(crosses.length, 4);
    for (const cross of crosses.filter(c => c.opId === 'lower-outgoing')) assert.deepEqual(cross.working,
      ids.map(spanId => ({ spanId, t0: 0, t1: 1 })));
    assert.ok(crosses.some(c => c.target.id === result.fixture.incomingTarget.id && c.pass === 'over'));
    // The accepted candidate keeps every prescribed finite over/under crossing.
    assert.ok(!result.checks.candidate.diagnostics.some(d => d.code.startsWith('crossing-')));
  });

  it('keeps numerical inflation separate from real physical thread radii and support lengths', () => {
    near(result.metrics.numericalClearanceMm, .003);
    near(result.coupon.threadRadiusMm, .2); near(result.coupon.supports[0].radiusMm, .08);
    const incoming = result.obstacles.find(s => s.id === 'incoming-1')!;
    assert.equal(incoming.kind, 'arc'); near(incoming.radiusMm, .203);
    const curve = result.fixture.incoming[0]; assert.equal(curve.kind, 'arc');
    if (curve.kind === 'arc') { pointNear(incoming.fromMm, curve.from); pointNear(incoming.toMm, curve.to); }
    // The ramp is its own exact tube: no chord cover and no cover tolerance.
    const ramp = result.obstacles.find(s => s.id === 'incoming-2')!, source = result.fixture.incoming[1];
    assert.equal(ramp.kind, 'curve'); near(ramp.radiusMm, .203);
    if (ramp.kind === 'curve' && source.kind === 'bezier') assert.deepEqual(ramp.piecesMm, [source.controls]);
    const marking = result.obstacles.find(s => s.id === result.fixture.markingSupport.id)!;
    near(marking.radiusMm, .083);
  });

  it('reports successive refinement differences within tolerance rather than screenshots', () => {
    const { refinements, resolutions } = result.checks;
    assert.equal(refinements.length, resolutions.length - 1);
    refinements.forEach((r, i) => {
      assert.equal(r.from, resolutions[i].controlCount); assert.equal(r.to, resolutions[i + 1].controlCount);
      near(r.lengthDifferenceMm, Math.abs(resolutions[i + 1].result.lengthMm - resolutions[i].result.lengthMm));
      assert.ok(r.lengthDifferenceMm <= result.metrics.lengthToleranceMm);
      assert.ok(r.shapeDifferenceMm > 0 && r.shapeDifferenceMm <= result.metrics.shapeToleranceMm);
    });
    near(result.metrics.lengthDifferenceMm, Math.max(...refinements.map(r => r.lengthDifferenceMm)));
    near(result.metrics.maxShapeDifferenceMm, Math.max(...refinements.map(r => r.shapeDifferenceMm)));
    // The computed outgoing branch is shorter than the raised engineering seed.
    assert.ok(result.result.lengthMm < result.metrics.seedLengthMm);
  });

  it('is mirror-covariant: the opposite working direction gives the reflected stitch', () => {
    const mirrored = computeLowerKagari({ handedness: -1 });
    assert.equal(mirrored.status, 'accepted');
    const q = result.fixture.frame.progress;
    const reflect = (p: PointMm): PointMm => { const d = 2 * (p[0] * q[0] + p[1] * q[1] + p[2] * q[2]); return [p[0] - d * q[0], p[1] - d * q[1], p[2] - d * q[2]]; };
    near(mirrored.result.lengthMm, result.result.lengthMm, 1e-9);
    const a = result.coupon.spans.filter(s => s.opId === 'lower-outgoing'), b = mirrored.coupon.spans.filter(s => s.opId === 'lower-outgoing');
    assert.equal(a.length, b.length);
    a.forEach((span, i) => { for (const t of [0, .5, 1]) pointNear(reflect(evaluateCurve(span.curve, t)), evaluateCurve(b[i].curve, t), 1e-7); });
  });

  it('never accepts an unresolved capped refinement or a single/repeated mesh', () => {
    const capped = computeLowerKagari({}, { solverOptions: { maxIterations: 1 } });
    assert.ok(capped.checks.resolutions.some(c => c.result.status === 'unresolved'));
    assert.notEqual(capped.status, 'accepted');
    assert.throws(() => computeLowerKagari({}, { controlCounts: [10] }), RangeError);
    assert.throws(() => computeLowerKagari({}, { controlCounts: [10, 10] }), RangeError);
    assert.throws(() => computeLowerKagari({}, { controlCounts: [60, 257] }), RangeError);
    assert.throws(() => computeLowerKagari({}, { spansPerBendRadius: 0 }), RangeError);
  });
});
