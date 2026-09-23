import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { closestSpatialSupport, sampleSpatialSpline, solveSpatialContact, spatialSplineBasis,
  spatialSplineKnots, splineToBezier, SPATIAL_CONTACT_DEFAULTS } from "./spatial-contact";
import type { SpatialContactInput, SpatialSupport } from "./spatial-contact";
import { evaluateCurve, sampleCurve } from "./thread-geometry";
import type { PointMm } from "./thread-path";
import { shapeDifferenceMm } from "./thick-rope-ladder";

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

type Cubic = [PointMm, PointMm, PointMm, PointMm];
const lerp = (a: PointMm, b: PointMm, t: number): PointMm => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** De Casteljau halves: the same polynomial, twice as many pieces. */
const halve = (c: Cubic): Cubic[] => {
  const ab = lerp(c[0], c[1], .5), bc = lerp(c[1], c[2], .5), cd = lerp(c[2], c[3], .5), abc = lerp(ab, bc, .5), bcd = lerp(bc, cd, .5), m = lerp(abc, bcd, .5);
  return [[c[0], ab, abc, m], [m, bcd, cd, c[3]]];
};
/** A parabolic arch in the plane x = 0, highest at y = 0 (a quadratic raised to a cubic). */
const ARCH: Cubic = (() => { const q0: PointMm = [0, -1.5, .35], q1: PointMm = [0, 0, 1.25], q2: PointMm = [0, 1.5, .35]; return [q0, lerp(q0, q1, 2 / 3), lerp(q2, q1, 2 / 3), q2]; })();
const archPieces = (count: number) => { let out = [ARCH]; while (out.length < count) out = out.flatMap(halve); return out; };
/** A thread pulled over the arch off its crest: the crossing slides in a soft valley, as at an upper kiku tip. */
function archSeed(supports: SpatialSupport[]): SpatialContactInput {
  const count = 24, knots = spatialSplineKnots(count);
  return { controlPointsMm: Array.from({ length: count }, (_, i) => {
    const t = (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3;
    return [-2 + 4 * t, .3, 1.3 * Math.sin(Math.PI * t)] as PointMm;
  }), threadRadiusMm: .2, body: { centerMm: [0, 0, -100], radiusMm: 1 }, supports,
  options: { maxIterations: 8000, maxOuterIterations: 60, feasibilityToleranceMm: 1e-4, stationarityTolerance: 2e-6, complementarityToleranceMm: 5e-7 } };
}
/** Solve, then restart from the result until a restart no longer moves it (as the Simple 8 ladder does). */
function settledSolve(input: SpatialContactInput) {
  let result = solveSpatialContact(input);
  for (let k = 0; k < 4 && result.status === "converged"; k++) {
    const next = solveSpatialContact({ ...input, controlPointsMm: result.controlPointsMm });
    const move = shapeDifferenceMm(result.curves, next.curves);
    result = next;
    if (move <= 1e-6) break;
  }
  return result;
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
        near(basis.secondDerivatives.reduce((a, b) => a + b), 0);
        near(basis.secondDerivatives.reduce((sum, b, i) => sum + b * controls[i][0], 0), 0);
      }
    }
  });

  it("matches second basis derivatives with central differences of the first derivatives", () => {
    // Parameters avoid knots, where the third derivative jumps.
    for (const count of [6, 11]) for (const u of [.013, .29, .52, .77, .987]) {
      const h = 1e-6, left = spatialSplineBasis(count, u - h).derivatives, right = spatialSplineBasis(count, u + h).derivatives;
      spatialSplineBasis(count, u).secondDerivatives.forEach((value, i) => near(value, (right[i] - left[i]) / (2 * h), 2e-4));
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

  it("finds the nearest point of a curve support exactly, also near a centre of curvature", () => {
    // Two contiguous pieces of a unit-circle quarter (centre at the origin), a
    // detached S-shaped piece, and query points everywhere, including next to
    // the centre, where several local minima compete.
    const k = 4 / 3 * Math.tan(Math.PI / 16);
    const arc = (a: number, b: number): Cubic => [[Math.cos(a), Math.sin(a), 0], [Math.cos(a) - k * Math.sin(a), Math.sin(a) + k * Math.cos(a), 0],
      [Math.cos(b) + k * Math.sin(b), Math.sin(b) - k * Math.cos(b), 0], [Math.cos(b), Math.sin(b), 0]];
    const pieces: Cubic[] = [arc(0, Math.PI / 4), arc(Math.PI / 4, Math.PI / 2), [[2, -1, .5], [3, 1, -.5], [1, 1, 1], [2.5, 2, 0]]];
    const support: SpatialSupport = { id: "curve", kind: "curve", piecesMm: pieces, radiusMm: .2 };
    const dense = pieces.flatMap(c => Array.from({ length: 20001 }, (_, i) => evaluateCurve({ kind: "bezier", controls: c }, i / 20000)));
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const points: PointMm[] = [[0, 0, 0], [.02, .01, 0], [.01, .02, .3], [1.9, .6, .2], [5, 5, 5]];
    for (let i = 0; i < 60; i++) points.push([4 * random() - 1, 4 * random() - 1.5, 2 * random() - 1]);
    for (const p of points) {
      const closest = closestSpatialSupport(p, support);
      const sampled = Math.min(...dense.map(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])));
      assert.ok(closest.distanceMm <= sampled + 1e-12, `${p}: ${closest.distanceMm} > ${sampled}`);
      // 20000 intervals of a piece up to 3.6 mm long miss the minimum by less than 1e-7.
      near(closest.distanceMm, sampled, 1e-7);
      near(Math.hypot(...p.map((v, axis) => v - closest.pointMm[axis])), closest.distanceMm, 1e-12);
      // parameter = (piece + t) / pieces; a piece end shares its value with the next piece's start.
      const u = closest.parameter * pieces.length, i = Math.min(pieces.length - 1, Math.floor(u));
      const at = (j: number, t: number) => j >= 0 && Math.hypot(...evaluateCurve({ kind: "bezier", controls: pieces[j] }, t).map((v, axis) => v - closest.pointMm[axis])) < 1e-12;
      assert.ok(at(i, u - i) || at(i - 1, 1), `${p}: ${closest.parameter}`);
    }
    // At the centre every arc point is at distance 1 (up to the cubic's radial error); the first piece's start wins ties.
    near(closestSpatialSupport([0, 0, 0], support).distanceMm, 1, 3e-5);
  });

  it("matches finite differences of the obstacle distance gradient at interior and cap contacts", () => {
    const supports: SpatialSupport[] = [
      { id: "arc", kind: "arc", centerMm: [0, 0, 0], fromMm: [1, 0, 0], toMm: [0, 1, 0], radiusMm: .2 },
      { id: "line", kind: "segment", fromMm: [0, 0, -1], toMm: [0, 0, 1], radiusMm: .2 },
      { id: "curve", kind: "curve", piecesMm: [[[1, 0, 0], [1, 1, .5], [0, 1, -.5], [-.3, 1.2, 0]]], radiusMm: .2 },
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

  it("treats a curve support as one smooth obstacle, whatever its piece count, unlike a capsule cover", () => {
    const curve = (count: number) => settledSolve(archSeed([{ id: "arch", kind: "curve", piecesMm: archPieces(count), radiusMm: .2 }]));
    const one = curve(1), two = curve(2), eight = curve(8);
    for (const r of [one, two, eight]) {
      assert.equal(r.status, "converged", JSON.stringify(r.diagnostics));
      assert.ok(r.reactions.some(x => x.supportId === "arch"));
      assert.ok(r.metrics.maxPenetrationMm <= 1e-4);
    }
    // The same polynomial split into more pieces is the same obstacle.
    assert.ok(shapeDifferenceMm(one.curves, two.curves) < 1e-9 && shapeDifferenceMm(one.curves, eight.curves) < 1e-9);
    near(one.lengthMm, eight.lengthMm, 1e-9);
    // A chord cover of the same arch is a polygon on a nearly neutral crest: its
    // tolerance moves the crossing far more than it moves the length.
    const chords = (tolerance: number): SpatialSupport[] => {
      const points = sampleCurve({ kind: "bezier", controls: ARCH }, tolerance / 4).points;
      const step = Math.max(1, Math.floor(Math.sqrt(4 * tolerance / 1.6) / (Math.hypot(...points[1].map((v, i) => v - points[0][i])) || 1)));
      const out: SpatialSupport[] = [];
      for (let i = 0; i < points.length - 1; i += step)
        out.push({ id: `c${i}`, kind: "segment", fromMm: points[i], toMm: points[Math.min(points.length - 1, i + step)], radiusMm: .2 + tolerance });
      return out;
    };
    const cover = settledSolve(archSeed(chords(2e-4)));
    assert.equal(cover.status, "converged");
    assert.ok(Math.abs(cover.lengthMm - one.lengthMm) < 5e-4);
    assert.ok(shapeDifferenceMm(cover.curves, one.curves) > 1e-3, String(shapeDifferenceMm(cover.curves, one.curves)));
  });

  it("removes a free bow with fixed ports and oriented tangents but free positive handle lengths", () => {
    const result = solveSpatialContact(straight), c = result.controlPointsMm;
    assert.equal(result.status, "converged", JSON.stringify(result.diagnostics));
    near(result.lengthMm, 4, 1e-9);
    for (const i of [0, 5]) assert.deepEqual(c[i], straight.controlPointsMm[i]);
    // Only the direction of each port handle is prescribed.
    pointNear([c[1][0] - c[0][0], c[1][1], c[1][2]].map(v => v / Math.hypot(c[1][0] - c[0][0], c[1][1], c[1][2])) as unknown as PointMm, [1, 0, 0]);
    pointNear([c[4][0] - c[5][0], c[4][1], c[4][2]].map(v => v / Math.hypot(c[4][0] - c[5][0], c[4][1], c[4][2])) as unknown as PointMm, [-1, 0, 0]);
    assert.ok(result.metrics.kktStationarity < SPATIAL_CONTACT_DEFAULTS.stationarityTolerance);
    assert.equal(result.reactions.length, 0);
    for (let i = 0; i <= 50; i++) near(sampleSpatialSpline(c, i / 50)[1], 0, 1e-6);
    // The energy objective removes the length functional's reparametrisation freedom.
    near(result.metrics.minRelativeSpeedBound, 1, 1e-6);
    near(result.metrics.parametrizationDefect, 0, 1e-9);
    assert.ok(result.metrics.curvatureTimesRadiusUpper < 1e-6); // residual bow within stationarity tolerance
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
    assert.ok(result.reactions.length > 0 && result.reactions.every(r => r.multiplier >= 0 && r.supportId === "body" && r.kind === "body"));
    // Wrapping radius R + r = 1 gives r*kappa = 0.2, inside the default limit 0.8.
    assert.ok(Math.abs(result.metrics.curvatureTimesRadiusUpper - .2) < .02);
    assert.ok(result.metrics.minRelativeSpeedBound > .9);
    for (let i = 0; i <= 1000; i++) assert.ok(Math.hypot(...sampleSpatialSpline(result.controlPointsMm, i / 1000))
      >= 1 - SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
  });

  it("converges to the planar tangent/semicircle benchmark around a finite capsule under refinement", () => {
    const length = 4 + Math.PI, errors: number[] = [];
    const at = (s: number): PointMm => s <= 2 ? [-2 + s, 1, 0] : s <= 2 + Math.PI
      ? [Math.cos(Math.PI / 2 - s + 2), Math.sin(Math.PI / 2 - s + 2), 0] : [-s + 2 + Math.PI, -1, 0];
    for (const count of [8, 14, 20, 40]) {
      const knots = spatialSplineKnots(count), handle = length / (3 * (count - 3));
      const controlPointsMm = Array.from({ length: count }, (_, i) => at(length * (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3));
      controlPointsMm[1] = [-2 + handle, 1, 0]; controlPointsMm[count - 2] = [-2 + handle, -1, 0];
      const result = solveSpatialContact({ ...straight, controlPointsMm,
        supports: [{ id: "finite-post", kind: "segment", fromMm: [0, 0, -10], toMm: [0, 0, 10], radiusMm: .8 }] });
      assert.equal(result.status, "converged", JSON.stringify(result.metrics));
      assert.ok(result.metrics.maxPenetrationMm <= SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
      assert.ok(result.metrics.maxPenetrationMm >= result.metrics.samplePenetrationMm - 1e-10);
      assert.ok(result.reactions.some(r => r.supportId === "finite-post"));
      for (let i = 0; i <= 1000; i++) {
        const p = sampleSpatialSpline(result.controlPointsMm, i / 1000);
        assert.ok(Math.hypot(p[0], p[1]) >= 1 - SPATIAL_CONTACT_DEFAULTS.feasibilityToleranceMm);
      }
      // The coarsest mesh still keeps the wrapped topology; the shorter hairpin
      // in front of the post is a different local minimum (see the next test).
      errors.push(result.lengthMm - length);
    }
    assert.ok(Math.abs(errors[0]) < .05);
    assert.ok(errors.every((e, i) => i === 0 || Math.abs(e) < Math.abs(errors[i - 1])), JSON.stringify(errors));
    assert.ok(Math.abs(errors.at(-1)!) < 1e-4, JSON.stringify(errors));
  });

  it("keeps a seed's side of an obstacle: a hairpin seed finds the other local minimum", () => {
    // With bounded curvature and fixed tangents the wrap is only a local minimum.
    // A hairpin in front of the post is shorter; the guarded solver does not jump
    // between them, so the prescribed topology must come from the seed and checks.
    const rho = .25, d = .5, count = 20, total = 2 * d + Math.PI * rho + 1.5;
    const at = (s: number): PointMm => s <= d ? [-2 + s, 1, 0]
      : s <= d + Math.PI / 2 * rho ? [-2 + d + rho * Math.sin((s - d) / rho), 1 - rho + rho * Math.cos((s - d) / rho), 0]
      : s <= d + Math.PI / 2 * rho + 1.5 ? [-2 + d + rho, 1 - rho - (s - d - Math.PI / 2 * rho), 0]
      : s <= d + Math.PI * rho + 1.5 ? [-2 + d + rho * Math.cos((s - d - Math.PI / 2 * rho - 1.5) / rho), -1 + rho - rho * Math.sin((s - d - Math.PI / 2 * rho - 1.5) / rho), 0]
      : [-2 + d - (s - d - Math.PI * rho - 1.5), -1, 0];
    const knots = spatialSplineKnots(count), handle = total / (3 * (count - 3));
    const controlPointsMm = Array.from({ length: count }, (_, i) => at(total * (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3));
    controlPointsMm[1] = [-2 + handle, 1, 0]; controlPointsMm[count - 2] = [-2 + handle, -1, 0];
    const result = solveSpatialContact({ ...straight, controlPointsMm, minBendRadiusMm: rho,
      supports: [{ id: "finite-post", kind: "segment", fromMm: [0, 0, -10], toMm: [0, 0, 10], radiusMm: .8 }] });
    assert.equal(result.status, "converged", JSON.stringify(result.metrics));
    // Two quarter turns of radius rho joined by the straight drop 2 - 2 rho.
    near(result.lengthMm, Math.PI * rho + 2 - 2 * rho, 2e-3);
    assert.ok(result.lengthMm < 4 + Math.PI - 2);
    for (let i = 0; i <= 200; i++) assert.ok(sampleSpatialSpline(result.controlPointsMm, i / 200)[0] < -1);
  });

  it("reaches the curvature-bounded Dubins semicircle and respects the certified turning bound", () => {
    // Opposite port tangents need total turning pi; kappa <= 1/rho gives L >= pi rho.
    const r = .2, rho = .25, d = .5, seedLength = 2 * d + Math.PI * rho, errors: number[] = [];
    const at = (s: number): PointMm => s <= d ? [s, 0, 0] : s <= d + Math.PI * rho
      ? [d + rho * Math.sin((s - d) / rho), rho - rho * Math.cos((s - d) / rho), 0] : [d - (s - d - Math.PI * rho), 2 * rho, 0];
    for (const count of [12, 24, 32]) {
      const knots = spatialSplineKnots(count), handle = seedLength / (3 * (count - 3));
      const controlPointsMm = Array.from({ length: count }, (_, i) => at(seedLength * (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3));
      controlPointsMm[1] = [handle, 0, 0]; controlPointsMm[count - 2] = [handle, 2 * rho, 0];
      const result = solveSpatialContact({ controlPointsMm, threadRadiusMm: r, minBendRadiusMm: rho,
        body: { centerMm: [0, 0, -100], radiusMm: 1 }, supports: [], options: { maxIterations: 8000, maxOuterIterations: 60 } });
      assert.equal(result.status, "converged", JSON.stringify(result.metrics));
      const upper = result.metrics.curvatureTimesRadiusUpper;
      near(result.metrics.curvatureLimit, r / rho);
      assert.ok(upper <= r / rho + SPATIAL_CONTACT_DEFAULTS.curvatureTolerance && upper >= r / rho - 1e-3);
      // Theorem, not a sampled estimate: integral of kappa >= pi and kappa <= upper / r.
      assert.ok(result.lengthMm >= Math.PI * r / upper - 1e-12);
      assert.ok(result.reactions.some(x => x.kind === "curvature"));
      errors.push(Math.abs(result.lengthMm - Math.PI * rho));
    }
    assert.ok(errors.at(-1)! < 1e-4 && errors.at(-1)! < errors[0], JSON.stringify(errors));
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

  it("agrees with an independent finite-difference Lagrangian, including curvature multipliers", () => {
    const rho = .25, r = .2, seedLength = 1 + Math.PI * rho, count = 12;
    const dubins = (s: number): PointMm => s <= .5 ? [s, 0, 0] : s <= .5 + Math.PI * rho
      ? [.5 + rho * Math.sin((s - .5) / rho), rho - rho * Math.cos((s - .5) / rho), 0] : [.5 - (s - .5 - Math.PI * rho), 2 * rho, 0];
    const knots = spatialSplineKnots(count), handle = seedLength / (3 * (count - 3));
    const bent = Array.from({ length: count }, (_, i) => dubins(seedLength * (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3));
    bent[1] = [handle, 0, 0]; bent[count - 2] = [handle, 2 * rho, 0];
    const cases = [
      { input: sphereSeed(), kinds: ["body"] },
      { input: { controlPointsMm: bent, threadRadiusMm: r, minBendRadiusMm: rho, body: { centerMm: [0, 0, -100] as PointMm, radiusMm: 1 },
        supports: [], options: { maxIterations: 8000, maxOuterIterations: 60 } } as SpatialContactInput, kinds: ["curvature"] },
    ];
    for (const { input, kinds } of cases) {
      const result = solveSpatialContact(input);
      assert.equal(result.status, "converged");
      assert.ok(result.reactions.length > 0 && result.reactions.every(x => kinds.includes(x.kind)), JSON.stringify(result.reactions.map(x => x.kind)));
      const n = result.controlPointsMm.length, limit = input.threadRadiusMm / (input.minBendRadiusMm ?? 1.25 * input.threadRadiusMm);
      const L = result.metrics.referenceLengthMm, radius = input.threadRadiusMm;
      // Independent Simpson energy and constraints in millimetres. The solver
      // works in thread radii: geometric gaps scale by r, dimensionless rows by 1,
      // so the equivalent millimetre Lagrangian weights dimensionless rows by r.
      const intervals = 2000;
      const basis = Array.from({ length: intervals + 1 }, (_, i) => spatialSplineBasis(n, i / intervals).derivatives);
      const lagrangian = (controls: PointMm[]) => {
        let energy = 0;
        for (let j = 0; j <= intervals; j++) {
          const v = [0, 1, 2].map(k => controls.reduce((sum, p, i) => sum + basis[j][i] * p[k], 0));
          energy += (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) * (j === 0 || j === intervals ? 1 : j % 2 ? 4 : 2) / (3 * intervals);
        }
        return energy / (2 * L) - result.reactions.reduce((sum, x) => {
          const b = spatialSplineBasis(n, x.parameter);
          if (x.kind === "body") return sum + x.multiplier * (Math.hypot(...[0, 1, 2].map(k =>
            controls.reduce((s2, p, i) => s2 + b.values[i] * p[k], 0) - input.body.centerMm[k])) - input.body.radiusMm - radius);
          const v = [0, 1, 2].map(k => controls.reduce((s2, p, i) => s2 + b.derivatives[i] * p[k], 0));
          const a = [0, 1, 2].map(k => controls.reduce((s2, p, i) => s2 + b.secondDerivatives[i] * p[k], 0));
          const w = [v[1] * a[2] - v[2] * a[1], v[2] * a[0] - v[0] * a[2], v[0] * a[1] - v[1] * a[0]];
          return sum + radius * x.multiplier * (limit * Math.hypot(...v) ** 3 - radius * Math.hypot(...w)) / L ** 3;
        }, 0);
      };
      const shifted = (i: number, delta: PointMm) => result.controlPointsMm.map((p, j) => j === i ? p.map((v, k) => v + delta[k]) : [...p]) as unknown as PointMm[];
      const h = 1e-6;
      let residual = 0;
      for (let i = 2; i < n - 2; i++) {
        const g = [0, 1, 2].map(k => {
          const e = [0, 1, 2].map(j => j === k ? h : 0) as unknown as PointMm;
          return (lagrangian(shifted(i, e)) - lagrangian(shifted(i, e.map(v => -v) as unknown as PointMm))) / (2 * h);
        });
        residual = Math.max(residual, Math.hypot(...g) * radius);
      }
      // Handle lengths move controls 1 and n-2 along the fixed port tangents.
      for (const [i, j] of [[1, 0], [n - 2, n - 1]]) {
        const t = result.controlPointsMm[i].map((v, k) => v - result.controlPointsMm[j][k]);
        const e = t.map(v => v / Math.hypot(...t) * h) as unknown as PointMm;
        residual = Math.max(residual, Math.abs(lagrangian(shifted(i, e)) - lagrangian(shifted(i, e.map(v => -v) as unknown as PointMm))) / (2 * h) * radius);
      }
      near(residual, result.metrics.kktStationarity, 2e-5);
      assert.ok(residual <= SPATIAL_CONTACT_DEFAULTS.stationarityTolerance);
    }
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
    // Tube regularity needs r/minBendRadius + tolerance < 1; the solver does not relax it.
    for (const minBendRadiusMm of [.2, .1, .2 / .99]) {
      const bad = solveSpatialContact({ ...straight, minBendRadiusMm });
      assert.equal(bad.status, "failed"); assert.equal(bad.diagnostics[0].code, "invalid-input");
    }
    const antipodal: SpatialSupport = { id: "ambiguous", kind: "arc", centerMm: [0, 0, 0], fromMm: [1, 0, 0], toMm: [-1, 0, 0], radiusMm: .1 };
    assert.equal(solveSpatialContact({ ...straight, supports: [antipodal] }).diagnostics[0].code, "invalid-support");
    const piece: [PointMm, PointMm, PointMm, PointMm] = [[0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1]];
    for (const piecesMm of [[], [[...piece.slice(0, 3)]], [[piece[0], piece[1], piece[2], [0, NaN, 1]]], Array(4097).fill(piece)])
      assert.equal(solveSpatialContact({ ...straight, supports: [{ id: "bad-curve", kind: "curve", piecesMm: piecesMm as never, radiusMm: .2 }] })
        .diagnostics[0].code, "invalid-support");
  });
});
