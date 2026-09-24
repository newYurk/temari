import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditAssignedPassage, buildSingleNeedleEquilibriumInput,
  solveSingleNeedleEquilibrium } from './single-needle-equilibrium';

const near = (a: number, b: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

describe('one renderer-independent working thread through an assigned foundation channel', () => {
  it('keeps one material identity, one reservoir and only two observation clamps under refinement', () => {
    const coarse = buildSingleNeedleEquilibriumInput({ stepMm: .9 });
    const fine = buildSingleNeedleEquilibriumInput({ stepMm: .3 });
    assert.equal(coarse.preflight, 'passed');
    assert.equal(coarse.input.threads.length, 1);
    assert.equal(coarse.input.threads[0].id, coarse.route.threadId);
    assert.ok(fine.input.threads[0].nodes.length > 2 * coarse.input.threads[0].nodes.length);
    for (const fixture of [coarse, fine]) {
      const thread = fixture.input.threads[0];
      assert.equal(thread.nodes.filter(n => n.fixed).length, 2);
      assert.equal(thread.channelPassages?.length, 1);
      assert.equal(thread.feed?.availableLengthMm, 120);
      assert.equal(thread.feed?.discretization, 'equal-chord');
      near(thread.restLengthsMm.reduce((sum, length) => sum + length, 0), fixture.route.representedLengthMm);
      assert.equal(fixture.route.portBoundary, 'spatial-channel-not-fixed-nodes');
      assert.equal(auditAssignedPassage(thread, fixture.route.assignedPassage.domain).status, 'passed');
    }
    assert.deepEqual(coarse.route.observationCuts.map(c => c.positionMm), fine.route.observationCuts.map(c => c.positionMm));
    near(coarse.route.representedLengthMm, fine.route.representedLengthMm);
  });

  it('converges on the straight positive control without moving mouths or inventing material', () => {
    const solved = solveSingleNeedleEquilibrium({}, {
      maxOuterIterations: 6, maxIterationsPerOuter: 100,
      gradientToleranceN: 1e-5, penetrationToleranceMm: 1e-4,
    });
    assert.equal(solved.preflight, 'passed');
    assert.ok(solved.result);
    assert.equal(solved.result.status, 'converged', JSON.stringify(solved.result.residuals));
    assert.equal(solved.result.threads.length, 1);
    assert.equal(solved.result.threads[0].id, solved.route.threadId);
    assert.deepEqual(solved.result.threads[0].nodes, solved.input.threads[0].nodes);
    assert.equal(solved.passageAudit?.status, 'passed');
    assert.equal(solved.passageAudit?.crossings.length, 2);
    assert.equal(solved.passageAudit?.portsInsideChannel, true);
    assert.equal(solved.geometryInspection?.status, 'not-certified');
    assert.equal(solved.geometryInspection?.threads[0].mesh?.foldedFaces, 0);
    assert.equal(solved.physicalAcceptance, 'not-certified');
    const ledger = solved.result.materialLedger[0];
    assert.equal(ledger.mode, 'sliding-inextensible-feed');
    if (ledger.mode !== 'sliding-inextensible-feed') assert.fail();
    near(ledger.laidLengthMm, solved.route.representedLengthMm);
    near(ledger.laidLengthMm + ledger.reserveLengthMm, ledger.availableLengthMm);
    assert.equal(ledger.threadId, solved.route.threadId);
  });

  it('preserves the narrow control rejection instead of solving around fixed marking material', () => {
    const rejected = solveSingleNeedleEquilibrium({ caseId: 'narrow' });
    assert.equal(rejected.preflight, 'rejected');
    assert.equal(rejected.source.geometryStatus, 'rejected');
    assert.equal(rejected.result, null);
    assert.equal(rejected.passageAudit, null);
    assert.equal(rejected.geometryInspection, null);
    assert.equal(rejected.physicalAcceptance, 'rejected-preflight');
  });

  it('rejects undefined numerical or channel controls before constructing a route', () => {
    for (const options of [{ stepMm: 0 }, { channelMarginMm: 0 }, { feedTensionN: NaN },
      { caseId: 'unknown' as 'narrow' }]) {
      assert.throws(() => buildSingleNeedleEquilibriumInput(options), /known case and finite positive/);
    }
  });
});
