import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { polePositions, type Division } from "./division.ts";
import { jiwariNormals } from "./jiwari.ts";
import {
  localMarkingRays,
  pointOnMarkingRayMm,
  uniqueMarkingCircles,
  type LocalMarkingInput,
  type MarkingCircle,
  type MarkingVector,
} from "./local-marking.ts";

const dot = (a: MarkingVector, b: MarkingVector) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a: MarkingVector, b: MarkingVector): MarkingVector => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const scale = (v: MarkingVector, s: number): MarkingVector => [v[0] * s, v[1] * s, v[2] * s];
function near(a: number, b: number, tolerance = 1e-10) {
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
}
function nearVector(a: MarkingVector, b: MarkingVector) {
  for (let i = 0; i < 3; i++) near(a[i], b[i]);
}
function rotate(v: MarkingVector, rawAxis: MarkingVector, angle: number): MarkingVector {
  // Rodrigues rotation, independent of the implementation's frame construction.
  const axis = scale(rawAxis, 1 / Math.hypot(...rawAxis));
  const w = cross(axis, v);
  const d = dot(axis, v) * (1 - Math.cos(angle));
  return [0, 1, 2].map((i) => v[i] * Math.cos(angle) + w[i] * Math.sin(angle) + axis[i] * d) as unknown as MarkingVector;
}
function fixture(division: Division, center: MarkingVector): LocalMarkingInput {
  const circles = jiwariNormals(division).map((normal, i) => ({ id: `source-${i}`, normal }));
  const circle = circles.find((circle) => Math.abs(dot(center, circle.normal)) < 1e-12)!;
  const tangent = cross(circle.normal, center);
  return { center, circles, firstRay: { circleId: circle.id, tangent: scale(tangent, 1 / Math.hypot(...tangent)) }, handedness: 1 };
}

describe("local marking rays from actual jiwari", () => {
  for (const [division, rayCount, circleCount] of [["simple", 8, 5], ["c8", 8, 9], ["c10", 10, 15]] as const) {
    it(`${division}: every center has ${rayCount} rays on ${circleCount} unique source circles`, () => {
      for (const center of polePositions(division)) {
        const input = fixture(division, center);
        const circles = uniqueMarkingCircles(input.circles);
        assert.equal(circles.length, circleCount);
        const rays = localMarkingRays(input);
        assert.equal(rays.length, rayCount);
        nearVector(rays[0].tangent, input.firstRay.tangent);
        for (const [i, ray] of rays.entries()) {
          near(ray.angleRad, i * 2 * Math.PI / rayCount);
          near(Math.hypot(...ray.tangent), 1);
          near(dot(ray.tangent, center), 0);
          const circle = circles.find((c) => c.id === ray.circleId)!;
          for (const circumferenceMm of [120, 230, 480]) {
            const radius = circumferenceMm / (2 * Math.PI);
            const distanceMm = circumferenceMm / 16;
            const p = pointOnMarkingRayMm(center, ray.tangent, distanceMm, circumferenceMm);
            near(Math.hypot(...p), radius);
            near(dot(circle.normal, p), 0);
            const direction = scale(p, 1 / radius);
            near(radius * Math.atan2(Math.hypot(...cross(center, direction)), dot(center, direction)), distanceMm);
          }
        }
      }
    });

    it(`${division}: joint rotations preserve source identity, ordering and physical marks at every center`, () => {
      for (const center of polePositions(division)) {
        for (const handedness of [1, -1] as const) {
          const input = { ...fixture(division, center), handedness };
          const original = localMarkingRays(input);
          for (const [axis, angle] of [[[1, 2, -3], 0.713], [[-2, 1, 0.1], 2.217], [[0, 0, 1], Math.PI / 2]] as const) {
            const q = (v: MarkingVector) => rotate(v, axis, angle);
            const rotated = localMarkingRays({
              ...input,
              center: q(input.center),
              circles: input.circles.map((c) => ({ ...c, normal: q(c.normal) })),
              firstRay: { ...input.firstRay, tangent: q(input.firstRay.tangent) },
            });
            for (const [i, ray] of original.entries()) {
              assert.equal(rotated[i].circleId, ray.circleId);
              near(rotated[i].angleRad, ray.angleRad);
              nearVector(rotated[i].tangent, q(ray.tangent));
              nearVector(
                pointOnMarkingRayMm(q(center), rotated[i].tangent, 17, 230),
                q(pointOnMarkingRayMm(center, ray.tangent, 17, 230)),
              );
            }
          }
        }
      }
    });
  }

  it("normal sign, input permutation and duplicate aliases do not change the ray order", () => {
    const input = fixture("c8", [0, 1, 0]);
    const alias = { id: "duplicate", normal: scale(input.circles[0].normal, -3) };
    const circles = [...input.circles, alias];
    const a = localMarkingRays({ ...input, circles, firstRay: { ...input.firstRay, circleId: alias.id } });
    const b = localMarkingRays({ ...input, circles: [...circles].reverse().map((c) => ({ ...c, normal: scale(c.normal, -7) })) });
    assert.equal(a.length, 8);
    for (const [i, ray] of a.entries()) {
      nearVector(ray.tangent, b[i].tangent);
      assert.equal(ray.circleId, b[i].circleId);
      assert.deepEqual(ray.sourceIds, b[i].sourceIds);
    }
  });

  it("handedness reverses the cyclic order while an explicit opposite first ray moves the origin", () => {
    const input = fixture("c8", [1, 0, 0]);
    const forward = localMarkingRays(input);
    const reversed = localMarkingRays({ ...input, handedness: -1 });
    const opposite = localMarkingRays({ ...input, firstRay: { ...input.firstRay, tangent: scale(input.firstRay.tangent, -1) } });
    for (let i = 0; i < 8; i++) {
      nearVector(reversed[i].tangent, forward[(8 - i) % 8].tangent);
      nearVector(opposite[i].tangent, forward[(i + 4) % 8].tangent);
    }
  });

  it("preserves unequal angles in the source geometry instead of inventing uniform rays", () => {
    const rays = localMarkingRays({
      center: [0, 0, 1],
      circles: [
        { id: "first", normal: [0, 1, 0] },
        { id: "thirty-degrees", normal: [-0.5, Math.sqrt(3) / 2, 0] },
        { id: "nonincident", normal: [0, 0, 1] },
      ],
      firstRay: { circleId: "first", tangent: [1, 0, 0] },
      handedness: 1,
    });
    assert.equal(rays.length, 4);
    for (const [i, angle] of [0, Math.PI / 6, Math.PI, 7 * Math.PI / 6].entries()) {
      near(rays[i].angleRad, angle);
    }
  });

  it("keeps normalized normals accurate even at tiny input magnitudes", () => {
    const [circle] = uniqueMarkingCircles([{ id: "tiny", normal: [1e-320, 2e-320, 3e-320] }]);
    near(Math.hypot(...circle.normal), 1);
    nearVector(circle.normal, scale([1, 2, 3], 1 / Math.sqrt(14)));
  });

  it("deduplicates across old sign boundaries without merging distinct nearby planes", () => {
    const circles: MarkingCircle[] = [
      { id: "a", normal: [0, 1e-12, 1] },
      { id: "b", normal: [0, 1e-12, -1] },
      { id: "c", normal: [0, 1e-6, 1] },
    ];
    const unique = uniqueMarkingCircles(circles);
    assert.equal(unique.length, 2);
    assert.deepEqual(unique[0].sourceIds, ["a", "b"]);
  });

  it("rejects invalid geometry and dimensional inputs instead of fabricating a frame", () => {
    const valid = fixture("simple", [0, 1, 0]);
    for (const bad of [[0, 0, 0], [NaN, 1, 0], [Infinity, 0, 0], [0, 2, 0]] as const) {
      assert.throws(() => localMarkingRays({ ...valid, center: bad }), RangeError);
      assert.throws(() => localMarkingRays({ ...valid, firstRay: { ...valid.firstRay, tangent: bad } }), RangeError);
    }
    assert.throws(() => uniqueMarkingCircles([{ id: "x", normal: [0, 0, 0] }]), RangeError);
    assert.throws(() => uniqueMarkingCircles([valid.circles[0], valid.circles[0]]), RangeError);
    assert.throws(() => localMarkingRays({ ...valid, handedness: 0 as 1 }), RangeError);
    assert.throws(() => localMarkingRays({ ...valid, firstRay: { circleId: "missing", tangent: valid.firstRay.tangent } }), RangeError);
    assert.throws(() => localMarkingRays({ ...valid, firstRay: { circleId: valid.firstRay.circleId, tangent: [1, 0, 0] } }), RangeError);
    assert.throws(() => localMarkingRays({ ...valid, firstRay: { circleId: "source-4", tangent: valid.firstRay.tangent } }), RangeError);
    for (const circumference of [0, -1, NaN, Infinity]) {
      assert.throws(() => pointOnMarkingRayMm(valid.center, valid.firstRay.tangent, 1, circumference), RangeError);
    }
    for (const distance of [-1, NaN, Infinity, 115, 116]) {
      assert.throws(() => pointOnMarkingRayMm(valid.center, valid.firstRay.tangent, distance, 230), RangeError);
    }
    assert.throws(() => pointOnMarkingRayMm(valid.center, valid.center, 1, 230), RangeError);
  });
});
