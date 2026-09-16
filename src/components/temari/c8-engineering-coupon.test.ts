import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { polePositions } from "./division.ts";
import { jiwariNormals } from "./jiwari.ts";
import { C8_ENGINEERING_FIXTURE, createC8EngineeringCoupon } from "./c8-engineering-coupon.ts";
import type { MarkingVector } from "./local-marking.ts";

function inputAt(center: MarkingVector) {
  const circles = jiwariNormals("c8").map((normal, i) => ({ id: `circle-${i}`, normal }));
  const circle = circles.find((c) => Math.abs(c.normal.reduce((sum, x, i) => sum + x * center[i], 0)) < 1e-12)!;
  const [n, c] = [circle.normal, center];
  const t: MarkingVector = [n[1] * c[2] - n[2] * c[1], n[2] * c[0] - n[0] * c[2], n[0] * c[1] - n[1] * c[0]];
  const length = Math.hypot(...t);
  const tangent: MarkingVector = [t[0] / length, t[1] / length, t[2] / length];
  return { center, circles, firstRay: { circleId: circle.id, tangent }, handedness: 1 as const, ...C8_ENGINEERING_FIXTURE };
}

describe("C8 engineering coupon (geometric intent, not GT55)", () => {
  it("has one ordered group with four outer tips at every C8 center", () => {
    for (const center of polePositions("c8")) {
      const coupon = createC8EngineeringCoupon(inputAt(center));
      assert.equal(coupon.kind, "geometric-intent");
      assert.equal(coupon.fixture.provenance, "engineering-assumption");
      assert.equal(coupon.marks.length, 8);
      assert.deepEqual(coupon.marks.filter((m) => m.role === "outer").map((m) => m.rayIndex), [1, 3, 5, 7]);
      assert.equal(coupon.legs.length, 8);
      for (const [i, leg] of coupon.legs.entries()) {
        assert.equal(leg.from, coupon.marks[i].id);
        assert.equal(leg.to, coupon.marks[(i + 1) % 8].id);
        const mark = coupon.marks[i];
        const radius = C8_ENGINEERING_FIXTURE.circumferenceMm / (Math.PI * 2);
        const dot = mark.positionMm.reduce((sum, x, k) => sum + x * center[k], 0) / radius;
        assert.ok(Math.abs(radius * Math.acos(dot) - mark.distanceMm) < 1e-10);
      }
      assert.ok(coupon.unresolved.includes("needle-catches"));
      assert.ok(coupon.unresolved.includes("contacts"));
    }
  });

  it("joint rotation preserves marks, legs and roles without changing fixture dimensions", () => {
    // A proper non-axis-aligned orthogonal matrix (unit quaternion 1,2,2,0 divided by 3).
    const q = ([x, y, z]: MarkingVector): MarkingVector => [
      (x + 8 * y + 4 * z) / 9,
      (8 * x + y - 4 * z) / 9,
      (-4 * x + 4 * y - 7 * z) / 9,
    ];
    for (const center of polePositions("c8")) {
      const input = inputAt(center);
      const a = createC8EngineeringCoupon(input);
      const b = createC8EngineeringCoupon({ ...input, center: q(center), circles: input.circles.map((c) => ({ ...c, normal: q(c.normal) })), firstRay: { ...input.firstRay, tangent: q(input.firstRay.tangent) } });
      assert.deepEqual(a.legs, b.legs);
      assert.deepEqual(a.fixture, b.fixture);
      for (const [i, mark] of a.marks.entries()) {
        assert.equal(mark.role, b.marks[i].role);
        const expected = q(mark.positionMm);
        for (let k = 0; k < 3; k++) assert.ok(Math.abs(expected[k] - b.marks[i].positionMm[k]) < 1e-10);
      }
    }
  });

  it("scales all physical distances together", () => {
    const input = inputAt([0, 1, 0]);
    const a = createC8EngineeringCoupon(input);
    const b = createC8EngineeringCoupon({ ...input, circumferenceMm: input.circumferenceMm * 2, innerMm: input.innerMm * 2, outerMm: input.outerMm * 2 });
    for (const [i, mark] of a.marks.entries()) {
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(mark.positionMm[k] * 2 - b.marks[i].positionMm[k]) < 1e-10);
    }
  });

  it("rejects invalid distances and a non-eight-ray center", () => {
    const input = inputAt([0, 1, 0]);
    for (const [innerMm, outerMm] of [[0, 20], [-1, 20], [5, 5], [5, 4], [NaN, 20], [5, Infinity], [5, 115]]) {
      assert.throws(() => createC8EngineeringCoupon({ ...input, innerMm, outerMm }), RangeError);
    }
    assert.throws(() => createC8EngineeringCoupon({ ...input, circles: input.circles.slice(0, 1) }), RangeError);
  });
});
