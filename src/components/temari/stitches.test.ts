import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stackBump, markTurnPast, sphereBezier, innerBiteJoin, appendParkBite } from "./kagari.ts";
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

describe("parked round still takes the inner bite", () => {
  const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);

  function v(x: number, y: number, z: number, r = 1 + pearl * 0.5): [number, number, number] {
    const len = Math.hypot(x, y, z) || 1;
    return [(x / len) * r, (y / len) * r, (z / len) * r];
  }

  function slerp(
    a: [number, number, number],
    b: [number, number, number],
    t: number,
  ): [number, number, number] {
    const na = Math.hypot(...a) || 1;
    const nb = Math.hypot(...b) || 1;
    const ua: [number, number, number] = [a[0] / na, a[1] / na, a[2] / na];
    const ub: [number, number, number] = [b[0] / nb, b[1] / nb, b[2] / nb];
    const d = Math.min(1, Math.max(-1, ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2]));
    const th = Math.acos(d);
    const r = na + (nb - na) * t;
    if (th < 1e-5) return [ua[0] * r, ua[1] * r, ua[2] * r];
    const s = Math.sin(th);
    const w0 = Math.sin((1 - t) * th) / s;
    const w1 = Math.sin(t * th) / s;
    return [(ua[0] * w0 + ub[0] * w1) * r, (ua[1] * w0 + ub[1] * w1) * r, (ua[2] * w0 + ub[2] * w1) * r];
  }

  function pathThrough(...keys: [number, number, number][]) {
    const out: [number, number, number][] = [];
    for (let s = 0; s < keys.length - 1; s++) {
      const a = keys[s]!;
      const b = keys[s + 1]!;
      const start = s === 0 ? 0 : 1;
      for (let i = start; i <= 8; i++) out.push(slerp(a, b, i / 8));
    }
    return out;
  }

  function az(p: [number, number, number]) {
    return Math.atan2(p[0], p[2]);
  }

  function wrapDelta(a: number, b: number) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  it("adds an across-jiwari U at the start meridian instead of a cusp", () => {
    const mark = v(0, Math.cos(0.2), -Math.sin(0.2));
    const right = v(0.18, Math.cos(0.38), -Math.sin(0.38));
    const left = v(-0.18, Math.cos(0.38), -Math.sin(0.38));
    const far = v(0, Math.cos(0.7), -Math.sin(0.7));
    const pts = pathThrough(mark, right, far, left, mark);
    assert.ok(pts.length > 16);
    const bitten = appendParkBite(pts, pearl);
    assert.ok(bitten.length > pts.length - 4, "bite appends the U");
    const last = bitten[bitten.length - 1]!;
    assert.ok(last[0] * right[0] > 0, "park bite aims at the departing flank");
    const markDot = mark[1] / (Math.hypot(...mark) || 1);
    for (const p of bitten.slice(-12)) {
      const n = Math.hypot(...p) || 1;
      assert.ok(p[1] / n <= markDot + 0.02, "park bite must not enter the polar cap");
    }
    let span = 0;
    for (const p of bitten.slice(-12)) {
      for (const q of bitten.slice(-12)) {
        span = Math.max(span, Math.abs(wrapDelta(az(p), az(q))));
      }
    }
    assert.ok(span > 0.04, "bite has width across the ray");
    assert.ok(span < 0.6, "park bite is a pearl U, not a noodle around the pole");
  });

  it("does not weld an open working length", () => {
    const mark = v(0, Math.cos(0.2), -Math.sin(0.2));
    const right = v(0.18, Math.cos(0.38), -Math.sin(0.38));
    const far = v(0, Math.cos(0.7), -Math.sin(0.7));
    const pts = pathThrough(mark, right, far);
    const bitten = appendParkBite(pts, pearl);
    assert.equal(bitten.length, pts.length, "open petal is left alone");
  });

  it("north park matches a mid-round inner bite after a 90° turn", () => {
    const pearlU = (phi: number) => {
      const mark = v(Math.sin(0.2) * Math.sin(phi), Math.cos(0.2), -Math.sin(0.2) * Math.cos(phi));
      const right = v(
        Math.sin(0.38) * Math.sin(phi + 0.5),
        Math.cos(0.38),
        -Math.sin(0.38) * Math.cos(phi + 0.5),
      );
      const left = v(
        Math.sin(0.38) * Math.sin(phi - 0.5),
        Math.cos(0.38),
        -Math.sin(0.38) * Math.cos(phi - 0.5),
      );
      const far = v(Math.sin(0.7) * Math.sin(phi), Math.cos(0.7), -Math.sin(0.7) * Math.cos(phi));
      return appendParkBite(pathThrough(mark, right, far, left, mark), pearl);
    };
    const north = pearlU(0);
    const east = pearlU(Math.PI / 2);
    const span = (pts: [number, number, number][]) => {
      let s = 0;
      const tail = pts.slice(-12);
      for (const p of tail) {
        for (const q of tail) s = Math.max(s, Math.abs(wrapDelta(az(p), az(q))));
      }
      return s;
    };
    assert.ok(Math.abs(span(north) - span(east)) < 0.08, "start-ray bite is not a special case");
  });
});
