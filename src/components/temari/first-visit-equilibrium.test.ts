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
});
