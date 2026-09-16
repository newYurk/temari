import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stackBump, markTurnPast, sphereBezier, smallCircleJoin } from "./kagari.ts";
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

describe("kiku mark turn is a U around the vertex, not a diamond", () => {
  const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);

  function v(x: number, y: number, z: number, r = 1 + pearl * 0.5): [number, number, number] {
    const len = Math.hypot(x, y, z) || 1;
    return [(x / len) * r, (y / len) * r, (z / len) * r];
  }

  function sub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function dot(a: [number, number, number], b: [number, number, number]) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  it("past sits on the tip side of the mark, not across the jiwari", () => {
    const mark = v(0, 0.5, 0.87);
    const from = v(0.12, 0.55, 0.82);
    const to = v(-0.12, 0.55, 0.82);
    const past = markTurnPast(from, mark, to, pearl);
    const open = sub(from, mark);
    open[0] += to[0] - mark[0];
    open[1] += to[1] - mark[1];
    open[2] += to[2] - mark[2];
    const tip = sub(past, mark);
    assert.ok(dot(tip, open) < 0, "past is opposite the open V");
    const d = Math.hypot(...sub(past, mark));
    assert.ok(d > pearl * 0.4, "turn has pearl room past the vertex");
    const across: [number, number, number] = [mark[1] * 0 - mark[2] * 1, mark[2] * 0 - mark[0] * 0, mark[0] * 1 - mark[1] * 0];
    const al = Math.hypot(...across) || 1;
    const pn = Math.hypot(...past) || 1;
    assert.ok(Math.abs(dot([past[0] / pn, past[1] / pn, past[2] / pn], [across[0] / al, across[1] / al, across[2] / al])) < 0.15, "U is along the ray, not across it");
  });

  it("bezier through the past does not reverse (no cusp, no diamond)", () => {
    const mark = v(0, 0.5, 0.87);
    const from = v(0.12, 0.55, 0.82);
    const to = v(-0.12, 0.55, 0.82);
    const past = markTurnPast(from, mark, to, pearl);
    const pts = [from, ...sphereBezier(from, past, to, 12)];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = sub(pts[i]!, pts[i - 1]!);
      const b = sub(pts[i + 1]!, pts[i]!);
      assert.ok(dot(a, b) > 0, `tangent reversal at ${i} would draw a diamond`);
    }
  });

  it("inner U does not enter the polar cap", () => {
    const mark = v(0.04, 0.99, 0.12);
    const from = v(0.14, 0.97, 0.18);
    const to = v(-0.1, 0.97, 0.2);
    const pole: [number, number, number] = [0, 1, 0];
    const pts = smallCircleJoin(from, to, pole, 6);
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
});
