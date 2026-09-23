import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Vector3 } from "three";
import { stackBump, innerBiteJoin, outerBiteJoin, appendParkBite, closestApproachT } from "./kagari.ts";
import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";
import {
  compileKiku,
  stitchesFromOps,
  annotateSetCrossings,
  groupWorkingThreads,
  type Stitch,
} from "./patterns.ts";
import { stackedArcChainParts } from "./stitches.ts";

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

describe("GT14 A then B: later set sits over earlier at tip kousa", () => {
  function sameKaiLines(layers: number, kai: number) {
    const aOps = compileKiku("simple", "out", "even", 0, 0, layers, 0);
    const bOps = compileKiku("simple", "out", "even", 0, 4, layers, 1);
    const stripped = [...stitchesFromOps(aOps), ...stitchesFromOps(bOps)].map((s) =>
      s.kind === "arc" ? { ...s, sitMid: 0, sitMidT: undefined, sitAts: undefined } : s,
    );
    const all = annotateSetCrossings(stripped as Stitch[]);
    const lines = (set: 0 | 1) => {
      const arcs = all.filter((s): s is Extract<Stitch, { kind: "arc" }> =>
        s.kind === "arc" && s.set === set && s.kai === kai);
      const out: [number, number, number][][] = [];
      for (const chain of groupWorkingThreads(arcs)) {
        for (const geo of stackedArcChainParts(chain, "pearl5")) {
          const cl = geo.userData.centerline as Vector3[] | undefined;
          if (!cl?.length) continue;
          out.push(cl.map((p) => [p.x, p.y, p.z]));
        }
      }
      return out;
    };
    return { aLines: lines(0), bLines: lines(1) };
  }

  // Contract relaxed on 22.09 (399dece) while tuning tip hills; restored as
  // the chronology rule: the later set lies over the earlier one where they
  // meet near the tips. Night queue task 4.
  it("same kai: B centerline clears A at tip-near meetings (1 and 4 rows)", {
    todo: "renderer by chronology (night queue 6–7): at HEAD B sits under A (rB 1.0053 < rA 1.0122)",
  }, () => {
    const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
    for (const layers of [1, 4]) {
      for (let kai = 0; kai < layers; kai++) {
        const { aLines, bLines } = sameKaiLines(layers, kai);
        assert.ok(aLines.length >= 4 && bLines.length >= 4, `kai ${kai} segments`);
        let meetings = 0;
        for (const a of aLines) {
          for (const b of bLines) {
            const c = closestApproachT(a, b);
            if (c.dist > pearl * 2.2) continue;
            meetings++;
            const iA = Math.min(a.length - 1, Math.round(c.tA * (a.length - 1)));
            const iB = Math.min(b.length - 1, Math.round(c.tB * (b.length - 1)));
            const rA = Math.hypot(...a[iA]!);
            const rB = Math.hypot(...b[iB]!);
            assert.ok(rB + 1e-4 >= rA,
              `B must sit over A at same-kai tip kousa (layers=${layers} kai=${kai} rB=${rB} rA=${rA})`);
            assert.ok(rB - rA < pearl * 2.2, `soft hill, not stackClear bridge (gap=${rB - rA})`);
          }
        }
        assert.ok(meetings >= 4, `layers=${layers} kai=${kai} meetings=${meetings}`);
      }
    }
  });

  it("tip paths stay low: no staircase elbows near same-kai meetings", () => {
    const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
    const { aLines, bLines } = sameKaiLines(4, 0);
    assert.ok(aLines.length >= 4 && bLines.length >= 4);
    let meetings = 0;
    for (const a of aLines) {
      for (const b of bLines) {
        const c = closestApproachT(a, b);
        if (c.dist > pearl * 2.2) continue;
        meetings++;
        const iA = Math.min(a.length - 1, Math.round(c.tA * (a.length - 1)));
        const iB = Math.min(b.length - 1, Math.round(c.tB * (b.length - 1)));
        const rA = Math.hypot(...a[iA]!);
        const rB = Math.hypot(...b[iB]!);
        // Soft layer only — tall tip-kousa hills were the row-4 nightmare.
        assert.ok(rA < 1 + pearl * 2.2, `A tip too high (rA=${rA})`);
        assert.ok(rB < 1 + pearl * 2.2, `B tip too high (rB=${rB})`);
        assert.ok(Math.abs(rB - rA) < pearl * 1.6, `layer gap too steep (${rB - rA})`);
      }
    }
    assert.ok(meetings >= 4, `expected tip meetings, got ${meetings}`);
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
  it("stays on the mari through the cross, then goes in across the jiwari, not toward the pin", async () => {
    const THREE = await import("three");
    const { sewKagariBite } = await import("./stitches.ts");
    const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
    const r = 1 + pearl * 0.5;
    const mark = new THREE.Vector3(0, 0.5, 0.87).normalize().multiplyScalar(r);
    const from = new THREE.Vector3(0.12, 0.55, 0.82).normalize().multiplyScalar(r);
    const to = new THREE.Vector3(-0.12, 0.55, 0.82).normalize().multiplyScalar(r);
    const pts = sewKagariBite(from, mark, to, "pearl5");
    const markDot = mark.clone().normalize().dot(new THREE.Vector3(0, 1, 0));
    for (const p of pts) {
      const d = p.clone().normalize().dot(new THREE.Vector3(0, 1, 0));
      const past = Math.acos(Math.min(1, Math.max(-1, d))) - Math.acos(Math.min(1, Math.max(-1, markDot)));
      assert.ok(past < pearl * 0.12, "outer bite walked past the pin");
    }
    const mid = Math.floor(pts.length / 2);
    const arriving = pts.slice(0, mid);
    const leaving = pts.slice(mid);
    const arrivingSurf = arriving.filter((p) => p.length() >= 0.995);
    const leavingSurf = leaving.filter((p) => p.length() >= 0.995);
    assert.ok(arrivingSurf.length >= 8, `outer V dives before the cross (${arrivingSurf.length})`);
    const lastIn = arriving[arriving.length - 1]!;
    assert.ok(lastIn.length() < 0.995, `needle does not go in across the jiwari (${lastIn.length().toFixed(3)})`);
    const firstOut = leaving[0]!;
    assert.ok(firstOut.length() < 0.995, `leaving starts in the air (${firstOut.length().toFixed(3)})`);
    // Nearest 3D samples can be beside the crossing, especially as sampling
    // improves. Intersect the projected segments, then compare their heights.
    const normal = mark.clone().normalize();
    const x = new THREE.Vector3(1, 0, 0);
    const y = new THREE.Vector3().crossVectors(normal, x);
    const project = (p: InstanceType<typeof THREE.Vector3>): [number, number] =>
      [p.dot(x) / p.dot(normal), p.dot(y) / p.dot(normal)];
    const sub = (a: [number, number], b: [number, number]): [number, number] => [a[0] - b[0], a[1] - b[1]];
    const cross = (a: [number, number], b: [number, number]) => a[0] * b[1] - a[1] * b[0];
    const crossings: { aR: number; bR: number }[] = [];
    for (let i = 1; i < arriving.length; i++) {
      for (let j = 1; j < leaving.length; j++) {
        const a = project(arriving[i - 1]!);
        const b = project(leaving[j - 1]!);
        const u = sub(project(arriving[i]!), a);
        const v = sub(project(leaving[j]!), b);
        const det = cross(u, v);
        if (Math.abs(det) < 1e-16) continue;
        const w = sub(b, a);
        const s = cross(w, v) / det;
        const t = cross(w, u) / det;
        if (s < 0 || s >= 1 || t < 0 || t >= 1) continue;
        crossings.push({
          aR: THREE.MathUtils.lerp(arriving[i - 1]!.length(), arriving[i]!.length(), s),
          bR: THREE.MathUtils.lerp(leaving[j - 1]!.length(), leaving[j]!.length(), t),
        });
      }
    }
    assert.equal(crossings.length, 1, "one finite projected crossing, not merely a close pair");
    const { aR, bR } = crossings[0]!;
    assert.ok(aR >= 1, "arriving is above the wrap at the crossing");
    assert.ok(bR - aR >= pearl * 0.5, "outgoing clears incoming for the renderer's half-height section");
  });

  it("inner pickup has two buried ports, not a visible return across the bundle", async () => {
    const THREE = await import("three");
    const { sewKagariLegs } = await import("./stitches.ts");
    const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
    const r = 1 + pearl * 0.5;
    const mark = new THREE.Vector3(0.04, 0.99, 0.12).normalize().multiplyScalar(r);
    const from = new THREE.Vector3(0.055, 0.987, 0.14).normalize().multiplyScalar(r);
    const to = new THREE.Vector3(0.025, 0.987, 0.155).normalize().multiplyScalar(r);
    const { inPts, outPts } = sewKagariLegs(from, mark, to, "pearl5", undefined, undefined, true);
    const pts = [...inPts, ...outPts];
    assert.ok(inPts.at(-1)!.length() + pearl / 2 < 1, "the arriving end is fully buried");
    assert.ok(outPts[0]!.length() + pearl / 2 < 1, "the leaving end starts fully buried");
    const maxR = Math.max(...pts.map((p) => p.length()));
    assert.ok(maxR > r + 1e-4, "catch sits on the pile");
    const pole = new THREE.Vector3(0, 1, 0);
    const markDot = mark.clone().normalize().dot(pole);
    for (const p of pts) {
      assert.ok(
        p.clone().normalize().dot(pole) <= markDot + 0.02,
        "inner bite walked into the cap",
      );
    }
  });

  it("later inner pickups preserve the wide recipe ports and enter on the far side", async () => {
    const THREE = await import("three");
    const { sewKagariLegs } = await import("./stitches.ts");
    const { biteAcross } = await import("./kagari.ts");
    const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
    const r = 1 + pearl * 0.5;
    const pole = new THREE.Vector3(0, 1, 0);
    const markTh = 0.15 + 3 * pearl;
    const mark = new THREE.Vector3(0, Math.cos(markTh), Math.sin(markTh)).normalize().multiplyScalar(r);
    const from = new THREE.Vector3(0.12, Math.cos(markTh + 0.07), Math.sin(markTh + 0.07)).normalize().multiplyScalar(r);
    const to = new THREE.Vector3(-0.12, Math.cos(markTh + 0.07), Math.sin(markTh + 0.07)).normalize().multiplyScalar(r);
    // Depth≥2 keeps recipe ports (poleward + wide). Boolean true is depth 1 and
    // intentionally falls back to synthetic ±pearl ports (r0↔r1 tip-gate path).
    const bite = biteAcross([0, 1, 0], [mark.x, mark.y, mark.z], 0.71 * 4, 3);
    const { inPts, outPts } = sewKagariLegs(from, mark, to, "pearl5", bite.enter, bite.exit, 3);
    const pts = [...inPts, ...outPts];
    const enter = new THREE.Vector3(...bite.enter).normalize();
    const exit = new THREE.Vector3(...bite.exit).normalize();
    const m = mark.clone().normalize();
    const minEnter = Math.min(...pts.map((p) => p.clone().normalize().distanceTo(enter)));
    const minExit = Math.min(...pts.map((p) => p.clone().normalize().distanceTo(exit)));
    assert.ok(enter.distanceTo(exit) > pearl * 2, "catch is wide around the stack");
    assert.ok(minEnter < pearl * 0.55, "visible catch sits on the enter side of the pile");
    assert.ok(minExit < pearl * 0.55, "visible catch sits on the exit side of the pile");
    assert.ok(Math.abs(enter.dot(pole) - m.dot(pole)) < 1e-10
      && Math.abs(exit.dot(pole) - m.dot(pole)) < 1e-10,
      "catch stays at the new row mark instead of walking back toward the pole");
    const incomingPort = inPts.at(-1)!;
    const outgoingPort = outPts[0]!;
    const far = from.clone().normalize().distanceTo(enter) > from.clone().normalize().distanceTo(exit) ? enter : exit;
    const near = far === enter ? exit : enter;
    assert.ok(incomingPort.clone().normalize().distanceTo(far) < 1e-10);
    assert.ok(outgoingPort.clone().normalize().distanceTo(near) < 1e-10);
    assert.ok(incomingPort.length() + pearl / 2 < 1);
    assert.ok(outgoingPort.length() + pearl / 2 < 1);
    for (const leg of [inPts, outPts]) {
      for (let i = 1; i < leg.length; i++) {
        assert.ok(Math.abs(leg[i]!.length() - leg[i - 1]!.length()) < pearl,
          "no instantaneous radius jump to a detached bridge");
      }
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

  it("first-round inner turns are reverse pickups, not welded angles", async () => {
    const { compileKiku, stitchesFromOps } = await import("./patterns.ts");
    const { createMotifGeometryParts } = await import("./stitches.ts");
    const stitches = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 1, 0));
    const parts = createMotifGeometryParts(stitches, 0);
    try {
      assert.equal(stitches.length, 8);
      assert.equal(
        parts.length,
        8,
        "outer and first inner marks both hide a pickup; plain inner joins weld the cord into fewer pieces",
      );
      assert.ok(parts.every((part) => (part.getAttribute("position")?.count ?? 0) > 1000));
    } finally {
      parts.forEach((part) => part.dispose());
    }
  });

  it("keeps all later and closing pickups split at buried returns on both poles", async () => {
    const { compileKiku, stitchesFromOps } = await import("./patterns.ts");
    const { createMotifGeometryParts } = await import("./stitches.ts");
    for (const pole of [0, 1]) {
      for (const rounds of [1, 2, 3, 10]) {
        const stitches = stitchesFromOps(compileKiku("simple", "out", "even", pole, 0, rounds));
        const parts = createMotifGeometryParts(stitches, 0);
        assert.equal(parts.length, rounds * 16, `pole ${pole}, ${rounds} rounds: one visible flank per pickup`);
        for (const part of parts) {
          const position = part.getAttribute("position");
          assert.ok(position.count > 0);
          // A tube ring has 20 radial segments and a duplicate seam vertex.
          for (const start of [0, position.count - 21]) {
            for (let i = start; i < start + 21; i++) {
              assert.ok(Math.hypot(position.getX(i), position.getY(i), position.getZ(i)) < 1,
                `pole ${pole}, ${rounds} rounds: open tube end is visible above the mari`);
            }
          }
        }
      }
    }
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
