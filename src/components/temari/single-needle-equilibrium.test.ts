import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditAssignedPassage, buildSingleNeedleEquilibriumInput,
  solveSingleNeedleEquilibrium } from './single-needle-equilibrium';
import type { EquilibriumYarn } from './yarn-equilibrium';
import type { NeedleChannelDomain } from './needle-channel-clearance';
import type { PointMm } from './thread-path';

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

  it('rejects a same-mouth U-turn even with two valid sphere crossings and full segment clearance', () => {
    const y = Math.sqrt(99);
    const domain: NeedleChannelDomain = { sphereCenterMm: [0, 0, 0], bodyRadiusMm: 10,
      entryMm: [-1, y, 0], exitMm: [1, y, 0], threadRadiusMm: .1, channelRadiusMm: .2 };
    const points: PointMm[] = [[-2, y, 0], [-1, y, 0], [-2, y, .03]];
    const thread: EquilibriumYarn = { id: 'u-turn', radiusMm: .1, axialStiffnessN: 1, bendingStiffnessNmm2: .01,
      nodes: points.map(positionMm => ({ positionMm, fixed: false })), restLengthsMm: [1, Math.sqrt(1.0009)] };
    const audit = auditAssignedPassage(thread, domain);
    assert.equal(audit.crossings.length, 2); assert.equal(audit.portsInsideChannel, true);
    assert.equal(audit.hasBuriedAxis, true); assert.deepEqual(audit.outsideSegmentIndices, []);
    assert.equal(audit.status, 'rejected'); assert.equal(audit.pairing.status, 'rejected');
    assert.deepEqual(audit.pairing.crossings.map(c => c.mouth), ['entry', 'entry']);
  });

  it('uses the declared channel direction and permits the reverse route only with reversed entry/exit', () => {
    const fixture = buildSingleNeedleEquilibriumInput(), original = fixture.input.threads[0], domain = fixture.route.assignedPassage.domain;
    const forward = auditAssignedPassage(original, domain);
    assert.equal(forward.status, 'passed');
    assert.deepEqual(forward.pairing.crossings.map(c => c.mouth), ['entry', 'exit']);
    assert.deepEqual(forward.crossings.map(c => c.radialDirection), ['inward', 'outward']);
    // On the axis, the exclusion envelope has a longer chord than nominal R.
    const L = Math.hypot(...domain.exitMm.map((x, i) => x - domain.entryMm[i]));
    const halfEnvelopeChord = Math.sqrt((L / 2) ** 2
      + 2 * domain.bodyRadiusMm * domain.threadRadiusMm + domain.threadRadiusMm ** 2);
    near(forward.pairing.crossings[0].axisParameter, .5 - halfEnvelopeChord / L, 1e-8);
    near(forward.pairing.crossings[1].axisParameter, .5 + halfEnvelopeChord / L, 1e-8);
    assert.equal(forward.nominalSurface.crossings.length, 2);
    const reversed = { ...original, nodes: [...original.nodes].reverse(), restLengthsMm: [...original.restLengthsMm].reverse() };
    const wrongDirection = auditAssignedPassage(reversed, domain);
    assert.equal(wrongDirection.status, 'rejected');
    assert.deepEqual(wrongDirection.pairing.crossings.map(c => c.mouth), ['exit', 'entry']);
    const matchingDirection = auditAssignedPassage(reversed, { ...domain, entryMm: domain.exitMm, exitMm: domain.entryMm });
    assert.equal(matchingDirection.status, 'passed');
    // Returning through the same two spatial holes is another passage, not two
    // duplicate events to be erased from the audit.
    const twice = { ...original, nodes: [...original.nodes, ...reversed.nodes.slice(1)] };
    const duplicatePass = auditAssignedPassage(twice, domain);
    assert.equal(duplicatePass.crossings.length, 4); assert.equal(duplicatePass.status, 'rejected');
  });

  it('rejects an exterior detour that exits entry then enters exit instead of traversing the channel', () => {
    const y = Math.sqrt(99);
    const domain: NeedleChannelDomain = { sphereCenterMm: [0, 0, 0], bodyRadiusMm: 10,
      entryMm: [-1, y, 0], exitMm: [1, y, 0], threadRadiusMm: .1, channelRadiusMm: .2 };
    const corners: PointMm[] = [[-1, y, 0], [-2, y, 0], [-2, 11, 0], [2, 11, 0], [2, y, 0], [1, y, 0]];
    const points: PointMm[] = [corners[0]];
    for (let i = 1; i < corners.length; i++) {
      const a = corners[i - 1], b = corners[i];
      const count = Math.ceil(Math.hypot(...b.map((x, k) => x - a[k])) / .25);
      for (let j = 1; j <= count; j++) points.push(a.map((x, k) => x + j / count * (b[k] - x)) as unknown as PointMm);
    }
    const thread: EquilibriumYarn = { id: 'exterior-detour', radiusMm: .1, axialStiffnessN: 1, bendingStiffnessNmm2: .01,
      nodes: points.map(positionMm => ({ positionMm, fixed: false })),
      restLengthsMm: points.slice(1).map((p, i) => Math.hypot(...p.map((x, k) => x - points[i][k]))) };
    const audit = auditAssignedPassage(thread, domain);
    assert.equal(audit.crossings.length, 2); assert.deepEqual(audit.outsideSegmentIndices, []);
    assert.deepEqual(audit.unresolvedSegmentIndices, []); assert.equal(audit.hasBuriedAxis, true);
    assert.deepEqual(audit.pairing.crossings.map(c => c.mouth), ['entry', 'exit']);
    assert.deepEqual(audit.crossings.map(c => c.radialDirection), ['outward', 'inward']);
    assert.equal(audit.status, 'rejected');
    // Reaching the envelope at a polygonal vertex and turning back is a touch,
    // not an inward crossing followed by a distinct outward crossing.
    const mouthX = -Math.sqrt(10.1 ** 2 - y ** 2);
    const touch = auditAssignedPassage({ ...thread,
      nodes: [-2, mouthX, -2].map(x => ({ positionMm: [x, y, 0] as PointMm, fixed: false })),
      restLengthsMm: [2 + mouthX, 2 + mouthX] }, domain);
    assert.equal(touch.crossings.length, 1);
    assert.equal(touch.crossings[0].radialDirection, 'ambiguous');
    assert.equal(touch.pairing.status, 'unresolved'); assert.equal(touch.status, 'unresolved');
  });

  it('admits a shallow channel route above nominal R without relaxing the exclusion envelope or clearance', () => {
    const y = Math.sqrt(100 - .1 ** 2), shiftedY = y + .025;
    assert.ok(shiftedY > 10); // No point on this horizontal route can enter nominal R.
    const domain: NeedleChannelDomain = { sphereCenterMm: [0, 0, 0], bodyRadiusMm: 10,
      entryMm: [-.1, y, 0], exitMm: [.1, y, 0], threadRadiusMm: .1, channelRadiusMm: .15 };
    const thread: EquilibriumYarn = { id: 'shallow-offset', radiusMm: .1, axialStiffnessN: 1, bendingStiffnessNmm2: .01,
      nodes: Array.from({ length: 17 }, (_, i) => ({ positionMm: [-2 + i / 4, shiftedY, 0] as PointMm,
        fixed: i === 0 || i === 16 })), restLengthsMm: Array(16).fill(.25) };
    const audit = auditAssignedPassage(thread, domain);
    assert.equal(audit.status, 'passed'); assert.deepEqual(audit.outsideSegmentIndices, []);
    assert.deepEqual(audit.crossingSurface, { kind: 'thread-axis-exclusion-envelope', radiusMm: 10.1 });
    assert.equal(audit.crossings.length, 2); assert.equal(audit.hasBuriedAxis, true);
    assert.deepEqual(audit.pairing.crossings.map(c => c.mouth), ['entry', 'exit']);
    assert.deepEqual(audit.nominalSurface, { radiusMm: 10, crossings: [], hasBuriedAxis: false });
    const halfChord = Math.sqrt(10.1 ** 2 - shiftedY ** 2);
    near(audit.crossings[0].pointMm[0], -halfChord);
    near(audit.crossings[1].pointMm[0], halfChord);
    // The same directed crossings do not excuse leaving the assigned channel.
    const outside = { ...thread, nodes: thread.nodes.map(n => ({ ...n,
      positionMm: [n.positionMm[0], shiftedY, .2] as PointMm })) };
    const rejected = auditAssignedPassage(outside, domain);
    assert.equal(rejected.crossings.length, 2);
    assert.equal(rejected.pairing.status, 'passed');
    assert.ok(rejected.outsideSegmentIndices.length > 0); assert.equal(rejected.status, 'rejected');
  });

  it('does not certify separate mouths when the middle channel disk reaches the exterior domain', () => {
    const y = Math.sqrt(99);
    const domain: NeedleChannelDomain = { sphereCenterMm: [0, 0, 0], bodyRadiusMm: 10,
      entryMm: [-1, y, 0], exitMm: [1, y, 0], threadRadiusMm: .1, channelRadiusMm: .5 };
    const thread: EquilibriumYarn = { id: 'unseparated', radiusMm: .1, axialStiffnessN: 1, bendingStiffnessNmm2: .01,
      nodes: [-2, 2].map(x => ({ positionMm: [x, y, 0] as PointMm, fixed: false })), restLengthsMm: [4] };
    const audit = auditAssignedPassage(thread, domain);
    assert.equal(audit.crossings.length, 2); assert.deepEqual(audit.outsideSegmentIndices, []);
    assert.ok(audit.pairing.midplaneClearanceMm! < 0);
    assert.equal(audit.pairing.status, 'unresolved'); assert.equal(audit.status, 'unresolved');
    assert.match(audit.diagnostics.join(' '), /middle channel disk/);
  });

  it('returns structured rejection for degenerate nodes or channel axes without throwing', () => {
    const fixture = buildSingleNeedleEquilibriumInput(), thread = fixture.input.threads[0], domain = fixture.route.assignedPassage.domain;
    const badNodes = [
      [thread.nodes[0], thread.nodes[0]],
      [{ ...thread.nodes[0], positionMm: [NaN, 0, 0] as PointMm }, thread.nodes[1]],
    ];
    for (const nodes of badNodes) {
      const audit = auditAssignedPassage({ ...thread, nodes }, domain);
      assert.equal(audit.status, 'rejected'); assert.ok(audit.diagnostics.length > 0);
    }
    for (const exitMm of [domain.entryMm, [Infinity, 0, 0] as PointMm]) {
      const audit = auditAssignedPassage(thread, { ...domain, exitMm });
      assert.equal(audit.status, 'rejected'); assert.ok(audit.diagnostics.length > 0);
    }
  });
});
