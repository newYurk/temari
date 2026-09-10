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
    const dPhi = Math.abs(((b.phi - a.phi + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    assert.ok(Math.abs(dPhi - Math.PI / 2) < 0.05 || Math.abs((((b.phi - a.phi) + Math.PI * 2) % (Math.PI * 2)) - Math.PI / 2) < 0.05);
  });

  it("upper marks sit ~1 cm from the pole, lower ⅓ up from the equator", () => {
    const spec = kikuSpec("simple");
    assert.ok(Math.abs(spec.inner - unitFromMm(10)) < 1e-6);
    assert.ok(spec.outer === Math.PI / 3);
    assert.ok(spec.inner + spec.rounds * spec.pitch <= spec.outer + spec.pitch);
    assert.ok(Math.abs(spec.pitch - unitFromMm(STITCH_THREAD_MM.pearl5)) < 1e-6);
  });

  it("one stitch is a long petal that leaves the meridian", () => {
    const pole: [number, number, number] = [0, 1, 0];
    const stitch = stitchesForSlot("simple", { pole: 0, ring: 0, sector: 0 }, 1)[0];
    assert.ok(stitch && stitch.kind === "arc");
    if (!stitch || stitch.kind !== "arc") return;
    const a = polar(pole, stitch.a);
    const b = polar(pole, stitch.b);
    const span = Math.abs(a.theta - b.theta);
    assert.ok(span > 0.55, `petal span ${span}`);
    assert.ok(Math.min(a.theta, b.theta) > 0.2, "inner is 1 cm, not 2 mm at the pole");
    const mid = polar(pole, slerp(stitch.a, stitch.b, 0.5));
    const startPhi = a.theta > b.theta ? a.phi : b.phi;
    let d = Math.abs(mid.phi - startPhi);
    if (d > Math.PI) d = Math.PI * 2 - d;
    assert.ok(d > 0.25, `midpoint still on the meridian (Δφ=${d})`);
  });

  it("fills even meridians first, then odd", () => {
    const sewn = fillKikuSewn("simple");
    const ring0 = sewn.filter((e) => e.key.startsWith("0:0:"));
    const sectors = ring0.map((e) => Number(e.key.split(":")[2]));
    assert.deepEqual(sectors.slice(0, 4), [0, 2, 4, 6]);
    assert.deepEqual(sectors.slice(4, 8), [1, 3, 5, 7]);
  });
});
