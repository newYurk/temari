import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileKiku } from "./patterns";
import { buildCrossingLedger } from "./crossing-ledger";
import type { KagariOp } from "./kagari";
import { MARI_C_CM } from "./measure";

type Vec3 = [number, number, number];

const short = (id: string) => id.replace(/^.*?\/p\d+\//, "");

function rotate(v: Vec3, axis: Vec3, ang: number): Vec3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  const x: Vec3 = [
    axis[1] * v[2] - axis[2] * v[1],
    axis[2] * v[0] - axis[0] * v[2],
    axis[0] * v[1] - axis[1] * v[0],
  ];
  return [0, 1, 2].map((i) => v[i]! * c + x[i]! * s + axis[i]! * d * (1 - c)) as Vec3;
}

function rotateOps(ops: KagariOp[], axis: Vec3, ang: number): KagariOp[] {
  const r = (v: Vec3) => rotate(v, axis, ang);
  return ops.map((op) => ({
    ...op,
    mark: { ...op.mark, at: r(op.mark.at) },
    lay: { from: r(op.lay.from), to: r(op.lay.to), via: op.lay.via?.map(r) },
    bite: { enter: r(op.bite.enter), exit: r(op.bite.exit) },
    resume: op.resume ? { at: r(op.resume.at) } : undefined,
  }));
}

describe("crossing ledger: who lies on whom, from sewing order", () => {
  const ops = compileKiku("simple", "out", "even", 0, 0, 2, "all");
  const ledger = buildCrossingLedger(ops);
  const orderOf = new Map(ledger.spans.map((s) => [s.operationId, s]));

  it("puts the later run on top everywhere except the sourced final closure", () => {
    assert.ok(ledger.crossings.length > 0);
    for (const c of ledger.crossings) {
      const top = orderOf.get(c.top)!;
      const under = orderOf.get(c.under)!;
      if (c.rule === "later-over") {
        assert.ok(top.order > under.order, `${short(c.top)} over ${short(c.under)}`);
      } else {
        // TemariKai underpassing: the last stitch of the thread's last round
        // goes under that round's start; earlier rounds step over.
        assert.ok(top.firstOfRound && under.lastOfRound && under.finalRound
          && top.threadId === under.threadId && top.kai === under.kai, `${short(c.top)} / ${short(c.under)}`);
      }
    }
    const threads = new Set(ledger.spans.map((s) => s.threadId));
    assert.equal(ledger.crossings.filter((c) => c.rule === "underpass-closure").length, threads.size);
  });

  it("crosses every catch's arriving run with its leaving run: the chidori X", () => {
    for (const next of ledger.spans) {
      if (!next.leaves) continue;
      const x = ledger.crossings.find((c) => c.chidori && c.top === next.operationId
        && c.under === next.leaves);
      assert.ok(x, `no X at ${short(next.leaves)}`);
      // A stretched lower X can sit nearer an earlier round's mark than its own.
      const mark = orderOf.get(next.leaves)!.mark.at;
      const mm = Math.acos(Math.min(1, x.at[0] * mark[0] + x.at[1] * mark[1] + x.at[2] * mark[2]))
        * (MARI_C_CM * 10) / (2 * Math.PI);
      assert.ok(mm < 3.5, `X ${mm.toFixed(2)} mm from ${short(next.leaves)}`);
    }
  });

  it("weaves A and B only because their rounds alternate (kousa)", () => {
    const setsOf = (l: typeof ledger) => {
      const byId = new Map(l.spans.map((s) => [s.operationId, s]));
      return l.crossings
        .filter((c) => byId.get(c.top)!.set !== byId.get(c.under)!.set)
        .map((c) => byId.get(c.top)!.set);
    };
    const alternating = setsOf(ledger);
    assert.ok(alternating.includes(0) && alternating.includes(1), "alternating rounds weave both ways");

    const a = compileKiku("simple", "out", "even", 0, 0, 2, 0);
    const b = compileKiku("simple", "out", "even", 0, 0, 2, 1)
      .map((op) => ({ ...op, i: op.i + a.length, over: op.over.map((k) => k + a.length) }));
    const sequential = setsOf(buildCrossingLedger([...a, ...b]));
    assert.ok(sequential.length > 0);
    assert.ok(sequential.every((set) => set === 1), "all of A first leaves B on top everywhere");
  });

  it("does not change when the whole flower is turned", () => {
    const turned = buildCrossingLedger(rotateOps(ops, [0.6, 0, 0.8], 1.1));
    const key = (l: typeof ledger) => l.crossings
      .map((c) => `${short(c.top)}>${short(c.under)}:${c.rule}:${c.poleMm.toFixed(3)}`).sort();
    assert.deepEqual(key(turned), key(ledger));
  });

  // GT14 / Toolkit uwagake: the top stitch goes around all earlier threads.
  // Masters' photos (TemariKai, Russian and Chinese classes, 23.09): the bite
  // grows ~one thread per round because the earlier legs are gathered onto
  // the line in a braid. The recipe still fans its legs at ~45°, so the
  // oldest rounds lie outside a craft-width bite (16 of 24 on four rounds).
  it("takes every later upper stitch around all the catches it declares", {
    todo: "recipe legs fan out at the upper tip; masters gather them into a braid (HANDOFF 23.09)",
  }, () => {
    for (const set of [0, "all"] as const) {
      const four = buildCrossingLedger(compileKiku("simple", "out", "even", 0, 0, 4, set));
      assert.ok(four.catches.some((k) => k.declared.length > 0));
      for (const k of four.catches) {
        assert.deepEqual(k.missed.map((m) => short(m.operationId)), [], short(k.operationId));
      }
    }
  });

  it("carries the working thread over the earlier rounds before the top stitch (uwagake)", {
    todo: "same braid: fanned legs never meet the later run at the tip (HANDOFF 23.09)",
  }, () => {
    const three = buildCrossingLedger(compileKiku("simple", "out", "even", 0, 0, 3, 0));
    const runsOf = (id: string) => new Set(three.spans
      .filter((s) => s.operationId === id || s.leaves === id).map((s) => s.operationId));
    const byId = new Map(three.spans.map((s) => [s.operationId, s]));
    for (const k of three.catches) {
      // The catch that closes the thread's last round is underpassing's.
      const span = byId.get(k.operationId)!;
      if (span.lastOfRound && span.finalRound) continue;
      for (const earlier of k.declared) {
        const under = runsOf(earlier);
        assert.ok(three.crossings.some((c) => c.top === k.operationId && under.has(c.under)),
          `${short(k.operationId)} does not come over ${short(earlier)}`);
      }
    }
  });
});
