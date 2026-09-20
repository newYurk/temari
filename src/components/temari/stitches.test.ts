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

describe("kiku mark turn is a V on the mari, not a zipper or a tail", () => {
  const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);

  function v(x: number, y: number, z: number, r = 1 + pearl * 0.5): [number, number, number] {
    const len = Math.hypot(x, y, z) || 1;
    return [(x / len) * r, (y / len) * r, (z / len) * r];
  }

  function dot(a: [number, number, number], b: [number, number, number]) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function sub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  it("outer turn does not walk toward the equator past the mark", () => {
    const mark = v(0, 0.5, 0.87);
    const from = v(0.12, 0.55, 0.82);
    const to = v(-0.12, 0.55, 0.82);
    const pts = outerBiteJoin(from, mark, to, pearl, 12);
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
    assert.ok(past < pearl * 0.15, `outer join walked ${past.toFixed(3)} past the mark — a tail, not a V`);
  });

  it("outer turn does not reverse (no W, no zipper rung)", () => {
    const mark = v(0, 0.5, 0.87);
    const from = v(0.08, 0.52, 0.85);
    const to = v(-0.08, 0.52, 0.85);
    const pts = [from, ...outerBiteJoin(from, mark, to, pearl, 12)];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = sub(pts[i]!, pts[i - 1]!);
      const b = sub(pts[i + 1]!, pts[i]!);
      assert.ok(dot(a, b) > 0, `tangent reversal at ${i} is a W / zipper`);
    }
  });

  it("hidden run under the wrap is not drawn", () => {
    const mark = v(0, 0.5, 0.87);
    const from = v(0.08, 0.52, 0.85);
    const to = v(-0.08, 0.52, 0.85);
    const outer = outerBiteJoin(from, mark, to, pearl, 12);
    const innerMark = v(0.04, 0.99, 0.12);
    const inner = innerBiteJoin(v(0.055, 0.987, 0.14), innerMark, v(0.025, 0.987, 0.155), pearl, 12);
    const floor = (pts: [number, number, number][]) => Math.min(...pts.map((p) => Math.hypot(...p)));
    assert.ok(floor(outer) >= 1, `outer join dives through the cover (${floor(outer).toFixed(3)})`);
    assert.ok(floor(inner) >= 1, `inner uwagake is buried instead of lying on the stack (${floor(inner).toFixed(3)})`);
  });

  it("inner U does not enter the polar cap", () => {
    const mark = v(0.04, 0.99, 0.12);
    const from = v(0.14, 0.97, 0.18);
    const to = v(-0.1, 0.97, 0.2);
    const pole: [number, number, number] = [0, 1, 0];
    const pts = innerBiteJoin(from, mark, to, pearl, 12);
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

  it("inner turn does not reverse into a W", () => {
    const mark = v(0.04, 0.99, 0.12);
    const from = v(0.055, 0.987, 0.14);
    const to = v(0.025, 0.987, 0.155);
    const pts = [from, ...innerBiteJoin(from, mark, to, pearl, 12)];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = sub(pts[i]!, pts[i - 1]!);
      const b = sub(pts[i + 1]!, pts[i]!);
      assert.ok(dot(a, b) > 0, `inner tangent reversal at ${i} is a W`);
    }
  });
});

describe("kagari bite goes in one side of the jiwari and out the other", () => {
  it("stays on the mari through the cross, and does not walk past the outer pin", async () => {
    const THREE = await import("three");
    const { sewKagariBite } = await import("./stitches.ts");
    const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
    const r = 1 + pearl * 0.5;
    const mark = new THREE.Vector3(0, 0.5, 0.87).normalize().multiplyScalar(r);
    const from = new THREE.Vector3(0.12, 0.55, 0.82).normalize().multiplyScalar(r);
    const to = new THREE.Vector3(-0.12, 0.55, 0.82).normalize().multiplyScalar(r);
    const pts = sewKagariBite(from, mark, to, "pearl5");
    const floor = Math.min(...pts.map((p) => p.length()));
    assert.ok(floor >= 0.995, `outer reverse pickup dives through the wrap (${floor.toFixed(3)})`);
    const markDot = mark.clone().normalize().dot(new THREE.Vector3(0, 1, 0));
    for (const p of pts) {
      const d = p.clone().normalize().dot(new THREE.Vector3(0, 1, 0));
      const past = Math.acos(Math.min(1, Math.max(-1, d))) - Math.acos(Math.min(1, Math.max(-1, markDot)));
      assert.ok(past < pearl * 0.12, "outer bite walked past the pin");
    }
    const mid = Math.floor(pts.length / 2);
    const arriving = pts.slice(0, mid);
    const leaving = pts.slice(mid);
    let best = Infinity;
    let aR = 0;
    let bR = 0;
    for (const a of arriving) {
      for (const b of leaving) {
        const d = a.distanceToSquared(b);
        if (d < best) {
          best = d;
          aR = a.length();
          bR = b.length();
        }
      }
    }
    assert.ok(aR >= 1, `arriving is already under the wrap at the cross (${aR.toFixed(3)})`);
    assert.ok(bR >= 1, `leaving is under the wrap at the cross (${bR.toFixed(3)})`);
    assert.ok(bR > aR, `leaving does not sit on arriving at the cross (${bR.toFixed(3)} vs ${aR.toFixed(3)})`);
  });

  it("inner uwagake stays on the stack and still crosses, leaving over arriving", async () => {
    const THREE = await import("three");
    const { sewKagariBite } = await import("./stitches.ts");
    const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
    const r = 1 + pearl * 0.5;
    const mark = new THREE.Vector3(0.04, 0.99, 0.12).normalize().multiplyScalar(r);
    const from = new THREE.Vector3(0.055, 0.987, 0.14).normalize().multiplyScalar(r);
    const to = new THREE.Vector3(0.025, 0.987, 0.155).normalize().multiplyScalar(r);
    const pts = sewKagariBite(from, mark, to, "pearl5", undefined, undefined, true);
    const floor = Math.min(...pts.map((p) => p.length()));
    assert.ok(floor >= 1, `inner uwagake dives through the cover (${floor.toFixed(3)})`);
    const mid = Math.floor(pts.length / 2);
    const arriving = pts.slice(0, mid);
    const leaving = pts.slice(mid);
    let best = Infinity;
    let aR = 0;
    let bR = 0;
    for (const a of arriving) {
      for (const b of leaving) {
        const d = a.distanceToSquared(b);
        if (d < best) {
          best = d;
          aR = a.length();
          bR = b.length();
        }
      }
    }
    assert.ok(bR > aR, `inner leaving does not sit on arriving (${bR.toFixed(3)} vs ${aR.toFixed(3)})`);
    const pole = new THREE.Vector3(0, 1, 0);
    const markDot = mark.clone().normalize().dot(pole);
    for (const p of pts) {
      assert.ok(
        p.clone().normalize().dot(pole) <= markDot + 0.02,
        "inner bite walked into the cap",
      );
    }
  });

  it("working start/stop tucks back under the stitch, not past the outer pin", async () => {
    const THREE = await import("three");
    const { workingThreadScoop } = await import("./stitches.ts");
    const at = new THREE.Vector3(0, 0.5, 0.87).normalize();
    const from = new THREE.Vector3(0, 0.62, 0.78).normalize();
    const pts = workingThreadScoop(at, from, "pearl5");
    assert.ok(pts.length >= 4, "scoop is a short dive, not a missing end");
    const pole = new THREE.Vector3(0, 1, 0);
    const atDot = at.dot(pole);
    for (const p of pts) {
      const d = p.clone().normalize().dot(pole);
      const past = Math.acos(Math.min(1, Math.max(-1, d))) - Math.acos(Math.min(1, Math.max(-1, atDot)));
      assert.ok(past < 0.002, "outer scoop walked past the pin toward the equator");
    }
    const last = pts[pts.length - 1]!;
    assert.ok(last.length() < 0.995, "end sits under the wrap");
  });
});
