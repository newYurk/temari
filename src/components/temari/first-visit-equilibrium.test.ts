import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstVisitEquilibriumInput, solveFirstVisitEquilibrium } from './first-visit-equilibrium';

describe('first visit handed to the one-thread solver', () => {
  it('covers the recipe route with one reserve and three ordered channels', () => {
    const fixture = buildFirstVisitEquilibriumInput();
    const [thread] = fixture.input.threads;
    assert.equal(fixture.input.threads.length, 1);
    assert.equal(thread.id, 'first-visit/physical-thread-1');
    assert.equal(thread.feed?.discretization, 'equal-chord');
    assert.deepEqual(thread.channelPassages?.map(p => [p.firstNode, p.lastNode]), [
      [0, thread.channelPassages![0].lastNode],
      [thread.channelPassages![0].lastNode, thread.channelPassages![1].lastNode],
      [thread.channelPassages![1].lastNode, thread.nodes.length - 1],
    ]);
    assert.deepEqual(thread.nodes.map(n => n.fixed), thread.nodes.map((_, i) => i === 0 || i === thread.nodes.length - 1));
    assert.equal(fixture.status, 'not-certified');
  });

  it('runs the solver without calling convergence a craft result', () => {
    const solved = solveFirstVisitEquilibrium({ maxOuterIterations: 2, maxIterationsPerOuter: 40 });
    assert.equal(solved.result.threads.length, 1);
    assert.notEqual(solved.physicalAcceptance, 'certified');
    assert.ok(['not-certified', 'unresolved', 'rejected-mechanics'].includes(solved.physicalAcceptance));
  });

  it('retains the assigned material and observation cuts when the mesh is refined', () => {
    const coarse = buildFirstVisitEquilibriumInput({ stepMm: 2 });
    const fine = buildFirstVisitEquilibriumInput({ stepMm: 1 });
    const a = coarse.input.threads[0], b = fine.input.threads[0];
    assert.ok(b.nodes.length > a.nodes.length);
    assert.notEqual(coarse.laidLengthMm, fine.laidLengthMm);
    assert.equal(a.feed!.availableLengthMm, 230);
    assert.equal(b.feed!.availableLengthMm, a.feed!.availableLengthMm,
      'refinement must not create material by adding a constant reserve to a different seed length');
    assert.deepEqual(b.nodes.filter(n => n.fixed), a.nodes.filter(n => n.fixed));
    assert.deepEqual(b.channelPassages!.map(p => p.domain), a.channelPassages!.map(p => p.domain));
    assert.equal(buildFirstVisitEquilibriumInput({ availableLengthMm: 240 }).input.threads[0].feed!.availableLengthMm, 240);
    assert.throws(() => buildFirstVisitEquilibriumInput({ stepMm: 0 }), /positive/);
    assert.throws(() => buildFirstVisitEquilibriumInput({ stepMm: 1e-6 }), /sampling budget/);
    assert.throws(() => buildFirstVisitEquilibriumInput({ availableLengthMm: Infinity }), /positive/);
  });
});
