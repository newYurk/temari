import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { closestSpatialSupport, sampleSpatialSpline, solveSpatialContact, spatialSplineBasis,
  spatialSplineKnots, splineToBezier, SPATIAL_CONTACT_DEFAULTS } from "./spatial-contact";
import type { SpatialContactInput, SpatialSupport } from "./spatial-contact";
import { evaluateCurve } from "./thread-geometry";
import type { PointMm } from "./thread-path";

const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const pointNear = (a: PointMm, b: PointMm, tolerance = 1e-9) => a.forEach((v, k) => near(v, b[k], tolerance));
const straight: SpatialContactInput = { controlPointsMm: [[-2, 0, 0], [-1.8, 0, 0], [-1, 1, 0], [1, 1, 0], [1.8, 0, 0], [2, 0, 0]],
  threadRadiusMm: .2, body: { centerMm: [0, -100, 0], radiusMm: 1 }, supports: [] };
function sphereSeed(count = 8): SpatialContactInput {
  const knots = spatialSplineKnots(count), handle = Math.PI / (3 * (count - 3));
  const controls: PointMm[] = Array.from({ length: count }, (_, i) => {
    const angle = Math.PI * (1 - (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3);
    return [Math.cos(angle), Math.sin(angle), 0];
  });
  controls[0] = [-1, 0, 0]; controls[1] = [-1, handle, 0];
  controls[count - 2] = [1, handle, 0]; controls[count - 1] = [1, 0, 0];
  return { controlPointsMm: controls, threadRadiusMm: .2, body: { centerMm: [0, 0, 0], radiusMm: .8 }, supports: [] };
}

describe("spatial contact: bounded spline stationary reference", () => {
  it("has a partition of unity and reproduces an affine path including endpoint derivatives", () => {
    for (const count of [4, 6, 9, 16]) {
      const knots = spatialSplineKnots(count);
      const controls: PointMm[] = Array.from({ length: count }, (_, i) => {
        const t = (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3;
        return [t, 2 * t - 1, -.3 * t];
      });
      for (const u of [0, 1e-6, .1, .37, .5, .91, 1]) {
        const basis = spatialSplineBasis(count, u);
        near(basis.values.reduce((a, b) => a + b), 1);
        near(basis.derivatives.reduce((a, b) => a + b), 0);
        assert.ok(basis.values.every(v => v >= 0));
        pointNear(sampleSpatialSpline(controls, u), [u, 2 * u - 1, -.3 * u]);
        near(basis.derivatives.reduce((sum, b, i) => sum + b * controls[i][0], 0), 1);
      }
    }
  });

  it("converts to Bezier exactly against an independent de Boor evaluator", () => {
    const controls: PointMm[] = Array.from({ length: 11 }, (_, i) => [Math.cos(i * .4), Math.sin(i * .31), i * .17]);
    const knots = spatialSplineKnots(controls.length), curves = splineToBezier(controls);
    const deBoor = (u: number): PointMm => {
      let k = controls.length - 1;
      if (u < 1) for (let j = 3; j < controls.length; j++) if (knots[j] <= u && u < knots[j + 1]) { k = j; break; }
      const d = Array.from({ length: 4 }, (_, j) => [...controls[k - 3 + j]]);
      for (let r = 1; r <= 3; r++) for (let j = 3; j >= r; j--) {
        const alpha = (u - knots[k - 3 + j]) / (knots[k + 1 + j - r] - knots[k - 3 + j]);
        d[j] = d[j].map((v, axis) => (1 - alpha) * d[j - 1][axis] + alpha * v);
      }
      return d[3] as unknown as PointMm;
    };
    for (let i = 0; i < curves.length; i++) for (const t of [0, .13, .5, .89, 1])
      pointNear(evaluateCurve(curves[i], t), deBoor((i + t) / curves.length));
  });

  it("finds finite circular-arc closest points and does not extend their ends", () => {
    const support: SpatialSupport = { id: "quarter", kind: "arc", centerMm: [0, 0, 0], fromMm: [1, 0, 0], toMm: [0, 1, 0], radiusMm: .2 };
    const interior = closestSpatialSupport([2, 2, .3], support);
    pointNear(interior.pointMm, [Math.SQRT1_2, Math.SQRT1_2, 0]); near(interior.parameter, .5);
    near(interior.distanceMm, Math.hypot(2 * Math.SQRT2 - 1, .3));
    const end = closestSpatialSupport([-1, 1, 0], support);
    pointNear(end.pointMm, [0, 1, 0]); near(end.distanceMm, 1); near(end.parameter, 1);
    const translated = { ...support, centerMm: [3, -2, 7] as PointMm, fromMm: [4, -2, 7] as PointMm, toMm: [3, -1, 7] as PointMm };
    pointNear(closestSpatialSupport([5, 0, 7.3], translated).pointMm, [3 + Math.SQRT1_2, -2 + Math.SQRT1_2, 7]);
  });

  it("matches finite differences of the obstacle distance gradient at interior and cap contacts", () => {
    const supports: SpatialSupport[] = [
      { id: "arc", kind: "arc", centerMm: [0, 0, 0], fromMm: [1, 0, 0], toMm: [0, 1, 0], radiusMm: .2 },
      { id: "line", kind: "segment", fromMm: [0, 0, -1], toMm: [0, 0, 1], radiusMm: .2 },
    ];
    for (const support of supports) for (const point of [[2, 2, .3], [-1, 1, 2]] as PointMm[]) {
      const closest = closestSpatialSupport(point, support), h = 1e-6;
      for (let k = 0; k < 3; k++) {
        const a = [...point], b = [...point]; a[k] += h; b[k] -= h;
        const derivative = (closestSpatialSupport(a as unknown as PointMm, support).distanceMm
          - closestSpatialSupport(b as unknown as PointMm, support).distanceMm) / (2 * h);
        near(derivative, closest.normal[k], 2e-8);
      }
    }
  });

  it("removes a free bow without moving the fixed ports or end handles", () => {
    const result = solveSpatialContact(straight);
    assert.equal(result.status, "converged", JSON.stringify(result.diagnostics));
    near(result.lengthMm, 4, 1e-9);
    for (const i of [0, 1, 4, 5]) assert.deepEqual(result.controlPointsMm[i], straight.controlPointsMm[i]);
    assert.ok(result.metrics.kktStationarity < SPATIAL_CONTACT_DEFAULTS.stationarityTolerance);
    assert.equal(result.reactions.length, 0);
    for (let i = 0; i <= 50; i++) near(sampleSpatialSpline(result.controlPointsMm, i / 50)[1], 0, 1e-6);
    assert.ok(Number.isFinite(result.metrics.lengthChangeMm));
  });

  it("approaches the independent great-semicircle length with explicit KKT and continuous-gap tolerances", () => {
    const input = sphereSeed(), result = solveSpatialContact(input);
    assert.equal(result.status, "converged", JSON.stringify(result.metrics));
    near(result.lengthMm, Math.PI, .001);
    assert.ok(result.metrics.continuousLowerGapMm >= -SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
    assert.ok(result.metrics.kktStationarity <= SPATIAL_CONTACT_DEFAULTS.stationarityTolerance);
    assert.ok(result.metrics.complementarityMm <= SPATIAL_CONTACT_DEFAULTS.complementarityToleranceMm);
    assert.ok(result.metrics.lengthQuadratureDifferenceMm <= SPATIAL_CONTACT_DEFAULTS.lengthToleranceMm);
    assert.ok(result.reactions.length > 0 && result.reactions.every(r => r.multiplier >= 0 && r.supportId === "body"));
    for (let i = 0; i <= 1000; i++) assert.ok(Math.hypot(...sampleSpatialSpline(result.controlPointsMm, i / 1000))
      >= 1 - SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
  });

  it("matches the planar tangent/semicircle benchmark around a finite capsule", () => {
    const count = 10, length = 4 + Math.PI, knots = spatialSplineKnots(count), handle = length / (3 * (count - 3));
    const at = (s: number): PointMm => s <= 2 ? [-2 + s, 1, 0] : s <= 2 + Math.PI
      ? [Math.cos(Math.PI / 2 - s + 2), Math.sin(Math.PI / 2 - s + 2), 0] : [-s + 2 + Math.PI, -1, 0];
    const controlPointsMm = Array.from({ length: count }, (_, i) => at(length * (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3));
    controlPointsMm[1] = [-2 + handle, 1, 0]; controlPointsMm[count - 2] = [-2 + handle, -1, 0];
    const result = solveSpatialContact({ ...straight, controlPointsMm,
      supports: [{ id: "finite-post", kind: "segment", fromMm: [0, 0, -10], toMm: [0, 0, 10], radiusMm: .8 }] });
    assert.equal(result.status, "converged", JSON.stringify(result.metrics));
    near(result.lengthMm, length, .004);
    assert.ok(result.metrics.maxPenetrationMm <= SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
    assert.ok(result.metrics.maxPenetrationMm >= result.metrics.samplePenetrationMm - 1e-10);
    assert.ok(result.reactions.some(r => r.supportId === "finite-post"));
    for (let i = 0; i <= 1000; i++) {
      const p = sampleSpatialSpline(result.controlPointsMm, i / 1000);
      assert.ok(Math.hypot(p[0], p[1]) >= 1 - SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
    }
  });

  it("does not pass a plausible-looking path when the iteration cap or residual fails", () => {
    const result = solveSpatialContact({ ...sphereSeed(), options: { maxIterations: 1 } });
    assert.equal(result.status, "unresolved"); assert.equal(result.diagnostics[0].code, "iteration-limit");
    assert.equal(result.metrics.iterations, 1);
    assert.ok(result.metrics.kktStationarity > SPATIAL_CONTACT_DEFAULTS.stationarityTolerance
      || result.metrics.complementarityMm > SPATIAL_CONTACT_DEFAULTS.complementarityToleranceMm
      || result.metrics.maxPenetrationMm > SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
    assert.ok(result.curves.length > 0); // Candidate is available for diagnostics, not acceptance.
  });

  it("adds between-knot contacts instead of trusting a sparse collocation grid", () => {
    const result = solveSpatialContact({ ...sphereSeed(), options: { samplesPerSpan: 1 } });
    assert.equal(result.status, "converged", JSON.stringify(result.metrics));
    assert.ok(result.metrics.constraintSamples > 6); // Initial 8-control spline has six knot probes.
    assert.ok(result.metrics.maxPenetrationMm <= SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
    for (let i = 0; i <= 1500; i++) assert.ok(Math.hypot(...sampleSpatialSpline(result.controlPointsMm, i / 1500))
      >= 1 - SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
    const capped = solveSpatialContact({ ...sphereSeed(), options: { samplesPerSpan: 1, maxConstraintSamples: 6 } });
    assert.equal(capped.status, "unresolved"); assert.equal(capped.diagnostics[0].code, "constraint-limit");
  });

  it("agrees with a finite-difference Lagrangian stationarity check using returned reactions", () => {
    const input = sphereSeed(), result = solveSpatialContact(input);
    assert.equal(result.status, "converged");
    // Independent Simpson integration and scalar L=f-sum(lambda*g), with no
    // production objective/gradient evaluation. Its control gradient has the
    // same units as the solver's normalised discrete force residual.
    const intervals = 1000;
    const derivatives = Array.from({ length: intervals + 1 }, (_, i) =>
      spatialSplineBasis(result.controlPointsMm.length, i / intervals).derivatives);
    const lagrangian = (controls: PointMm[]) => {
      let length = 0;
      for (let j = 0; j <= intervals; j++) {
        const velocity = [0, 0, 0];
        for (let i = 0; i < controls.length; i++) for (let k = 0; k < 3; k++) velocity[k] += derivatives[j][i] * controls[i][k];
        length += Math.hypot(...velocity) * (j === 0 || j === intervals ? 1 : j % 2 ? 4 : 2) / (3 * intervals);
      }
      return length - result.reactions.reduce((sum, r) => sum + r.multiplier
        * (Math.hypot(...sampleSpatialSpline(controls, r.parameter)) - 1), 0);
    };
    let residual = 0;
    for (let i = 2; i < result.controlPointsMm.length - 2; i++) {
      const gradient = [];
      for (let k = 0; k < 3; k++) {
        const h = 1e-5, a = result.controlPointsMm.map(p => [...p]), b = result.controlPointsMm.map(p => [...p]);
        a[i][k] += h; b[i][k] -= h;
        gradient.push((lagrangian(a as unknown as PointMm[]) - lagrangian(b as unknown as PointMm[])) / (2 * h));
      }
      residual = Math.max(residual, Math.hypot(...gradient));
    }
    near(residual, result.metrics.kktStationarity, 2e-6);
  });

  it("is covariant under a joint 3D rotation/translation and consistent scaling of numerical lengths", () => {
    const original = solveSpatialContact(straight), scale = 3;
    // An orthogonal cyclic permutation changes the actual 3D plane.
    const map = ([x, y, z]: PointMm): PointMm => [7 + scale * z, -3 + scale * x, 11 + scale * y];
    const transformed = solveSpatialContact({ ...straight, controlPointsMm: straight.controlPointsMm.map(map),
      body: { centerMm: map(straight.body.centerMm), radiusMm: scale * straight.body.radiusMm }, threadRadiusMm: scale * straight.threadRadiusMm,
      options: { feasibilityToleranceMm: scale * SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm,
        complementarityToleranceMm: scale * SPATIAL_CONTACT_DEFAULTS.complementarityToleranceMm,
        lengthToleranceMm: scale * SPATIAL_CONTACT_DEFAULTS.lengthToleranceMm } });
    assert.equal(transformed.status, "converged"); near(transformed.lengthMm, scale * original.lengthMm);
    for (let i = 0; i <= 30; i++) pointNear(sampleSpatialSpline(transformed.controlPointsMm, i / 30),
      map(sampleSpatialSpline(original.controlPointsMm, i / 30)), 1e-8);
  });

  it("rejects invalid geometry and fixed penetrating ports without correcting them", () => {
    const badPort = solveSpatialContact({ ...straight, body: { centerMm: [-2, 0, 0], radiusMm: 1 } });
    assert.equal(badPort.status, "failed"); assert.equal(badPort.diagnostics[0].code, "invalid-port");
    assert.deepEqual(badPort.controlPointsMm, straight.controlPointsMm);
    assert.equal(solveSpatialContact({ ...straight, threadRadiusMm: 0 }).status, "failed");
    const antipodal: SpatialSupport = { id: "ambiguous", kind: "arc", centerMm: [0, 0, 0], fromMm: [1, 0, 0], toMm: [-1, 0, 0], radiusMm: .1 };
    assert.equal(solveSpatialContact({ ...straight, supports: [antipodal] }).diagnostics[0].code, "invalid-support");
  });
});
