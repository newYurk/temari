import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileKiku, groupWorkingThreads, stitchesFromOps } from "./patterns";
import { traceKagariOperations } from "./kagari-topology";

const recipeId = "kiku-8-point";
const id = (row: number, mark: string, set = 0, pole = 0) =>
  `${recipeId}/p${pole}/s${set}/r${row}/${mark}`;

describe("recipe identities survive the workshop adapter", () => {
  it("preserves exact earlier upper operations through three rows, not just a stack bit", () => {
    const arcs = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 3, 0));
    const uppers = arcs.filter(s => s.kind === "arc" && s.operation?.operationId.endsWith("/inner-2"));
    assert.equal(uppers.length, 3);
    assert.deepEqual(uppers.map(s => s.kind === "arc" ? s.operation?.overOperations : null), [
      [], [id(0, "inner-2")], [id(0, "inner-2"), id(1, "inner-2")],
    ]);
    assert.deepEqual(uppers.map(s => s.kind === "arc" ? s.operation?.previousInThread : null),
      [0, 1, 2].map(row => id(row, "outer-1")));
  });

  it("keeps the same physical thread when A is parked for B or changes colour", () => {
    const ops = compileKiku("simple", "out", "even", 0, 0, 3, "all");
    ops[16]!.color = 4;
    const traces = traceKagariOperations(ops, recipeId);
    assert.equal(traces[16]!.previousInThread, id(0, "inner-0"));
    assert.equal(traces[24]!.previousInThread, id(0, "inner-1", 1));
    assert.equal(new Set(traces.map(t => t.threadId)).size, 2);
    const onlyA = traceKagariOperations(compileKiku("simple", "out", "even", 0, 0, 3, 0), recipeId);
    assert.deepEqual(traces.filter(t => t.threadId.endsWith("/s0")).map(t => t.operationId),
      onlyA.map(t => t.operationId));
  });

  it("survives geometric grouping and JSON round-trip without losing bundle identities", () => {
    const arcs = stitchesFromOps(compileKiku("simple", "out", "even", 1, 0, 3, "all"));
    const grouped = groupWorkingThreads(arcs.filter(s => s.kind === "arc")).flat();
    assert.equal(grouped.length, arcs.length);
    assert.deepEqual(new Set(grouped.map(s => s.operation?.operationId)),
      new Set(arcs.map(s => s.kind === "arc" ? s.operation?.operationId : null)));
    const traces = arcs.map(s => s.kind === "arc" ? s.operation : null);
    const restored: typeof arcs = JSON.parse(JSON.stringify(arcs));
    assert.deepEqual(restored.map(s => s.kind === "arc" ? s.operation : null), traces);
    assert.ok(grouped.every(s => s.operation?.threadId.startsWith(`${recipeId}/p1/`)));
  });

  it("rejects missing, future, repeated, or wrong-thread targets rather than silently reducing them", () => {
    const source = () => compileKiku("simple", "out", "even", 0, 0, 3, "all");
    const missing = source(); missing[17]!.over = [999];
    assert.throws(() => stitchesFromOps(missing), /absent or not yet laid/);
    const duplicate = source(); duplicate[17]!.over = [1, 1];
    assert.throws(() => stitchesFromOps(duplicate), /Repeated bundle target/);
    const wrong = source(); wrong[17]!.over = [9];
    assert.throws(() => stitchesFromOps(wrong), /same working thread and mark/);
    const reordered = source(); [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    assert.throws(() => stitchesFromOps(reordered), /increasing execution order/);
  });
});
