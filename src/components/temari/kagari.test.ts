import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { biteAcross, KIKU_8_POINT, stackOver, uwagakeVia } from "./kagari.ts";
import { compileKiku, fillKikuSewn, kikuSpec, stitchesFromOps } from "./patterns.ts";
import { unitFromMm } from "./measure.ts";

function dist(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe("kagari recipe atom", () => {
  it("kiku-8-point is Simple 8 uwagake, facing one pole", () => {
    assert.equal(KIKU_8_POINT.requires, "simple");
    assert.equal(KIKU_8_POINT.stitch, "uwagake-chidori");
    assert.equal(KIKU_8_POINT.centers, "facing-pole");
    assert.equal(KIKU_8_POINT.sets, 2);
    assert.equal(KIKU_8_POINT.innerMm, 10);
    assert.equal(KIKU_8_POINT.outerFromEquator, 1 / 3);
  });

  it("kikuSpec on Simple reads the recipe, not magic numbers", () => {
    const spec = kikuSpec("simple", "even");
    assert.equal(spec.recipe, KIKU_8_POINT);
    assert.equal(spec.sets, 2);
    assert.ok(Math.abs(spec.inner - unitFromMm(KIKU_8_POINT.innerMm)) < 1e-9);
    assert.ok(Math.abs(spec.outer - (Math.PI / 2) * (1 - KIKU_8_POINT.outerFromEquator)) < 1e-9);
  });

  it("bite sits across the mark, not along the meridian", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const mark: [number, number, number] = [0, Math.cos(0.4), -Math.sin(0.4)];
    const bite = biteAcross(pole, mark);
    const mid = [
      (bite.enter[0] + bite.exit[0]) / 2,
      (bite.enter[1] + bite.exit[1]) / 2,
      (bite.enter[2] + bite.exit[2]) / 2,
    ];
    const len = Math.hypot(...mid) || 1;
    const m: [number, number, number] = [mid[0] / len, mid[1] / len, mid[2] / len];
    assert.ok(dist(m, mark) < 0.02, "bite centered on the mark");
    assert.ok(dist(bite.enter, bite.exit) > unitFromMm(1), "bite has width");
    const along = Math.abs(mark[1] - bite.enter[1]);
    const across = dist(bite.enter, bite.exit);
    assert.ok(along < across, "bite is across the jiwari, not down the ray");
  });

  it("stackOver follows the recipe crossing, not always every previous round", () => {
    assert.deepEqual(stackOver([3, 7, 11], "over-all"), [3, 7, 11]);
    assert.deepEqual(stackOver([3, 7, 11], "over-1"), [11]);
    assert.deepEqual(stackOver([3, 7, 11], "under"), []);
  });

  it("compileKiku is one op per chidori leg, same count as the old petal walk", () => {
    const sewn = fillKikuSewn("simple", "out", "even", 0);
    const ops = compileKiku("simple", "out", "even", 0);
    assert.equal(ops.length, sewn.length * 2);
    const spec = kikuSpec("simple", "even");
    assert.equal(ops.length, spec.rounds * 8 * 2);
    assert.equal(ops[0]?.kai, 0);
    assert.equal(ops[0]?.set, 0);
    assert.equal(ops[0]?.mark.t, "outer");
    assert.equal(ops[1]?.mark.t, "inner");
  });

  it("uwagake: inner bites after kai 0 catch previous rounds on that line", () => {
    const ops = compileKiku("simple", "out", "even", 0);
    const firstInner = ops.filter((op) => op.kai === 0 && op.mark.t === "inner");
    assert.ok(firstInner.length > 0);
    assert.ok(firstInner.every((op) => op.over.length === 0));
    const later = ops.filter((op) => op.kai > 0 && op.mark.t === "inner");
    assert.ok(later.length > 0);
    assert.ok(
      later.every((op) => op.over.length === op.kai),
      "each inner bite stacks the previous kai on that meridian",
    );
  });

  it("stitchesFromOps keep the V lay and attach a bite", () => {
    const ops = compileKiku("simple", "out", "even", 0).slice(0, 2);
    const stitches = stitchesFromOps(ops);
    assert.equal(stitches.length, 2);
    for (const stitch of stitches) {
      assert.equal(stitch.kind, "arc");
      if (stitch.kind !== "arc") return;
      assert.ok(stitch.bite);
      assert.ok(dist(stitch.a, stitch.b) > 0.4);
    }
  });

  it("uwagake via sits closer to the pole than the inner bite", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const inner: [number, number, number] = [0, Math.cos(0.4), -Math.sin(0.4)];
    const via = uwagakeVia(pole, inner, 2, 0.02);
    assert.ok(via);
    if (!via) return;
    assert.ok(via[1] > inner[1], "via is higher / closer to +Y pole");
    const kai0 = compileKiku("simple", "out", "even", 0).filter(
      (op) => op.kai === 0 && op.mark.t === "inner",
    );
    assert.ok(kai0.every((op) => !op.lay.via || op.lay.via.length === 0));
    const later = compileKiku("simple", "out", "even", 0).filter(
      (op) => op.kai > 0 && op.mark.t === "inner",
    );
    assert.ok(later.length > 0);
    assert.ok(
      later.every((op) => op.lay.via && op.lay.via.length === 1),
      "later inner legs hook over the bundle",
    );
  });

  it("outer of later kai drops extra so the V point stretches", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const spec = kikuSpec("simple", "even");
    const ops = compileKiku("simple", "out", "even", 0);
    const outer0 = ops.find((op) => op.kai === 0 && op.mark.t === "outer");
    const outer1 = ops.find((op) => op.kai === 1 && op.mark.t === "outer");
    assert.ok(outer0 && outer1);
    if (!outer0 || !outer1) return;
    const th = (p: [number, number, number]) => Math.acos(Math.min(1, Math.max(-1, p[1])));
    const d = th(outer1.mark.at) - th(outer0.mark.at);
    assert.ok(d > spec.pitch + spec.stretch * 0.8, `outer step ${d} includes stretch`);
  });

  it("player color is kai 0; later kais follow the recipe cycle", () => {
    const a = compileKiku("simple", "out", "even", 0, 0);
    const b = compileKiku("simple", "out", "even", 0, 1);
    assert.equal(a[0]?.color, 0);
    assert.equal(b[0]?.color, 1);
    const kai1a = a.find((op) => op.kai === 1);
    const kai1b = b.find((op) => op.kai === 1);
    assert.equal(kai1a?.color, 1);
    assert.equal(kai1b?.color, 2);
  });
});
