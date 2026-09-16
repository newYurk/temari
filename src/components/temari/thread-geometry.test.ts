import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { closestSegmentApproach, curveDerivative, curveSecondDerivative, evaluateCurve, polynomialRoots01, sampleCurve, validateThreadCoupon } from "./thread-geometry";
import type { C8ThreadCoupon, PointMm, ThreadCurve, ThreadSpan } from "./thread-path";

const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);
const lerp = (a: PointMm, b: PointMm, t: number): PointMm => a.map((x, i) => x + t * (b[i] - x)) as unknown as PointMm;
const line = (a: PointMm, b: PointMm): ThreadCurve => ({ kind: "bezier", controls: [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b] });
const span = (id: string, curve: ThreadCurve, threadId = "thread"): ThreadSpan => ({ id, opId: `op-${id}`, threadId, step: 1, zone: "buried", curve });
function coupon(spans: ThreadSpan[]): C8ThreadCoupon {
  return { kind: "engineering-thread-path", bodyRadiusMm: 10, threadRadiusMm: .05, threadId: "thread", spans,
    operations: [{ id: "start", order: 0, step: 0, kind: "start", spanIds: [] }, ...spans.map((s, i) => ({ id: s.opId, order: i + 1, step: s.step, kind: "lay" as const, spanIds: [s.id] })), { id: "finish", order: spans.length + 1, step: 2, kind: "finish", spanIds: [] }],
    supports: [], marks: [], assumptions: [], fixture: {} };
}
const codes = (c: C8ThreadCoupon) => validateThreadCoupon(c).diagnostics.map((d) => d.code);
const parabola: ThreadCurve = { kind: "bezier", controls: [[0, 0, 0], [1 / 3, 0, 0], [2 / 3, 1 / 3, 0], [1, 1, 0]] };

// Independent projected point-to-segment distance, used only as a sampling oracle.
function distance(p: PointMm, a: PointMm, b: PointMm) {
  const v = b.map((x, i) => x - a[i]), w = p.map((x, i) => x - a[i]);
  const t = Math.max(0, Math.min(1, w.reduce((s, x, i) => s + x * v[i], 0) / v.reduce((s, x) => s + x * x, 0)));
  return Math.hypot(...p.map((x, i) => x - a[i] - t * v[i]));
}

describe("thread curve geometry: independent oracles", () => {
  it("sorts repeated critical roots before isolating the parent polynomial", () => {
    const repeated = polynomialRoots01([-.05, .45, -1.2, 1]);
    assert.equal(repeated.length, 2); near(repeated[0], .2, 1e-10); near(repeated[1], .5, 1e-10);
    // Its integral has one root on each side of the minimum at .2. An unsorted
    // critical list [.5,.2] used to miss the first root and duplicate the second.
    const poly = [.0035, -.05, .225, -.4, .25], roots = polynomialRoots01(poly);
    assert.equal(roots.length, 2);
    assert.ok(roots[0] > 0 && roots[0] < .2); assert.ok(roots[1] > .2 && roots[1] < .5);
    for (const t of roots) near(poly.reduceRight((value, c) => value * t + c, 0), 0, 1e-14);
    assert.deepEqual(polynomialRoots01([0, 0, 1]), [0]);
  });

  it("evaluates a polynomial parabola and its exact derivatives", () => {
    for (const t of [0, .2, .5, 1]) {
      const p = evaluateCurve(parabola, t), v = curveDerivative(parabola, t), a = curveSecondDerivative(parabola, t);
      near(p[0], t); near(p[1], t * t); near(v[0], 1); near(v[1], 2 * t); near(a[0], 0); near(a[1], 2);
    }
    const result = validateThreadCoupon(coupon([span("parabola", parabola)]), .001);
    assert.equal(result.status, "passed");
    near(result.lengthMm.total, Math.sqrt(5) / 2 + Math.asinh(2) / 4, 1e-7);
    near(result.maxCurvatureTimesRadius, .1);
  });

  it("uses bounded chord sag for arcs and control hull subdivision for cubics", () => {
    for (const curve of [parabola, { kind: "arc", from: [2, 0, 0], to: [0, 2, 0] } as ThreadCurve]) {
      const sampled = sampleCurve(curve, .001);
      assert.ok(sampled.errorBoundMm <= .001);
      assert.equal(sampled.parameters[0], 0); assert.equal(sampled.parameters.at(-1), 1);
      for (let i = 1; i < sampled.points.length; i++) for (let j = 1; j < 20; j++) {
        const t = sampled.parameters[i - 1] + (sampled.parameters[i] - sampled.parameters[i - 1]) * j / 20;
        assert.ok(distance(evaluateCurve(curve, t), sampled.points[i - 1], sampled.points[i]) <= sampled.errorBoundMm + 1e-12);
      }
    }
    const curve: ThreadCurve = { kind: "arc", from: [10.05, 0, 0], to: [0, 10.05, 0] };
    const s = span("arc", curve); s.zone = "surface";
    const result = validateThreadCoupon(coupon([s]));
    assert.equal(result.status, "passed"); near(result.lengthMm.total, 10.05 * Math.PI / 2); near(result.maxCurvatureTimesRadius, .05 / 10.05);
    assert.throws(() => sampleCurve({ kind: "arc", from: [1, 0, 0], to: [-1, 0, 0] }, .01));
  });

  it("finds interior crossing/skew minima that vertex distances miss", () => {
    const a: PointMm = [-1, 0, 0], b: PointMm = [1, 0, 0];
    const crossing = closestSegmentApproach(a, b, [0, -1, 0], [0, 1, 0]);
    near(crossing.distanceMm, 0); near(crossing.s, .5); near(crossing.t, .5);
    near(closestSegmentApproach(a, b, [0, -1, .3], [0, 1, .3]).distanceMm, .3);
    near(closestSegmentApproach(a, b, [-2, .4, 0], [2, .4, 0]).distanceMm, .4);
    near(closestSegmentApproach(a, b, [-1, -1e-9, 0], [1, 1e-9, 0]).distanceMm, 0, 1e-14);
    near(closestSegmentApproach([0, 0, 0], [0, 0, 0], [1, -1, 0], [1, 1, 0]).distanceMm, 1);
  });

  it("detects hidden working-thread intersections and leaves exact contact unresolved", () => {
    const c = coupon([span("a", line([-1, 0, 0], [1, 0, 0]), "a"), span("b", line([0, -1, 0], [0, 1, 0]), "b")]);
    assert.ok(codes(c).includes("self-penetration"));
    c.spans[1].curve = line([-1, .1, 0], [1, .1, 0]);
    const touching = validateThreadCoupon(c);
    assert.ok(touching.diagnostics.some((d) => d.code === "self-contact-unresolved"));
    c.spans[1].curve = line([-1, .11, 0], [1, .11, 0]);
    assert.ok(!codes(c).some((code) => code === "self-contact-unresolved" || code === "self-penetration"));
    assert.ok(codes(c).includes("operation-graph")); // Multiple physical working threads are invalid in a one-thread coupon.
  });

  it("refines curve distance bounds and preserves ambiguity at true tangency", () => {
    assert.equal(parabola.kind, "bezier"); if (parabola.kind !== "bezier") return;
    const shifted = (z: number): ThreadCurve => ({ kind: "bezier", controls: parabola.controls.map(([x, y]) => [x, y, z]) as unknown as typeof parabola.controls });
    const working = span("a", shifted(11)); working.zone = "surface";
    const c = coupon([working]);
    c.supports = [{ id: "support", circleId: "circle", radiusMm: .05, curve: shifted(11.101) }];
    const separated = validateThreadCoupon(c, .005);
    assert.equal(separated.status, "passed"); assert.ok(separated.minSupportGapMm > 0 && separated.minSupportGapMm <= .001);
    c.supports[0].curve = shifted(11.1);
    assert.equal(validateThreadCoupon(c, .005).status, "unresolved");
  });

  it("finds an interior curvature extremum between uniform sample sites", () => {
    const offset = .371234567;
    const curve: ThreadCurve = { kind: "bezier", controls: [[-offset, offset ** 2, 0], [1 / 3 - offset, offset ** 2 - 2 * offset / 3, 0], [2 / 3 - offset, offset ** 2 - 4 * offset / 3 + 1 / 3, 0], [1 - offset, (1 - offset) ** 2, 0]] };
    const result = validateThreadCoupon(coupon([span("interior", curve)]));
    assert.equal(result.status, "passed"); near(result.maxCurvatureTimesRadius, .1, 1e-12);
  });

  it("checks distant parts of adjacent spans instead of exempting their whole length", () => {
    const first: ThreadCurve = { kind: "bezier", controls: [[0, 0, 0], [1.5, 1.5, 0], [.75, 2.25, 0], [0, 2.25, 0]] };
    const second: ThreadCurve = { kind: "bezier", controls: [[0, 2.25, 0], [-.75, 2.25, 0], [-1.5, 1.5, 0], [0, 0, 0]] };
    const c = coupon([span("first", first), span("second", second)]);
    const result = validateThreadCoupon(c);
    assert.ok(result.diagnostics.some((d) => d.code === "self-penetration"));
    assert.ok(!result.diagnostics.some((d) => d.code === "tangent-discontinuity"));
    const straight = coupon([span("a", line([0, 0, 0], [1, 0, 0])), span("b", line([1, 0, 0], [2, 0, 0]))]);
    assert.equal(validateThreadCoupon(straight).status, "passed");
    assert.ok(validateThreadCoupon(straight).minSelfGapMm > 0);
  });

  it("does not pass a nonlocal loop contained in a single coarse sampling segment", () => {
    const tinyLoop: ThreadCurve = { kind: "bezier", controls: [[0, 0, 2], [.001, .001, 2], [-.001, .001, 2], [.0002, 0, 2]] };
    assert.equal(sampleCurve(tinyLoop, .005).points.length, 2);
    const a = evaluateCurve(tinyLoop, .03337173737130861), b = evaluateCurve(tinyLoop, 1 - .03337173737130861);
    assert.ok(Math.hypot(...a.map((x, i) => x - b[i])) < 1e-15);
    const s = span("small-loop", tinyLoop); s.zone = "surface";
    const c = coupon([s]); c.bodyRadiusMm = 1; c.threadRadiusMm = 1e-7;
    const result = validateThreadCoupon(c, .005);
    assert.notEqual(result.status, "passed");
    assert.ok(result.diagnostics.some((d) => d.code === "self-contact-unresolved" || d.code === "self-penetration"));
  });

  it("rejects breaks, tangent corners, singular curves and excessive curvature", () => {
    const c = coupon([span("a", line([0, 0, 0], [1, 0, 0])), span("b", line([1, 0, 0], [1, 1, 0]))]);
    assert.ok(codes(c).includes("tangent-discontinuity"));
    c.spans[1].curve = line([1, 0, 0], [2, .0001, 0]); assert.ok(codes(c).includes("tangent-discontinuity"));
    c.spans[1].curve = line([2, 0, 0], [3, 0, 0]); assert.ok(codes(c).includes("thread-discontinuity"));
    const sharp = coupon([span("p", parabola)]); sharp.threadRadiusMm = .6;
    assert.ok(codes(sharp).includes("curvature-radius"));
    const at = .371234567;
    const stationary: ThreadCurve = { kind: "bezier", controls: [[0, 0, 0], [at * at / 3, 0, 0], [(2 * at * at - at) / 3, 0, 0], [1 / 3 - at + at * at, 0, 0]] };
    assert.ok(codes(coupon([span("stationary", stationary)])).includes("curvature-radius"));
    assert.ok(codes(coupon([span("cusp", { kind: "bezier", controls: [[0, 0, 0], [1, 0, 0], [1, 0, 0], [0, 0, 0]] })])).includes("curvature-radius"));
  });

  it("enforces full tube body zones and declared piercing corridor", () => {
    const s = span("needle", line([0, 0, 9], [.1, 0, 9])); s.zone = "piercing";
    const c = coupon([s]); assert.ok(codes(c).includes("missing-piercing-corridor"));
    s.corridor = { centerMm: [0, 0, 10], radiusMm: 2, maxDepthMm: 2 };
    assert.equal(validateThreadCoupon(c).status, "passed");
    s.corridor.maxDepthMm = .5; assert.ok(codes(c).includes("body-zone-violation"));
    s.zone = "surface"; assert.ok(codes(c).includes("body-zone-violation"));
    s.zone = "buried"; s.curve = line([0, 0, 10], [.1, 0, 10]); assert.ok(codes(c).includes("body-zone-violation"));
  });

  it("checks marking supports against working yarn, body and each other", () => {
    const s = span("working", line([-1, 0, 11], [1, 0, 11])); s.zone = "surface";
    const c = coupon([s]);
    c.supports = [{ id: "support-a", circleId: "a", radiusMm: .05, curve: line([0, -1, 11], [0, 1, 11]) }];
    assert.ok(codes(c).includes("support-penetration"));
    c.spans[0].curve = line([-1, 0, 12], [1, 0, 12]);
    c.supports.push({ id: "support-b", circleId: "b", radiusMm: .05, curve: line([-1, 0, 11], [1, 0, 11]) });
    assert.ok(codes(c).includes("support-penetration"));
    c.supports = [{ ...c.supports[0], curve: line([-1, 0, 0], [1, 0, 0]) }];
    assert.ok(codes(c).includes("support-body-penetration"));
  });

  it("rejects malformed operation ownership and missing boundaries", () => {
    const c = coupon([span("a", line([0, 0, 0], [1, 0, 0]))]);
    c.operations[1].spanIds = ["missing"]; assert.ok(codes(c).includes("operation-graph"));
    c.operations = []; assert.ok(codes(c).includes("operation-graph"));
  });

  it("preserves clearance, curvature and length under rotation and consistent unit scaling", () => {
    const c = coupon([span("a", parabola)]), before = validateThreadCoupon(c, .001);
    const scale = 7, transform = ([x, y, z]: PointMm): PointMm => [scale * (x + 8 * y + 4 * z) / 9, scale * (8 * x + y - 4 * z) / 9, scale * (-4 * x + 4 * y - 7 * z) / 9];
    const curve = c.spans[0].curve; assert.equal(curve.kind, "bezier");
    if (curve.kind !== "bezier") return;
    c.spans[0].curve = { kind: "bezier", controls: curve.controls.map(transform) as unknown as typeof curve.controls };
    c.bodyRadiusMm *= scale; c.threadRadiusMm *= scale;
    const after = validateThreadCoupon(c, .001 * scale);
    assert.equal(after.status, before.status); near(after.lengthMm.total, before.lengthMm.total * scale, 1e-7);
    near(after.maxCurvatureTimesRadius, before.maxCurvatureTimesRadius, 1e-8);
    near(after.minSelfGapMm, before.minSelfGapMm * scale, 1e-8);
  });
});
