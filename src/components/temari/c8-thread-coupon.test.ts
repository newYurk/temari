import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { polePositions } from "./division";
import { jiwariNormals } from "./jiwari";
import { C8_THREAD_FIXTURE, createC8ThreadCoupon, type C8ThreadCouponInput } from "./c8-thread-coupon";
import type { MarkingVector } from "./local-marking";
import type { ThreadCurve } from "./thread-path";
import { validateThreadCoupon } from "./thread-geometry";

const dot = (a: MarkingVector, b: MarkingVector) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a: MarkingVector, b: MarkingVector): MarkingVector => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const unit = (v: MarkingVector): MarkingVector => v.map((x) => x / Math.hypot(...v)) as unknown as MarkingVector;
const distance = (a: MarkingVector, b: MarkingVector) => Math.hypot(...a.map((x, i) => x - b[i]));
const ends = (c: ThreadCurve) => c.kind === "arc" ? [c.from, c.to] : [c.controls[0], c.controls[3]];
function fixture(center: MarkingVector = [0, 1, 0], handedness: 1 | -1 = 1): C8ThreadCouponInput {
  const circles = jiwariNormals("c8").map((normal, i) => ({ id: `circle-${i}`, normal }));
  const first = circles.find((circle) => Math.abs(dot(center, circle.normal)) < 1e-12)!;
  return {
    center, circles, handedness,
    firstRay: { circleId: first.id, tangent: unit(cross(first.normal, center)) },
    circumferenceMm: 230, innerMm: 5, outerMm: 20,
  };
}
// Fixed proper rotation, not a change of center with an unchanged world frame.
const rotate = ([x, y, z]: MarkingVector): MarkingVector => [
  (x + 8 * y + 4 * z) / 9, (8 * x + y - 4 * z) / 9, (-4 * x + 4 * y - 7 * z) / 9,
];
function curvePoints(curve: ThreadCurve) { return curve.kind === "arc" ? [curve.from, curve.to] : curve.controls; }

describe("one continuous engineering C8 thread", () => {
  it("has one open thread with eight lays, eight catches and explicit start/transfer/finish", () => {
    const coupon = createC8ThreadCoupon(fixture());
    assert.deepEqual(coupon.operations.map((op) => op.kind), [
      "start", ...Array.from({ length: 8 }, () => ["lay", "catch"]).flat(), "transfer", "finish",
    ]);
    assert.equal(new Set(coupon.spans.map((span) => span.threadId)).size, 1);
    assert.equal(coupon.operations[0].step, 0);
    assert.ok(coupon.operations.slice(-2).every((op) => op.step === 8));
    assert.deepEqual(coupon.operations.filter((op) => op.kind === "catch").map((op) => op.markId),
      ["mark-2", "mark-3", "mark-4", "mark-5", "mark-6", "mark-7", "mark-8", "mark-1"]);
    for (let i = 1; i < coupon.spans.length; i++) {
      assert.ok(distance(ends(coupon.spans[i - 1].curve)[1], ends(coupon.spans[i].curve)[0]) < 1e-10);
      assert.ok(coupon.spans[i - 1].step <= coupon.spans[i].step);
    }
    const allIds = coupon.operations.flatMap((op) => op.spanIds);
    assert.deepEqual(allIds, coupon.spans.map((span) => span.id));
    assert.ok(distance(ends(coupon.spans[0].curve)[0], ends(coupon.spans.at(-1)!.curve)[1]) > 2 * coupon.threadRadiusMm);
    for (const kind of ["start", "transfer", "finish"]) {
      assert.ok(coupon.spans.some((s) => s.zone === "buried" && coupon.operations.find((op) => op.id === s.opId)!.kind === kind));
    }
    assert.equal(coupon.supports.length, 8);
  });

  it("each named catch crosses its finite support footprint once and underneath", () => {
    for (const center of polePositions("c8")) for (const handedness of [1, -1] as const) {
      const input = fixture(center, handedness);
      const coupon = createC8ThreadCoupon(input);
      for (const op of coupon.operations.filter((op) => op.kind === "catch")) {
        assert.equal(op.pass, "under");
        const support = coupon.supports.find((s) => s.id === op.captureIds?.[0])!;
        const supportEnds = ends(support.curve);
        const normal = unit(cross(supportEnds[0], supportEnds[1]));
        const [first, second] = op.spanIds.map((id) => coupon.spans.find((s) => s.id === id)!.curve);
        assert.equal(first.kind, "bezier"); assert.equal(second.kind, "bezier");
        if (first.kind !== "bezier" || second.kind !== "bezier") continue;
        const bottom = first.controls[3];
        const side = Math.sign(dot(first.controls[0], normal));
        assert.ok(first.controls.slice(0, 3).every((p) => dot(p, normal) * side > 1e-10));
        assert.ok(second.controls.slice(1).every((p) => dot(p, normal) * side < -1e-10));
        assert.ok(Math.abs(dot(bottom, normal)) < 1e-10);
        assert.ok(distance(bottom, second.controls[0]) < 1e-10);
        assert.ok(Math.hypot(...bottom) + coupon.threadRadiusMm < coupon.bodyRadiusMm);
        // The radial projection of the crossing is the midpoint of the SHORT support arc.
        const midpoint = unit(supportEnds[0].map((x, i) => x + supportEnds[1][i]) as unknown as MarkingVector);
        assert.ok(distance(unit(bottom), midpoint) < 1e-10);
        const tangent = second.controls[1].map((x, i) => x - bottom[i]) as unknown as MarkingVector;
        assert.ok(Math.abs(dot(unit(tangent), normal)) > 1 - 1e-10);
      }
    }
  });

  it("all centerlines, supports and piercing corridors commute with rotation at six centers", () => {
    for (const center of polePositions("c8")) for (const handedness of [1, -1] as const) {
      const input = fixture(center, handedness);
      const a = createC8ThreadCoupon(input);
      const b = createC8ThreadCoupon({ ...input,
        center: rotate(center), circles: input.circles.map((c) => ({ ...c, normal: rotate(c.normal) })),
        firstRay: { ...input.firstRay, tangent: rotate(input.firstRay.tangent) },
      });
      assert.deepEqual(a.operations, b.operations);
      for (const [i, span] of a.spans.entries()) {
        curvePoints(span.curve).forEach((p, k) => assert.ok(distance(rotate(p), curvePoints(b.spans[i].curve)[k]) < 1e-10));
        if (span.corridor) assert.ok(distance(rotate(span.corridor.centerMm), b.spans[i].corridor!.centerMm) < 1e-10);
      }
      for (const [i, support] of a.supports.entries()) {
        curvePoints(support.curve).forEach((p, k) => assert.ok(distance(rotate(p), curvePoints(b.supports[i].curve)[k]) < 1e-10));
      }
    }
  });

  it("scales geometry when all body, stitch and support lengths scale together", () => {
    const input = fixture();
    const a = createC8ThreadCoupon(input);
    const overrides = Object.fromEntries(Object.entries(C8_THREAD_FIXTURE).map(([key, value]) => [key, value * 2]));
    const b = createC8ThreadCoupon({ ...input, circumferenceMm: 460, innerMm: 10, outerMm: 40, threadFixture: overrides });
    for (const [i, span] of a.spans.entries()) curvePoints(span.curve).forEach((p, k) => {
      assert.ok(distance(p.map((x) => x * 2) as unknown as MarkingVector, curvePoints(b.spans[i].curve)[k]) < 1e-10);
    });
  });

  it("rejects nonfinite, collapsed and nonlocal fixture dimensions explicitly", () => {
    const input = fixture();
    for (const value of [0, -1, NaN, Infinity]) {
      assert.throws(() => createC8ThreadCoupon({ ...input, threadFixture: { threadRadiusMm: value } }), RangeError);
    }
    assert.throws(() => createC8ThreadCoupon({ ...input, threadFixture: { seamOffsetMm: 0.1 } }), RangeError);
    assert.throws(() => createC8ThreadCoupon({ ...input, threadFixture: { catchDepthMm: 0.1 } }), RangeError);
    assert.throws(() => createC8ThreadCoupon({ ...input, threadFixture: { halfBiteMm: 8 } }), RangeError);
  });

  it("passes independent body, G1, curvature and collision checks at six centers, both hands, C180..360", () => {
    // Every 10 mm, not a claim to have exhaustively sampled a continuous interval.
    for (let circumferenceMm = 180; circumferenceMm <= 360; circumferenceMm += 10) {
      for (const center of polePositions("c8")) for (const handedness of [1, -1] as const) {
        const coupon = createC8ThreadCoupon({ ...fixture(center, handedness), circumferenceMm });
        const result = validateThreadCoupon(coupon);
        assert.equal(result.status, "passed", JSON.stringify({ circumferenceMm, center, handedness, diagnostics: result.diagnostics }));
        assert.ok(result.minSupportGapMm > 0.1);
        assert.ok(result.minSelfGapMm > 0.13);
        assert.ok(result.maxCurvatureTimesRadius < 0.66);
        assert.ok(result.lengthMm.surface > 0 && result.lengthMm.piercing > 0 && result.lengthMm.buried > 0);
        assert.ok(Math.abs(result.lengthMm.total - result.lengthMm.surface - result.lengthMm.piercing - result.lengthMm.buried) < 1e-9);
      }
    }
  });

  it("keeps validation and total length under rotation and tighter curve approximation", () => {
    const input = fixture();
    const coupon = createC8ThreadCoupon(input);
    const rotated = createC8ThreadCoupon({ ...input,
      center: rotate(input.center), circles: input.circles.map((c) => ({ ...c, normal: rotate(c.normal) })),
      firstRay: { ...input.firstRay, tangent: rotate(input.firstRay.tangent) },
    });
    const coarse = validateThreadCoupon(coupon, 0.005);
    const fine = validateThreadCoupon(coupon, 0.001);
    const turned = validateThreadCoupon(rotated, 0.001);
    assert.equal(coarse.status, "passed");
    assert.equal(fine.status, "passed");
    assert.equal(turned.status, "passed");
    assert.ok(Math.abs(coarse.lengthMm.total - fine.lengthMm.total) < 1e-5);
    assert.ok(Math.abs(fine.lengthMm.total - turned.lengthMm.total) < 1e-9);
    assert.ok(Math.abs(fine.maxCurvatureTimesRadius - turned.maxCurvatureTimesRadius) < 1e-9);
  });

  it("reports a colliding override rather than silently clamping it to the fixture", () => {
    const coupon = createC8ThreadCoupon({ ...fixture(), threadFixture: { halfBiteMm: 0.8 } });
    assert.equal(coupon.fixture.halfBiteMm, 0.8);
    const result = validateThreadCoupon(coupon);
    assert.equal(result.status, "failed");
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code.includes("support")));
  });
});
