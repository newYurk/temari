import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { motifStitchPlan, type Stitch } from "./patterns.ts";
import { arcPath, pileParts } from "./stitches.ts";

type Arc = Extract<Stitch, { kind: "arc" }>;

/** Rows as the workshop adds them (`kikuExtra`): per row set A, then set B, each row in its own colour. */
function rows(colors: readonly number[]): Stitch[] {
  const out: Stitch[] = [];
  colors.forEach((color, i) => {
    const layer = i + 1;
    for (const set of [0, 1] as const) {
      const plan = motifStitchPlan("simple", "kiku", "out", "even", 0, color, layer, set);
      const prev = motifStitchPlan("simple", "kiku", "out", "even", 0, color, layer - 1, set);
      out.push(...plan.slice(prev.length));
    }
  });
  return out;
}

/** The stitch whose own path runs closest to the middle of a drawn piece. */
function nearestArc(arcs: Arc[], p: Vector3) {
  const u = p.clone().normalize();
  let best: { d: number; s: Arc } | null = null;
  for (const s of arcs) {
    for (const q of arcPath(s, "pearl5")) {
      const d = q.clone().normalize().distanceTo(u);
      if (!best || d < best.d) best = { d, s };
    }
  }
  return best!.s;
}

describe("pile parts belong to the stitch they are drawn along", () => {
  it("draws every row in its own colour where a round starts and ends", () => {
    const stitches = rows([1, 2, 3]);
    const arcs = stitches.filter((s): s is Arc => s.kind === "arc");
    const wrong: string[] = [];
    for (const part of pileParts(stitches, "pearl5")) {
      const near = nearestArc(arcs, part.pts[Math.floor(part.pts.length / 2)]!);
      if (near.color !== part.color) wrong.push(`${near.operation?.operationId}: drawn ${part.color}, sewn ${near.color}`);
    }
    assert.deepEqual(wrong, [], "a new colour is a new thread (spec/thread-identity.md)");
  });

  it("stacks each piece at the time of its own stitch, also in one colour", () => {
    const stitches = rows([1, 1, 1]);
    const arcs = stitches.filter((s): s is Arc => s.kind === "arc");
    const wrong: string[] = [];
    for (const part of pileParts(stitches, "pearl5")) {
      const near = nearestArc(arcs, part.pts[Math.floor(part.pts.length / 2)]!);
      const own = near.operation?.operationId;
      if (own !== part.at.operation?.operationId) wrong.push(`${own} stacked as ${part.at.operation?.operationId}`);
    }
    assert.deepEqual(wrong, []);
  });
});
