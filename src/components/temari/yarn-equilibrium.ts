import { closestSegmentApproach } from './thread-geometry';
import { pointNeedleChannelClearance, segmentNeedleChannelClearance,
  type NeedleChannelDomain } from './needle-channel-clearance';
import type { PointMm } from './thread-path';

/** Engineering controls, not calibrated pearl-cotton properties. All lengths are mm.
 * Quasistatic, frictionless discrete elastic rods with a fixed circular radius.
 * No compression law, torsion, yarn twist, or foundation deformation. Optional
 * frictionless feed is a distinct inextensible constant-tension limit, not an
 * automatic reset of elastic rest lengths or a calibrated cotton constitutive law.
 * `converged` means discrete first-order/contact residuals passed, NOT global
 * optimality, stability, continuous-curve regularity, topology, or craft acceptance.
 */
export type YarnNode = {
  positionMm: PointMm;
  fixed: boolean;
  /** Forbidden radius for the AXIS about sphere.centerMm. Default body R + yarn r.
   * An explicit smaller value permits a prescribed internal passage; it does not
   * compute displacement or compression of foundation fibres. Zero disables it. */
  minimumSphereRadiusMm?: number;
  /** Optional upper radius for the AXIS. Together with the lower bound, this
   * describes a permitted shell, not an equilibrium law for the foundation. */
  maximumSphereRadiusMm?: number;
};
export type YarnChannelPassage = {
  id: string;
  /** Inclusive mesh interval whose complete polygonal segments must remain in
   * the fixed world-space union of the exterior and this assigned channel.
   * In sliding mode these indices are not fixed material coordinates; assigning
   * several channels needs explicit topological boundaries. */
  firstNode: number;
  lastNode: number;
  domain: NeedleChannelDomain;
  /** Numerical witness tolerance for the finite-segment minimum, not a
   * physical clearance or permission to penetrate the channel boundary. */
  toleranceMm?: number;
  maxEvaluations?: number;
};
export type EquilibriumYarn = {
  id: string;
  radiusMm: number;
  /** EA in N; positive bilateral elastic stretching/compression energy. */
  axialStiffnessN: number;
  /** B in N mm²; positive, fixed bending stiffness. */
  bendingStiffnessNmm2: number;
  nodes: readonly YarnNode[];
  /** Assigned before solving. Never reset to a solved or seed curve's length. */
  restLengthsMm: readonly number[];
  /** Distinct boundary model: material slides freely through held spatial nodes.
   * Rest lengths and EA remain provenance data but do not enter this energy.
   * Pulling the external reservoir gives potential T*laidLength (constant omitted).
   * The remaining material reserve is in the ledger; the reservoir's spatial path
   * outside the observed rods is not represented. T is the applied reservoir
   * force, not a proven axial force everywhere. T and B are engineering values. */
  feed?: { tensionN: number; availableLengthMm: number;
    /** Numerical mesh gauge, NOT a yarn constitutive law. Equal chord lengths
     * between successive held spatial nodes prevent sampling-point collapse.
     * At finite resolution this changes the polygon approximation, so mesh
     * reactions and the ungauged physical residual are reported separately.
     * Refinement remains necessary. End nodes must be held; default is free
     * vertices. Bounds attached to nodes must describe the intended spatial
     * region after redistribution, not stale material-coordinate permissions. */
    discretization?: 'free-vertices' | 'equal-chord';
  };
  /** Per finite segment, AXIS forbidden radius. Independent of node overrides. */
  segmentMinimumSphereRadiiMm?: readonly number[];
  /** Fixed spatial passages assigned to explicit mesh intervals. Unlike the legacy
   * per-node mouth taper, their clearance is recomputed after every move. */
  channelPassages?: readonly YarnChannelPassage[];
};
export type YarnEquilibriumOptions = {
  maxOuterIterations?: number;
  maxIterationsPerOuter?: number;
  gradientToleranceN?: number;
  penetrationToleranceMm?: number;
  complementarityToleranceNmm?: number;
  /** Numerical equal-chord mesh constraint tolerance, independent of contacts. */
  meshSpacingToleranceMm?: number;
  initialPenaltyNPerMm?: number;
  maxPenaltyNPerMm?: number;
  /** Exclude local pairs of material points closer along rest arclength
   * (current arclength in the sliding inextensible feed model) than
   * this many yarn radii (default pi). This clips material points, including
   * adjacent segment pairs; adjacency never exempts a whole folded segment.
   * A 2r cutoff is invalid even for a bent regular rod: its chord is shorter
   * than its arclength. The pi*r local neighbourhood assumes a separately
   * verified smooth bend-radius bound; it does NOT establish that bound.
   * Segment pairs are clipped in parameter space, not discarded
   * merely because their closest unrestricted points are local neighbours.
   * A separate smooth-curve curvature/mesh check is still necessary. */
  selfExclusionRadii?: number;
  maxContactPairs?: number;
};
export type YarnEquilibriumInput = {
  threads: readonly EquilibriumYarn[];
  sphere?: { centerMm: PointMm; radiusMm: number };
  options?: YarnEquilibriumOptions;
};
export type YarnContact = {
  id: string;
  kind: 'yarn-yarn' | 'sphere-node' | 'sphere-node-ceiling' | 'sphere-segment'
    | 'needle-channel-node' | 'needle-channel-segment' | 'feed-length-budget';
  gapMm: number;
  /** Budget constraints use the two boundary points as identifiers, not a
   * distance witness; their gap is availableLength - laidLength. */
  pointsMm: readonly [PointMm, PointMm];
  multiplierN: number;
  immovable: boolean;
  normalDefined: boolean;
  channelClearance?: {
    status: 'resolved' | 'unresolved';
    clearance: 'clear' | 'outside-domain' | 'unresolved';
    lowerBoundMm: number;
    upperBoundMm: number;
    accuracyMm: number;
  };
  /** No remote material points remain in this local self-pair's clipped domain.
   * Its multiplier is zero; the zero gap is a placeholder, not physical contact. */
  excludedLocal?: boolean;
};
export type YarnMaterialLedger = {
  threadId: string; mode: 'clamped-elastic'; laidLengthMm: number; restLengthMm: number;
} | {
  threadId: string; mode: 'sliding-inextensible-feed'; laidLengthMm: number;
  availableLengthMm: number; reserveLengthMm: number; tensionN: number;
  /** Fixed geometry nodes in this mode hold position, not a material coordinate. */
  heldNodesPermitSliding: true;
};
export type YarnMeshConstraint = {
  id: string; kind: 'equal-chord'; threadId: string; nodeIndex: number;
  /** Signed current left chord minus right chord. */
  errorMm: number;
  /** Signed numerical gauge reaction, NOT a yarn or contact force. */
  multiplierN: number;
};
export type YarnEquilibriumResiduals = {
  maxPenetrationMm: number;
  /** Stationarity of the chosen discrete problem, including mesh reactions. */
  freeGradientNormN: number;
  /** Physical Lagrangian gradient before numerical mesh reactions. These
   * reactions need not vanish at finite resolution; inspect mesh refinement. */
  freePhysicalGradientNormN: number;
  maxMeshSpacingErrorMm: number;
  maxComplementarityNmm: number;
  maxRelativeStretch: number;
  maxMaterialOverdrawMm: number;
};
export type YarnEquilibriumTrace = YarnEquilibriumResiduals & {
  outerIteration: number; iterations: number; penaltyNPerMm: number; elasticEnergyNmm: number; potentialEnergyNmm: number;
  /** Inexact inner solves may use a looser target; final acceptance never does. */
  innerTargetN: number; innerGradientNormN: number; subproblemConverged: boolean;
  multiplierNormN: number;
};
export type YarnEquilibriumResult = {
  model: 'discrete-circular-elastic-yarn-v1';
  status: 'converged' | 'unresolved' | 'rejected';
  /** False means overflow/undefined arithmetic, not a geometric witness. */
  numericallyValid: boolean;
  threads: EquilibriumYarn[];
  energy: { stretchNmm: number; bendNmm: number; tensionNmm: number; totalNmm: number };
  materialLedger: YarnMaterialLedger[];
  residuals: YarnEquilibriumResiduals;
  contacts: YarnContact[];
  contactMultipliersN: number[];
  meshConstraints: YarnMeshConstraint[];
  meshMultipliersN: number[];
  gradientN: PointMm[][];
  iterations: number;
  trace: YarnEquilibriumTrace[];
  diagnostics: string[];
};

export const YARN_EQUILIBRIUM_DEFAULTS = Object.freeze({
  maxOuterIterations: 12, maxIterationsPerOuter: 250,
  gradientToleranceN: 1e-7, penetrationToleranceMm: 1e-5,
  meshSpacingToleranceMm: 1e-6,
  complementarityToleranceNmm: 1e-6, initialPenaltyNPerMm: 10,
  maxPenaltyNPerMm: 1e8, selfExclusionRadii: Math.PI, maxContactPairs: 50000,
});
type Options = Required<YarnEquilibriumOptions>;
type V = [number, number, number];
type Segment = { a: number; b: number; thread: number; index: number; rest: number; offset: number; radius: number };
type Pair = [number, number];
type Constraint = { contact: Omit<YarnContact, 'multiplierN' | 'kind'> & { kind: YarnContact['kind'] | 'mesh-equal-chord' };
  mesh?: { thread: number; nodeIndex: number };
  derivatives: { node: number; value: V }[] };
const sub = (a: PointMm, b: PointMm): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const length = (a: readonly number[]) => Math.sqrt(dot(a, a));
const scale = (a: PointMm, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const mix = (a: PointMm, b: PointMm, t: number): V => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
const positive = (n: number) => Number.isFinite(n) && n > 0;
const pointValid = (p: PointMm) => p.length === 3 && p.every(Number.isFinite);
const samePoint = (a: PointMm, b: PointMm, tolerance = 1e-10) =>
  length(sub(a, b)) <= tolerance * Math.max(1, length(a), length(b));

function channelBoundaryWitness(point: PointMm, domain: NeedleChannelDomain,
  result: ReturnType<typeof pointNeedleChannelClearance>): V {
  if (!result.gradient) return [...point];
  if (result.branch === 'exterior') {
    const radial = sub(point, domain.sphereCenterMm), radialLength = length(radial);
    const radius = domain.bodyRadiusMm + domain.threadRadiusMm;
    return radialLength > 0
      ? domain.sphereCenterMm.map((x, i) => x + radial[i] * radius / radialLength) as V
      : [...point];
  }
  const axisDelta = sub(domain.exitMm, domain.entryMm), axisLength = length(axisDelta);
  const axis = scale(axisDelta, 1 / axisLength), fromEntry = sub(point, domain.entryMm);
  const projection = domain.entryMm.map((x, i) => x + axis[i] * dot(fromEntry, axis)) as V;
  const perpendicular = sub(point, projection), perpendicularLength = length(perpendicular);
  const radius = domain.channelRadiusMm - domain.threadRadiusMm;
  return perpendicularLength > 0
    ? projection.map((x, i) => x + perpendicular[i] * radius / perpendicularLength) as V
    : [...point];
}

function prepare(input: YarnEquilibriumInput) {
  const options = { ...YARN_EQUILIBRIUM_DEFAULTS, ...input.options };
  for (const [key, value] of Object.entries(options)) {
    if (key === 'selfExclusionRadii' ? !Number.isFinite(value) || value < 0 : !positive(value)) throw new RangeError(`Invalid ${key}`);
  }
  for (const key of ['maxOuterIterations', 'maxIterationsPerOuter', 'maxContactPairs'] as const)
    if (!Number.isSafeInteger(options[key])) throw new RangeError(`${key} must be an integer`);
  if (options.maxPenaltyNPerMm < options.initialPenaltyNPerMm) throw new RangeError('Maximum penalty is below initial penalty');
  if (!input.threads.length || new Set(input.threads.map(t => t.id)).size !== input.threads.length) throw new RangeError('Threads need unique IDs');
  if (input.sphere && (!pointValid(input.sphere.centerMm) || !positive(input.sphere.radiusMm))) throw new RangeError('Invalid sphere');
  const positions: V[] = [], fixed: boolean[] = [], starts: number[] = [], segments: Segment[] = [];
  for (const [thread, yarn] of input.threads.entries()) {
    if (!yarn.id || !positive(yarn.radiusMm) || !positive(yarn.axialStiffnessN) || !positive(yarn.bendingStiffnessNmm2)
      || yarn.nodes.length < 2 || yarn.restLengthsMm.length !== yarn.nodes.length - 1 || !yarn.restLengthsMm.every(positive)) throw new RangeError(`Invalid yarn ${yarn.id}`);
    if (yarn.feed && (!positive(yarn.feed.tensionN) || !positive(yarn.feed.availableLengthMm))) throw new RangeError('Feed needs positive finite tension and available material');
    if (yarn.feed?.discretization !== undefined && !['free-vertices', 'equal-chord'].includes(yarn.feed.discretization)) throw new RangeError('Unknown feed discretization');
    if (yarn.feed?.discretization === 'equal-chord' && (!yarn.nodes[0].fixed || !yarn.nodes.at(-1)!.fixed))
      throw new RangeError('Equal-chord mesh needs held observation endpoints');
    if (yarn.segmentMinimumSphereRadiiMm && (yarn.segmentMinimumSphereRadiiMm.length !== yarn.restLengthsMm.length
      || yarn.segmentMinimumSphereRadiiMm.some(r => !Number.isFinite(r) || r < 0))) throw new RangeError('Invalid segment axis exclusion radii');
    const channelNodes = new Set<number>(), channelSegments = new Set<number>(), passageIds = new Set<string>();
    for (const passage of yarn.channelPassages ?? []) {
      if (!passage.id?.trim() || passageIds.has(passage.id)
        || !Number.isSafeInteger(passage.firstNode) || !Number.isSafeInteger(passage.lastNode)
        || passage.firstNode < 0 || passage.lastNode >= yarn.nodes.length || passage.firstNode >= passage.lastNode
        || passage.toleranceMm !== undefined && !positive(passage.toleranceMm)
        || passage.maxEvaluations !== undefined && (!Number.isSafeInteger(passage.maxEvaluations) || passage.maxEvaluations < 2)) {
        throw new RangeError('Invalid assigned needle-channel passage');
      }
      passageIds.add(passage.id);
      // This validates all dimensions and the channel axis without silently
      // projecting either mouth or changing the declared yarn radius.
      pointNeedleChannelClearance(yarn.nodes[passage.firstNode].positionMm, passage.domain);
      if (Math.abs(passage.domain.threadRadiusMm - yarn.radiusMm) > 1e-12
        || !input.sphere || !samePoint(passage.domain.sphereCenterMm, input.sphere.centerMm)
        || Math.abs(passage.domain.bodyRadiusMm - input.sphere.radiusMm) > 1e-10 * Math.max(1, input.sphere.radiusMm)) {
        throw new RangeError('Assigned channel must use the equilibrium yarn radius and nominal sphere');
      }
      for (let i = passage.firstNode; i <= passage.lastNode; i++) {
        if (channelNodes.has(i)) throw new RangeError('Assigned needle-channel node intervals must not overlap');
        channelNodes.add(i);
      }
      for (let i = passage.firstNode; i < passage.lastNode; i++) {
        if (channelSegments.has(i)) throw new RangeError('Assigned needle-channel segment intervals must not overlap');
        channelSegments.add(i);
      }
    }
    const start = positions.length; starts.push(start);
    for (const node of yarn.nodes) {
      if (!pointValid(node.positionMm) || typeof node.fixed !== 'boolean'
        || [node.minimumSphereRadiusMm, node.maximumSphereRadiusMm].some(r => r !== undefined && (!Number.isFinite(r) || r < 0))) throw new RangeError('Invalid yarn node');
      if (!input.sphere && (node.minimumSphereRadiusMm !== undefined || node.maximumSphereRadiusMm !== undefined || yarn.segmentMinimumSphereRadiiMm))
        throw new RangeError('Sphere axis bounds require a sphere center');
      if (node.maximumSphereRadiusMm !== undefined && node.maximumSphereRadiusMm < (node.minimumSphereRadiusMm ?? input.sphere!.radiusMm + yarn.radiusMm))
        throw new RangeError('Axis radius ceiling is below its lower bound');
      positions.push([...node.positionMm]); fixed.push(node.fixed);
    }
    let offset = 0;
    yarn.restLengthsMm.forEach((rest, index) => {
      if (length(sub(positions[start + index + 1], positions[start + index])) < 1e-9) throw new RangeError('Coincident consecutive nodes have no defined tangent');
      segments.push({ a: start + index, b: start + index + 1, thread, index, rest, offset, radius: yarn.radiusMm }); offset += rest;
    });
  }
  const pairs: [Segment, Segment][] = [];
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j];
    if (a.thread === b.thread && !input.threads[a.thread].feed && b.offset + b.rest - a.offset < options.selfExclusionRadii * a.radius) continue;
    pairs.push([a, b]);
    if (pairs.length > options.maxContactPairs) throw new RangeError('Contact-pair budget exceeded; no equilibrium was computed');
  }
  return { input, options, positions, fixed, starts, segments, pairs };
}
type Prepared = ReturnType<typeof prepare>;

/** Finite segment minimum with an optional fixed-material-coordinate exclusion.
 * The feasible parameter polygon is convex. A convex quadratic reaches its
 * minimum at its unrestricted minimum, or on a boundary edge. */
function contactMinimum(a: Segment, b: Segment, p: V[], exclusion: number) {
  const A = p[a.a], B = p[a.b], C = p[b.a], D = p[b.b];
  const full = closestSegmentApproach(A, B, C, D);
  if (a.thread !== b.thread) return { ...full, clipped: false };
  const gap = (v: Pair) => b.offset + v[1] * b.rest - a.offset - v[0] * a.rest - exclusion;
  if (gap([full.s, full.t]) >= 0) return { ...full, clipped: false };
  const square: Pair[] = [[0, 0], [1, 0], [1, 1], [0, 1]], polygon: Pair[] = [];
  for (let i = 0; i < 4; i++) {
    const x = square[i], y = square[(i + 1) % 4], gx = gap(x), gy = gap(y);
    if (gx >= 0) polygon.push(x);
    if ((gx < 0) !== (gy < 0)) { const t = gx / (gx - gy); polygon.push([x[0] + t * (y[0] - x[0]), x[1] + t * (y[1] - x[1])]); }
  }
  let best: typeof full | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const x = polygon[i], y = polygon[(i + 1) % polygon.length];
    const base = sub(mix(A, B, x[0]), mix(C, D, x[1]));
    const delta = sub(sub(mix(A, B, y[0]), mix(C, D, y[1])), base);
    const u = dot(delta, delta) ? Math.max(0, Math.min(1, -dot(base, delta) / dot(delta, delta))) : 0;
    const s = x[0] + u * (y[0] - x[0]), t = x[1] + u * (y[1] - x[1]);
    const first = mix(A, B, s), second = mix(C, D, t), distanceMm = length(sub(first, second));
    if (!best || distanceMm < best.distanceMm) best = { a: first, b: second, s, t, distanceMm };
  }
  return best ? { ...best, clipped: true } : null;
}

function evaluate(prep: Prepared, points: V[]) {
  const gradient: V[] = points.map(() => [0, 0, 0]), constraints: Constraint[] = [];
  let stretchNmm = 0, bendNmm = 0, tensionNmm = 0, maxRelativeStretch = 0, valid = true;
  const laidLengths = prep.input.threads.map(() => 0), currentSegments: Segment[] = [];
  const add = (node: number, v: PointMm, k = 1) => { for (let d = 0; d < 3; d++) gradient[node][d] += k * v[d]; };
  for (const s of prep.segments) {
    const delta = sub(points[s.b], points[s.a]), L = length(delta), yarn = prep.input.threads[s.thread];
    currentSegments.push({ ...s, rest: L, offset: laidLengths[s.thread] }); laidLengths[s.thread] += L;
    if (L < 1e-9 || !Number.isFinite(L)) { valid = false; continue; }
    if (yarn.feed) {
      tensionNmm += yarn.feed.tensionN * L;
      const g = scale(delta, yarn.feed.tensionN / L); add(s.a, g, -1); add(s.b, g);
    } else {
      const extension = L - s.rest, coefficient = yarn.axialStiffnessN / s.rest;
      stretchNmm += coefficient * extension * extension / 2;
      maxRelativeStretch = Math.max(maxRelativeStretch, Math.abs(extension) / s.rest);
      const g = scale(delta, coefficient * extension / L); add(s.a, g, -1); add(s.b, g);
    }
    if (s.index === 0) continue;
    const left = sub(points[s.a], points[s.a - 1]), Lleft = length(left);
    if (Lleft < 1e-9 || !Number.isFinite(Lleft)) { valid = false; continue; }
    const t0 = scale(left, 1 / Lleft), t1 = scale(delta, 1 / L), turn = sub(t1, t0);
    const dual = yarn.feed ? (Lleft + L) / 2 : (yarn.restLengthsMm[s.index - 1] + s.rest) / 2;
    const stiffness = yarn.bendingStiffnessNmm2 / dual, bend = stiffness * dot(turn, turn) / 2;
    bendNmm += bend;
    // In feed mode d(1/(Lleft+L))/dL contributes to BOTH segment forces.
    const denominatorForce = yarn.feed ? bend / (Lleft + L) : 0;
    const g0 = sub(scale(sub(turn, scale(t0, dot(t0, turn))), -stiffness / Lleft), scale(t0, denominatorForce));
    const g1 = sub(scale(sub(turn, scale(t1, dot(t1, turn))), stiffness / L), scale(t1, denominatorForce));
    add(s.a - 1, g0, -1); add(s.a, sub(g0, g1)); add(s.b, g1);
  }
  const constraint = (id: string, kind: YarnContact['kind'], a: PointMm, b: PointMm, required: number,
    weights: { node: number; weight: number }[], sense: 1 | -1 = 1) => {
    const delta = sub(a, b), distance = length(delta), normalDefined = distance > 1e-12;
    const normal = normalDefined ? scale(delta, sense / distance) : [0, 0, 0] as V;
    const value: Constraint = { contact: { id, kind, gapMm: sense * (distance - required), pointsMm: [a, b],
      immovable: weights.every(w => prep.fixed[w.node] || Math.abs(w.weight) < 1e-14), normalDefined },
    derivatives: weights.map(w => ({ node: w.node, value: scale(normal, w.weight) })) };
    constraints.push(value); return value;
  };
  const currentByNode = new Map(currentSegments.map(s => [s.a, s]));
  const threadSegments = prep.input.threads.map((_, ti) => currentSegments.filter(s => s.thread === ti));
  for (const [a, b] of prep.pairs) {
    const sliding = a.thread === b.thread && !!prep.input.threads[a.thread].feed;
    const ca = sliding ? currentByNode.get(a.a)! : a, cb = sliding ? currentByNode.get(b.a)! : b;
    const c = contactMinimum(ca, cb, points, prep.options.selfExclusionRadii * a.radius);
    const id = `yarn:${a.thread}:${a.index}/${b.thread}:${b.index}`;
    if (!c) {
      // Preserve stable multiplier indices as a feed-local domain opens/closes.
      constraints.push({ contact: { id, kind: 'yarn-yarn', gapMm: 0, pointsMm: [points[a.a], points[b.a]],
        normalDefined: true, immovable: false, excludedLocal: true }, derivatives: [] }); continue;
    }
    const value = constraint(id, 'yarn-yarn', c.a, c.b, a.radius + b.radius,
      [{ node: a.a, weight: 1 - c.s }, { node: a.b, weight: c.s }, { node: b.a, weight: c.t - 1 }, { node: b.b, weight: -c.t }]);
    if (sliding && c.clipped && c.distanceMm > 1e-12) {
      // Envelope theorem for min distance with current-arclength inequality
      // h(s,t,x)>=0: d distance/dx = partial_x distance - eta*partial_x h.
      // Away from a parameter-box corner, eta follows from a free s or t.
      const normal = scale(sub(c.a, c.b), 1 / c.distanceMm);
      let eta = 0;
      if (c.s > 1e-10 && c.s < 1 - 1e-10) eta = -dot(normal, sub(points[a.b], points[a.a])) / ca.rest;
      else if (c.t > 1e-10 && c.t < 1 - 1e-10) eta = -dot(normal, sub(points[b.b], points[b.a])) / cb.rest;
      else {
        // A moving clipping boundary at a parameter corner has a nonsmooth
        // envelope. Do not silently certify an active contact there.
        value.contact.normalDefined = false;
      }
      eta = Math.max(0, eta);
      if (eta > 0) for (let i = a.index; i <= b.index; i++) {
        const s = threadSegments[a.thread][i], weight = i === a.index ? 1 - c.s : i === b.index ? c.t : 1;
        const t = scale(sub(points[s.b], points[s.a]), 1 / s.rest);
        value.derivatives.push({ node: s.a, value: scale(t, eta * weight) }, { node: s.b, value: scale(t, -eta * weight) });
      }
      // Domain motion also depends on intermediate material, not only the
      // two closest surface points. Fixed-point rejection must account for it.
      value.contact.immovable = threadSegments[a.thread].slice(a.index, b.index + 1).every(s => prep.fixed[s.a] && prep.fixed[s.b]);
    }
  }
  for (const [ti, thread] of prep.input.threads.entries()) for (const passage of thread.channelPassages ?? []) {
    for (let i = passage.firstNode; i <= passage.lastNode; i++) {
      const node = prep.starts[ti] + i, point = points[node];
      const clearance = pointNeedleChannelClearance(point, passage.domain);
      const witness = channelBoundaryWitness(point, passage.domain, clearance);
      constraints.push({ contact: { id: `needle-channel-node:${ti}:${passage.id}:${i}`, kind: 'needle-channel-node',
        gapMm: clearance.gapMm, pointsMm: [point, witness], immovable: prep.fixed[node],
        normalDefined: clearance.gradientStatus === 'smooth' && clearance.gradient !== null },
      derivatives: clearance.gradient ? [{ node, value: [...clearance.gradient] as V }] : [] });
    }
    for (let i = passage.firstNode; i < passage.lastNode; i++) {
      const segment = threadSegments[ti][i]!;
      const clearance = segmentNeedleChannelClearance(points[segment.a], points[segment.b], passage.domain,
        { toleranceMm: passage.toleranceMm, maxEvaluations: passage.maxEvaluations });
      const point = [...clearance.witness.pointMm] as V, evaluation = clearance.witness.evaluation;
      const witness = channelBoundaryWitness(point, passage.domain, evaluation);
      constraints.push({ contact: { id: `needle-channel-segment:${ti}:${passage.id}:${i}`, kind: 'needle-channel-segment',
        gapMm: clearance.gapMm, pointsMm: [point, witness],
        immovable: prep.fixed[segment.a] && prep.fixed[segment.b],
        normalDefined: clearance.status === 'resolved' && clearance.clearance !== 'unresolved'
          && evaluation.gradientStatus === 'smooth' && evaluation.gradient !== null,
        channelClearance: { status: clearance.status, clearance: clearance.clearance,
          lowerBoundMm: clearance.lowerBoundMm, upperBoundMm: clearance.upperBoundMm, accuracyMm: clearance.accuracyMm } },
      derivatives: evaluation.gradient ? [
        { node: segment.a, value: scale(evaluation.gradient, 1 - clearance.witness.t) },
        { node: segment.b, value: scale(evaluation.gradient, clearance.witness.t) },
      ] : [] });
    }
  }
  if (prep.input.sphere) {
    const sphere = prep.input.sphere;
    for (const [ti, thread] of prep.input.threads.entries()) thread.nodes.forEach((node, i) => {
      if (thread.channelPassages?.some(p => i >= p.firstNode && i <= p.lastNode)) return;
      const r = node.minimumSphereRadiusMm ?? sphere.radiusMm + thread.radiusMm, index = prep.starts[ti] + i;
      if (r > 0) constraint(`sphere-node:${ti}:${i}`, 'sphere-node', points[index], sphere.centerMm, r, [{ node: index, weight: 1 }]);
      if (node.maximumSphereRadiusMm !== undefined) constraint(`sphere-node-ceiling:${ti}:${i}`, 'sphere-node-ceiling', points[index], sphere.centerMm,
        node.maximumSphereRadiusMm, [{ node: index, weight: 1 }], -1);
    });
    for (const s of prep.segments) {
      if (prep.input.threads[s.thread].channelPassages?.some(p => s.index >= p.firstNode && s.index < p.lastNode)) continue;
      const r = prep.input.threads[s.thread].segmentMinimumSphereRadiiMm?.[s.index] ?? sphere.radiusMm + s.radius;
      if (r <= 0) continue;
      const c = closestSegmentApproach(points[s.a], points[s.b], sphere.centerMm, sphere.centerMm);
      constraint(`sphere-segment:${s.thread}:${s.index}`, 'sphere-segment', c.a, sphere.centerMm, r,
        [{ node: s.a, weight: 1 - c.s }, { node: s.b, weight: c.s }]);
    }
  }
  const materialLedger: YarnMaterialLedger[] = prep.input.threads.map((yarn, ti) => yarn.feed
    ? { threadId: yarn.id, mode: 'sliding-inextensible-feed', laidLengthMm: laidLengths[ti], availableLengthMm: yarn.feed.availableLengthMm,
      reserveLengthMm: yarn.feed.availableLengthMm - laidLengths[ti], tensionN: yarn.feed.tensionN, heldNodesPermitSliding: true }
    : { threadId: yarn.id, mode: 'clamped-elastic', laidLengthMm: laidLengths[ti], restLengthMm: yarn.restLengthsMm.reduce((s, x) => s + x, 0) });
  for (const [ti, yarn] of prep.input.threads.entries()) if (yarn.feed) {
    const derivatives = threadSegments[ti].flatMap(s => {
      const t = scale(sub(points[s.b], points[s.a]), 1 / s.rest);
      return [{ node: s.a, value: t }, { node: s.b, value: scale(t, -1) }];
    });
    constraints.push({ contact: { id: `feed-budget:${ti}`, kind: 'feed-length-budget', gapMm: yarn.feed.availableLengthMm - laidLengths[ti],
      pointsMm: [points[prep.starts[ti]], points[prep.starts[ti] + yarn.nodes.length - 1]],
      immovable: yarn.nodes.every(n => n.fixed), normalDefined: true }, derivatives });
  }
  // These are equality constraints on the DISCRETIZATION. They are appended
  // after physical contacts for stable replay, and exposed in a separate list.
  // No stretching energy, rest length reset, or material source is introduced.
  for (const [ti, yarn] of prep.input.threads.entries()) if (yarn.feed?.discretization === 'equal-chord') {
    for (let i = 1; i < yarn.nodes.length - 1; i++) {
      if (yarn.nodes[i].fixed) continue; // Held ports split mesh intervals.
      const node = prep.starts[ti] + i, left = sub(points[node], points[node - 1]), right = sub(points[node + 1], points[node]);
      const Lleft = length(left), Lright = length(right), t0 = scale(left, 1 / Lleft), t1 = scale(right, 1 / Lright);
      constraints.push({ mesh: { thread: ti, nodeIndex: i },
        contact: { id: `mesh:${ti}:${i}`, kind: 'mesh-equal-chord', gapMm: Lleft - Lright,
          pointsMm: [points[node - 1], points[node + 1]], immovable: false, normalDefined: Lleft > 1e-9 && Lright > 1e-9 },
        derivatives: [{ node: node - 1, value: scale(t0, -1) }, { node, value: sub(t0, scale(t1, -1)) },
          { node: node + 1, value: scale(t1, -1) }] });
    }
  }
  valid = valid && Number.isFinite(stretchNmm) && Number.isFinite(bendNmm) && Number.isFinite(tensionNmm) && Number.isFinite(stretchNmm + bendNmm + tensionNmm)
    && laidLengths.every(Number.isFinite)
    && Number.isFinite(maxRelativeStretch) && gradient.every(p => p.every(Number.isFinite))
    && constraints.every(c => Number.isFinite(c.contact.gapMm) && c.contact.pointsMm.every(pointValid)
      && c.derivatives.every(d => d.value.every(Number.isFinite)));
  return { gradient, constraints, maxRelativeStretch, valid, materialLedger,
    energy: { stretchNmm, bendNmm, tensionNmm, totalNmm: valid ? stretchNmm + bendNmm + tensionNmm : Infinity } };
}
type Evaluation = ReturnType<typeof evaluate>;
function augmented(prep: Prepared, e: Evaluation, multipliers: readonly number[], penalty = 0) {
  const gradient = e.gradient.map(p => [...p] as V), effective: number[] = [];
  let merit = e.energy.totalNmm;
  for (let i = 0; i < e.constraints.length; i++) {
    const c = e.constraints[i], lambda = multipliers[i] ?? 0;
    const force = c.contact.excludedLocal ? 0 : penalty
      ? c.mesh ? lambda - penalty * c.contact.gapMm : Math.max(0, lambda - penalty * c.contact.gapMm) : lambda;
    effective.push(force);
    if (penalty) merit += (force * force - lambda * lambda) / (2 * penalty);
    for (const d of c.derivatives) for (let k = 0; k < 3; k++) gradient[d.node][k] -= force * d.value[k];
  }
  const flat = gradient.flatMap((p, i) => prep.fixed[i] ? [0, 0, 0] : p);
  return { gradient, flat, merit, effective };
}
function finiteAugmented(a: ReturnType<typeof augmented>) {
  // Check reactions too: masking fixed DOFs must not hide NaN/Infinity.
  return Number.isFinite(a.merit) && a.gradient.every(p => p.every(Number.isFinite))
    && a.flat.every(Number.isFinite) && a.effective.every(Number.isFinite);
}
function residuals(prep: Prepared, e: Evaluation, lambda: readonly number[]): YarnEquilibriumResiduals {
  const a = augmented(prep, e, lambda);
  // Infinity is an unavailable-residual sentinel on numerical failure, never
  // a claim of infinite physical penetration or a zero-residual equilibrium.
  if (!e.valid || !finiteAugmented(a)) return { maxPenetrationMm: Infinity, freeGradientNormN: Infinity,
    freePhysicalGradientNormN: Infinity, maxMeshSpacingErrorMm: Infinity,
    maxComplementarityNmm: Infinity, maxRelativeStretch: e.maxRelativeStretch, maxMaterialOverdrawMm: Infinity };
  const physical = augmented(prep, e, lambda.map((value, i) => e.constraints[i].mesh ? 0 : value));
  return { maxPenetrationMm: Math.max(0, ...e.constraints.filter(c => !c.mesh && c.contact.kind !== 'feed-length-budget').map(c => -c.contact.gapMm)),
    maxMaterialOverdrawMm: Math.max(0, ...e.constraints.filter(c => c.contact.kind === 'feed-length-budget').map(c => -c.contact.gapMm)),
    maxMeshSpacingErrorMm: Math.max(0, ...e.constraints.filter(c => c.mesh).map(c => Math.abs(c.contact.gapMm))),
    freeGradientNormN: length(a.flat), freePhysicalGradientNormN: length(physical.flat), maxRelativeStretch: e.maxRelativeStretch,
    maxComplementarityNmm: Math.max(0, ...e.constraints.map((c, i) => c.mesh || c.contact.excludedLocal ? 0 : Math.abs((lambda[i] ?? 0) * c.contact.gapMm))) };
}
const passes = (r: YarnEquilibriumResiduals, o: Options) => Object.values(r).every(Number.isFinite)
  && r.maxPenetrationMm <= o.penetrationToleranceMm
  && r.maxMaterialOverdrawMm === 0
  && r.maxMeshSpacingErrorMm <= o.meshSpacingToleranceMm
  && r.freeGradientNormN <= o.gradientToleranceN && r.maxComplementarityNmm <= o.complementarityToleranceNmm;

function physicalContacts(e: Evaluation, lambda: readonly number[]): YarnContact[] {
  return e.constraints.flatMap((c, i) => c.mesh ? [] : [{ ...c.contact, multiplierN: lambda[i] } as YarnContact]);
}
function meshConstraints(prep: Prepared, e: Evaluation, lambda: readonly number[]): YarnMeshConstraint[] {
  return e.constraints.flatMap((c, i) => c.mesh ? [{ id: c.contact.id, kind: 'equal-chord' as const,
    threadId: prep.input.threads[c.mesh.thread].id, nodeIndex: c.mesh.nodeIndex, errorMm: c.contact.gapMm, multiplierN: lambda[i] }] : []);
}

/** Evaluate the same physical energy and finite contacts without solving. The
 * optional multipliers reproduce a solver result's Lagrangian residual. */
export function evaluateYarnEquilibrium(input: YarnEquilibriumInput, contactMultipliersN?: readonly number[], meshMultipliersN?: readonly number[]) {
  const prep = prepare(input), e = evaluate(prep, prep.positions);
  const physicalCount = e.constraints.filter(c => !c.mesh).length, meshCount = e.constraints.length - physicalCount;
  const contactLambda = contactMultipliersN ?? Array(physicalCount).fill(0), meshLambda = meshMultipliersN ?? Array(meshCount).fill(0);
  if (contactLambda.length !== physicalCount || contactLambda.some(x => !Number.isFinite(x) || x < 0)) throw new RangeError('Invalid contact multipliers');
  if (meshLambda.length !== meshCount || meshLambda.some(x => !Number.isFinite(x))) throw new RangeError('Invalid mesh multipliers');
  const lambda = [...contactLambda, ...meshLambda];
  const r = residuals(prep, e, lambda);
  return { numericallyValid: e.valid && finiteAugmented(augmented(prep, e, lambda)) && Object.values(r).every(Number.isFinite), energy: e.energy, residuals: r, materialLedger: e.materialLedger,
    gradientN: input.threads.map((t, i) => augmented(prep, e, lambda).gradient.slice(prep.starts[i], prep.starts[i] + t.nodes.length)),
    contacts: physicalContacts(e, lambda), meshConstraints: meshConstraints(prep, e, lambda) };
}

/** Positive, rotation-covariant numerical preconditioner. It changes SEARCH
 * directions only, never physical energy, material stiffness, or acceptance.
 * Segment Laplacians approximate stretching/tangent stiffness; active rho J^T J
 * supplies the otherwise very stiff normal contact directions. Matrix-free CG
 * is bounded and need not converge: the outer Armijo test remains authoritative. */
function contactPreconditioner(prep: Prepared, points: V[], e: Evaluation, effective: readonly number[], penalty: number) {
  const size = points.length * 3;
  const edges = prep.segments.map(s => {
    const yarn = prep.input.threads[s.thread], L = length(sub(points[s.b], points[s.a]));
    const bending = yarn.bendingStiffnessNmm2 / (L * L * L);
    return { a: s.a, b: s.b, k: (yarn.feed ? yarn.feed.tensionN / L : yarn.axialStiffnessN / s.rest) + 4 * bending };
  });
  const active = e.constraints.filter((c, i) => c.mesh || effective[i] > 0 && !c.contact.excludedLocal);
  const scaleNPerMm = Math.max(1e-12, ...edges.map(s => s.k));
  const regularization = scaleNPerMm * 1e-8;
  const diagonal = points.map(() => regularization);
  for (const edge of edges) { diagonal[edge.a] += edge.k; diagonal[edge.b] += edge.k; }
  for (const c of active) for (const d of c.derivatives) diagonal[d.node] += penalty * dot(d.value, d.value);
  const apply = (v: number[]) => {
    const out = v.map(x => regularization * x);
    for (const edge of edges) for (let k = 0; k < 3; k++) {
      const difference = edge.k * (v[3 * edge.b + k] - v[3 * edge.a + k]);
      out[3 * edge.a + k] -= difference; out[3 * edge.b + k] += difference;
    }
    for (const c of active) {
      let jv = 0;
      for (const d of c.derivatives) for (let k = 0; k < 3; k++) jv += d.value[k] * v[3 * d.node + k];
      for (const d of c.derivatives) for (let k = 0; k < 3; k++) out[3 * d.node + k] += penalty * jv * d.value[k];
    }
    for (let i = 0; i < points.length; i++) if (prep.fixed[i]) out.fill(0, 3 * i, 3 * i + 3);
    return out;
  };
  const diagonalSolve = (v: number[]) => v.map((x, i) => prep.fixed[Math.floor(i / 3)] ? 0 : x / diagonal[Math.floor(i / 3)]);
  return (rhs: number[]) => {
    const result = Array(size).fill(0) as number[], norm = length(rhs);
    if (norm === 0) return result;
    let residual = [...rhs], z = diagonalSolve(residual), direction = [...z], rz = dot(residual, z);
    for (let i = 0; i < Math.min(size, 60); i++) {
      const product = apply(direction), denominator = dot(direction, product);
      if (!(denominator > 0) || !Number.isFinite(denominator)) break;
      const step = rz / denominator;
      for (let j = 0; j < size; j++) { result[j] += step * direction[j]; residual[j] -= step * product[j]; }
      if (length(residual) <= norm * 1e-4) break;
      z = diagonalSolve(residual); const next = dot(residual, z), ratio = next / rz;
      direction = z.map((x, j) => x + ratio * direction[j]); rz = next;
    }
    return result.every(Number.isFinite) && dot(result, rhs) > 0 ? result : diagonalSolve(rhs);
  };
}

/** Augmented Lagrangian + limited-memory BFGS/Armijo. No convergence claim is
 * based on iteration count. Radii, fixed nodes, and material rest lengths never
 * become optimization variables. The finite discretization must be independently
 * refined and the resulting smooth mesh checked before physical acceptance. */
export function solveYarnEquilibrium(input: YarnEquilibriumInput): YarnEquilibriumResult {
  const prep = prepare(input), o = prep.options;
  let points = prep.positions.map(p => [...p] as V), e = evaluate(prep, points);
  let lambda = e.constraints.map(() => 0), penalty = o.initialPenaltyNPerMm, iterations = 0;
  let status: YarnEquilibriumResult['status'] = 'unresolved';
  const diagnostics: string[] = [], trace: YarnEquilibriumTrace[] = [];
  const finish = () => {
    const a = augmented(prep, e, lambda), r = residuals(prep, e, lambda);
    return { model: 'discrete-circular-elastic-yarn-v1' as const, status, numericallyValid: e.valid && finiteAugmented(a) && Object.values(r).every(Number.isFinite),
      threads: input.threads.map((t, i) => ({ ...t, restLengthsMm: [...t.restLengthsMm],
        ...(t.segmentMinimumSphereRadiiMm ? { segmentMinimumSphereRadiiMm: [...t.segmentMinimumSphereRadiiMm] } : {}),
        nodes: t.nodes.map((n, j) => ({ ...n, positionMm: [...points[prep.starts[i] + j]] as V })) })),
      energy: e.energy, residuals: r, materialLedger: e.materialLedger,
      contacts: physicalContacts(e, lambda), contactMultipliersN: lambda.filter((_, i) => !e.constraints[i].mesh),
      meshConstraints: meshConstraints(prep, e, lambda), meshMultipliersN: lambda.filter((_, i) => !!e.constraints[i].mesh),
      gradientN: input.threads.map((t, i) => a.gradient.slice(prep.starts[i], prep.starts[i] + t.nodes.length)), iterations, trace, diagnostics };
  };
  const obstacles = () => {
    for (const [ti, yarn] of input.threads.entries()) if (yarn.feed) {
      const held = yarn.nodes.flatMap((node, i) => node.fixed ? [points[prep.starts[ti] + i]] : []);
      const unavoidable = held.slice(1).reduce((sum, p, i) => sum + length(sub(p, held[i])), 0);
      if (unavoidable > yarn.feed.availableLengthMm) { status = 'rejected'; diagnostics.push(`Available material for ${yarn.id} is below the straight-distance lower bound between held spatial ports.`); return true; }
    }
    const impossible = e.constraints.find(c => !c.mesh && c.contact.immovable && c.contact.gapMm < -o.penetrationToleranceMm);
    if (impossible) { status = 'rejected'; diagnostics.push(`Fixed material violates ${impossible.contact.id}; moving free nodes cannot clear this witness.`); return true; }
    const singular = e.constraints.find((c, i) => !c.mesh && !c.contact.normalDefined
      && (c.contact.gapMm <= o.penetrationToleranceMm || (lambda[i] ?? 0) > 0));
    if (singular) { diagnostics.push(`Undefined contact normal at ${singular.contact.id}; supply a noncoincident, physically ordered seed.`); return true; }
    return false;
  };
  if (!e.valid) { diagnostics.push('Non-finite initial energy, gradient, contact, or segment arithmetic; no equilibrium was computed.'); return finish(); }
  if (obstacles()) return finish();
  // An inexact AL forcing sequence, not a physical acceptance tolerance. Work
  // chunks that miss this target continue the SAME subproblem and multiplier.
  let innerTarget = Math.max(o.gradientToleranceN * .5, length(augmented(prep, e, lambda, penalty).flat) * .1);
  const violationSize = (r: YarnEquilibriumResiduals) => Math.max(r.maxPenetrationMm, r.maxMaterialOverdrawMm, r.maxMeshSpacingErrorMm);
  let previousViolation = violationSize(residuals(prep, e, lambda));
  const history: { s: number[]; y: number[]; rho: number }[] = [];
  for (let outer = 0; outer < o.maxOuterIterations; outer++) {
    let a = augmented(prep, e, lambda, penalty);
    if (!finiteAugmented(a)) { diagnostics.push('Non-finite augmented energy, forces, or multipliers; numerical equilibrium is unresolved.'); return finish(); }
    let lineSearchFailed = false;
    for (let inner = 0; inner < o.maxIterationsPerOuter; inner++) {
      if (length(a.flat) <= innerTarget) break;
      const precondition = contactPreconditioner(prep, points, e, a.effective, penalty);
      let direction = [...a.flat]; const alpha: number[] = [];
      for (let k = history.length - 1; k >= 0; k--) { const h = history[k]; alpha[k] = h.rho * dot(h.s, direction); direction = direction.map((x, i) => x - alpha[k] * h.y[i]); }
      direction = precondition(direction);
      for (let k = 0; k < history.length; k++) { const h = history[k], beta = h.rho * dot(h.y, direction); direction = direction.map((x, i) => x + h.s[i] * (alpha[k] - beta)); }
      direction = direction.map(x => -x);
      let accepted = false;
      // First discard an unreliable quasi-Newton history; only then try the
      // raw steepest direction. A failed line search never updates lambda/rho.
      for (let attempt = 0; attempt < 3 && !accepted; attempt++) {
        if (attempt > 0) { history.length = 0; direction = (attempt === 1 ? precondition(a.flat) : a.flat).map(x => -x); }
        const slope = dot(a.flat, direction), norm = length(direction);
        if (!(slope < 0) || !Number.isFinite(slope) || !Number.isFinite(norm)) continue;
        // Rotation-invariant trust step; NOT a topology certificate.
        let step = Math.min(1, Math.min(...input.threads.map(t => t.radiusMm)) / Math.max(norm, 1e-30));
        for (let search = 0; search < 35; search++, step *= .5) {
          const next = points.map((p, i) => prep.fixed[i] ? [...p] as V : p.map((x, d) => x + step * direction[3 * i + d]) as V);
          const trial = evaluate(prep, next), trialA = augmented(prep, trial, lambda, penalty);
          if (trial.valid && finiteAugmented(trialA) && trialA.merit <= a.merit + 1e-4 * step * slope) {
            const oldFlat = points.flat(), s = next.flat().map((x, i) => x - oldFlat[i]), y = trialA.flat.map((x, i) => x - a.flat[i]), sy = dot(s, y);
            if (sy > 1e-12 * length(s) * length(y)) { history.push({ s, y, rho: 1 / sy }); if (history.length > 7) history.shift(); }
            points = next; e = trial; a = trialA; accepted = true; iterations++; break;
          }
        }
      }
      if (!accepted) { lineSearchFailed = true; break; }
    }
    const innerGradient = length(a.flat), subproblemConverged = innerGradient <= innerTarget;
    if (subproblemConverged) lambda = a.effective;
    const r = residuals(prep, e, lambda);
    trace.push({ ...r, outerIteration: outer + 1, iterations, penaltyNPerMm: penalty,
      elasticEnergyNmm: e.energy.stretchNmm + e.energy.bendNmm, potentialEnergyNmm: e.energy.totalNmm,
      innerTargetN: innerTarget, innerGradientNormN: innerGradient, subproblemConverged, multiplierNormN: length(lambda) });
    if (obstacles()) return finish();
    if (e.valid && finiteAugmented(a) && passes(r, o)) { status = 'converged'; return finish(); }
    if (lineSearchFailed) { diagnostics.push('Inner line search failed after history reset and steepest-descent fallback; multipliers and penalty were not advanced.'); return finish(); }
    if (subproblemConverged) {
      const violation = violationSize(r);
      // Escalate only if a sufficiently minimized subproblem fails to contract
      // its constraint violation. This is a numerical forcing rule, not physics.
      if ((r.maxPenetrationMm > o.penetrationToleranceMm || r.maxMaterialOverdrawMm > 0 || r.maxMeshSpacingErrorMm > o.meshSpacingToleranceMm)
        && violation > .25 * previousViolation)
        penalty = Math.min(o.maxPenaltyNPerMm, penalty * 5);
      previousViolation = violation;
      innerTarget = Math.max(o.gradientToleranceN * .5, innerTarget * .2);
      history.length = 0;
    }
  }
  diagnostics.push('Iteration/line-search budget ended before all discrete stationarity, penetration and complementarity tolerances passed.');
  return finish();
}
