import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstVisitEquilibriumInput } from './first-visit-equilibrium';
import { buildFirstVisitSnapshot, snapshotFirstVisit } from './first-visit-snapshot';
import { solveYarnEquilibrium } from './yarn-equilibrium';

describe('one first-visit coordinate state for display and checks', () => {
  it('keeps the actual discretized route, one budget and three independently checked passages', () => {
    const fixture = buildFirstVisitEquilibriumInput();
    const source = snapshotFirstVisit(fixture);
    assert.strictEqual(source.thread, fixture.input.threads[0]);
    assert.equal(source.phase, 'prepared');
    assert.equal(source.solver, null);
    assert.equal(source.acceptance, 'unresolved', 'a feasible seed is not an equilibrium');
    assert.equal(source.channelStatus, 'passed');
    assert.deepEqual(source.passages.map(p => p.audit.crossings.length), [2, 2, 2]);
    assert.equal(source.inspection.threads[0].mesh?.foldedFaces, 0);
    assert.equal(source.material.availableLengthMm, 230);
    assert.ok(Math.abs(source.material.reserveLengthMm + source.material.laidLengthMm - 230) < 1e-10);
    assert.equal(source.thread.nodes.filter(n => n.fixed).length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(source)), source, 'the displayed snapshot must survive export without another solve');
  });

  it('inspects the returned solver coordinates instead of silently displaying the seed', () => {
    const fixture = buildFirstVisitEquilibriumInput();
    const result = solveYarnEquilibrium({ ...fixture.input,
      options: { maxOuterIterations: 1, maxIterationsPerOuter: 2 } });
    const snapshot = snapshotFirstVisit(fixture, result);
    assert.equal(snapshot.phase, 'solved');
    assert.strictEqual(snapshot.thread, result.threads[0]);
    assert.notDeepEqual(snapshot.thread.nodes, fixture.input.threads[0].nodes);
    const ledger = result.materialLedger[0];
    assert.equal(ledger.mode, 'sliding-inextensible-feed');
    if (ledger.mode === 'sliding-inextensible-feed') {
      assert.ok(Math.abs(snapshot.material.laidLengthMm - ledger.laidLengthMm) < 1e-10);
      assert.ok(Math.abs(snapshot.material.reserveLengthMm - ledger.reserveLengthMm) < 1e-10);
    }
    assert.equal(snapshot.solver?.status, result.status);
    const differentMaterial = structuredClone(result);
    differentMaterial.threads[0].radiusMm /= 2;
    assert.throws(() => snapshotFirstVisit(fixture, differentMaterial), /preserve/);
    const movedCut = structuredClone(result);
    const cut = movedCut.threads[0].nodes[0].positionMm;
    movedCut.threads[0].nodes[0].positionMm = [cut[0] + 1, cut[1], cut[2]];
    assert.throws(() => snapshotFirstVisit(fixture, movedCut), /preserve/);
    // A falsely successful upstream flag cannot hide an invalid output mesh.
    const broken = structuredClone(result);
    broken.status = 'converged';
    broken.threads[0].nodes[1].positionMm = [...broken.threads[0].nodes[0].positionMm];
    assert.equal(snapshotFirstVisit(fixture, broken).acceptance, 'rejected-geometry');
    broken.threads[0].id = 'another-thread';
    assert.throws(() => snapshotFirstVisit(fixture, broken), /identity/);
  });

  it('rejects bypassing the channels even when the display mesh remains well formed', () => {
    const fixture = buildFirstVisitEquilibriumInput();
    // A far-away rigid translation preserves the mesh but removes every required passage.
    fixture.input.threads[0].nodes.forEach(n => { n.positionMm = [n.positionMm[0] + 300, n.positionMm[1], n.positionMm[2]]; });
    const snapshot = snapshotFirstVisit(fixture);
    assert.equal(snapshot.inspection.status, 'not-certified');
    assert.equal(snapshot.acceptance, 'rejected-channel');
    assert.deepEqual(snapshot.passages.map(p => p.audit.crossings.length), [0, 0, 0]);
    assert.deepEqual(buildFirstVisitSnapshot().thread.nodes, buildFirstVisitEquilibriumInput().input.threads[0].nodes,
      'a changed diagnostic must not mutate later builds');
  });
});
