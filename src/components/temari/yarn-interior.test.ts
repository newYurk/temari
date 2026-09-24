import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contactBarrier } from './contact-barrier';
import { evaluateYarnEquilibrium, solveYarnEquilibrium,
  type EquilibriumYarn, type YarnEquilibriumOptions } from './yarn-equilibrium';
import type { PointMm } from './thread-path';

const near = (a: number, b: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const distance = (a: PointMm, b: PointMm) => Math.hypot(...a.map((x, i) => x - b[i]));
const options: YarnEquilibriumOptions = { contactMethod: 'interior-barrier', barrierDistanceMm: .1,
  initialBarrierNmm: .001, maxOuterIterations: 12, maxIterationsPerOuter: 100 };
const ceiling = (x = 1.19): EquilibriumYarn => ({
  id: 'ceiling', radiusMm: .1, axialStiffnessN: 1, bendingStiffnessNmm2: .001,
  nodes: [
    { positionMm: [.2, 0, 0], fixed: true, minimumSphereRadiusMm: 0 },
    { positionMm: [x, 0, 0], fixed: false, minimumSphereRadiusMm: 0, maximumSphereRadiusMm: 1.2 },
  ], restLengthsMm: [2], segmentMinimumSphereRadiiMm: [0],
});
const fixedFeed = (): EquilibriumYarn => ({
  id: 'fixed-feed', radiusMm: .1, axialStiffnessN: 1, bendingStiffnessNmm2: .001,
  nodes: [{ positionMm: [0, 0, 0], fixed: true }, { positionMm: [1, 0, 0], fixed: true }],
  restLengthsMm: [1], feed: { tensionN: .05, availableLengthMm: 1.001 },
});
const sphere = { centerMm: [0, 0, 0] as PointMm, radiusMm: 1 };

describe('interior contact and numerical mesh contracts', () => {
  it('balances a repulsive ceiling reaction against an independently known elastic force', () => {
    const thread = ceiling(), result = solveYarnEquilibrium({ threads: [thread], sphere, options });
    assert.equal(result.status, 'converged', JSON.stringify(result.residuals));
    const x = result.threads[0].nodes[1].positionMm[0];
    assert.ok(x < 1.2 && x > 1.199);
    const reaction = result.contacts.find(c => c.kind === 'sphere-node-ceiling')!;
    assert.ok(reaction.gapMm > 0 && reaction.multiplierN > 0);
    // EA*(l0-l)/l0 pushes outward; the ceiling must balance it inward.
    const outwardElasticN = thread.axialStiffnessN * (2 - (x - .2)) / 2;
    near(reaction.multiplierN, outwardElasticN, 1e-7);
    const replay = evaluateYarnEquilibrium({ threads: result.threads, sphere, options },
      result.contactMultipliersN, result.meshMultipliersN);
    near(replay.residuals.freeGradientNormN, result.residuals.freeGradientNormN, 1e-12);
    assert.deepEqual(result.threads[0].nodes[0], thread.nodes[0]);
    assert.deepEqual(result.threads[0].restLengthsMm, thread.restLengthsMm);
  });

  it('does not move a zero-clearance seed or call it converged in interior mode', () => {
    const thread = ceiling(1.2), result = solveYarnEquilibrium({ threads: [thread], sphere, options });
    assert.equal(result.status, 'unresolved'); assert.equal(result.iterations, 0);
    assert.deepEqual(result.threads[0].nodes, thread.nodes);
    assert.match(result.diagnostics.join(' '), /strictly feasible seed/);
    assert.throws(() => solveYarnEquilibrium({ threads: [thread], sphere,
      options: { contactMethod: ['interior-barrier'] as unknown as YarnEquilibriumOptions['contactMethod'] } }), /Invalid contactMethod/);
  });

  it('returns reactions and the last trace at the same barrier parameter when the budget ends', () => {
    const result = solveYarnEquilibrium({ threads: [fixedFeed()], options: { ...options,
      maxOuterIterations: 1, maxIterationsPerOuter: 2 } });
    assert.equal(result.status, 'unresolved'); assert.equal(result.iterations, 0);
    const last = result.trace.at(-1)!;
    assert.equal(result.finalBarrierNmm, last.barrierNmm);
    const budget = result.contacts.find(c => c.kind === 'feed-length-budget')!;
    near(budget.multiplierN, contactBarrier(budget.gapMm, .1, result.finalBarrierNmm).forceN, 1e-12);
    near(result.residuals.maxComplementarityNmm, last.maxComplementarityNmm, 1e-12);
    near(Math.hypot(...result.contactMultipliersN), last.multiplierNormN, 1e-12);
  });

  it('fails closed on barrier overflow even when every geometric degree of freedom is held', () => {
    const thread = fixedFeed(), result = solveYarnEquilibrium({ threads: [thread], options: { ...options,
      initialBarrierNmm: Number.MAX_VALUE, maxOuterIterations: 1, maxIterationsPerOuter: 2 } });
    assert.equal(result.status, 'unresolved'); assert.equal(result.numericallyValid, false);
    assert.equal(result.iterations, 0); assert.deepEqual(result.threads[0].nodes, thread.nodes);
    assert.match(result.diagnostics.join(' '), /Non-finite/);
  });

  it('preserves a nonuniform reference metric without cancelling physical force or changing material', () => {
    const points: PointMm[] = [[0, 0, 0], [.8, .3, .1], [2.2, -.2, .3], [4, .1, 0]];
    const references = points.slice(1).map((p, i) => distance(p, points[i]));
    const thread: EquilibriumYarn = { id: 'nonuniform', radiusMm: .1, axialStiffnessN: 1, bendingStiffnessNmm2: .01,
      nodes: points.map((positionMm, i) => ({ positionMm, fixed: i === 0 || i === points.length - 1 })),
      restLengthsMm: [.9, 1.6, 1.9], feed: { tensionN: .05, availableLengthMm: 10,
        discretization: 'fixed-chord-ratios', referenceChordLengthsMm: references } };
    const initial = evaluateYarnEquilibrium({ threads: [thread] });
    assert.throws(() => evaluateYarnEquilibrium({ threads: [{ ...thread,
      feed: { ...thread.feed!, referenceChordLengthsMm: [1e308, .01, 1] } }] }), /numerical range/);
    assert.ok(initial.residuals.maxMeshSpacingErrorMm < 1e-12);
    assert.ok(initial.residuals.freePhysicalGradientNormN > .001);
    const shifted = (source: EquilibriumYarn, node: number, axis: number, amount: number): EquilibriumYarn => ({ ...source,
      nodes: source.nodes.map((n, i) => ({ ...n, positionMm: n.positionMm.map((x, d) =>
        x + (i === node && d === axis ? amount : 0)) as unknown as PointMm })) });
    const perturbed = shifted(thread, 1, 1, .12), physical = evaluateYarnEquilibrium({ threads: [perturbed] });
    assert.ok(physical.residuals.maxMeshSpacingErrorMm > .01);
    const multipliers = [.3, -.2], loaded = evaluateYarnEquilibrium({ threads: [perturbed] },
      physical.contacts.map(() => 0), multipliers);
    const meshPotential = (candidate: EquilibriumYarn) => -evaluateYarnEquilibrium({ threads: [candidate] })
      .meshConstraints.reduce((sum, c, i) => sum + multipliers[i] * c.errorMm, 0);
    for (let i = 0; i < points.length; i++) for (let d = 0; d < 3; d++) {
      const epsilon = 1e-6;
      const fd = (meshPotential(shifted(perturbed, i, d, epsilon)) - meshPotential(shifted(perturbed, i, d, -epsilon))) / (2 * epsilon);
      near(loaded.gradientN[0][i][d] - physical.gradientN[0][i][d], fd, 1e-8);
    }
    // Multiplying every reference length changes no ratios, material or motion.
    const scaled = { ...perturbed, feed: { ...perturbed.feed!, referenceChordLengthsMm: references.map(h => 7 * h) } };
    const scaledEvaluation = evaluateYarnEquilibrium({ threads: [scaled] });
    scaledEvaluation.meshConstraints.forEach((c, i) => near(c.errorMm, physical.meshConstraints[i].errorMm, 1e-12));
    assert.deepEqual(scaledEvaluation.materialLedger, physical.materialLedger);
    const solve = (candidate: EquilibriumYarn) => solveYarnEquilibrium({ threads: [candidate], options });
    const a = solve(perturbed), b = solve(scaled);
    assert.equal(a.status, 'converged'); assert.equal(b.status, 'converged');
    a.threads[0].nodes.forEach((n, i) => near(distance(n.positionMm, b.threads[0].nodes[i].positionMm), 0, 1e-8));
    assert.deepEqual(a.threads[0].restLengthsMm, thread.restLengthsMm);
    for (const result of [a, b]) {
      const ledger = result.materialLedger[0]; assert.equal(ledger.mode, 'sliding-inextensible-feed');
      if (ledger.mode !== 'sliding-inextensible-feed') assert.fail();
      near(ledger.laidLengthMm + ledger.reserveLengthMm, 10, 1e-12);
      near(ledger.laidLengthMm, distance(points[0], points.at(-1)!), 1e-8);
    }
    near(a.materialLedger[0].laidLengthMm, b.materialLedger[0].laidLengthMm, 1e-8);
  });
});
