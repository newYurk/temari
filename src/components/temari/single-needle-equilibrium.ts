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

export type AssignedPassageAudit = ReturnType<typeof auditAssignedPassage>;

/** Independent post-solve gate for the complete polygonal axis. */
export function auditAssignedPassage(thread: EquilibriumYarn, domain: NeedleChannelDomain, toleranceMm = .0005) {
  const segments = thread.nodes.slice(1).map((node, i) =>
    segmentNeedleChannelClearance(thread.nodes[i]!.positionMm, node.positionMm, domain,
      { toleranceMm, maxEvaluations: 2049 }));
  const outside = segments.filter(s => s.clearance === 'outside-domain');
  const unresolved = segments.filter(s => s.clearance === 'unresolved' || s.status === 'unresolved');
  const center = domain.sphereCenterMm, R = domain.bodyRadiusMm;
  const crossings: { segmentIndex: number; t: number; pointMm: PointMm;
    channelGapMm: number }[] = [];
  for (let i = 0; i + 1 < thread.nodes.length; i++) {
    const a = thread.nodes[i]!.positionMm, b = thread.nodes[i + 1]!.positionMm;
    const d = b.map((x, k) => x - a[k]!) as unknown as PointMm;
    const m = a.map((x, k) => x - center[k]!) as unknown as PointMm;
    const A = d.reduce((sum, x) => sum + x * x, 0);
    const B = 2 * d.reduce((sum, x, k) => sum + x * m[k]!, 0);
    const C = m.reduce((sum, x) => sum + x * x, 0) - R * R;
    const discriminant = B * B - 4 * A * C;
    if (discriminant < 0) continue;
    for (const t of [(-B - Math.sqrt(Math.max(0, discriminant))) / (2 * A),
      (-B + Math.sqrt(Math.max(0, discriminant))) / (2 * A)]) {
      if (t < -1e-10 || t > 1 + 1e-10) continue;
      const q = Math.max(0, Math.min(1, t));
      const pointMm = a.map((x, k) => x + q * d[k]!) as unknown as PointMm;
      if (crossings.some(c => distance(c.pointMm, pointMm) <= toleranceMm)) continue;
      crossings.push({ segmentIndex: i, t: q, pointMm,
        channelGapMm: pointNeedleChannelClearance(pointMm, domain).channelGapMm });
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
  const portsInsideChannel = crossings.length === 2 && crossings.every(c => c.channelGapMm >= -toleranceMm);
  const status = outside.length || crossings.length !== 2 || !hasBuriedAxis || !portsInsideChannel ? 'rejected'
    : unresolved.length ? 'unresolved' : 'passed';
  return { status, toleranceMm, segments, outsideSegmentIndices: segments.flatMap((s, i) =>
    s.clearance === 'outside-domain' ? [i] : []), unresolvedSegmentIndices: segments.flatMap((s, i) =>
    s.clearance === 'unresolved' || s.status === 'unresolved' ? [i] : []),
  crossings, hasBuriedAxis, portsInsideChannel };
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
