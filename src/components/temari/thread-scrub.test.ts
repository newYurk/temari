import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { motifStitchPlan, type Stitch } from "./patterns.ts";
import { clipArc, lyingPetalParts } from "./stitches.ts";
import { kikuFrameTip, kikuOpeningFrame, useTemari } from "./store.ts";

const initial = useTemari.getState();

function roundName(stitch: Stitch) {
  assert.equal(stitch.kind, "arc");
  if (stitch.kind !== "arc") return "";
  if (stitch.set === 0 && stitch.kai === 0) return "A1";
  if (stitch.set === 1 && stitch.kai === 0) return "B1";
  if (stitch.set === 0 && stitch.kai === 1) return "A2";
  return `other:${stitch.set}:${stitch.kai}`;
}

function operationId(stitch: Stitch) {
  return stitch.kind === "arc" ? stitch.operation?.operationId : undefined;
}

describe("thread scrub opens A1, then B1, then A2", () => {
  afterEach(() => useTemari.setState(initial, true));

  it("arms that recipe sequence and never shows a later round early", () => {
    useTemari.setState({
      ...initial,
      mode: "studio",
      division: "simple",
      facingPole: 0,
      kagariDir: "out",
      kagariSpacing: "tight",
      kagariColors: [2, 4],
      kagariScrub: null,
      kagariPlan: [],
      kagariKept: [],
    }, true);

    const a1 = motifStitchPlan("simple", "kiku", "out", "even", 0, 2, 1, 0);
    const b1 = motifStitchPlan("simple", "kiku", "out", "even", 0, 4, 1, 1);
    const a2 = motifStitchPlan("simple", "kiku", "out", "even", 0, 2, 2, 0).slice(a1.length);
    const expected = kikuOpeningFrame("simple", "out", "even", 0, [2, 4]);
    assert.equal(a1.length, 8, "A round 0 is eight legs");
    assert.equal(b1.length, 8, "B round 0 is eight legs");
    assert.equal(a2.length, 8, "A round 1 is eight legs");
    assert.deepEqual(expected, [...a1, ...b1, ...a2]);
    assert.deepEqual(expected.map(roundName), [
      ...Array(8).fill("A1"),
      ...Array(8).fill("B1"),
      ...Array(8).fill("A2"),
    ]);
    assert.ok(a1.every((stitch) => stitch.kind === "arc" && stitch.color === 2 && stitch.bite));
    assert.ok(b1.every((stitch) => stitch.kind === "arc" && stitch.color === 4 && stitch.bite));
    assert.ok(a2.every((stitch) => stitch.kind === "arc" && stitch.color === 2 && stitch.bite));

    const stops = [0, 0.4, 1, 7.98, 8, 8.02, 12, 15.9, 16, 16.02, 20, 24, 40];
    for (const stop of stops) {
      useTemari.getState().setThreadScrub(stop);
      const state = useTemari.getState();
      assert.equal(state.kagariSpacing, "even");
      assert.equal(state.division, "simple");
      assert.equal(state.kagariKept.length, 0);
      assert.equal(state.kagariPlan.length, 24);
      assert.deepEqual(state.kagariPlan.map(operationId), expected.map(operationId));
      const x = state.kagariScrub ?? -1;
      assert.equal(x, Math.min(24, Math.max(0, stop)));
      assert.equal(state.kagariLaid, Math.floor(x));
      const shown = state.kagariPlan.slice(0, state.kagariLaid);
      const names = shown.map(roundName);
      assert.deepEqual(names, expected.slice(0, shown.length).map(roundName));
      const aCount = names.filter((name) => name === "A1").length;
      const bCount = names.filter((name) => name === "B1").length;
      const secondA = names.filter((name) => name === "A2").length;
      if (bCount > 0) assert.equal(aCount, 8, `${stop}: B starts only after A1`);
      if (secondA > 0) assert.equal(bCount, 8, `${stop}: A2 starts only after B1`);
      assert.equal(names.filter((name) => name.startsWith("other")).length, 0);
      assert.equal(kikuFrameTip(state.kagariPlan, x), roundName(expected[Math.min(23, Math.max(0, Math.ceil(x) - 1))]!));
    }

    useTemari.getState().setThreadScrub(24);
    useTemari.getState().setThreadScrub(4.5);
    const back = useTemari.getState();
    assert.equal(back.kagariScrub, 4.5);
    assert.equal(back.kagariLaid, 4);
    assert.deepEqual(back.kagariPlan.slice(0, 4).map(roundName), Array(4).fill("A1"));
    assert.equal(kikuFrameTip(back.kagariPlan, 4.5), "A1");
    assert.equal(kikuFrameTip(back.kagariPlan, 8), "A1");
    assert.equal(kikuFrameTip(back.kagariPlan, 8.02), "B1");
    assert.equal(kikuFrameTip(back.kagariPlan, 16), "B1");
    assert.equal(kikuFrameTip(back.kagariPlan, 16.02), "A2");
    assert.equal(kikuFrameTip(back.kagariPlan, 24), "A2");
  });

  it("lays the three rounds on the mari, one diameter at a crossing", () => {
    const frame = kikuOpeningFrame("simple", "out", "even", 0, [0, 1]);
    const parts = lyingPetalParts(frame);
    assert.equal(parts.length, 3);
    assert.ok(parts.every((part) => part.pts.length > 40));
    const radii = parts.flatMap((part) => part.pts.map((p) => Math.hypot(p.x, p.y, p.z)));
    const inside = Math.min(...radii);
    const outside = radii.filter((r) => r > 1);
    const base = Math.min(...outside);
    const top = Math.max(...outside);
    assert.ok(inside < 0.995, `the tip pass stays on the surface (${inside})`);
    assert.ok(base > 1 && base < 1.02, `surface thread leaves the mari (${base})`);
    assert.ok(top - base < 0.08, `stack is a staircase (${top - base})`);
    assert.ok(top > base + 0.005, "a later thread never rises at a crossing");
  });

  it("does not perform a terminal bite until the illustrated leg is complete", () => {
    const leg = kikuOpeningFrame("simple", "out", "even", 0, [0, 1])
      .find((s): s is Extract<Stitch, { kind: "arc" }> => s.kind === "arc")!;
    const original = structuredClone(leg);
    assert.ok(leg.bite);
    const partial = clipArc(leg, 0.4);
    assert.equal(partial.bite, undefined);
    assert.ok(lyingPetalParts([partial]).flatMap(part => part.pts).every(p => p.length() > 1),
      "the incomplete leg must not introduce the full buried recipe bite");
    assert.deepEqual(clipArc(leg, 1), original, "completion retains the real bite and metadata");
    assert.deepEqual(leg, original, "clipping does not change the recipe");
  });

  it("retains the entire prefix when stopping exactly at a via node", () => {
    const leg: Extract<Stitch, { kind: "arc" }> = {
      kind: "arc", color: 0, a: [1, 0, 0], b: [0, 1, 0],
      via: [[Math.sqrt(3) / 2, 0.5, 0], [0.5, Math.sqrt(3) / 2, 0]],
    };
    for (const node of [1, 2]) {
      const prefix = clipArc(leg, node / 3);
      assert.deepEqual([prefix.a, ...prefix.via!, prefix.b], [leg.a, ...leg.via!.slice(0, node)]);
    }
  });
});
