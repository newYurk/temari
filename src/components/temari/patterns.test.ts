import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillKikuSewn, kikuSpec, stitchesForSlot } from "./patterns.ts";
import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";

function polar(pole: [number, number, number], p: [number, number, number]) {
  const n = Math.hypot(...pole) || 1;
  const pn = pole.map((v) => v / n) as [number, number, number];
  const qn = p.map((v) => v / (Math.hypot(...p) || 1)) as [number, number, number];
  const theta = Math.acos(Math.min(1, Math.max(-1, pn[0] * qn[0] + pn[1] * qn[1] + pn[2] * qn[2])));
  const phi = Math.atan2(qn[0], qn[2]);
  return { theta, phi };
}

describe("kiku on Simple 8", () => {
  it("sits on meridians, not in the wedges", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const stitch = stitchesForSlot("simple", { pole: 0, ring: 0, sector: 0 }, 1)[0];
    assert.ok(stitch && stitch.kind === "arc");
    if (stitch.kind !== "arc") return;
    const a = polar(pole, stitch.a);
    const b = polar(pole, stitch.b);
    const step = Math.PI / 4;
    const snap = (phi: number) => {
      const k = Math.round(phi / step);
      return Math.abs(phi - k * step) < 0.04;
    };
    assert.equal(snap(a.phi), true);
    assert.equal(snap(b.phi), true);
  });

  it("starts a turn-gap from the pole and stays above the equator", () => {
    const spec = kikuSpec("simple");
    const gap = unitFromMm(2);
    assert.ok(Math.abs(spec.inner - gap) < 1e-6);
    assert.ok(spec.outer === Math.PI / 3);
    assert.ok(spec.inner + spec.rounds * spec.pitch <= spec.outer + spec.pitch);
    assert.ok(Math.abs(spec.pitch - unitFromMm(STITCH_THREAD_MM.pearl5)) < 1e-6);
  });

  it("one stitch is a long petal, not a short octagon chord", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const stitch = stitchesForSlot("simple", { pole: 0, ring: 0, sector: 0 }, 1)[0];
    assert.ok(stitch && stitch.kind === "arc");
    if (!stitch || stitch.kind !== "arc") return;
    const a = polar(pole, stitch.a);
    const b = polar(pole, stitch.b);
    const span = Math.abs(a.theta - b.theta);
    assert.ok(span > 0.7, `petal span ${span} should reach ~π/3`);
    assert.ok(Math.min(a.theta, b.theta) < 0.08, "inner sits at the 2 mm gap");
  });

  it("fills even meridians first, then odd", () => {
    const sewn = fillKikuSewn("simple");
    const ring0 = sewn.filter((e) => e.key.startsWith("0:0:"));
    const sectors = ring0.map((e) => Number(e.key.split(":")[2]));
    assert.deepEqual(sectors.slice(0, 4), [0, 2, 4, 6]);
    assert.deepEqual(sectors.slice(4, 8), [1, 3, 5, 7]);
  });
});
