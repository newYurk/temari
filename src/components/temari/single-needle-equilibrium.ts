import { pointNeedleChannelClearance, segmentNeedleChannelClearance,
  type NeedleChannelDomain } from './needle-channel-clearance';
import { buildSingleNeedleCatch, type NeedleCatchCase } from './single-needle-catch';
import type { PointMm } from './thread-path';
import { evaluateYarnEquilibrium, solveYarnEquilibrium, type EquilibriumYarn,
  type YarnEquilibriumInput, type YarnEquilibriumOptions } from './yarn-equilibrium';
import { inspectEquilibriumGeometry } from './yarn-equilibrium-validation';

export const SINGLE_NEEDLE_EQUILIBRIUM_MODEL = 'single-needle-spatial-channel-equilibrium-v1' as const;
export type SingleNeedleEquilibriumOptions = {
  caseId?: NeedleCatchCase;
  suppliedLengthMm?: number;
  stepMm?: number;
  axialStiffnessN?: number;
  bendingStiffnessNmm2?: number;
  feedTensionN?: number;
  /** Radial clearance beyond the round yarn radius inside the assigned channel. */
  channelMarginMm?: number;
};

const distance = (a: PointMm, b: PointMm) => Math.hypot(...a.map((x, i) => x - b[i]!));
const finitePositive = (n: number) => Number.isFinite(n) && n > 0;

export function buildSingleNeedleEquilibriumInput(options: SingleNeedleEquilibriumOptions = {}) {
  const parameters = {
    caseId: options.caseId ?? 'clearance-control' as NeedleCatchCase,
    suppliedLengthMm: options.suppliedLengthMm ?? 60,
    stepMm: options.stepMm ?? .6,
    axialStiffnessN: options.axialStiffnessN ?? 10,
    bendingStiffnessNmm2: options.bendingStiffnessNmm2 ?? .001,
    feedTensionN: options.feedTensionN ?? .05,
    channelMarginMm: options.channelMarginMm ?? .05,
  };
  if (!['clearance-control', 'narrow'].includes(parameters.caseId)
    || ![parameters.suppliedLengthMm, parameters.stepMm, parameters.axialStiffnessN,
      parameters.bendingStiffnessNmm2, parameters.feedTensionN, parameters.channelMarginMm].every(finitePositive)) {
    throw new RangeError('A known case and finite positive equilibrium controls are required.');
  }
  const source = buildSingleNeedleCatch(parameters.caseId, parameters.suppliedLengthMm);
  const entry = source.channel.ports.entry.positionMm, exit = source.channel.ports.exit.positionMm;
  const axisLengthMm = distance(entry, exit);
  const axis = exit.map((x, i) => (x - entry[i]!) / axisLengthMm) as unknown as PointMm;
  // Observe only the straight local pass. The existing prescribed exterior
  // branches and free tail remain visible context, but they are not silently
  // imported as mechanical boundary data.
  const start = entry.map((x, i) => x - source.parameters.exteriorHandleMm * axis[i]!) as unknown as PointMm;
  const end = exit.map((x, i) => x + source.parameters.exteriorHandleMm * axis[i]!) as unknown as PointMm;
  const representedLengthMm = distance(start, end);
  const segmentCount = Math.max(2, Math.ceil(representedLengthMm / parameters.stepMm));
  const pointsMm = Array.from({ length: segmentCount + 1 }, (_, i) =>
    start.map((x, d) => x + i / segmentCount * (end[d]! - x)) as unknown as PointMm);
  if (pointsMm.some((p, i) => i > 0 && distance(p, pointsMm[i - 1]!) < 1e-9)) {
    throw new Error('The sampled working-thread route contains a coincident segment.');
  }
  const threadId = source.spans[0]?.threadId;
  if (!threadId || source.spans.some(span => span.threadId !== threadId)) {
    throw new Error('One observed pass must retain one physical thread identity.');
  }
  const domain: NeedleChannelDomain = {
    sphereCenterMm: [0, 0, 0],
    bodyRadiusMm: source.parameters.R,
    entryMm: source.channel.ports.entry.positionMm,
    exitMm: source.channel.ports.exit.positionMm,
    channelRadiusMm: source.parameters.rThread + parameters.channelMarginMm,
    threadRadiusMm: source.parameters.rThread,
  };
  // Validate the fixed domain now; the solver will recompute its clearance
  // from current positions at every evaluation.
  pointNeedleChannelClearance(pointsMm[0]!, domain);
  const assignedPassage = { id: `${threadId}/assigned-foundation-channel`, firstNode: 0, lastNode: segmentCount,
    domain, toleranceMm: .002, maxEvaluations: 513 };
  const thread: EquilibriumYarn = {
    id: threadId,
    radiusMm: source.parameters.rThread,
    axialStiffnessN: parameters.axialStiffnessN,
    bendingStiffnessNmm2: parameters.bendingStiffnessNmm2,
    nodes: pointsMm.map((positionMm, i) => ({ positionMm, fixed: i === 0 || i === segmentCount })),
    // In feed mode these are provenance only. Their sum preserves the complete
    // represented local interval rather than importing omitted exterior shape.
    restLengthsMm: Array(segmentCount).fill(representedLengthMm / segmentCount),
    feed: { tensionN: parameters.feedTensionN, availableLengthMm: source.parameters.totalMaterialMm,
      discretization: 'equal-chord' },
    channelPassages: [assignedPassage],
  };
  const preflight = source.geometryStatus === 'rejected' || source.material.status === 'rejected' ? 'rejected'
    : source.geometryStatus === 'passed' && source.material.status === 'conserved' ? 'passed' : 'unresolved';
  const input: YarnEquilibriumInput = { threads: [thread],
    sphere: { centerMm: domain.sphereCenterMm, radiusMm: domain.bodyRadiusMm } };
  return {
    model: SINGLE_NEEDLE_EQUILIBRIUM_MODEL,
    parameters,
    source,
    preflight,
    input,
    route: {
      threadId,
      originalPointsMm: pointsMm.map(p => [...p] as PointMm),
      representedLengthMm,
      observationCuts: [
        { kind: 'observation-cut' as const, nodeIndex: 0, positionMm: pointsMm[0] },
        { kind: 'observation-cut' as const, nodeIndex: segmentCount, positionMm: pointsMm.at(-1)! },
      ],
      assignedPassage,
      portBoundary: 'spatial-channel-not-fixed-nodes' as const,
    },
    limitations: [
      'One renderer-independent engineering pass, not the three-row kiku route or a craft-accepted stitch.',
      'Only the two observation cuts are held. Channel mouths are a fixed spatial domain, not additional material anchors.',
      'The observed equilibrium interval is the straight passage plus explicit exterior handles. Curved outer branches and the free tail remain source context, not solved geometry.',
      'The first control assigns its one channel to the complete observed mesh. Several sequential channels need explicit topological boundaries; mesh indices are not material coordinates under sliding feed.',
      'The channel margin, tension, stiffnesses and foundation layer are assigned controls, not calibrated pearl-cotton or mari properties.',
      'The conservative exterior/channel union omits foundation deformation, friction, needle motion and some valid rim placements.',
    ],
  };
}

type PassageCrossing = {
  segmentIndex: number; t: number; pointMm: PointMm; channelGapMm: number;
  /** (x-O) dot segmentDelta, half the derivative of squared radial distance. */
  radialDotMm2: number;
  radialDirection: 'inward' | 'outward' | 'ambiguous';
};

export type AssignedPassageAudit = {
  status: 'passed' | 'rejected' | 'unresolved';
  toleranceMm: number;
  segments: ReturnType<typeof segmentNeedleChannelClearance>[];
  outsideSegmentIndices: number[];
  unresolvedSegmentIndices: number[];
  /** The contact domain excludes the thread axis from R+r, not the nominal R. */
  crossingSurface: { kind: 'thread-axis-exclusion-envelope'; radiusMm: number | null };
  crossings: PassageCrossing[];
  hasBuriedAxis: boolean;
  portsInsideChannel: boolean;
  /** Descriptive only: a partly exposed thread may never cross nominal R. */
  nominalSurface: { radiusMm: number | null; crossings: PassageCrossing[]; hasBuriedAxis: boolean };
  pairing: {
    status: 'passed' | 'rejected' | 'unresolved';
    expectedDirection: 'entry-to-exit';
    axisLengthMm: number | null;
    /** S-(b+q): the entire middle channel disk must lie inside the excluded sphere. */
    midplaneClearanceMm: number | null;
    crossings: { crossingIndex: number; axisParameter: number; mouth: 'entry' | 'exit' | 'ambiguous' }[];
  };
  diagnostics: string[];
};

/** Independent post-solve gate for the complete polygonal axis. Two R+r sphere
 * crossings alone permit a U-turn through the same mouth. The channel's entry
 * and exit define the intended direction; their perpendicular bisector splits
 * the two mouths, provided the entire middle disk is inside that sphere.
 * Nominal R crossings are recorded without imposing extra physical constraints. */
export function auditAssignedPassage(thread: EquilibriumYarn, domain: NeedleChannelDomain, toleranceMm = .0005): AssignedPassageAudit {
  const invalid = (status: 'rejected' | 'unresolved', message: string): AssignedPassageAudit => ({
    status, toleranceMm, segments: [], outsideSegmentIndices: [], unresolvedSegmentIndices: [], crossings: [],
    crossingSurface: { kind: 'thread-axis-exclusion-envelope',
      radiusMm: finitePositive(domain.bodyRadiusMm + domain.threadRadiusMm) ? domain.bodyRadiusMm + domain.threadRadiusMm : null },
    hasBuriedAxis: false, portsInsideChannel: false,
    nominalSurface: { radiusMm: finitePositive(domain.bodyRadiusMm) ? domain.bodyRadiusMm : null,
      crossings: [], hasBuriedAxis: false },
    pairing: { status: 'unresolved', expectedDirection: 'entry-to-exit', axisLengthMm: null,
      midplaneClearanceMm: null, crossings: [] },
    diagnostics: [message],
  });
  if (!(toleranceMm > 0) || !Number.isFinite(toleranceMm) || thread.nodes.length < 2
    || thread.nodes.some(n => n.positionMm.length !== 3 || !n.positionMm.every(Number.isFinite))) {
    return invalid('rejected', 'Passage audit requires a positive finite tolerance and at least two finite nodes.');
  }
  for (let i = 1; i < thread.nodes.length; i++) {
    const L = distance(thread.nodes[i - 1].positionMm, thread.nodes[i].positionMm);
    if (!(L > 0) || !Number.isFinite(L)) return invalid('rejected', `Undefined finite segment at ${i - 1}.`);
  }
  try {
    pointNeedleChannelClearance(domain.entryMm, domain); // Validate dimensions and axis.
    if (!Number.isFinite(thread.radiusMm) || Math.abs(thread.radiusMm - domain.threadRadiusMm) > 1e-12
      || Math.abs(distance(domain.entryMm, domain.sphereCenterMm) - domain.bodyRadiusMm) > toleranceMm
      || Math.abs(distance(domain.exitMm, domain.sphereCenterMm) - domain.bodyRadiusMm) > toleranceMm) {
      return invalid('rejected', 'Passage mouths must be on the nominal sphere and use the represented thread radius.');
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return invalid('rejected', error.message);
  }
  try { return auditFiniteAssignedPassage(thread, domain, toleranceMm); }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return invalid('unresolved', error.message);
  }
}

function auditSphereCrossings(thread: EquilibriumYarn, domain: NeedleChannelDomain, R: number, toleranceMm: number) {
  const center = domain.sphereCenterMm;
  const crossings: PassageCrossing[] = [];
  for (let i = 0; i + 1 < thread.nodes.length; i++) {
    const a = thread.nodes[i]!.positionMm, b = thread.nodes[i + 1]!.positionMm;
    const d = b.map((x, k) => x - a[k]!) as unknown as PointMm;
    const m = a.map((x, k) => x - center[k]!) as unknown as PointMm;
    const A = d.reduce((sum, x) => sum + x * x, 0);
    const B = 2 * d.reduce((sum, x, k) => sum + x * m[k]!, 0);
    const C = m.reduce((sum, x) => sum + x * x, 0) - R * R;
    const discriminant = B * B - 4 * A * C;
    if (![A, B, C, discriminant].every(Number.isFinite)) throw new RangeError('Non-finite sphere-crossing arithmetic.');
    if (discriminant < 0) continue;
    for (const t of [(-B - Math.sqrt(Math.max(0, discriminant))) / (2 * A),
      (-B + Math.sqrt(Math.max(0, discriminant))) / (2 * A)]) {
      if (t < -1e-10 || t > 1 + 1e-10) continue;
      const q = Math.max(0, Math.min(1, t));
      const pointMm = a.map((x, k) => x + q * d[k]!) as unknown as PointMm;
      const radialDotMm2 = d.reduce((sum, x, k) => sum + (m[k] + q * d[k]) * x, 0);
      const directionAllowance = 128 * Number.EPSILON * Math.max(1, Math.abs(B) / 2, q * A, R * Math.sqrt(A));
      if (![radialDotMm2, directionAllowance].every(Number.isFinite)) throw new RangeError('Non-finite crossing-direction arithmetic.');
      const radialDirection: PassageCrossing['radialDirection'] = Math.abs(radialDotMm2) <= directionAllowance
        ? 'ambiguous' : radialDotMm2 < 0 ? 'inward' : 'outward';
      // Merge only the same event shared by adjacent polygonal segments, not
      // later revisits of the same spatial hole along the working thread.
      const previous = crossings.at(-1);
      if (previous && Math.abs(previous.segmentIndex + previous.t - i - q) <= 1e-10
        && distance(previous.pointMm, pointMm) <= toleranceMm) {
        // A polygonal vertex may touch the sphere and turn back. Opposite
        // one-sided directions cannot establish an inward/outward crossing.
        if (previous.radialDirection !== radialDirection) previous.radialDirection = 'ambiguous';
        continue;
      }
      crossings.push({ segmentIndex: i, t: q, pointMm,
        channelGapMm: pointNeedleChannelClearance(pointMm, domain).channelGapMm, radialDotMm2, radialDirection });
    }
  }
  const hasBuriedAxis = thread.nodes.some(n => distance(n.positionMm, center) < R - toleranceMm)
    || thread.nodes.slice(1).some((node, i) => {
      const a = thread.nodes[i]!.positionMm, b = node.positionMm;
      const d = b.map((x, k) => x - a[k]!) as unknown as PointMm;
      const m = a.map((x, k) => x - center[k]!) as unknown as PointMm;
      const dd = d.reduce((sum, x) => sum + x * x, 0);
      const t = Math.max(0, Math.min(1, -d.reduce((sum, x, k) => sum + x * m[k]!, 0) / dd));
      return distance(a.map((x, k) => x + t * d[k]!) as unknown as PointMm, center) < R - toleranceMm;
    });
  return { radiusMm: R, crossings, hasBuriedAxis };
}

function auditFiniteAssignedPassage(thread: EquilibriumYarn, domain: NeedleChannelDomain, toleranceMm: number): AssignedPassageAudit {
  const segments = thread.nodes.slice(1).map((node, i) =>
    segmentNeedleChannelClearance(thread.nodes[i]!.positionMm, node.positionMm, domain,
      { toleranceMm, maxEvaluations: 2049 }));
  const outside = segments.filter(s => s.clearance === 'outside-domain');
  const unresolved = segments.filter(s => s.clearance === 'unresolved' || s.status === 'unresolved');
  const S = domain.bodyRadiusMm + domain.threadRadiusMm;
  const { crossings, hasBuriedAxis } = auditSphereCrossings(thread, domain, S, toleranceMm);
  const nominalSurface = auditSphereCrossings(thread, domain, domain.bodyRadiusMm, toleranceMm);
  const portsInsideChannel = crossings.length === 2 && crossings.every(c => c.channelGapMm >= -toleranceMm);
  const axisLengthMm = distance(domain.entryMm, domain.exitMm);
  const axis = domain.exitMm.map((x, k) => (x - domain.entryMm[k]) / axisLengthMm);
  // Nominal surface endpoints make the axis midpoint the closest axis point
  // to the sphere centre. If b+q >= S, a path can go around the middle disk
  // while remaining in the domain: mouth pairing is not established here.
  const middle = domain.entryMm.map((x, k) => x / 2 + domain.exitMm[k] / 2) as unknown as PointMm;
  const b = distance(middle, domain.sphereCenterMm);
  const q = domain.channelRadiusMm - domain.threadRadiusMm;
  const midplaneClearanceMm = S - (b + q);
  const separatedMouths = midplaneClearanceMm > toleranceMm;
  const paired: AssignedPassageAudit['pairing']['crossings'] = crossings.map((c, crossingIndex) => {
    const along = c.pointMm.reduce((sum, x, k) => sum + (x - domain.entryMm[k]) * axis[k], 0);
    const fromMiddle = along - axisLengthMm / 2;
    return { crossingIndex, axisParameter: along / axisLengthMm,
      mouth: Math.abs(fromMiddle) <= toleranceMm ? 'ambiguous' : fromMiddle < 0 ? 'entry' : 'exit' };
  });
  const ambiguousDirection = crossings.some(c => c.radialDirection === 'ambiguous');
  const pairingStatus = !separatedMouths || ambiguousDirection ? 'unresolved' : paired.length !== 2 ? 'rejected'
    : paired.some(c => c.mouth === 'ambiguous') ? 'unresolved'
    : paired[0].mouth === 'entry' && paired[1].mouth === 'exit'
      && crossings[0].radialDirection === 'inward' && crossings[1].radialDirection === 'outward' ? 'passed' : 'rejected';
  const pairing: AssignedPassageAudit['pairing'] = {
    status: pairingStatus, expectedDirection: 'entry-to-exit', axisLengthMm, midplaneClearanceMm, crossings: paired,
  };
  const status = outside.length || (!ambiguousDirection
    && (crossings.length !== 2 || !hasBuriedAxis || !portsInsideChannel || pairingStatus === 'rejected')) ? 'rejected'
    : unresolved.length || pairingStatus === 'unresolved' ? 'unresolved' : 'passed';
  return { status, toleranceMm, segments, outsideSegmentIndices: segments.flatMap((s, i) =>
    s.clearance === 'outside-domain' ? [i] : []), unresolvedSegmentIndices: segments.flatMap((s, i) =>
    s.clearance === 'unresolved' || s.status === 'unresolved' ? [i] : []),
  crossingSurface: { kind: 'thread-axis-exclusion-envelope', radiusMm: S },
  crossings, hasBuriedAxis, portsInsideChannel, nominalSurface, pairing,
  diagnostics: !separatedMouths
    ? ['The middle channel disk is not strictly inside the thread-axis exclusion envelope; two separated mouths are not established.']
    : ambiguousDirection ? ['A tangent or polygonal touch has no established inward/outward crossing direction.']
    : pairingStatus === 'passed' ? [] : [pairingStatus === 'unresolved'
    ? 'A surface crossing cannot be assigned to a channel mouth within tolerance.'
    : 'The path must enter through the entry mouth and leave through the exit mouth exactly once.'] };
}

export function solveSingleNeedleEquilibrium(options: SingleNeedleEquilibriumOptions = {},
  solverOptions: YarnEquilibriumOptions = {}) {
  const fixture = buildSingleNeedleEquilibriumInput(options);
  const before = evaluateYarnEquilibrium(fixture.input);
  if (fixture.preflight === 'rejected') {
    return { ...fixture, before, result: null, passageAudit: null, geometryInspection: null,
      physicalAcceptance: 'rejected-preflight' as const };
  }
  const result = solveYarnEquilibrium({ ...fixture.input, options: solverOptions });
  const passageAudit = auditAssignedPassage(result.threads[0]!, fixture.route.assignedPassage.domain);
  const geometryInspection = inspectEquilibriumGeometry(result.threads, fixture.source.parameters.R);
  const physicalAcceptance = result.status === 'rejected' ? 'rejected-mechanics'
    : passageAudit.status === 'rejected' ? 'rejected-channel'
    : geometryInspection.status === 'invalid' ? 'rejected-geometry'
    : result.status !== 'converged' || passageAudit.status !== 'passed' ? 'unresolved'
    : 'not-certified';
  return { ...fixture, before, result, passageAudit, geometryInspection, physicalAcceptance };
}

export type SingleNeedleEquilibrium = ReturnType<typeof solveSingleNeedleEquilibrium>;
