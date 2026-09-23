import { closestSegmentApproach, evaluateCurve, sampleCurve } from './thread-geometry';
import type { MarkingSupport, PointMm, ThreadSpan } from './thread-path';

export type NeedleChannelInput = {
  /** Nominal sphere, permitted surface layer, and undeformed needle/yarn radii, in mm. */
  R: number; layerThickness: number; rNeedle: number; rThread: number;
  /** Centre-line intersections with the NOMINAL sphere, not measured microscopic fibre holes. */
  entry: PointMm; exit: PointMm;
  supports: readonly MarkingSupport[];
  toleranceMm?: number;
  id?: string; threadId?: string;
};
export type ChannelWitness = {
  channelParameter: number; supportParameter: number;
  channelPointMm: PointMm; supportPointMm: PointMm;
  centerlineDistanceMm: number; clearanceMm: number;
};
export type ChannelClearance = {
  status: 'passed' | 'rejected' | 'unresolved';
  /** Bounds for the minimum surface clearance; null if no bounded sample was available. */
  lowerMm: number | null; upperMm: number | null;
  /** Actual evaluated curve points, not a point on the approximating support chord. */
  witness: ChannelWitness | null;
};
export type NeedleChannel = {
  id: string; model: 'straight-needle-channel-v1';
  geometry: 'passed' | 'rejected' | 'unresolved'; mechanics: 'unresolved';
  body: { radiusMm: number; coreRadiusMm: number; layerThicknessMm: number };
  rNeedle: number; rThread: number; toleranceMm: number;
  spans: [ThreadSpan];
  ports: {
    entry: { id: string; positionMm: PointMm; tangent: PointMm };
    exit: { id: string; positionMm: PointMm; tangent: PointMm };
  };
  axis: { direction: PointMm; lengthMm: number; closestToCenterMm: PointMm };
  chordDepthMm: number;
  exposure: {
    centerlineInside: true;
    /** Midpoint cross-section only: positive-radius envelopes also cross the surface near both ports. */
    threadMiddle: 'fully-inside' | 'partly-exposed' | 'tangent';
    needleMiddle: 'fully-inside' | 'partly-exposed' | 'tangent';
    threadMiddleOutermostRadiusMm: number; needleMiddleOutermostRadiusMm: number;
    exposedNearPorts: true;
  };
  coreClearance: { needleMm: number; threadMm: number; needle: ChannelClearance['status']; thread: ChannelClearance['status'] };
  supportChecks: {
    supportId: string; needle: ChannelClearance; thread: ChannelClearance;
    samplingErrorMm: number | null; refinements: number;
  }[];
  diagnostics: { scope: 'geometry' | 'mechanics'; code: string; message: string; supportId?: string }[];
  assumptions: string[];
};

const norm = (p: PointMm) => Math.hypot(...p);
const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mix = (a: PointMm, b: PointMm, t: number): PointMm =>
  [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
const finitePoint = (p: PointMm) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const classify = (lower: number, upper: number, tolerance: number): ChannelClearance['status'] =>
  upper < -tolerance ? 'rejected' : lower > tolerance ? 'passed' : 'unresolved';
const copy = (p: PointMm): PointMm => [p[0], p[1], p[2]];

/**
 * Distance from the exact finite canal to a finite support. A certified
 * polyline supplies a lower bound, while evaluated points on the original
 * support supply actual upper witnesses. No infinite tangent-line extension.
 */
function supportClearance(entry: PointMm, exit: PointMm, support: MarkingSupport,
  rNeedle: number, rThread: number, tolerance: number): NeedleChannel['supportChecks'][number] {
  let lower = -Infinity, best: Omit<ChannelWitness, 'clearanceMm'> | null = null;
  let samplingErrorMm: number | null = null, refinements = 0;
  const clearance = (radius: number): ChannelClearance => {
    if (!best || !Number.isFinite(lower)) return { status: 'unresolved', lowerMm: null, upperMm: null, witness: null };
    const lowerMm = lower - support.radiusMm - radius;
    const upperMm = best.centerlineDistanceMm - support.radiusMm - radius;
    return { status: classify(lowerMm, upperMm, tolerance), lowerMm, upperMm,
      witness: { ...best, clearanceMm: upperMm } };
  };
  for (; refinements <= 3; refinements++) {
    let sample: ReturnType<typeof sampleCurve>;
    try { sample = sampleCurve(support.curve, tolerance / 4 ** refinements); }
    catch (error) {
      // Valid but numerically excessive curves remain unresolved; malformed
      // geometry is checked before reaching this bounded numerical stage.
      if (!(error instanceof RangeError) || !error.message.includes('sampling budget')) throw error;
      break;
    }
    samplingErrorMm = sample.errorBoundMm;
    let levelLower = Infinity;
    for (let i = 1; i < sample.points.length; i++) {
      const pair = closestSegmentApproach(entry, exit, sample.points[i - 1], sample.points[i]);
      levelLower = Math.min(levelLower, pair.distanceMm - sample.errorBoundMm);
      const parameter = sample.parameters[i - 1] + pair.t * (sample.parameters[i] - sample.parameters[i - 1]);
      const supportPointMm = evaluateCurve(support.curve, parameter);
      const actual = closestSegmentApproach(entry, exit, supportPointMm, supportPointMm);
      if (!best || actual.distanceMm < best.centerlineDistanceMm) best = {
        channelParameter: actual.s, supportParameter: parameter,
        channelPointMm: actual.a, supportPointMm, centerlineDistanceMm: actual.distanceMm,
      };
    }
    lower = Math.max(lower, levelLower);
    if (clearance(rNeedle).status !== 'unresolved' && clearance(rThread).status !== 'unresolved') break;
  }
  return { supportId: support.id, needle: clearance(rNeedle), thread: clearance(rThread),
    samplingErrorMm, refinements: Math.min(refinements, 3) };
}

/**
 * One straight needle pass and a straight yarn centre-line on the SAME axis.
 * Geometry acceptance tests their undeformed envelopes against a hard core
 * and fixed marking material. It is not acceptance of passage mechanics,
 * a deformed fibre surface, yarn relaxation, or retained material length.
 */
export function buildNeedleChannel(input: NeedleChannelInput): NeedleChannel {
  const { R, layerThickness, rNeedle, rThread } = input;
  const tolerance = input.toleranceMm ?? .0001;
  if (![R, rNeedle, rThread, tolerance].every(v => Number.isFinite(v) && v > 0)
    || !Number.isFinite(layerThickness) || layerThickness < 0 || layerThickness >= R
    || rNeedle >= R || rThread >= R || !finitePoint(input.entry) || !finitePoint(input.exit)
    || !Array.isArray(input.supports) || input.supports.length > 256)
    throw new RangeError('Need finite positive dimensions, a layer in [0,R), valid ports, and at most 256 supports.');
  const portTolerance = 1e-9 * Math.max(1, R);
  if (Math.abs(norm(input.entry) - R) > portTolerance || Math.abs(norm(input.exit) - R) > portTolerance)
    throw new RangeError('Needle channel ports must lie on the nominal sphere; they are not projected silently.');
  const entry = copy(input.entry), exit = copy(input.exit), delta = sub(exit, entry), length = norm(delta);
  if (!(length > portTolerance)) throw new RangeError('A needle channel needs two distinct surface ports.');
  const ids = new Set<string>();
  for (const support of input.supports) {
    if (!support || typeof support.id !== 'string' || !support.id.trim() || ids.has(support.id)
      || !(support.radiusMm > 0) || !Number.isFinite(support.radiusMm))
      throw new RangeError('Marking supports need unique IDs and positive finite radii.');
    ids.add(support.id);
    const c = support.curve;
    if (!c || (c.kind !== 'arc' && c.kind !== 'bezier')
      || (c.kind === 'arc' ? !finitePoint(c.from) || !finitePoint(c.to)
        : !Array.isArray(c.controls) || c.controls.length !== 4 || !c.controls.every(finitePoint)))
      throw new RangeError('Marking support curves must contain finite three-dimensional points.');
    // Also checks the equal-radius and explicit-route requirements of an arc.
    evaluateCurve(c, .5);
  }
  const id = input.id ?? 'straight-needle-channel', threadId = input.threadId ?? 'engineering-thread';
  if (typeof id !== 'string' || typeof threadId !== 'string' || !id.trim() || !threadId.trim())
    throw new RangeError('Channel and material IDs must be nonempty.');
  const direction: PointMm = [delta[0] / length, delta[1] / length, delta[2] / length];
  const closest = closestSegmentApproach(entry, exit, [0, 0, 0], [0, 0, 0]);
  const centreRadius = closest.distanceMm, depth = R - centreRadius;
  const coreRadius = R - layerThickness;
  const needleCoreGap = centreRadius - rNeedle - coreRadius;
  const threadCoreGap = centreRadius - rThread - coreRadius;
  const coreClearance: NeedleChannel['coreClearance'] = {
    needleMm: needleCoreGap, threadMm: threadCoreGap,
    needle: classify(needleCoreGap, needleCoreGap, tolerance), thread: classify(threadCoreGap, threadCoreGap, tolerance),
  };
  const supportChecks = input.supports.map(s => supportClearance(entry, exit, s, rNeedle, rThread, tolerance));
  const geometryStates = [coreClearance.needle, coreClearance.thread, ...supportChecks.flatMap(s => [s.needle.status, s.thread.status])];
  const geometry: NeedleChannel['geometry'] = geometryStates.includes('rejected') ? 'rejected'
    : geometryStates.includes('unresolved') ? 'unresolved' : 'passed';
  const diagnostics: NeedleChannel['diagnostics'] = [
    { scope: 'mechanics', code: 'surface-layer-unmodelled', message: 'The surface layer is a declared permitted penetration region, not a solved fibre deformation or force law.' },
    { scope: 'mechanics', code: 'material-not-assigned', message: 'This geometry does not assign or conserve a material length or prescribe exchange at its ends.' },
    { scope: 'mechanics', code: 'post-withdrawal-shape-unmodelled', message: 'A straight single-pass channel does not establish the yarn shape after needle withdrawal and tightening.' },
  ];
  if (rThread > rNeedle) diagnostics.push({ scope: 'mechanics', code: 'bore-enlargement-unmodelled',
    message: 'The undeformed yarn is wider than the needle shaft. These envelope checks do not prove passage through the needle-created bore.' });
  for (const [object, status] of [['needle', coreClearance.needle], ['thread', coreClearance.thread]] as const)
    if (status !== 'passed') diagnostics.push({ scope: 'geometry', code: `${object}-core-${status}`,
      message: `${object} clearance against the declared hard core is ${status}.` });
  for (const support of supportChecks) for (const object of ['needle', 'thread'] as const)
    if (support[object].status !== 'passed') diagnostics.push({ scope: 'geometry', code: `${object}-support-${support[object].status}`,
      supportId: support.supportId, message: `${object} clearance against finite support ${support.supportId} is ${support[object].status}.` });
  const middle = (radius: number): NeedleChannel['exposure']['threadMiddle'] =>
    centreRadius + radius < R ? 'fully-inside' : centreRadius + radius > R ? 'partly-exposed' : 'tangent';
  const span: ThreadSpan = { id: `${id}/axis`, opId: `${id}/pass`, threadId, step: 0, zone: 'piercing',
    curve: { kind: 'bezier', controls: [entry, mix(entry, exit, 1 / 3), mix(entry, exit, 2 / 3), exit] },
    corridor: { centerMm: closest.a, radiusMm: length / 2 + rThread + portTolerance, maxDepthMm: layerThickness },
  };
  return { id, model: 'straight-needle-channel-v1', geometry, mechanics: 'unresolved',
    body: { radiusMm: R, coreRadiusMm: coreRadius, layerThicknessMm: layerThickness },
    rNeedle, rThread, toleranceMm: tolerance, spans: [span],
    ports: { entry: { id: `${id}/entry`, positionMm: entry, tangent: direction },
      exit: { id: `${id}/exit`, positionMm: exit, tangent: direction } },
    axis: { direction, lengthMm: length, closestToCenterMm: closest.a }, chordDepthMm: depth,
    exposure: { centerlineInside: true, threadMiddle: middle(rThread), needleMiddle: middle(rNeedle),
      threadMiddleOutermostRadiusMm: centreRadius + rThread, needleMiddleOutermostRadiusMm: centreRadius + rNeedle,
      exposedNearPorts: true },
    coreClearance, supportChecks, diagnostics,
    assumptions: [
      'One straight rigid needle pass along a fixed axis; the nominal spherical surface is undeformed in this geometric reference.',
      'The layer thickness is an explicit engineering assumption. Its fibres, displacement, compression, retention, and friction are not solved.',
      'Needle and yarn use the same finite centre line and separately declared round radii; support collisions are never suppressed by the surface layer.',
      'The permitted layer is not an empty needle bore. A yarn wider than the needle may require unmodelled bore enlargement or deformation.',
      'Envelope clearances use the finite segment swept by a round radius (including endpoint balls); this is conservative for a flat-ended cylinder.',
      'Only the segment between the ports is checked; the exterior needle shaft and the full insertion/withdrawal motion are not represented.',
      'Partial exposure of the actual envelope near the nominal surface is retained, not hidden by changing the path or its radius.',
      'Finite support clearance bounds use certified curve approximation and actual curve-point upper witnesses, subject to floating-point rounding.',
      'Near-zero contact within the numerical tolerance is unresolved, not a certificate of positive separation.',
      'Outer continuations, material exchange, and the yarn shape after withdrawal are outside this channel-only observation.',
      'No dimensions in this analytic control are presented as measured GT14 needle or material parameters.',
    ],
  };
}
