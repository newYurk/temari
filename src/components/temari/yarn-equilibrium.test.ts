import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateYarnEquilibrium, solveYarnEquilibrium, type EquilibriumYarn, type YarnEquilibriumInput } from './yarn-equilibrium';
import type { PointMm } from './thread-path';

const near = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}, tolerance ${tolerance}`);
const distance = (a: PointMm, b: PointMm) => Math.hypot(...a.map((v, i) => v - b[i]));
const yarn = (id: string, points: PointMm[], rest: number[], fixed = points.map((_, i) => i === 0 || i === points.length - 1)): EquilibriumYarn => ({
  id, radiusMm: .1, axialStiffnessN: 2, bendingStiffnessNmm2: .05,
  nodes: points.map((p, i) => ({ positionMm: p, fixed: fixed[i] })), restLengthsMm: rest,
});
const crossed = (): YarnEquilibriumInput => ({ threads: [
  yarn('A', [[-2, 0, .08], [0, 0, .02], [2, 0, .08]], [1.98, 1.98]),
  yarn('B', [[0, -2, -.08], [0, 0, -.02], [0, 2, -.08]], [1.98, 1.98]),
] });

describe('quasistatic discrete circular yarn: explicit elastic/contact engineering control', () => {
  it('matches a stretched bar energy and fixed-end reactions analytically', () => {
    const thread = { ...yarn('bar', [[0, 0, 0], [4, 0, 0]], [3]), axialStiffnessN: 10 };
    const result = solveYarnEquilibrium({ threads: [thread] });
    assert.equal(result.status, 'converged');
    near(result.energy.stretchNmm, 10 / 6); near(result.energy.bendNmm, 0);
    near(result.gradientN[0][0][0], -10 / 3); near(result.gradientN[0][1][0], 10 / 3);
    near(result.residuals.freeGradientNormN, 0);
    assert.deepEqual(result.threads[0].restLengthsMm, [3]);
  });

  it('relaxes a deflected stretched bar to the independent symmetric solution without resetting material', () => {
    const input: YarnEquilibriumInput = { threads: [yarn('bar', [[-2, 0, 0], [.45, .35, -.2], [2, 0, 0]], [1.8, 1.8])] };
    const original = JSON.stringify(input), initial = evaluateYarnEquilibrium(input), result = solveYarnEquilibrium(input);
    assert.equal(result.status, 'converged', JSON.stringify(result.residuals));
    assert.ok(result.energy.totalNmm < initial.energy.totalNmm);
    near(distance(result.threads[0].nodes[1].positionMm, [0, 0, 0]), 0, 1e-5);
    near(result.energy.stretchNmm, 2 * 2 / (2 * 1.8) * .2 ** 2, 1e-9);
    near(result.gradientN[0][0][0], -2 * .2 / 1.8, 1e-7);
    assert.equal(JSON.stringify(input), original);
    assert.deepEqual(result.threads[0].nodes[0], input.threads[0].nodes[0]);
    assert.deepEqual(result.threads[0].nodes[2], input.threads[0].nodes[2]);
    assert.deepEqual(result.threads[0].restLengthsMm, input.threads[0].restLengthsMm);
  });

  it('has the correct 90-degree bending energy and nodal gradient at unequal rest lengths', () => {
    const thread = { ...yarn('corner', [[0, 0, 0], [2, 0, 0], [2, 3, 0]], [3, 5], [false, false, false]),
      axialStiffnessN: .001, bendingStiffnessNmm2: 5 };
    const e = evaluateYarnEquilibrium({ threads: [thread] });
    // dual rest length = 4, E_b = B/dual for perpendicular unit tangents.
    near(e.energy.bendNmm, 1.25);
    const expected = [[.001 / 3, .625, 0], [5 / 12 - .001 / 3, -.625 + .0004, 0], [-5 / 12, -.0004, 0]];
    e.gradientN[0].forEach((p, i) => p.forEach((v, d) => near(v, expected[i][d])));
    for (let d = 0; d < 3; d++) near(e.gradientN[0].reduce((sum, g) => sum + g[d], 0), 0);
  });

  it('checks the combined elastic gradient against energy finite differences in all coordinates', () => {
    const input: YarnEquilibriumInput = { threads: [yarn('3d', [[-.4, .6, .1], [1.2, -.1, .5], [2.1, 1.3, -.4]], [1.4, 2.3], [false, false, false])] };
    const e = evaluateYarnEquilibrium(input), h = 1e-5;
    for (let i = 0; i < 3; i++) for (let d = 0; d < 3; d++) {
      const shifted = (sign: number) => ({ ...input, threads: input.threads.map(t => ({ ...t,
        nodes: t.nodes.map((n, j) => ({ ...n, positionMm: n.positionMm.map((x, k) => x + (i === j && k === d ? sign * h : 0)) as unknown as PointMm })) })) });
      const fd = (evaluateYarnEquilibrium(shifted(1)).energy.totalNmm - evaluateYarnEquilibrium(shifted(-1)).energy.totalNmm) / (2 * h);
      near(e.gradientN[0][i][d], fd, 2e-9);
    }
  });

  it('clears two crossing finite yarns with pinned ends and positive bending/stretching energy', () => {
    const input = crossed(), before = evaluateYarnEquilibrium(input), result = solveYarnEquilibrium(input);
    assert.ok(before.residuals.maxPenetrationMm > .15);
    assert.equal(result.status, 'converged', JSON.stringify({ residuals: result.residuals, diagnostics: result.diagnostics, trace: result.trace }));
    assert.ok(result.residuals.maxPenetrationMm <= 1e-5);
    assert.ok(result.residuals.freeGradientNormN <= 1e-7);
    assert.ok(result.residuals.maxComplementarityNmm <= 1e-6);
    assert.ok(result.contacts.some(c => c.multiplierN > 0));
    assert.ok(result.energy.stretchNmm > 0 && result.energy.bendNmm > 0);
    result.threads.forEach((t, i) => {
      assert.deepEqual(t.restLengthsMm, input.threads[i].restLengthsMm);
      for (const j of [0, 2]) assert.deepEqual(t.nodes[j], input.threads[i].nodes[j]);
    });
    const replay = evaluateYarnEquilibrium({ ...input, threads: result.threads }, result.contactMultipliersN);
    near(replay.residuals.freeGradientNormN, result.residuals.freeGradientNormN);
    near(replay.residuals.maxPenetrationMm, result.residuals.maxPenetrationMm);
  });

  it('is rotation covariant including the contact solve, not only its scalar energy', () => {
    // Rodrigues rotation around (1,2,3)/sqrt(14), unrelated to the input axes.
    const axis = [1, 2, 3].map(x => x / Math.sqrt(14)), c = Math.cos(.73), s = Math.sin(.73);
    const rotate = (p: PointMm): PointMm => {
      const d = p.reduce((sum, x, i) => sum + x * axis[i], 0);
      const cross = [axis[1] * p[2] - axis[2] * p[1], axis[2] * p[0] - axis[0] * p[2], axis[0] * p[1] - axis[1] * p[0]];
      return p.map((x, i) => c * x + s * cross[i] + (1 - c) * d * axis[i]) as unknown as PointMm;
    };
    const input = crossed(), rotated = { ...input, threads: input.threads.map(t => ({ ...t, nodes: t.nodes.map(n => ({ ...n, positionMm: rotate(n.positionMm) })) })) };
    const a = solveYarnEquilibrium(input), b = solveYarnEquilibrium(rotated);
    assert.equal(a.status, 'converged'); assert.equal(b.status, 'converged');
    near(a.energy.totalNmm, b.energy.totalNmm, 1e-9);
    a.threads.forEach((t, i) => t.nodes.forEach((n, j) => near(distance(rotate(n.positionMm), b.threads[i].nodes[j].positionMm), 0, 1e-5)));
  });

  it('checks the full finite segment against the sphere and keeps internal permissions explicit', () => {
    const thread = yarn('chord', [[-2, 1, 0], [2, 1, 0]], [4]);
    const input = { threads: [thread], sphere: { centerMm: [0, 0, 0] as PointMm, radiusMm: 1 } };
    const rejected = solveYarnEquilibrium(input);
    assert.equal(rejected.status, 'rejected'); near(rejected.residuals.maxPenetrationMm, .1);
    assert.ok(rejected.contacts.find(c => c.kind === 'sphere-segment')!.gapMm < 0);
    assert.ok(rejected.contacts.filter(c => c.kind === 'sphere-node').every(c => c.gapMm > 0));
    const permitted = solveYarnEquilibrium({ ...input, threads: [{ ...thread, segmentMinimumSphereRadiiMm: [.9] }] });
    assert.equal(permitted.status, 'converged');
    // Permitting nodes alone does not suppress an interior segment collision.
    assert.equal(solveYarnEquilibrium({ ...input, threads: [{ ...thread, nodes: thread.nodes.map(n => ({ ...n, minimumSphereRadiusMm: .9 })) }] }).status, 'rejected');
  });

  it('uses finite contacts, reports immovable overlaps, and never silently invents a contact normal', () => {
    const finite = { threads: [yarn('A', [[0, 0, 0], [1, 0, 0]], [1]), yarn('B', [[2, 1, 0], [2, 2, 0]], [1])] };
    near(evaluateYarnEquilibrium(finite).contacts[0].gapMm, Math.sqrt(2) - .2);
    assert.equal(solveYarnEquilibrium(finite).status, 'converged');
    const fixedCross = { threads: [yarn('A', [[-1, 0, 0], [1, 0, 0]], [2]), yarn('B', [[0, -1, 0], [0, 1, 0]], [2])] };
    assert.equal(solveYarnEquilibrium(fixedCross).status, 'rejected');
    const singular = crossed();
    const bothInPlane = { ...singular, threads: singular.threads.map(t => ({ ...t, nodes: t.nodes.map(n => ({ ...n, positionMm: [n.positionMm[0], n.positionMm[1], 0] as PointMm })) })) };
    const unresolved = solveYarnEquilibrium(bothInPlane);
    assert.equal(unresolved.status, 'unresolved');
    assert.ok(unresolved.diagnostics.some(d => d.includes('Undefined contact normal')));
  });

  it('enforces a hidden-node axis ceiling with an inward contact normal', () => {
    const base = yarn('shell', [[-.5, 1.2, 0], [0, 1.3, 0], [.5, 1.2, 0]], [.5, .5]);
    const thread = { ...base, segmentMinimumSphereRadiiMm: [0, 0],
      nodes: base.nodes.map((n, i) => i === 1 ? { ...n, minimumSphereRadiusMm: .2, maximumSphereRadiusMm: 1 } : n) };
    const input: YarnEquilibriumInput = { threads: [thread], sphere: { centerMm: [0, 0, 0], radiusMm: 1 } };
    const initial = evaluateYarnEquilibrium(input);
    near(initial.contacts.find(c => c.kind === 'sphere-node-ceiling')!.gapMm, -.3);
    const result = solveYarnEquilibrium(input);
    assert.equal(result.status, 'converged', JSON.stringify(result.residuals));
    near(distance(result.threads[0].nodes[1].positionMm, [0, 0, 0]), 1, 1e-5);
    const contact = result.contacts.find(c => c.kind === 'sphere-node-ceiling')!;
    assert.ok(contact.multiplierN > 0);
    assert.ok(result.residuals.freeGradientNormN <= 1e-7);
    assert.deepEqual(result.threads[0].nodes[0], thread.nodes[0]);
    assert.deepEqual(result.threads[0].nodes[2], thread.nodes[2]);
    assert.deepEqual(result.threads[0].restLengthsMm, [.5, .5]);
  });

  it('rejects contradictory shell bounds and does not silently ignore bounds without a sphere', () => {
    const base = yarn('shell', [[0, 1.2, 0], [1, 1.2, 0]], [1]);
    const upperOnly = { ...base, nodes: base.nodes.map(n => ({ ...n, maximumSphereRadiusMm: 1 })) };
    assert.throws(() => solveYarnEquilibrium({ threads: [upperOnly] }), /Sphere axis bounds require/);
    assert.throws(() => solveYarnEquilibrium({ threads: [upperOnly], sphere: { centerMm: [0, 0, 0], radiusMm: 1 } }), /ceiling is below/);
    const fixedOutside = { ...base, nodes: base.nodes.map(n => ({ ...n, minimumSphereRadiusMm: .2, maximumSphereRadiusMm: 1 })) };
    assert.equal(solveYarnEquilibrium({ threads: [fixedOutside], sphere: { centerMm: [0, 0, 0], radiusMm: 1 } }).status, 'rejected');
  });

  it('clips local self-contact domains instead of discarding whole nonadjacent segment pairs', () => {
    const points: PointMm[] = Array.from({ length: 5 }, (_, i) => [.5 * Math.cos(i * .2), .5 * Math.sin(i * .2), 0]);
    const rest = points.slice(1).map((p, i) => distance(points[i], p));
    const thread = yarn('arc', points, rest, points.map(() => true));
    const defaultCheck = evaluateYarnEquilibrium({ threads: [thread] });
    assert.ok(defaultCheck.contacts.length > 0, 'the remote part of the pair must still be checked');
    assert.ok(defaultCheck.contacts.every(c => c.gapMm > 0));
    // At material separation 2r a bent, regular arc has a chord shorter than 2r;
    // treating this local neighbour as an obstacle gives an artificial collision.
    const tooShort = evaluateYarnEquilibrium({ threads: [thread], options: { selfExclusionRadii: 2 } });
    assert.ok(tooShort.residuals.maxPenetrationMm > 1e-4);
  });

  it('does not exempt long coincident material merely because its segments are adjacent', () => {
    const folded = { ...yarn('folded', [[0, 0, 0], [10, 0, 0], [0, 0, 0]], [10, 10], [true, true, true]), radiusMm: .355 };
    const evaluation = evaluateYarnEquilibrium({ threads: [folded] });
    assert.equal(evaluation.contacts.length, 1);
    near(evaluation.contacts[0].gapMm, -.71);
    const result = solveYarnEquilibrium({ threads: [folded] });
    assert.equal(result.status, 'rejected');
    assert.ok(result.contacts[0].immovable);
    assert.deepEqual(result.threads[0].nodes, folded.nodes);
  });

  it('reports an exhausted iteration budget without calling it convergence', () => {
    const result = solveYarnEquilibrium({ ...crossed(), options: { maxOuterIterations: 1, maxIterationsPerOuter: 1 } });
    assert.equal(result.status, 'unresolved');
    assert.ok(result.residuals.maxPenetrationMm > 1e-5 || result.residuals.freeGradientNormN > 1e-7 || result.residuals.maxComplementarityNmm > 1e-6);
    assert.equal(result.trace.length, 1);
  });

  it('continues an unfinished inner minimization without escalating penalty or inventing contact multipliers', () => {
    const input: YarnEquilibriumInput = { threads: [
      yarn('A', [[-2, 0, .08], [.55, .3, .02], [2, 0, .08]], [1.98, 1.98]),
      yarn('B', [[0, -2, -.08], [.1, .45, -.02], [0, 2, -.08]], [1.98, 1.98]),
    ], options: { maxOuterIterations: 3, maxIterationsPerOuter: 1 } };
    const result = solveYarnEquilibrium(input);
    assert.equal(result.status, 'unresolved'); assert.equal(result.iterations, 3);
    assert.equal(result.trace.length, 3);
    for (const step of result.trace) {
      assert.equal(step.subproblemConverged, false);
      assert.ok(step.innerGradientNormN > step.innerTargetN);
      near(step.penaltyNPerMm, 10); near(step.multiplierNormN, 0);
      near(step.innerTargetN, result.trace[0].innerTargetN);
    }
    assert.ok(result.contactMultipliersN.every(x => x === 0));
    assert.ok(result.trace[2].maxPenetrationMm < result.trace[0].maxPenetrationMm, 'retained work must still make geometric progress');
  });

  it('rejects nonphysical material parameters and undefined segment tangents before solving', () => {
    const t = yarn('x', [[0, 0, 0], [1, 0, 0]], [1]);
    for (const bad of [{ ...t, bendingStiffnessNmm2: 0 }, { ...t, restLengthsMm: [0] }, { ...t, axialStiffnessN: NaN },
      { ...t, nodes: t.nodes.map(n => ({ ...n, positionMm: [0, 0, 0] as PointMm })) }]) assert.throws(() => solveYarnEquilibrium({ threads: [bad] }), RangeError);
  });

  it('fails closed on overflow even when fixed-coordinate masking would hide invalid reactions', () => {
    const cases = [
      yarn('overflow-position', [[0, 0, 0], [1e200, 0, 0]], [1], [false, false]),
      yarn('overflow-difference', [[-1e308, 0, 0], [1e308, 0, 0]], [1], [false, false]),
      yarn('overflow-fixed-reaction', [[0, 0, 0], [1, 0, 0]], [1e-320], [true, true]),
    ];
    for (const thread of cases) {
      const result = solveYarnEquilibrium({ threads: [thread] });
      assert.equal(result.status, 'unresolved', thread.id);
      assert.equal(result.numericallyValid, false, thread.id);
      assert.ok(result.diagnostics.some(d => d.includes('Non-finite')), thread.id);
      assert.equal(result.iterations, 0, thread.id);
      assert.equal(result.residuals.freeGradientNormN, Infinity, thread.id);
      assert.deepEqual(result.threads[0].restLengthsMm, thread.restLengthsMm);
      assert.deepEqual(result.threads[0].nodes, thread.nodes);
      assert.equal(evaluateYarnEquilibrium({ threads: [thread] }).numericallyValid, false);
    }
  });

  it('balances explicitly available material under straight constant tension without rewriting rest lengths', () => {
    const thread = { ...yarn('feed', [[0, 0, 0], [4, 0, 0]], [.1]), feed: { tensionN: .7, availableLengthMm: 6 } };
    const result = solveYarnEquilibrium({ threads: [thread] });
    assert.equal(result.status, 'converged'); near(result.energy.stretchNmm, 0); near(result.energy.bendNmm, 0);
    near(result.energy.tensionNmm, .7 * 4); near(result.gradientN[0][0][0], -.7); near(result.gradientN[0][1][0], .7);
    const ledger = result.materialLedger[0]; assert.equal(ledger.mode, 'sliding-inextensible-feed');
    if (ledger.mode !== 'sliding-inextensible-feed') assert.fail('wrong boundary model');
    near(ledger.laidLengthMm, 4); near(ledger.reserveLengthMm, 2);
    near(ledger.laidLengthMm + ledger.reserveLengthMm, ledger.availableLengthMm);
    assert.equal(ledger.heldNodesPermitSliding, true);
    assert.deepEqual(result.threads[0].restLengthsMm, [.1]);
    const changedReference = solveYarnEquilibrium({ threads: [{ ...thread, axialStiffnessN: 900, restLengthsMm: [100] }] });
    assert.deepEqual(changedReference.energy, result.energy);
    assert.deepEqual(changedReference.gradientN, result.gradientN);
    assert.deepEqual(changedReference.materialLedger, result.materialLedger);
  });

  it('pulls geometric slack into an external reserve while held spatial ports stay fixed', () => {
    const thread = { ...yarn('slack', [[-2, 0, 0], [.4, .5, .2], [2, 0, 0]], [1, 1]), feed: { tensionN: .2, availableLengthMm: 6 } };
    const result = solveYarnEquilibrium({ threads: [thread] });
    assert.equal(result.status, 'converged', JSON.stringify(result.residuals));
    const ledger = result.materialLedger[0]; assert.equal(ledger.mode, 'sliding-inextensible-feed');
    if (ledger.mode !== 'sliding-inextensible-feed') assert.fail('wrong boundary model');
    near(ledger.laidLengthMm, 4, 1e-7); near(ledger.reserveLengthMm, 2, 1e-7);
    assert.deepEqual(result.threads[0].nodes[0], thread.nodes[0]); assert.deepEqual(result.threads[0].nodes[2], thread.nodes[2]);
    assert.deepEqual(result.threads[0].restLengthsMm, [1, 1]);
    near(result.residuals.maxRelativeStretch, 0); near(result.energy.stretchNmm, 0);
  });

  it('uses current dual length in feed bending and differentiates its denominator', () => {
    const thread = { ...yarn('corner-feed', [[0, 0, 0], [2, 0, 0], [2, 3, 0]], [30, .2], [false, false, false]),
      bendingStiffnessNmm2: 5, feed: { tensionN: .7, availableLengthMm: 9 } };
    const e = evaluateYarnEquilibrium({ threads: [thread] });
    near(e.energy.bendNmm, 5 / (2 + 3) * 2); near(e.energy.tensionNmm, .7 * 5);
    const expected = [[-.3, 1, 0], [.3 + 2 / 3, -1.3, 0], [-2 / 3, .3, 0]];
    e.gradientN[0].forEach((p, i) => p.forEach((v, d) => near(v, expected[i][d])));
    const doubled = { ...thread, nodes: thread.nodes.map(n => ({ ...n, positionMm: n.positionMm.map(x => x * 2) as unknown as PointMm })), feed: { ...thread.feed, availableLengthMm: 18 } };
    const e2 = evaluateYarnEquilibrium({ threads: [doubled] });
    near(e2.energy.bendNmm, e.energy.bendNmm / 2); near(e2.energy.tensionNmm, e.energy.tensionNmm * 2);
  });

  it('verifies the complete feed gradient, moving self-exclusion and material-budget force by finite differences', () => {
    const thread = { ...yarn('feed-gradient', [[0, 0, 0], [1, 0, 0], [1, 1.3, .2]], [.1, 7], [false, false, false]), radiusMm: .2,
      feed: { tensionN: .7, availableLengthMm: 5 } };
    const input = { threads: [thread] }, plain = evaluateYarnEquilibrium(input);
    const lambda = plain.contacts.map(c => c.kind === 'yarn-yarn' ? .6 : c.kind === 'feed-length-budget' ? .25 : 0);
    const e = evaluateYarnEquilibrium(input, lambda), h = 1e-5;
    const lagrangian = (q: YarnEquilibriumInput) => {
      const v = evaluateYarnEquilibrium(q); return v.energy.totalNmm - v.contacts.reduce((sum, c, i) => sum + lambda[i] * c.gapMm, 0);
    };
    for (let i = 0; i < 3; i++) for (let d = 0; d < 3; d++) {
      const shifted = (sign: number) => ({ threads: [{ ...thread,
        nodes: thread.nodes.map((n, j) => ({ ...n, positionMm: n.positionMm.map((x, k) => x + (i === j && k === d ? sign * h : 0)) as unknown as PointMm })) }] });
      near(e.gradientN[0][i][d], (lagrangian(shifted(1)) - lagrangian(shifted(-1))) / (2 * h), 3e-8);
    }
    const differentReferences = evaluateYarnEquilibrium({ threads: [{ ...thread, restLengthsMm: [100, .01] }] }, lambda);
    assert.deepEqual(differentReferences.gradientN, e.gradientN);
    assert.deepEqual(differentReferences.contacts, e.contacts);
  });

  it('solves a crossing under explicit feed tension with conserved available material', () => {
    const base = crossed(), input = { ...base, threads: base.threads.map(t => ({ ...t, feed: { tensionN: .08, availableLengthMm: 5 } })) };
    const result = solveYarnEquilibrium(input);
    assert.equal(result.status, 'converged', JSON.stringify({ residuals: result.residuals, diagnostics: result.diagnostics }));
    assert.ok(result.residuals.maxPenetrationMm <= 1e-5); assert.ok(result.residuals.freeGradientNormN <= 1e-7);
    near(result.residuals.maxMaterialOverdrawMm, 0); near(result.energy.stretchNmm, 0);
    for (const ledger of result.materialLedger) {
      if (ledger.mode !== 'sliding-inextensible-feed') assert.fail('wrong boundary model');
      assert.ok(ledger.reserveLengthMm >= 0); near(ledger.laidLengthMm + ledger.reserveLengthMm, 5);
    }
    assert.deepEqual(result.threads.map(t => t.restLengthsMm), input.threads.map(t => t.restLengthsMm));
  });

  it('refuses unavailable feed material and distinguishes its budget from geometric penetration', () => {
    const thread = { ...yarn('short-feed', [[-2, 0, 0], [0, .2, 0], [2, 0, 0]], [2, 2]), feed: { tensionN: .1, availableLengthMm: 3.9 } };
    const result = solveYarnEquilibrium({ threads: [thread] });
    assert.equal(result.status, 'rejected'); assert.ok(result.diagnostics.some(d => d.includes('straight-distance lower bound')));
    assert.ok(result.residuals.maxMaterialOverdrawMm > .1); near(result.residuals.maxPenetrationMm, 0);
    const ledger = result.materialLedger[0];
    if (ledger.mode !== 'sliding-inextensible-feed') assert.fail('wrong boundary model');
    assert.ok(ledger.reserveLengthMm < 0, 'never clamp an overdrawn ledger to zero');
    for (const feed of [{ tensionN: 0, availableLengthMm: 9 }, { tensionN: .1, availableLengthMm: Infinity }])
      assert.throws(() => solveYarnEquilibrium({ threads: [{ ...thread, feed }] }), /Feed needs/);
  });
});
