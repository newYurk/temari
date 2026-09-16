import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLowerKagari } from './computed-lower-kagari';
import { createLowerKagariFixture } from './lower-kagari';
import { curveDerivative, evaluateCurve } from './thread-geometry';
import type { PointMm } from './thread-path';

const result = computeLowerKagari();
const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const pointNear = (a: PointMm, b: PointMm) => a.forEach((v, i) => near(v, b[i]));
const unit = (p: PointMm): PointMm => p.map(v => v / Math.hypot(...p)) as unknown as PointMm;

describe('computed lower kagari: full-path and refinement acceptance', () => {
  it('does not accept one successful discretisation when the finer physical path fails', () => {
    assert.equal(result.checks.seed.status, 'passed');
    assert.deepEqual(result.checks.resolutions.map(c => c.controlCount), [10, 12]);
    const [coarse, fine] = result.checks.resolutions;
    assert.equal(coarse.result.status, 'converged'); assert.equal(coarse.validation.status, 'passed');
    assert.ok(coarse.validation.maxCurvatureTimesRadius < 1);
    assert.equal(fine.result.status, 'converged');
    assert.ok(fine.validation.diagnostics.some(d => d.code === 'curvature-radius'));
    assert.ok(fine.validation.maxCurvatureTimesRadius > 1);
    assert.equal(result.status, 'rejected');
    assert.equal(result.result, fine.result); assert.equal(result.checks.candidate, fine.validation);
    // Do not silently fall back to the passing coarse curve for acceptance.
    assert.equal(result.coupon.spans.filter(s => s.opId === 'lower-outgoing').length, 12 - 3);
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
    // Rejection is real section regularity/refinement, not a missing X recipe.
    assert.ok(!result.checks.candidate.diagnostics.some(d => d.code.startsWith('crossing-')));
  });

  it('keeps numerical inflation separate from real physical thread radii and support lengths', () => {
    near(result.metrics.numericalClearanceMm, .003);
    near(result.coupon.threadRadiusMm, .2); near(result.coupon.supports[0].radiusMm, .08);
    const incoming = result.obstacles.find(s => s.id === 'incoming-1')!;
    assert.equal(incoming.kind, 'arc'); near(incoming.radiusMm, .203);
    const curve = result.fixture.incoming[0]; assert.equal(curve.kind, 'arc');
    if (curve.kind === 'arc') { pointNear(incoming.fromMm, curve.from); pointNear(incoming.toMm, curve.to); }
    const ramp = result.obstacles.filter(s => s.id.startsWith('incoming-2-capsule'));
    assert.ok(ramp.length > 1 && ramp.every(s => s.kind === 'segment' && s.radiusMm >= .203
      && s.radiusMm <= .203 + result.metrics.obstacleToleranceMm + 1e-12));
    const marking = result.obstacles.find(s => s.id === result.fixture.markingSupport.id)!;
    near(marking.radiusMm, .083);
  });

  it('reports refinement differences rather than treating similar screenshots as proof', () => {
    const [coarse, fine] = result.checks.resolutions;
    near(result.metrics.lengthDifferenceMm, Math.abs(coarse.result.lengthMm - fine.result.lengthMm));
    assert.ok(result.metrics.lengthDifferenceMm > result.metrics.lengthToleranceMm);
    assert.ok(Number.isFinite(result.metrics.maxShapeDifferenceMm) && result.metrics.maxShapeDifferenceMm > 0);
    assert.ok(result.diagnostics.some(d => d.includes('length has not stabilised')));
    assert.ok(result.diagnostics.some(d => d.includes('curvature-radius')));
  });

  it('never accepts an unresolved capped refinement or a single/repeated mesh', () => {
    const capped = computeLowerKagari({}, { solverOptions: { maxIterations: 1 } });
    assert.ok(capped.checks.resolutions.some(c => c.result.status === 'unresolved'));
    assert.notEqual(capped.status, 'accepted');
    assert.throws(() => computeLowerKagari({}, { controlCounts: [10] }), RangeError);
    assert.throws(() => computeLowerKagari({}, { controlCounts: [10, 10] }), RangeError);
  });
});
