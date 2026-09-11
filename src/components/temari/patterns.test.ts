import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillKikuSewn, kikuSpec, stitchesForSlot, hitKikuSlot, kikuThetas, around, nextKagariPole, compileKiku, stitchesFromOps } from "./patterns.ts";
import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";

function merPhi(p: [number, number, number]) {
  return Math.atan2(-p[0], -p[2]);
}

function wrapDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function polar(pole: [number, number, number], p: [number, number, number]) {
  const n = Math.hypot(...pole) || 1;
  const pn = pole.map((v) => v / n) as [number, number, number];
  const qn = p.map((v) => v / (Math.hypot(...p) || 1)) as [number, number, number];
  const theta = Math.acos(Math.min(1, Math.max(-1, pn[0] * qn[0] + pn[1] * qn[1] + pn[2] * qn[2])));
  return { theta, phi: merPhi(qn) };
}

function slerp(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const th = Math.acos(d);
  if (th < 1e-4) return a;
  const s = Math.sin(th);
  const w0 = Math.sin((1 - t) * th) / s;
  const w1 = Math.sin(t * th) / s;
  const x = a[0] * w0 + b[0] * w1;
  const y = a[1] * w0 + b[1] * w1;
  const z = a[2] * w0 + b[2] * w1;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

describe("kiku on Simple 8", () => {
  it("sits on meridians, not in the wedges", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const legs = stitchesForSlot("simple", { pole: 0, ring: 0, sector: 0 }, 1);
    assert.equal(legs.length, 2);
    const step = Math.PI / 4;
    const snap = (phi: number) => {
      const k = Math.round(phi / step);
      return Math.abs(phi - k * step) < 0.04;
    };
    for (const stitch of legs) {
      assert.ok(stitch && stitch.kind === "arc");
      if (stitch.kind !== "arc") return;
      const a = polar(pole, stitch.a);
      const b = polar(pole, stitch.b);
      assert.equal(snap(a.phi), true);
      assert.equal(snap(b.phi), true);
      const dPhi = Math.abs(wrapDelta(a.phi, b.phi));
      assert.ok(Math.abs(dPhi - Math.PI / 4) < 0.05, `leg Δφ=${dPhi}`);
    }
  });

  it("GT14: inner 5 mm from the pole; first outer is the pin ⅓ from the equator", () => {
    const spec = kikuSpec("simple");
    assert.ok(Math.abs(spec.inner - unitFromMm(5)) < 1e-6);
    assert.ok(Math.abs(spec.outer - Math.PI / 3) < 1e-9);
    const first = kikuThetas(spec, 0);
    assert.ok(Math.abs(first.tOuter - spec.outer) < 1e-9, "round 0 goes to the pin");
    assert.ok(first.tOuter - first.tInner > 0.7, "first V is a long petal, not a tick");
    assert.ok(spec.inner + spec.rounds * spec.pitch <= spec.ceiling + spec.pitch);
    assert.ok(Math.abs(spec.pitch - unitFromMm(STITCH_THREAD_MM.pearl5)) < 1e-6);
  });

  it("one petal is a V of two legs that leave the meridian both ways", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const legs = stitchesForSlot("simple", { pole: 0, ring: 0, sector: 0 }, 1);
    assert.equal(legs.length, 2);
    const a = legs[0];
    const b = legs[1];
    assert.ok(a && a.kind === "arc" && b && b.kind === "arc");
    if (!a || a.kind !== "arc" || !b || b.kind !== "arc") return;
    const aA = polar(pole, a.a);
    const aB = polar(pole, a.b);
    const bA = polar(pole, b.a);
    const bB = polar(pole, b.b);
    const spanA = Math.abs(aA.theta - aB.theta);
    const spanB = Math.abs(bA.theta - bB.theta);
    assert.ok(spanA > 0.7, `leg A span ${spanA} — GT14 first V reaches the pin`);
    assert.ok(spanB > 0.7, `leg B span ${spanB}`);
    assert.ok(spanA < 1.2, `leg A still a hemisphere (${spanA})`);
    assert.ok(Math.min(aA.theta, aB.theta, bA.theta, bB.theta) > 0.1, "inner is 5 mm, not on the pole");
    const slopeA = wrapDelta(aA.phi, aB.phi) / (aB.theta - aA.theta);
    const slopeB = wrapDelta(bA.phi, bB.phi) / (bB.theta - bA.theta);
    assert.ok(slopeA * slopeB < 0, `same-way herringbone: ${slopeA} vs ${slopeB}`);
    const midA = polar(pole, slerp(a.a, a.b, 0.5));
    const startPhi = aA.theta < aB.theta ? aA.phi : aB.phi;
    let d = Math.abs(wrapDelta(midA.phi, startPhi));
    assert.ok(d > 0.08, `midpoint still on the meridian (Δφ=${d})`);
  });

  it("fills even meridians first, then odd", () => {
    const sewn = fillKikuSewn("simple");
    const ring0 = sewn.filter((e) => e.key.startsWith("0:0:"));
    const sectors = ring0.map((e) => Number(e.key.split(":")[2]));
    assert.deepEqual(sectors.slice(0, 4), [0, 2, 4, 6]);
    assert.deepEqual(sectors.slice(4, 8), [1, 3, 5, 7]);
  });

  it("GT14: one kai of A, then one kai of B, then the next kai of both", () => {
    const sewn = fillKikuSewn("simple", "out", "even");
    assert.deepEqual(
      sewn.slice(0, 4).map((e) => e.key),
      ["0:0:0", "0:0:2", "0:0:4", "0:0:6"],
    );
    assert.deepEqual(
      sewn.slice(4, 8).map((e) => e.key),
      ["0:0:1", "0:0:3", "0:0:5", "0:0:7"],
    );
    assert.deepEqual(
      sewn.slice(8, 12).map((e) => e.key),
      ["0:1:0", "0:1:2", "0:1:4", "0:1:6"],
    );
    const inward = fillKikuSewn("simple", "in", "even");
    assert.equal(inward[0]?.key, "0:0:0", "kiku ignores dir — always pole-out");
  });

  it("finishes the north pole before turning to the south", () => {
    const sewn = fillKikuSewn("simple", "out", "even", "all");
    const spec = kikuSpec("simple", "even");
    const north = spec.rounds * 8;
    assert.ok(sewn.length >= north * 2);
    for (let i = 0; i < north; i++) {
      assert.equal(sewn[i]?.key.startsWith("0:"), true, sewn[i]?.key);
    }
    assert.equal(sewn[north]?.key.startsWith("1:"), true);
    assert.equal(sewn[north]?.key, "1:0:0");
  });

  it("one pole is a choice: north only does not sew south", () => {
    const north = fillKikuSewn("simple", "out", "even", 0);
    const south = fillKikuSewn("simple", "out", "even", 1);
    const spec = kikuSpec("simple", "even");
    const per = spec.rounds * 8;
    assert.equal(north.length, per);
    assert.equal(south.length, per);
    assert.ok(north.every((e) => e.key.startsWith("0:")));
    assert.ok(south.every((e) => e.key.startsWith("1:")));
  });

  it("after north kiku, the next pole is south; not C8's six centers", () => {
    const north = stitchesFromOps(compileKiku("simple", "out", "even", 0));
    const south = stitchesFromOps(compileKiku("simple", "out", "even", 1));
    assert.equal(nextKagariPole("simple", "kiku", north, []), 1);
    assert.equal(nextKagariPole("simple", "kiku", south, north), null);
    assert.equal(nextKagariPole("c8", "kiku", north, []), null);
  });

  it("later rounds: inner one thread, outer Ozaki; mid-flank stays parallel", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const a = stitchesForSlot("simple", { pole: 0, ring: 0, sector: 0 }, 1)[0];
    const b = stitchesForSlot("simple", { pole: 0, ring: 3, sector: 0 }, 1)[0];
    assert.ok(a && a.kind === "arc" && b && b.kind === "arc");
    if (!a || a.kind !== "arc" || !b || b.kind !== "arc") return;
    const aIn = Math.min(polar(pole, a.a).theta, polar(pole, a.b).theta);
    const bIn = Math.min(polar(pole, b.a).theta, polar(pole, b.b).theta);
    const aOut = Math.max(polar(pole, a.a).theta, polar(pole, a.b).theta);
    const bOut = Math.max(polar(pole, b.a).theta, polar(pole, b.b).theta);
    assert.ok(bIn > aIn + 0.02, "inner moves out with the round");
    assert.ok(bOut > aOut + 0.02, "outer moves toward the equator");
    const spec = kikuSpec("simple");
    assert.ok(Math.abs(bIn - aIn - 3 * spec.pitch) < 1e-6, "inner steps one pearl");
    assert.ok(Math.abs(bOut - aOut - 3 * spec.stretch) < 1e-6, "outer steps Ozaki 2 mm");
    assert.ok(b.via && b.via.length > 4, "later kai is an offset path");
    const mid0 = polar(pole, slerp(a.a, a.b, 0.5));
    const midVia = b.via[Math.floor(b.via.length / 2)];
    assert.ok(midVia);
    const midN = polar(pole, midVia);
    const tan0 = (() => {
      const p0 = slerp(a.a, a.b, 0.45);
      const p1 = slerp(a.a, a.b, 0.55);
      const v = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]] as [number, number, number];
      const l = Math.hypot(...v) || 1;
      return v.map((x) => x / l) as [number, number, number];
    })();
    const tanN = (() => {
      const i = Math.floor(b.via!.length / 2);
      const p0 = b.via![i - 1]!;
      const p1 = b.via![i + 1]!;
      const v = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]] as [number, number, number];
      const l = Math.hypot(...v) || 1;
      return v.map((x) => x / l) as [number, number, number];
    })();
    const dot = tan0[0] * tanN[0] + tan0[1] * tanN[1] + tan0[2] * tanN[2];
    assert.ok(dot > 0.99, `mid-flank parallel, tan dot ${dot}`);
    assert.ok(midN.theta > mid0.theta, "offset sits further from the pole");
  });

  it("fit is Ozaki rounds to the obi, not seventeen tape layers", () => {
    const spec = kikuSpec("simple", "even", "fit");
    assert.ok(spec.fit >= 5 && spec.fit <= 10, `fit=${spec.fit}`);
    const last = kikuThetas(spec, spec.fit - 1);
    assert.ok(last.tOuter <= spec.ceiling + 1e-9, "never past the obi mark");
    assert.ok(last.tOuter > spec.outer + spec.stretch * 3, "later rounds pack past the first pin");
    const first = kikuThetas(spec, 0);
    assert.ok(last.tOuter - last.tInner > first.tOuter - first.tInner, "points stretch; flanks stay parallel");
  });

  it("hitKikuSlot asks kikuThetas, not an inward band", () => {
    const spec = kikuSpec("simple");
    const pole: [number, number, number] = [0, 1, 0];
    const first = kikuThetas(spec, 0);
    const p = around(pole, 0.5 * (first.tInner + first.tOuter), 0.1);
    const h0 = hitKikuSlot(p[0], p[1], p[2], "simple");
    assert.equal(h0?.ring, 0);

    const lastI = spec.rounds - 1;
    const last = kikuThetas(spec, lastI);
    assert.ok(last.tOuter > first.tOuter, "later rings move out");
    assert.ok(last.tOuter <= spec.ceiling + 1e-9, "never past the obi ceiling");
    const q = around(pole, 0.5 * (last.tInner + last.tOuter), 0.1);
    const hN = hitKikuSlot(q[0], q[1], q[2], "simple");
    assert.equal(hN?.ring, lastI);

    const past = around(pole, last.tOuter - spec.pitch * 0.1, 0.1);
    const hPast = hitKikuSlot(past[0], past[1], past[2], "simple");
    assert.ok(hPast, "drawn outer rows are hittable");
  });

  it("one set of one kai is four petals to the pin, not a short star", () => {
    const ops = compileKiku("simple", "out", "even", 0, 0, 1, 0);
    assert.equal(ops.length, 8);
    assert.ok(ops.every((op) => op.set === 0 && op.kai === 0));
    const outer = ops.find((op) => op.mark.t === "outer");
    assert.ok(outer);
    if (!outer) return;
    const th = Math.acos(Math.min(1, Math.max(-1, outer.mark.at[1])));
    const spec = kikuSpec("simple", "even", 1);
    assert.ok(Math.abs(th - spec.outer) < 0.02, "first corners sit on the pin, ⅓ from the equator");
    assert.ok(th > spec.inner + 0.5, "first V is long");
  });
});
