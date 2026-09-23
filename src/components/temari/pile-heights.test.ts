import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pileHeights, type PileLine } from "./pile-heights";

type Vec3 = [number, number, number];

const W = 0.02;
const H = 0.01;
const opts = { width: W, height: H, portRadius: W };

function norm(p: Vec3): Vec3 {
  const l = Math.hypot(...p);
  return [p[0] / l, p[1] / l, p[2] / l];
}

/** Straight run near the north pole: x from -a to a at height offset y. */
function run(axis: "x" | "z", offset: number, n = 81, a = 0.1): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const s = -a + (2 * a * i) / (n - 1);
    return norm(axis === "x" ? [s, 1, offset] : [offset, 1, s]);
  });
}

const mid = (line: number[]) => line[Math.floor(line.length / 2)]!;

describe("pile heights: later lies on earlier (spec/pile-render.md)", () => {
  it("lifts the later of two crossing threads by the section height, the earlier not at all", () => {
    const [a, b] = pileHeights([{ points: run("x", 0) }, { points: run("z", 0) }], opts);
    assert.ok(Math.max(...a!) === 0);
    assert.ok(Math.abs(mid(b!) - H) < 1e-6, `later at crossing ${mid(b!)}`);
    assert.equal(b![0], 0);
  });

  it("does not lift a neighbour laid snug beside, one width away", () => {
    const [, b] = pileHeights([{ points: run("x", 0) }, { points: run("x", W * 1.01) }], opts);
    assert.ok(Math.max(...b!) === 0);
  });

  it("lifts a half-overlapping neighbour by the ellipse of the section", () => {
    const [, b] = pileHeights([{ points: run("x", 0) }, { points: run("x", W / 2) }], opts);
    assert.ok(Math.abs(mid(b!) - H * Math.sqrt(0.75)) < H * 0.02, `${mid(b!)}`);
  });

  it("stacks three threads crossing one point in sewing order", () => {
    const diag = run("x", 0).map(([x, y]) => norm([x, y, x]));
    const lifts = pileHeights([{ points: run("x", 0) }, { points: run("z", 0) }, { points: diag }], opts);
    assert.ok(Math.abs(mid(lifts[2]!) - 2 * H) < 1e-6, `third ${mid(lifts[2]!)}`);
  });

  it("swaps seniority for an underpassing pair", () => {
    const [a, b] = pileHeights([{ points: run("x", 0) }, { points: run("z", 0) }], { ...opts, swaps: [[0, 1]] });
    assert.ok(Math.max(...b!) === 0, "the last stitch goes under the start");
    assert.ok(Math.abs(mid(a!) - H) < 1e-6, "the start rests on it");
  });

  it("dives at its own port instead of climbing the pile", () => {
    const later: PileLine = { points: run("z", 0), ports: [norm([0, 1, 0])] };
    const [, b] = pileHeights([{ points: run("x", 0) }, later], opts);
    assert.equal(mid(b!), 0);
  });

  it("counts a sample partly down its port at the height it really is", () => {
    const sunk = (n: number, o: number) => Array.from({ length: n }, () => o);
    const earlier: PileLine = { points: run("x", 0), offset: sunk(81, -H / 2) };
    const [, over] = pileHeights([earlier, { points: run("z", 0) }], opts);
    assert.ok(Math.abs(mid(over!) - H / 2) < 1e-6, `rests on the sunk one ${mid(over!)}`);
    const later: PileLine = { points: run("z", 0), offset: sunk(81, -H / 2) };
    const [, up] = pileHeights([{ points: run("x", 0) }, later], opts);
    assert.ok(Math.abs(mid(up!) - 1.5 * H) < 1e-6, `climbs from where it is ${mid(up!)}`);
  });

  it("comes back over its own earlier stretch: the chidori X within one thread", () => {
    const loop = [...run("x", 0), ...run("z", 0)];
    const [l] = pileHeights([{ points: loop }], opts);
    const second = l!.slice(81);
    assert.ok(Math.abs(mid(second) - H) < 1e-6, `${mid(second)}`);
    assert.equal(mid(l!.slice(0, 81)), 0);
  });
});
