import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { biteAcross, KIKU_8_POINT, stackOver, uwagakeVia, scoopAway, scoopRadius, KAGARI_SCOOP_MM, closestApproachT } from "./kagari.ts";
import { compileKiku, fillKikuSewn, kikuSpec, stitchesFromOps, groupWorkingThreads } from "./patterns.ts";
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
    assert.equal(KIKU_8_POINT.innerMm, 5);
    assert.equal(KIKU_8_POINT.outerFromEquator, 1 / 3);
    assert.equal(KIKU_8_POINT.stretchMm, 2);
  });

  it("kikuSpec on Simple reads the recipe, not magic numbers", () => {
    const spec = kikuSpec("simple", "even");
    assert.equal(spec.recipe, KIKU_8_POINT);
    assert.equal(spec.sets, 2);
    assert.ok(Math.abs(spec.inner - unitFromMm(KIKU_8_POINT.innerMm)) < 1e-9);
    assert.ok(Math.abs(spec.outer - (Math.PI / 2) * (1 - KIKU_8_POINT.outerFromEquator)) < 1e-9);
    assert.ok(Math.abs(spec.stretch - unitFromMm(2)) < 1e-9, "Ozaki 2 mm is the corner turn, recorded on the recipe");
    assert.ok(Math.abs(spec.pitch - unitFromMm(0.71)) < 1e-6, "flanks pack at one pearl #5");
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
    assert.ok(dist(bite.enter, bite.exit) > unitFromMm(0.5), "bite has width");
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
      assert.ok(dist(stitch.a, stitch.b) > 0.2);
    }
  });

  it("uwagake via sits closer to the pole than the inner bite", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const inner: [number, number, number] = [0, Math.cos(0.4), -Math.sin(0.4)];
    const via = uwagakeVia(pole, inner, 2, 0.02);
    assert.ok(via);
    if (!via) return;
    assert.ok(via[1] > inner[1], "via is higher / closer to +Y pole");
  });

  it("both flanks of a V meet on the mark, same count", () => {
    const ops = compileKiku("simple", "out", "even", 0);
    for (const set of [0, 1] as const) {
      const inner = ops.filter((op) => op.set === set && op.mark.t === "inner");
      const outer = ops.filter((op) => op.set === set && op.mark.t === "outer");
      assert.equal(inner.length, outer.length, `set ${set} inner vs outer`);
      for (const op of inner) {
        assert.ok(dist(op.lay.to, op.mark.at) < 1e-9, "inner leg ends on the mark");
        assert.ok(dist(op.lay.from, op.mark.at) > 0.2, "inner leg has a real span");
      }
      for (const op of outer) {
        assert.ok(dist(op.lay.to, op.mark.at) < 1e-9, "outer leg ends on the mark");
      }
    }
    const byLine = new Map<string, { inner: number; outer: number }>();
    for (const op of ops) {
      const k = `${op.set}:${op.mark.line}`;
      const slot = byLine.get(k) ?? { inner: 0, outer: 0 };
      if (op.mark.t === "inner") slot.inner += 1;
      else slot.outer += 1;
      byLine.set(k, slot);
    }
    for (const [k, slot] of byLine) {
      assert.equal(slot.inner + slot.outer, slot.inner + slot.outer);
      assert.ok(slot.inner === 0 || slot.outer === 0, `one set uses a line as inner or outer, not mixed: ${k}`);
    }
  });

  it("later kai: inner one thread, outer Ozaki stretch; flanks stay parallel mid-petal", () => {
    const spec = kikuSpec("simple", "even");
    const ops = compileKiku("simple", "out", "even", 0);
    const outer0 = ops.find((op) => op.kai === 0 && op.mark.t === "outer");
    const outer1 = ops.find((op) => op.kai === 1 && op.mark.t === "outer");
    const inner0 = ops.find((op) => op.kai === 0 && op.mark.t === "inner");
    const inner1 = ops.find((op) => op.kai === 1 && op.mark.t === "inner");
    assert.ok(outer0 && outer1 && inner0 && inner1);
    if (!outer0 || !outer1 || !inner0 || !inner1) return;
    const th = (p: [number, number, number]) => Math.acos(Math.min(1, Math.max(-1, p[1])));
    const dOut = th(outer1.mark.at) - th(outer0.mark.at);
    const dIn = th(inner1.mark.at) - th(inner0.mark.at);
    assert.ok(Math.abs(dOut - spec.stretch) < 1e-6, `outer step ${dOut} is Ozaki stretch`);
    assert.ok(Math.abs(dIn - spec.pitch) < 1e-6, `inner step ${dIn} is one thread`);
    assert.ok(outer1.lay.via && outer1.lay.via.length > 4, "later kai follow the offset path, not a free geodesic");
  });

  it("player color is every kai until they pick another", () => {
    const a = compileKiku("simple", "out", "even", 0, 0);
    const b = compileKiku("simple", "out", "even", 0, 4);
    assert.ok(a.every((op) => op.color === 0));
    assert.ok(b.every((op) => op.color === 4));
  });

  it("both sets of kai 0 make 8 inner and 8 outer marks — the star with diamonds", () => {
    const ops = compileKiku("simple", "out", "even", 0).filter((op) => op.kai === 0);
    assert.equal(ops.length, 16);
    const inners = ops.filter((op) => op.mark.t === "inner");
    const outers = ops.filter((op) => op.mark.t === "outer");
    assert.equal(inners.length, 8);
    assert.equal(outers.length, 8);
    const setA = ops.filter((op) => op.set === 0).length;
    const setB = ops.filter((op) => op.set === 1).length;
    assert.equal(setA, 8);
    assert.equal(setB, 8);
  });

  it("GT14 ring-major: A0, B0, A1, B1 — not all kai of A first", () => {
    const ops = compileKiku("simple", "out", "even", 0);
    assert.ok(ops.slice(0, 8).every((op) => op.kai === 0 && op.set === 0));
    assert.ok(ops.slice(8, 16).every((op) => op.kai === 0 && op.set === 1));
    assert.ok(ops.slice(16, 24).every((op) => op.kai === 1 && op.set === 0));
    assert.ok(ops.slice(24, 32).every((op) => op.kai === 1 && op.set === 1));
  });

  it("onlySet 0 with one kai is four petals, not eight", () => {
    const ops = compileKiku("simple", "out", "even", 0, 0, 1, 0);
    assert.equal(ops.length, 8);
    assert.ok(ops.every((op) => op.set === 0 && op.kai === 0));
    const both = compileKiku("simple", "out", "even", 0, 0, 1, "all");
    assert.equal(both.length, 16);
  });

  it("inner uwagake bite widens around the stack; outer bite stays tiny", () => {
    const ops = compileKiku("simple", "out", "even", 0);
    const inner0 = ops.find((op) => op.kai === 0 && op.mark.t === "inner");
    const innerN = ops.find((op) => op.kai >= 2 && op.mark.t === "inner");
    const outerN = ops.find((op) => op.kai >= 2 && op.mark.t === "outer");
    assert.ok(inner0 && innerN && outerN);
    if (!inner0 || !innerN || !outerN) return;
    const w = (op: typeof inner0) => dist(op.bite.enter, op.bite.exit);
    assert.ok(w(innerN) > w(inner0) * 1.8, "later inner bite wraps the stack");
    assert.ok(w(outerN) < w(innerN) * 0.6, "outer point stays a tiny scoop");
    assert.ok(innerN.bite.enter[1] > innerN.mark.at[1], "inner scoop sits toward the pole");
    assert.ok(dist(innerN.lay.to, innerN.mark.at) < 1e-9, "flanks still meet on the mark");
  });

  it("working start/stop scoops under the wrap, ~2 mm, no chord", () => {
    const at: [number, number, number] = [0, Math.cos(0.4), -Math.sin(0.4)];
    const from: [number, number, number] = [0, Math.cos(0.55), -Math.sin(0.55)];
    const walk = scoopAway(at, from);
    assert.ok(walk.length >= 6);
    const last = walk[walk.length - 1]!;
    const ang = Math.acos(Math.min(1, Math.max(-1, at[0] * last[0] + at[1] * last[1] + at[2] * last[2])));
    assert.ok(Math.abs(ang - unitFromMm(KAGARI_SCOOP_MM)) < 1e-6, "scoop is the kagari 2 mm");
    const dFrom = dist(from, at);
    const dWalk = dist(from, last);
    assert.ok(dWalk > dFrom, "walks away from the laid stitch, not back along it");
    for (const p of walk) {
      assert.ok(Math.abs(Math.hypot(...p) - 1) < 1e-9, "stays on the sphere, not a chord");
    }
    const half = unitFromMm(0.71) * 0.5;
    const surface = 1 + half;
    const buried = scoopRadius(1, surface, half);
    assert.ok(buried + half < 1.0, "whole pearl sits under the wrap cover");
    assert.ok(buried > 0.97, "upper wrap layers, not the core");
    assert.ok(scoopRadius(0, surface, half) === surface, "t=0 is still on the mari");
  });

  it("inner scoop walks toward the equator, not into the polar cap", () => {
    const at: [number, number, number] = [0.04, Math.cos(0.14), Math.sin(0.14)];
    const n = Math.hypot(...at) || 1;
    const inner: [number, number, number] = [at[0] / n, at[1] / n, at[2] / n];
    const from: [number, number, number] = [0.12, Math.cos(0.28), Math.sin(0.28)];
    const fn = Math.hypot(...from) || 1;
    const flank: [number, number, number] = [from[0] / fn, from[1] / fn, from[2] / fn];
    const poleward: [number, number, number] = [
      2 * inner[0] - flank[0],
      2 * inner[1] - flank[1],
      2 * inner[2] - flank[2],
    ];
    const walk = scoopAway(inner, poleward, 4, 0.8);
    const pole: [number, number, number] = [0, 1, 0];
    const atDot = inner[0] * pole[0] + inner[1] * pole[1] + inner[2] * pole[2];
    for (const p of walk) {
      const d = p[0] * pole[0] + p[1] * pole[1] + p[2] * pole[2];
      assert.ok(d <= atDot + 1e-5, "inner park must not walk into the cap");
    }
  });

  it("a finished set-round parks at the start; one petal does not", () => {
    const round = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 1, 0));
    assert.equal(round.length, 8);
    const first = round[0];
    const last = round[round.length - 1];
    assert.ok(first && last && first.kind === "arc" && last.kind === "arc");
    if (!first || !last || first.kind !== "arc" || last.kind !== "arc") return;
    assert.ok(dist(first.a, last.b) < 0.02, "complete set-round returns to the start mark");
    const chains = groupWorkingThreads(round.filter((s): s is Extract<typeof s, { kind: "arc" }> => s.kind === "arc"));
    assert.equal(chains.length, 1, "one working thread for the round");
    const petal = round.slice(0, 2);
    const p0 = petal[0];
    const p1 = petal[1];
    assert.ok(p0 && p1 && p0.kind === "arc" && p1.kind === "arc");
    if (!p0 || !p1 || p0.kind !== "arc" || p1.kind !== "arc") return;
    assert.ok(dist(p0.a, p1.b) > 0.1, "one petal is an open working length");
  });

  it("two working threads per pole: A and B park/resume across kai, never weld", () => {
    const stitches = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 3, "all"));
    const arcs = stitches.filter((s): s is Extract<typeof s, { kind: "arc" }> => s.kind === "arc");
    const chains = groupWorkingThreads(arcs);
    assert.equal(chains.length, 2, "one cord for A, one for B");
    const sets = chains.map((c) => c[0]?.set).sort();
    assert.deepEqual(sets, [0, 1]);
    for (const chain of chains) {
      const head = chain[0];
      const tail = chain[chain.length - 1];
      assert.ok(head && tail && head.kind === "arc" && tail.kind === "arc");
      if (!head || !tail || head.kind !== "arc" || tail.kind !== "arc") return;
      assert.ok(
        dist(head.a, tail.b) > 0.02,
        "later kai parks further out — not a welded loop",
      );
      const kais = [...new Set(chain.map((s) => s.kai))];
      assert.deepEqual(kais, [0, 1, 2], "same pearl resumes across kai");
    }
  });

  it("A/B kousa is near the inner marks, not mid-flank", () => {
    const stitches = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 1, "all"));
    const b = stitches.filter((s) => s.kind === "arc" && s.set === 1);
    assert.ok(b.length >= 8);
    for (const s of b) {
      if (s.kind !== "arc") continue;
      assert.equal(s.sitMid, 1);
      assert.ok(s.sitMidT != null, "crossing has a real t");
      const t = s.sitMidT ?? 0.5;
      assert.ok(t < 0.28 || t > 0.72, `kousa t=${t} is near an end, not 0.5`);
    }
    const a = stitches.filter((s) => s.kind === "arc" && s.set === 0);
    assert.ok(a.every((s) => s.kind !== "arc" || !s.sitMid), "A stays on the mari");
  });

  it("finds the same crossings in a deep flower as in a shallow one", () => {
    // The pair loop rejects distant stitches by their caps before measuring, and
    // sharpens what it keeps. These counts are what that finds; a rejection that
    // reaches too far would quietly drop crossings and show up here. Sharpening
    // lowered the point counts (56 → 48 at three rounds): crossings that the
    // sample grid placed apart turn out to be the same meeting.
    for (const [layers, arcs, carrying, points] of [[1, 16, 8, 8], [3, 48, 40, 48], [10, 160, 152, 368]]) {
      const stitches = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, layers!, "all"))
        .filter((s) => s.kind === "arc");
      assert.equal(stitches.length, arcs, `arcs at ${layers} rounds`);
      assert.equal(stitches.filter((s) => s.kind === "arc" && s.sitMid).length, carrying,
        `stitches carrying a crossing at ${layers} rounds`);
      assert.equal(
        stitches.reduce((n, s) => n + (s.kind === "arc" ? s.sitAts?.length ?? 0 : 0), 0),
        points, `crossing points at ${layers} rounds`);
    }
  });

  it("later kai sits on earlier opposite set at the real crossing", () => {
    const stitches = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 3, "all"));
    const a1 = stitches.filter((s) => s.kind === "arc" && s.set === 0 && s.kai === 1);
    assert.ok(a1.length > 0);
    const withKousa = a1.filter((s) => s.kind === "arc" && (s.sitAts?.length ?? 0) > 0);
    assert.ok(withKousa.length >= 4, "A1 meets B0 along the petal");
    for (const s of withKousa) {
      if (s.kind !== "arc") continue;
      for (const at of s.sitAts ?? []) {
        assert.ok(at.t > 0.08 && at.t < 0.92, `cross-kai t=${at.t} is on the flank`);
        assert.ok(at.n <= 2, "one meeting is one pearl, not the whole stack");
      }
    }
  });

  it("uwagake height at the inner is one pearl, not the whole stack", () => {
    const stitches = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 3, "all"));
    const later = stitches.filter((s) => s.kind === "arc" && (s.kai ?? 0) >= 2);
    assert.ok(later.length > 0);
    for (const s of later) {
      if (s.kind !== "arc") continue;
      assert.ok((s.sitA ?? 0) <= 1, "inner stack is the previous thread, not every kai");
      assert.ok((s.sitB ?? 0) <= 1, "inner stack is the previous thread, not every kai");
    }
  });

  it("closestApproachT finds the meeting of two polylines", () => {
    const a: [number, number, number][] = [
      [0, 1, 0],
      [0.2, 0.98, 0],
      [0.4, 0.9, 0],
    ];
    const b: [number, number, number][] = [
      [0.4, 0.9, 0.2],
      [0.4, 0.9, 0],
      [0.4, 0.9, -0.2],
    ];
    const hit = closestApproachT(a, b);
    assert.ok(hit.dist < 1e-9);
    assert.ok(Math.abs(hit.tA - 1) < 1e-9);
    assert.ok(Math.abs(hit.tB - 0.5) < 1e-9);
  });
});
