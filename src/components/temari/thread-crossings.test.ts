import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateThreadCrossings } from "./thread-crossings";
import { validateThreadCoupon } from "./thread-geometry";
import type { C8ThreadCoupon, PointMm, ThreadCurve, ThreadSpan } from "./thread-path";
const line = (a: PointMm, b: PointMm): ThreadCurve => ({ kind: "bezier", controls: [a, a.map((x, i) => x + (b[i] - x) / 3) as unknown as PointMm, a.map((x, i) => x + 2 * (b[i] - x) / 3) as unknown as PointMm, b] });
const span = (id: string, opId: string, curve: ThreadCurve): ThreadSpan => ({ id, opId, threadId: "thread", step: 1, zone: "surface", curve });
function fixture(): C8ThreadCoupon {
  return {
    kind: "engineering-thread-path", bodyRadiusMm: 1, threadRadiusMm: .1, threadId: "thread", assumptions: [], fixture: {}, marks: [], supports: [],
    spans: [span("old", "old-op", line([-2, 0, 11], [2, 0, 11])), span("above", "lay", line([-.5, -1, 12], [-.5, 1, 12])), span("below", "catch", line([.5, -1, 10], [.5, 1, 10]))],
    operations: [{ id: "old-op", order: 0, step: 1, kind: "lay", spanIds: ["old"] }, { id: "lay", order: 1, step: 1, kind: "lay", spanIds: ["above"] }, { id: "catch", order: 2, step: 1, kind: "catch", spanIds: ["below"], captureIds: ["old"] }],
    crossings: [{ id: "over", opId: "lay", working: [{ spanId: "above", t0: 0, t1: 1 }], target: { id: "old", t0: 0, t1: 1 }, pass: "over" }, { id: "under", opId: "catch", working: [{ spanId: "below", t0: 0, t1: 1 }], target: { id: "old", t0: 0, t1: 1 }, pass: "under" }],
    captures: [{ id: "capture", opId: "catch", targets: [{ id: "old", t0: 0, t1: 1 }], overCrossingIds: ["over"], underCrossingIds: ["under"] }],
  };
}
const codes = (c: C8ThreadCoupon) => validateThreadCrossings(c).map((d) => d.code);
describe("finite chronological crossing and capture validation", () => {
  it("checks an actual radial over then under against a finite previous span", () => {
    assert.deepEqual(validateThreadCrossings(fixture()), []);
    const c = fixture(); c.crossings![0].pass = "under";
    assert.ok(codes(c).includes("crossing-wrong-side"));
    assert.ok(validateThreadCoupon(c).diagnostics.some((d) => d.code === "crossing-wrong-side"));
  });
  it("detects radial penetration and leaves exact touching unresolved", () => {
    const c = fixture(); c.spans[1].curve = line([-.5, -1, 11.1], [-.5, 1, 11.1]);
    assert.ok(codes(c).includes("crossing-penetration"));
    // Same ray at x=0 makes the radial center distance exactly the sum of radii.
    c.spans[1].curve = line([0, -1, 11.2], [0, 1, 11.2]);
    assert.ok(codes(c).includes("crossing-unresolved"));
  });
  it("rejects a future working target and incomplete or mismatched bundles", () => {
    const c = fixture(); c.operations[0].order = 3;
    assert.ok(codes(c).includes("crossing-future-target"));
    const missing = fixture(); missing.captures![0].overCrossingIds = [];
    assert.ok(codes(missing).includes("capture-incomplete"));
    const interval = fixture(); interval.crossings![0].target.t1 = .8;
    assert.ok(codes(interval).includes("capture-contract"));
    const legacy = fixture(); legacy.operations[2].captureIds = [];
    assert.ok(codes(legacy).includes("capture-contract"));
  });
  it("checks order inside one catch using material position", () => {
    const c = fixture(); c.spans[1].opId = "catch"; c.crossings![0].opId = "catch";
    c.operations[1].spanIds = []; c.operations[2].spanIds = ["above", "below"];
    assert.deepEqual(validateThreadCrossings(c), []);
    [c.spans[1], c.spans[2]] = [c.spans[2], c.spans[1]];
    c.operations[2].spanIds = ["below", "above"];
    assert.ok(codes(c).includes("capture-order"));
  });
  it("requires the entire over phase before any under passage of one bundle", () => {
    const c = fixture();
    const oldB = span("old-b", "old-op", line([-2, .3, 11], [2, .3, 11]));
    const aboveB = span("above-b", "catch", line([-.5, -1, 12], [-.5, 1, 12]));
    const belowB = span("below-b", "catch", line([.5, -1, 10], [.5, 1, 10]));
    c.spans[1].opId = "catch"; c.crossings![0].opId = "catch";
    c.spans.splice(1, 0, oldB); c.spans.push(aboveB, belowB);
    c.operations[0].spanIds.push("old-b"); c.operations[1].spanIds = [];
    c.operations[2].spanIds = ["above", "below", "above-b", "below-b"]; c.operations[2].captureIds!.push("old-b");
    c.crossings!.push({ id: "over-b", opId: "catch", working: [{ spanId: "above-b", t0: 0, t1: 1 }], target: { id: "old-b", t0: 0, t1: 1 }, pass: "over" }, { id: "under-b", opId: "catch", working: [{ spanId: "below-b", t0: 0, t1: 1 }], target: { id: "old-b", t0: 0, t1: 1 }, pass: "under" });
    c.captures![0].targets.push({ id: "old-b", t0: 0, t1: 1 }); c.captures![0].overCrossingIds.push("over-b"); c.captures![0].underCrossingIds.push("under-b");
    // Both pairwise orders are valid, but over-a,under-a,over-b,under-b is not one bundle capture.
    assert.deepEqual(codes(c), ["capture-order"]);
    const unrelated = span("unrelated", "catch", line([3, 3, 13], [4, 3, 13]));
    c.spans = [c.spans[0], oldB, c.spans[2], aboveB, unrelated, c.spans[3], belowB];
    c.operations[2].spanIds = c.spans.slice(2).map((s) => s.id);
    assert.deepEqual(validateThreadCrossings(c), []); // No artificial adjacency requirement between phases.
  });
  it("does not count intersections of extended supporting lines outside the target", () => {
    const c = fixture(); c.spans[1].curve = line([10, -1, 12], [10, 1, 12]);
    assert.ok(codes(c).includes("crossing-missing"));
    const endpoint = fixture(); endpoint.spans[0].curve = line([0, 0, 11], [2, 0, 11]); endpoint.spans[1].curve = line([0, -1, 12], [0, 1, 12]);
    assert.ok(codes(endpoint).includes("crossing-unresolved"));
  });
  it("accepts a two-sided smooth working join and rejects a one-sided endpoint", () => {
    const c = fixture(); c.spans[1].curve = line([-.5, -1, 12], [-.5, 0, 12]);
    c.spans.splice(2, 0, span("above-out", "lay", line([-.5, 0, 12], [-.5, 1, 12])));
    c.operations[1].spanIds = ["above", "above-out"];
    c.crossings![0].working.push({ spanId: "above-out", t0: 0, t1: 1 });
    assert.deepEqual(validateThreadCrossings(c), []);
    // Nonuniform speed makes an unconstrained Newton step overshoot the join.
    c.spans[1].curve = { kind: "bezier", controls: [[-.5, -1, 12], [-.5, -5 / 6, 12], [-.5, -.5, 12], [-.5, 0, 12]] };
    assert.deepEqual(validateThreadCrossings(c), []);
    c.crossings![0].working.pop(); assert.ok(codes(c).includes("crossing-unresolved"));
  });
  it("does not claim a unique transverse crossing for tangency or two crossings", () => {
    const c = fixture(); c.spans[1].curve = { kind: "bezier", controls: [[-1, 1, 12], [-1 / 3, -1 / 3, 12], [1 / 3, -1 / 3, 12], [1, 1, 12]] };
    assert.ok(codes(c).includes("crossing-unresolved"));
    c.spans[1].curve = { kind: "bezier", controls: [[-.5, .1875, 12], [-1 / 6, .1875 - 1 / 3, 12], [1 / 6, .1875 - 1 / 3, 12], [.5, .1875, 12]] };
    assert.ok(codes(c).includes("crossing-unresolved"));
  });
  it("does not merge two nearby roots when candidate seeds converge to one", () => {
    for (const scale of [.01, .001]) {
      const c = fixture(), a = .1, b = .101, constant = a * b * scale, linear = -(a + b) * scale;
      // y=scale*(t-.1)*(t-.101): two exact roots, below the initial mesh error.
      c.spans[1].curve = { kind: "bezier", controls: [[-.5, constant, 12], [-1 / 6, constant + linear / 3, 12], [1 / 6, constant + 2 * linear / 3 + scale / 3, 12], [.5, constant + linear + scale, 12]] };
      assert.ok(codes(c).includes("crossing-unresolved"));
    }
  });
  it("resolves a neighboring mesh cell only with uniqueness over the cell and root together", () => {
    const c = fixture(), root = .250001, bend = .5;
    // y=(t-root)+bend*(t-root)^2 has exactly one root in [0,1]. Its location
    // just beyond a dyadic cell boundary left conservative false candidates.
    const constant = bend * root * root - root, linear = 1 - 2 * bend * root;
    c.spans[1].curve = { kind: "bezier", controls: [[-.5, constant, 12], [-1 / 6, constant + linear / 3, 12], [1 / 6, constant + 2 * linear / 3 + bend / 3, 12], [.5, constant + linear + bend, 12]] };
    assert.deepEqual(validateThreadCrossings(c), []);
    assert.deepEqual(validateThreadCrossings(c, .005 / 4), []);
  });
  it("allows a support-only under capture while retaining prior-span requirements", () => {
    const c = fixture(); c.supports = [{ id: "support", circleId: "circle", curve: c.spans[0].curve, radiusMm: .08 }];
    c.crossings = [c.crossings![1]]; c.crossings[0].target.id = "support";
    c.captures![0].targets[0].id = "support"; c.captures![0].overCrossingIds = []; c.operations[2].captureIds = ["support"];
    assert.deepEqual(validateThreadCrossings(c), []);
  });
  it("rejects nonexistent IDs, malformed windows and duplicate claims", () => {
    const c = fixture(); c.crossings![0].working[0].t0 = Number.NaN;
    assert.ok(codes(c).includes("crossing-contract"));
    const duplicate = fixture(); duplicate.crossings!.push(duplicate.crossings![0]);
    assert.ok(codes(duplicate).includes("crossing-contract"));
    const missing = fixture(); missing.captures![0].underCrossingIds = ["missing"];
    assert.ok(codes(missing).includes("capture-contract"));
  });
  it("commutes with a proper rotation and consistent scaling of all lengths", () => {
    const c = fixture(), scale = 7;
    const transform = ([x, y, z]: PointMm): PointMm => [scale * (x + 8 * y + 4 * z) / 9, scale * (8 * x + y - 4 * z) / 9, scale * (-4 * x + 4 * y - 7 * z) / 9];
    for (const s of c.spans) if (s.curve.kind === "bezier") s.curve.controls = s.curve.controls.map(transform) as unknown as typeof s.curve.controls;
    c.bodyRadiusMm *= scale; c.threadRadiusMm *= scale;
    assert.deepEqual(validateThreadCrossings(c, .005 * scale), []);
  });
});

describe("crossings over a chain of computed target pieces", () => {
  // The old thread is split into three consecutive G1 pieces along x.
  function chained(pieces: [PointMm, PointMm][], above: ThreadCurve): C8ThreadCoupon {
    const old = pieces.map(([a, b], i) => span(`old-${i}`, "old-op", line(a, b)));
    return {
      kind: "engineering-thread-path", bodyRadiusMm: 1, threadRadiusMm: .1, threadId: "thread", assumptions: [], fixture: {}, marks: [], supports: [],
      spans: [...old, span("above", "lay", above)],
      operations: [{ id: "old-op", order: 0, step: 1, kind: "lay", spanIds: old.map((s) => s.id) }, { id: "lay", order: 1, step: 1, kind: "lay", spanIds: ["above"] }],
      crossings: [{ id: "over-chain", opId: "lay", working: [{ spanId: "above", t0: 0, t1: 1 }], target: { id: "old-0", t0: 0, t1: 1 },
        targetChain: old.map((s) => ({ spanId: s.id, t0: 0, t1: 1 })), pass: "over" }],
    };
  }
  const straight: [PointMm, PointMm][] = [[[-3, 0, 11], [-1, 0, 11]], [[-1, 0, 11], [1, 0, 11]], [[1, 0, 11], [3, 0, 11]]];

  it("finds the single crossing in any piece, including exactly at a join", () => {
    for (const x of [-2, .3, 1]) assert.deepEqual(codes(chained(straight, line([x, -1, 12], [x, 1, 12]))), [], String(x));
    // A single-piece target misses a crossing that lies in another piece.
    const single = chained(straight, line([2, -1, 12], [2, 1, 12]));
    delete single.crossings![0].targetChain;
    assert.ok(codes(single).includes("crossing-missing"));
  });

  it("does not accept a second crossing hidden in another piece of the chain", () => {
    const zigzag: ThreadCurve = { kind: "bezier", controls: [[-2.5, -1, 12], [-2.5, 3, 12], [2.5, -3, 12], [2.5, 1, 12]] };
    assert.ok(codes(chained(straight, zigzag)).includes("crossing-unresolved"));
  });

  it("checks the side and the chain contract", () => {
    const below = chained(straight, line([.3, -1, 10], [.3, 1, 10]));
    assert.ok(codes(below).includes("crossing-wrong-side"));
    const gap = chained(straight, line([.3, -1, 12], [.3, 1, 12]));
    gap.crossings![0].targetChain = [{ spanId: "old-0", t0: 0, t1: 1 }, { spanId: "old-2", t0: 0, t1: 1 }];
    assert.ok(codes(gap).includes("crossing-contract"));
    const mismatch = chained(straight, line([.3, -1, 12], [.3, 1, 12]));
    mismatch.crossings![0].target = { id: "old-1", t0: 0, t1: 1 };
    assert.ok(codes(mismatch).includes("crossing-contract"));
    const future = chained(straight, line([.3, -1, 12], [.3, 1, 12]));
    future.operations[0].order = 2;
    assert.ok(codes(future).includes("crossing-future-target"));
    const elbow = chained([[[-3, 0, 11], [-1, 0, 11]], [[-1, 0, 11], [1, .5, 11]], [[1, .5, 11], [3, .5, 11]]], line([.3, -1, 12], [.3, 1, 12]));
    assert.ok(codes(elbow).includes("crossing-contract"));
  });
});

describe("a transverse crossing beside an interior smooth join", () => {
  // Conservative candidates keep a false cell across the join from the root.
  // Newton must continue from it through the join, and uniqueness must hold
  // over the pieces on both sides.
  type Controls = readonly [PointMm, PointMm, PointMm, PointMm];
  const mix = (a: PointMm, b: PointMm, t: number): PointMm => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function splitAt([a, b, d, e]: Controls, t: number): ThreadCurve[] {
    const ab = mix(a, b, t), bd = mix(b, d, t), de = mix(d, e, t), left = mix(ab, bd, t), right = mix(bd, de, t), p = mix(left, right, t);
    return [{ kind: "bezier", controls: [a, ab, left, p] }, { kind: "bezier", controls: [p, right, de, e] }];
  }
  function joined(working: ThreadCurve[], target: ThreadCurve[]): C8ThreadCoupon {
    const old = target.map((curve, i) => span(`old-${i}`, "old-op", curve)), later = working.map((curve, i) => span(`new-${i}`, "lay", curve));
    return {
      kind: "engineering-thread-path", bodyRadiusMm: 1, threadRadiusMm: .1, threadId: "thread", assumptions: [], fixture: {}, marks: [], supports: [],
      spans: [...old, ...later],
      operations: [{ id: "old-op", order: 0, step: 1, kind: "lay", spanIds: old.map((s) => s.id) }, { id: "lay", order: 1, step: 1, kind: "lay", spanIds: later.map((s) => s.id) }],
      crossings: [{ id: "over", opId: "lay", working: later.map((s) => ({ spanId: s.id, t0: 0, t1: 1 })), target: { id: "old-0", t0: 0, t1: 1 }, pass: "over",
        ...(old.length > 1 ? { targetChain: old.map((s) => ({ spanId: s.id, t0: 0, t1: 1 })) } : {}) }],
    };
  }
  // The previous thread bulges (a nonzero chord error) and its x is linear in t:
  // the later thread x=-.5, z=12 meets its ray at t=tq, y=yRoot.
  const bulge: Controls = [[-2, 0, 11], [-2 / 3, .1, 11], [2 / 3, .1, 11], [2, 0, 11]];
  const tq = (2 - .5 * 11 / 12) / 4, yRoot = .3 * tq * (1 - tq) * 12 / 11;
  const later = (join: number) => [line([-.5, -1, 12], [-.5, join, 12]), line([-.5, join, 12], [-.5, 1, 12])];
  // y=scale*(t-r1)*(t-r2) for x from -.5 to .5 at z=12, over a straight previous thread.
  const parabola = (scale: number, r1: number, r2: number): Controls => {
    const constant = r1 * r2 * scale, linear = -(r1 + r2) * scale;
    return [[-.5, constant, 12], [-1 / 6, constant + linear / 3, 12], [1 / 6, constant + 2 * linear / 3 + scale / 3, 12], [.5, constant + linear + scale, 12]];
  };
  const straight = line([-2, 0, 11], [2, 0, 11]);

  for (const [side, offset] of [["before", 1e-5], ["after", -1e-5]] as const) {
    it(`resolves a root 1e-5 mm ${side} a working join`, () => {
      const c = joined(later(yRoot + offset), [{ kind: "bezier", controls: bulge }]);
      assert.deepEqual(validateThreadCrossings(c), []);
      assert.deepEqual(validateThreadCrossings(c, .005 / 4), []);
    });
  }
  it("resolves a root beside a target-chain join on either side", () => {
    for (const offset of [1e-6, -1e-6]) assert.deepEqual(codes(joined([line([-.5, -1, 12], [-.5, 1, 12])], splitAt(bulge, tq + offset))), [], String(offset));
  });
  it("resolves the recorded Simple 8 stitch crossing 3e-5 mm before a join", () => {
    // Stitch factor 3, approach-2-over-jiwari: the root is at t=.99964 of the
    // first of these two spans, over the jiwari support arc.
    const c = joined([
      { kind: "bezier", controls: [[5.596445253935962, 36.53722488439256, 0.06227862151927159], [5.5798500499164785, 36.542370934970904, 0.04156063239079909], [5.563268298244862, 36.547606615947906, 0.020808224921105248], [5.546292828795289, 36.550252059597746, -0.000022648770835730428]] },
      { kind: "bezier", controls: [[5.546292828795289, 36.550252059597746, -0.000022648770835730428], [5.529317359345716, 36.552897503247586, -0.020853522462776705], [5.511948172118186, 36.552952709570256, -0.041762862376964915], [5.494282616903808, 36.551029936097535, -0.062133898996030085]] },
    ], []);
    c.bodyRadiusMm = 36.60563691113593; c.threadRadiusMm = .2;
    c.supports = [{ id: "jiwari-2", circleId: "s8-2", radiusMm: .08, curve: { kind: "arc", from: [1.017896975417084, 36.67151266750713, 0], to: [14.39634757482305, 33.74286786982673, 0] } }];
    c.operations.shift(); c.crossings![0].target.id = "jiwari-2";
    assert.deepEqual(validateThreadCrossings(c, .001), []);
  });
  it("tells one root beside a join from two roots straddling it", () => {
    for (const scale of [1, .01]) {
      assert.deepEqual(codes(joined(splitAt(parabola(scale, .1, -1), .10001), [straight])), [], `one root, scale ${scale}`);
      // Roots at t=.1 and t=.101 with the join between them.
      const two = joined(splitAt(parabola(scale, .1, .101), .1005), [straight]);
      assert.deepEqual(codes(two), ["crossing-unresolved"], `two roots, scale ${scale}`);
      assert.match(validateThreadCrossings(two)[0]!.message, /^crossing "over": /);
    }
    // A bump crosses the straight later thread twice, far apart, with its join between the roots.
    const bump = joined([line([-1.5, 0, 12], [-.2, 0, 12]), line([-.2, 0, 12], [1.5, 0, 12])], [{ kind: "bezier", controls: [[-2, -.3, 11], [-2 / 3, .3, 11], [2 / 3, .3, 11], [2, -.3, 11]] }]);
    assert.deepEqual(codes(bump), ["crossing-unresolved"]);
  });
});
