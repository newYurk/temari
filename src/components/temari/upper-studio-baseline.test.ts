import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildUpperStudioBaseline, intersectPolylineSphere, probePointAgainstPriorPath,
  type StudioBaselinePart, type StudioPointMm } from "./upper-studio-baseline.ts";
import { compileKiku, stitchesFromOps } from "./patterns.ts";
import { pileParts } from "./stitches.ts";

const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const part = (order: number, pointsMm: StudioPointMm[]): StudioBaselinePart => ({
  partId: `part-${order}`, operationId: `op-${order}`, threadId: "thread", order, row: order + 1,
  mark: "test", color: 0, pointsMm, liftMm: pointsMm.map(() => 0),
});

describe("axis intersections with the sphere, independently of the studio renderer", () => {
  it("finds the two analytic intersections of a diameter and keeps their direction", () => {
    const found = intersectPolylineSphere([[-2, 0, 0], [2, 0, 0]], 1);
    assert.equal(found.length, 2);
    assert.deepEqual(found.map(c => c.pointMm), [[-1, 0, 0], [1, 0, 0]]);
    assert.deepEqual(found.map(c => c.direction), ["enter", "exit"]);
    assert.deepEqual(found.map(c => c.t), [.25, .75]);
    assert.deepEqual(found.map(c => c.alongMm), [1, 3]);
  });
  it("distinguishes tangency, a vertex shared by segments, and a later revisit", () => {
    const tangent = intersectPolylineSphere([[-2, 1, 0], [2, 1, 0]], 1);
    assert.equal(tangent.length, 1); assert.equal(tangent[0]!.direction, "tangent");
    assert.deepEqual(tangent[0]!.pointMm, [0, 1, 0]);
    const shared = intersectPolylineSphere([[-2, 0, 0], [-1, 0, 0], [0, 0, 0]], 1);
    assert.equal(shared.length, 1); assert.equal(shared[0]!.direction, "enter");
    const duplicates = intersectPolylineSphere([[-2, 0, 0], [-1, 0, 0], [-1, 0, 0], [0, 0, 0]], 1);
    assert.equal(duplicates.length, 1); assert.equal(duplicates[0]!.direction, "enter");
    const turn = intersectPolylineSphere([[-2, 0, 0], [-1, 0, 0], [-2, 0, 0]], 1);
    assert.equal(turn.length, 1); assert.equal(turn[0]!.direction, "tangent");
    const revisit = intersectPolylineSphere([[2, 0, 0], [0, 0, 0], [2, 0, 0]], 1);
    assert.equal(revisit.length, 2); assert.deepEqual(revisit.map(c => c.direction), ["enter", "exit"]);
    assert.deepEqual(revisit.map(c => c.pointMm), [[1, 0, 0], [1, 0, 0]]);
    assert.deepEqual(revisit.map(c => c.alongMm), [1, 3]);
  });
  it("is rotation/scale covariant and rejects invalid input", () => {
    const transform = ([x, y, z]: StudioPointMm): StudioPointMm => [z * 7, x * 7, y * 7];
    const expected = Math.sqrt(.75);
    const original: StudioPointMm[] = [[-2, .5, 0], [2, .5, 0]];
    const roots = intersectPolylineSphere(original.map(transform), 7);
    assert.equal(roots.length, 2);
    close(roots[0]!.pointMm[1], -7 * expected); close(roots[1]!.pointMm[1], 7 * expected);
    assert.deepEqual(intersectPolylineSphere([[2, 0, 0], [2, 0, 0]], 1), []);
    assert.deepEqual(intersectPolylineSphere([[2, 2, 0], [3, 2, 0]], 1), []);
    assert.throws(() => intersectPolylineSphere([[0, NaN, 0]], 1), RangeError);
    assert.throws(() => intersectPolylineSphere([], 0), RangeError);
  });
});

describe("finite prior-path distance diagnostics", () => {
  it("uses finite endpoints and earlier chronology, without interpreting the proxy as physics", () => {
    const prior = [part(0, [[1, 1, 0], [2, 1, 0]]), part(2, [[0, 0, 0], [0, 1, 0]])];
    const result = probePointAgainstPriorPath([0, 0, 0], prior, 1, .355);
    close(result.minAxisDistanceMm!, Math.SQRT2);
    close(result.pointToRoundEnvelopeGapMm!, Math.SQRT2 - .355);
    assert.deepEqual(result.witness?.pointMm, [1, 1, 0]);
    assert.equal(result.witness?.operationId, "op-0"); assert.equal(result.witness?.t, 0);
    assert.equal(probePointAgainstPriorPath([0, 0, 0], prior, 0).minAxisDistanceMm, null);
  });
  it("locates the interior foot and does not bridge independent parts", () => {
    const hit = probePointAgainstPriorPath([1, 2, 0], [part(0, [[0, 0, 0], [2, 0, 0]])], 1);
    close(hit.minAxisDistanceMm!, 2); close(hit.witness!.t, .5);
    const separated = [part(0, [[-3, 0, 0], [-2, 0, 0]]), part(1, [[2, 0, 0], [3, 0, 0]])];
    close(probePointAgainstPriorPath([0, 0, 0], separated, 2).minAxisDistanceMm!, 2);
  });
});

describe("current three-visit upper studio baseline", () => {
  const baseline = buildUpperStudioBaseline();
  it("extracts the specified operations and preserves chronological material identities", () => {
    assert.equal(baseline.status, "diagnostic-only");
    assert.deepEqual(baseline.visits.map(v => [v.row, v.order]), [[1, 1], [2, 9], [3, 17]]);
    assert.equal(baseline.operations.length, 9);
    assert.deepEqual(baseline.operations.map(op => op.trace.order), [0, 1, 2, 8, 9, 10, 16, 17, 18]);
    for (const v of baseline.visits) {
      assert.equal(v.operationId, `kiku-8-point/p0/s0/r${v.row - 1}/inner-2`);
      assert.equal(v.threadId, "kiku-8-point/p0/s0");
      assert.equal(v.recipe.trace.overOperations.length, v.row - 1);
      assert.ok(v.partIds.every(id => baseline.parts.some(p => p.partId === id && p.row === v.row)));
      for (const p of v.priorPathProbes) if (p.witness) assert.ok(p.witness.order < (v.row - 1) * 8);
    }
    assert.match(baseline.limitations.join(" "), /not a proven needle port/);
    assert.match(baseline.limitations.join(" "), /Negative proxy gaps do not prove physical penetration/);
  });
  it("retains actual pile polylines in millimetres and keeps recipe ports separate", () => {
    const ops = compileKiku("simple", "out", "even", 0, 0, 3, 0);
    const source = pileParts(stitchesFromOps(ops), "pearl5"), R = baseline.config.bodyRadiusMm;
    for (const p of baseline.parts) {
      const original = source[Number(p.partId.replace("studio-part-", ""))]!;
      assert.equal(p.operationId, original.at.operation!.operationId);
      assert.equal(p.order, original.at.operation!.order);
      assert.equal(p.pointsMm.length, original.pts.length);
      for (const i of [0, Math.floor(p.pointsMm.length / 2), p.pointsMm.length - 1]) {
        assert.deepEqual(p.pointsMm[i], original.pts[i]!.toArray().map(c => c * R));
      }
    }
    for (const v of baseline.visits) {
      assert.deepEqual(v.recipe.biteEnterMm, ops[v.order]!.bite.enter.map(c => c * R));
      assert.deepEqual(v.recipe.biteExitMm, ops[v.order]!.bite.exit.map(c => c * R));
      assert.ok(v.axisSphereCrossings.length > 0, "the inspected rendered path intersects the sphere");
      for (const c of v.axisSphereCrossings) close(Math.hypot(...c.pointMm), R, 1e-8);
      for (const d of v.recipeToAxis) if (d.nearestAxisCrossingIndex !== null) {
        const point = v.axisSphereCrossings[d.nearestAxisCrossingIndex]!.pointMm;
        const port = d.port === "enter" ? v.recipe.biteEnterMm : v.recipe.biteExitMm;
        close(d.distanceMm!, Math.hypot(...point.map((value, i) => value - port[i]!)));
      }
    }
  });
  it("publishes replayable height/distance witnesses, without an acceptance flag", () => {
    const allParts = new Map([...baseline.parts, ...baseline.referenceParts].map(p => [p.partId, p]));
    for (const v of baseline.visits) {
      assert.ok(v.maxHeightWitness);
      close(Math.hypot(...v.maxHeightWitness.pointMm) - baseline.config.bodyRadiusMm, v.maxAxisHeightMm!);
      const d = v.exteriorPriorDistance;
      if (v.row === 1) { assert.equal(d.minAxisDistanceMm, null); continue; }
      assert.ok(d.witness); assert.ok(d.testedSegmentPairs > 0);
      for (const witness of [...v.priorPathProbes.flatMap(p => p.witness ? [p.witness] : []), d.witness.prior]) {
        const p = allParts.get(witness.partId);
        assert.ok(p, "every prior-path witness is replayable from the exported snapshot");
        assert.equal(p.operationId, witness.operationId); assert.equal(p.order, witness.order);
        const a = p.pointsMm[witness.segment]!, b = p.pointsMm[witness.segment + 1]!;
        for (let k = 0; k < 3; k++) close(witness.pointMm[k]!, a[k]! + (b[k]! - a[k]!) * witness.t);
      }
      const a = d.witness.current.pointMm, b = d.witness.prior.pointMm;
      close(Math.hypot(...a.map((x, i) => x - b[i]!)), d.minAxisDistanceMm!);
      close(d.twoRoundEnvelopesGapMm!, d.minAxisDistanceMm! - 2 * baseline.config.roundEnvelopeRadiusMm);
      assert.ok(d.witness.prior.order < (v.row - 1) * 8);
    }
    assert.doesNotMatch(JSON.stringify(baseline), /physicsPassed|"passed"/);
    assert.deepEqual(JSON.parse(JSON.stringify(baseline)), baseline);
  });
});
