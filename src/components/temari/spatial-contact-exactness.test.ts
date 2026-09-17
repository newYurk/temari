import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { solveSpatialContact, spatialSplineKnots } from "./spatial-contact";
import type { SpatialContactInput, SpatialContactResult, SpatialSupport } from "./spatial-contact";
import type { PointMm } from "./thread-path";
import s8Inputs from "./fixtures/spatial-contact-s8-inputs.json" with { type: "json" };

// The default solve skips far support probes, sums bases over local ranges and
// factors an envelope; referenceEvaluation does none of that. Both must agree
// on every number, including the sign of zero, except the iteration counters
// (an exact null step now ends an inner loop instead of repeating it).
const COUNTERS = new Set(["iterations", "lineSearchFailures"]);
function assertIdentical(actual: unknown, expected: unknown, path: string) {
  if (typeof expected === "number") {
    assert.ok(Object.is(actual, expected), `${path}: ${String(actual)} !== ${expected}`);
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && actual.length === expected.length, `${path}: array length`);
    expected.forEach((value, i) => assertIdentical((actual as unknown[])[i], value, `${path}[${i}]`));
  } else if (expected && typeof expected === "object") {
    assert.ok(actual && typeof actual === "object", `${path}: object`);
    const keys = (value: object) => Object.keys(value).filter(k => !(path.endsWith(".metrics") && COUNTERS.has(k))).sort();
    assert.deepEqual(keys(actual as object), keys(expected), `${path}: keys`);
    for (const key of keys(expected)) assertIdentical((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
  } else assert.equal(actual, expected, path);
}
function assertMatchesReference(name: string, input: SpatialContactInput, expectedStatus: SpatialContactResult["status"]) {
  const fast = solveSpatialContact(input);
  const reference = solveSpatialContact({ ...input, options: { ...input.options, referenceEvaluation: true } });
  assert.equal(reference.status, expectedStatus, `${name}: ${JSON.stringify(reference.diagnostics)}`);
  assertIdentical(fast, reference, name);
  for (const r of [fast, reference]) {
    assert.ok(Number.isInteger(r.metrics.lineSearchFailures) && r.metrics.lineSearchFailures >= 0);
    assert.ok(r.metrics.lineSearchFailures <= r.metrics.iterations);
  }
  return fast;
}

const planar = (count: number, length: number, at: (s: number) => PointMm) => {
  const knots = spatialSplineKnots(count);
  return Array.from({ length: count }, (_, i) => at(length * (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3));
};
function sphereSeed(count = 8): SpatialContactInput {
  const handle = Math.PI / (3 * (count - 3));
  const controls = planar(count, 1, t => [Math.cos(Math.PI * (1 - t)), Math.sin(Math.PI * (1 - t)), 0]);
  controls[0] = [-1, 0, 0]; controls[1] = [-1, handle, 0];
  controls[count - 2] = [1, handle, 0]; controls[count - 1] = [1, 0, 0];
  return { controlPointsMm: controls, threadRadiusMm: .2, body: { centerMm: [0, 0, 0], radiusMm: .8 }, supports: [] };
}
function postSeed(count: number): SpatialContactInput {
  const length = 4 + Math.PI, handle = length / (3 * (count - 3));
  const controlPointsMm = planar(count, length, s => s <= 2 ? [-2 + s, 1, 0] : s <= 2 + Math.PI
    ? [Math.cos(Math.PI / 2 - s + 2), Math.sin(Math.PI / 2 - s + 2), 0] : [-s + 2 + Math.PI, -1, 0]);
  controlPointsMm[1] = [-2 + handle, 1, 0]; controlPointsMm[count - 2] = [-2 + handle, -1, 0];
  return { controlPointsMm, threadRadiusMm: .2, body: { centerMm: [0, -100, 0], radiusMm: 1 },
    supports: [{ id: "finite-post", kind: "segment", fromMm: [0, 0, -10], toMm: [0, 0, 10], radiusMm: .8 }] };
}
function dubinsSeed(count: number): SpatialContactInput {
  const rho = .25, d = .5, length = 2 * d + Math.PI * rho, handle = length / (3 * (count - 3));
  const controlPointsMm = planar(count, length, s => s <= d ? [s, 0, 0] : s <= d + Math.PI * rho
    ? [d + rho * Math.sin((s - d) / rho), rho - rho * Math.cos((s - d) / rho), 0] : [d - (s - d - Math.PI * rho), 2 * rho, 0]);
  controlPointsMm[1] = [handle, 0, 0]; controlPointsMm[count - 2] = [handle, 2 * rho, 0];
  return { controlPointsMm, threadRadiusMm: .2, minBendRadiusMm: rho, body: { centerMm: [0, 0, -100], radiusMm: 1 },
    supports: [], options: { maxIterations: 8000, maxOuterIterations: 60 } };
}
/** A lifted 3D path pulled around two posts onto a ring of short arcs; most probes are far from most supports. */
function ringSeed(): SpatialContactInput {
  const supports = Array.from({ length: 12 }, (_, i): SpatialSupport => {
    const a = i * Math.PI / 6, b = a + Math.PI / 8;
    return { id: `arc-${i}`, kind: "arc", centerMm: [0, 0, -.25], fromMm: [2.5 * Math.cos(a), 2.5 * Math.sin(a), -.25],
      toMm: [2.5 * Math.cos(b), 2.5 * Math.sin(b), -.25], radiusMm: .1 };
  });
  for (const x of [-1, 1]) supports.push({ id: `post${x}`, kind: "segment", fromMm: [x, 0, -2], toMm: [x, 0, 2], radiusMm: .3 });
  const count = 16, h = 1 / (3 * (count - 3));
  const controlPointsMm = planar(count, 1, t => [-4 + 8 * t, 1.5 * Math.sin(Math.PI * t), .5 * Math.sin(Math.PI * t)]);
  controlPointsMm[0] = [-4, 0, 0]; controlPointsMm[1] = [-4 + 8 * h, 1.5 * Math.PI * h, .5 * Math.PI * h];
  controlPointsMm[count - 1] = [4, 0, 0]; controlPointsMm[count - 2] = [4 - 8 * h, 1.5 * Math.PI * h, .5 * Math.PI * h];
  return { controlPointsMm, threadRadiusMm: .2, body: { centerMm: [0, 0, -40], radiusMm: 38 }, supports };
}

describe("spatial contact: exact shortcuts against the dense reference evaluation", () => {
  it("matches on free, wrapped, capsule and curvature-limited planar problems", () => {
    const straight: SpatialContactInput = { controlPointsMm: [[-2, 0, 0], [-1.8, 0, 0], [-1, 1, 0], [1, 1, 0], [1.8, 0, 0], [2, 0, 0]],
      threadRadiusMm: .2, body: { centerMm: [0, -100, 0], radiusMm: 1 }, supports: [] };
    assertMatchesReference("straight", straight, "converged");
    assertMatchesReference("sphere", sphereSeed(), "converged");
    const post = assertMatchesReference("post", postSeed(14), "converged");
    assert.ok(post.reactions.some(r => r.supportId === "finite-post"));
    const dubins = assertMatchesReference("dubins", dubinsSeed(12), "converged");
    assert.ok(dubins.reactions.some(r => r.kind === "curvature"));
  });

  it("matches when witnesses add probes, and on capped or unresolved solves", () => {
    assertMatchesReference("witnesses", { ...sphereSeed(), options: { samplesPerSpan: 1 } }, "converged");
    assertMatchesReference("iteration-cap", { ...sphereSeed(), options: { maxIterations: 1 } }, "unresolved");
    assertMatchesReference("sample-cap", { ...sphereSeed(), options: { samplesPerSpan: 1, maxConstraintSamples: 6 } }, "unresolved");
    // Stops with loaded AL multipliers, which the final evaluation must honour.
    const capped = assertMatchesReference("post-capped", { ...postSeed(20), options: { maxIterations: 5 } }, "unresolved");
    assert.ok(capped.reactions.length > 0);
  });

  it("matches with arc and segment supports in 3D", () => {
    const ring = assertMatchesReference("ring", ringSeed(), "converged");
    const touched = new Set(ring.reactions.map(r => r.supportId));
    assert.ok(touched.has("post-1") && touched.has("post1") && [...touched].some(id => id.startsWith("arc-")), JSON.stringify([...touched]));
  });

  it("matches with a curve support, where the reference visits every piece", () => {
    // A lifted thread pulled over a smooth arched earlier thread of 16 pieces and a finite post.
    const lerp = (a: PointMm, b: PointMm, t: number): PointMm => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const arch = (a: number, b: number): [PointMm, PointMm, PointMm, PointMm] => {
      const at = (t: number): PointMm => [.1 * Math.sin(3 * t), -1.5 + 3 * t, .35 + 1.8 * t * (1 - t)];
      const d = (t: number): PointMm => [.3 * Math.cos(3 * t), 3, 1.8 - 3.6 * t];
      const h = (b - a) / 3;
      return [at(a), lerp(at(a), [at(a)[0] + d(a)[0], at(a)[1] + d(a)[1], at(a)[2] + d(a)[2]], h), lerp(at(b), [at(b)[0] - d(b)[0], at(b)[1] - d(b)[1], at(b)[2] - d(b)[2]], h), at(b)];
    };
    const piecesMm = Array.from({ length: 16 }, (_, i) => arch(i / 16, (i + 1) / 16));
    const count = 24, h = 1 / (3 * (count - 3));
    const controlPointsMm = planar(count, 1, t => [-2 + 4 * t, .3, 1.3 * Math.sin(Math.PI * t)]);
    controlPointsMm[1] = [-2 + 4 * h, .3, 1.3 * Math.PI * h]; controlPointsMm[count - 2] = [2 - 4 * h, .3, 1.3 * Math.PI * h];
    const input: SpatialContactInput = { controlPointsMm, threadRadiusMm: .2, body: { centerMm: [0, 0, -100], radiusMm: 1 },
      supports: [{ id: "arch", kind: "curve", piecesMm, radiusMm: .2 },
        { id: "post", kind: "segment", fromMm: [1.2, -1, -1], toMm: [1.2, 1, -1], radiusMm: .2 }],
      options: { maxIterations: 8000, maxOuterIterations: 60, feasibilityToleranceMm: 1e-4, stationarityTolerance: 2e-6, complementarityToleranceMm: 5e-7 } };
    const result = assertMatchesReference("arch", input, "converged");
    assert.ok(result.reactions.some(r => r.supportId === "arch"));
  });

  it("matches on frozen Simple 8 kiku window solves", () => {
    // Round stage, factor 1: 12 supports with a short arc, and 80 supports with many segments.
    const inputs = s8Inputs as unknown as { name: string; input: SpatialContactInput }[];
    assert.deepEqual(inputs.map(x => x.name), ["s8-round-x1-approach-6", "s8-round-x1-departure-6"]);
    for (const { name, input } of inputs) {
      const result = assertMatchesReference(name, input, "converged");
      assert.ok(input.supports.length > 10 && result.reactions.length > 0, name);
    }
  });
});
