import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stackBump, innerBiteJoin, outerBiteJoin } from "./kagari.ts";
import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";

describe("thread stack is local, not a lifted petal", () => {
  it("stackBump peaks at the named sites and is ~0 on a bare mid-leg", () => {
    assert.ok(stackBump(0, 2, 0, 0) > 1.5);
    assert.ok(stackBump(1, 0, 3, 0) > 2.5);
    assert.ok(stackBump(0.5, 0, 0, 1) < 0.05, "sitMid without midT is not a hill");
    assert.ok(stackBump(0.5, 2, 0, 0) < 0.05, "mid-leg of a pole stack stays on the mari");
    assert.ok(stackBump(0.22, 0, 0, 0) === 0);
    assert.ok(stackBump(0.42, 0, 0, 1) < 0.05, "set-B crossing is a point, not a hill along the flank");
  });

  it("kousa lift is at the actual crossing, not mid-flank", () => {
    assert.ok(stackBump(0.1, 0, 0, 1, 0.1) > 0.5, "B sits on A at the kousa");
    assert.ok(stackBump(0.5, 0, 0, 1, 0.1) < 0.05, "mid-flank stays on the mari");
    assert.ok(stackBump(0.9, 0, 0, 1, 0.9) > 0.5);
    assert.ok(stackBump(0.5, 0, 0, 1, 0.9) < 0.05);
  });

  it("pearl #5 diameter is the unit of stack, not a whole-V lift", () => {
    const d = unitFromMm(STITCH_THREAD_MM.pearl5);
    assert.ok(d > 0.015 && d < 0.025);
    const midLift = stackBump(0.5, 3, 3, 0) * d;
    assert.ok(midLift < d * 0.2, "raising both ends does not levitate the leg");
  });
});

describe("kiku mark turn is a bite across the jiwari, not a U past it", () => {
  const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);

  function v(x: number, y: number, z: number, r = 1 + pearl * 0.5): [number, number, number] {
    const len = Math.hypot(x, y, z) || 1;
    return [(x / len) * r, (y / len) * r, (z / len) * r];
  }

  function dot(a: [number, number, number], b: [number, number, number]) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  it("outer bite sits just below the pin, not a tail toward the equator", () => {
    const mark = v(0, 0.5, 0.87);
    const from = v(0.12, 0.55, 0.82);
    const to = v(-0.12, 0.55, 0.82);
    const pts = outerBiteJoin(from, mark, to, pearl, 3);
    const pole: [number, number, number] = [0, 1, 0];
    const markDot = dot(
      [mark[0] / Math.hypot(...mark), mark[1] / Math.hypot(...mark), mark[2] / Math.hypot(...mark)],
      pole,
    );
    let minDot = 1;
    for (const p of pts) {
      const n = Math.hypot(...p) || 1;
      const d = dot([p[0] / n, p[1] / n, p[2] / n], pole);
      if (d < minDot) minDot = d;
    }
    const past = Math.acos(Math.min(1, Math.max(-1, minDot))) - Math.acos(Math.min(1, Math.max(-1, markDot)));
    assert.ok(past > 0, "stitch is just below the pin");
    assert.ok(past < pearl * 1.2, `outer join walked ${past.toFixed(3)} past the mark — a tail, not a kagari`);
  });

  it("outer bite is a dash across the meridian, not a loop down the ray", () => {
    const mark = v(0, 0.5, 0.87);
    const from = v(0.08, 0.52, 0.85);
    const to = v(-0.08, 0.52, 0.85);
    const pts = outerBiteJoin(from, mark, to, pearl, 3);
    const az = (p: [number, number, number]) => Math.atan2(p[0], p[2]);
    const angles = pts.map((p) => az(p));
    let span = 0;
    for (const a of angles) {
      for (const b of angles) {
        let d = Math.abs(a - b);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > span) span = d;
      }
    }
    assert.ok(span < 0.35, `outer join spanned ${(span * 180) / Math.PI}° — a U, not a bite`);
  });

  it("bite across sits under the wrap, not on top of the flower", () => {
    const mark = v(0, 0.5, 0.87);
    const from = v(0.08, 0.52, 0.85);
    const to = v(-0.08, 0.52, 0.85);
    const outer = outerBiteJoin(from, mark, to, pearl, 3);
    const innerMark = v(0.04, 0.99, 0.12);
    const inner = innerBiteJoin(v(0.055, 0.987, 0.14), innerMark, v(0.025, 0.987, 0.155), pearl, 4);
    const under = (pts: [number, number, number][]) => {
      const mid = pts[Math.floor(pts.length / 2)]!;
      return Math.hypot(...mid);
    };
    assert.ok(under(outer) < 1, `outer hidden path is on top of the maki (${under(outer).toFixed(3)})`);
    assert.ok(under(inner) < 1, `inner hidden path is on top of the maki (${under(inner).toFixed(3)})`);
  });

  it("inner U does not enter the polar cap", () => {
    const mark = v(0.04, 0.99, 0.12);
    const from = v(0.14, 0.97, 0.18);
    const to = v(-0.1, 0.97, 0.2);
    const pole: [number, number, number] = [0, 1, 0];
    const pts = innerBiteJoin(from, mark, to, pearl, 4);
    const markDot = dot(
      [mark[0] / Math.hypot(...mark), mark[1] / Math.hypot(...mark), mark[2] / Math.hypot(...mark)],
      pole,
    );
    for (const p of pts) {
      const n = Math.hypot(...p) || 1;
      const d = dot([p[0] / n, p[1] / n, p[2] / n], pole);
      assert.ok(d <= markDot + 0.02, "macaroni: inner turn went closer to the pole than the stitch");
    }
  });

  it("inner bite is a dash across the meridian, not a quarter-ring around the pole", () => {
    const mark = v(0.04, 0.99, 0.12);
    const from = v(0.055, 0.987, 0.14);
    const to = v(0.025, 0.987, 0.155);
    const pts = innerBiteJoin(from, mark, to, pearl, 4);
    const az = (p: [number, number, number]) => Math.atan2(p[0], p[2]);
    const angles = pts.map((p) => az(p));
    let span = 0;
    for (const a of angles) {
      for (const b of angles) {
        let d = Math.abs(a - b);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > span) span = d;
      }
    }
    assert.ok(span < 0.35, `macaroni from above: inner join spanned ${(span * 180) / Math.PI}° around the pole`);
  });
});
