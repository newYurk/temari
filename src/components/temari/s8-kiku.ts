import { boundCurvatureTimesRadius, type CurvatureBound } from './curvature-bound';
import { jiwariNormals } from './jiwari';
import { localMarkingRays, pointOnMarkingRayMm, type MarkingCircle } from './local-marking';
import { solveSpatialContact, type SpatialContactOptions, type SpatialContactResult, type SpatialCubicMm, type SpatialSupport } from './spatial-contact';
import { fitSpatialSeed } from './spatial-spline-seed';
import { curvesLength, settleSolve, shapeDifferenceMm } from './thick-rope-ladder';
import { closestSegmentApproach, evaluateCurve, sampleCurve, validateThreadCoupon } from './thread-geometry';
import type {
  C8ThreadCoupon, MarkingSupport, PathValidation, PiercingCorridor, PointMm, ThreadCrossing, ThreadCurve,
  ThreadOperation, ThreadOperationKind, ThreadSpan, ThreadWindow, ThreadZone,
} from './thread-path';

/**
 * Control Simple 8 kiku (GT14 placement). Every length is an explicit
 * engineering value unless marked as a GT14 placement.
 */
export const S8_KIKU_DIMENSIONS = Object.freeze({
  circumferenceMm: 230,
  /** GT14 placement: upper marks 5 mm from the pole. */
  innerMm: 5,
  /** GT14 placement: lower marks one third of the way from the equator to the pole. */
  outerFractionOfQuarter: 2 / 3,
  threadRadiusMm: 0.2,
  markingRadiusMm: 0.08,
  /** Thick-rope bend limit, r/rho = 0.8. Hidden bites must respect it too. */
  minBendRadiusMm: 0.25,
  halfBiteMm: 0.6,
  /** The thread enters and leaves the wrapping this steeply (degrees from the surface). */
  portAngleDeg: 45,
  /** Bite depth and handles keep the hidden turn well inside the bend limit. */
  depthMm: 1.2,
  biteEndHandleMm: 0.8,
  biteBottomHandleMm: 0.8,
  portGuardMm: 0.01,
  /** Computed windows at each port; beyond them a taut thread lies on a great circle. */
  upperWindowMm: 8,
  lowerWindowMm: 12,
  approachLiftMm: 0.35,
  departureLiftMm: 0.8,
  approachRiseMm: 2,
  upperApproachFallMm: 0.4,
  lowerApproachFallMm: 1,
  upperDepartureRiseMm: 0.3,
  lowerDepartureRiseMm: 1.2,
  departureFallMm: 2,
  closingLiftMm: 0.8,
  closingFallMm: 0.5,
  /** Round-2 upper stitch: a little more than one thread width lower, wide enough for the start bundle. */
  rowAdvanceMm: 0.45,
  wrapHalfBiteMm: 1,
  /**
   * Later lower stitch along the marking ray. Craft (owner 22.09): lay the next
   * thread snug against the previous flanks (one diameter, no gap), then pierce
   * where that lay meets the guideline. Into this tip's ~13.6° V that natural
   * advance is 2r/sin(α/2) ≈ 3.4 mm for r=0.2 — not an equal “outer pitch”
   * rule and not a clearance for great-circle legs. The default matches that
   * packed pierce; override only for diagnostics.
   */
  lowerRowAdvanceMm: 3.4,
  supportMarginMm: 2,
  poleGapMm: 1,
  tailLeadMm: 4,
  tailLengthMm: 3,
  tailDepthMm: 2,
  corridorMarginMm: 0.05,
  numericalClearanceMm: 0.003,
  /** Earlier material within this distance of a window's seed route is an obstacle (exact tube of its own pieces). */
  obstacleSearchMm: 3,
  maxObstacles: 256,
  validationToleranceMm: 0.001,
  lengthToleranceMm: 0.002,
  shapeToleranceMm: 0.02,
  curvatureToleranceRKappa: 0.02,
  /**
   * Fixed-point check of each window: a converged solve is restarted from its
   * own result until a restart moves it by at most this much (well below
   * shapeTolerance/4), so the ladder compares discrete minima rather than
   * wherever the stopping test fired in a flat contact valley.
   */
  settleToleranceMm: 0.0001,
  maxSettleRestarts: 4,
  /** Asymptotic refinement: the last difference contracts by this ratio or is below tolerance/4. */
  contraction: 0.75,
});
/**
 * Settings that define acceptance or the numerical solve. Overriding any of
 * them (or passing solverOptions) makes a computation diagnostic only; the
 * other dimensions define the modelled kiku itself.
 */
export const S8_KIKU_ACCEPTANCE_KEYS = Object.freeze(['numericalClearanceMm', 'portGuardMm', 'obstacleSearchMm', 'maxObstacles', 'validationToleranceMm',
  'lengthToleranceMm', 'shapeToleranceMm', 'curvatureToleranceRKappa', 'settleToleranceMm', 'maxSettleRestarts', 'contraction',
  // Seed shapes are initial guesses, but their length sets the model-derived ladder.
  'approachLiftMm', 'departureLiftMm', 'approachRiseMm', 'upperApproachFallMm', 'lowerApproachFallMm',
  'upperDepartureRiseMm', 'lowerDepartureRiseMm', 'departureFallMm', 'closingLiftMm', 'closingFallMm'] as const);
/** Canonical resolution ladder in spline spans per minimum bend radius; fixed before any result. */
export const S8_KIKU_LADDER: readonly number[] = Object.freeze([1, 1.5, 2, 3, 4]);
/** The acceptance decision uses the last two refinements of the canonical ladder. */
export const S8_KIKU_ASYMPTOTIC_REFINEMENTS = 2;
export type S8KikuDimensions = { -readonly [K in keyof typeof S8_KIKU_DIMENSIONS]: number };
/**
 * stitch: hidden start, lower catch, upper catch, departure (open end).
 * round: hidden start, seven catches and the return carried over the start;
 * the open end is the entry of the first round-2 upper stitch (Toolkit:
 * carry over before the last stitch of round 1).
 * row2: the round, then the second uwagake round: upper stitches under the
 * whole bundle, lower stitches farther out; the open end is the entry of the
 * first round-3 upper stitch.
 */
export type S8KikuStage = 'stitch' | 'round' | 'row2';
/** One stitch of the working order: a tip and the uwagake row (0 = first round). */
export type S8Catch = { tip: number; row: number };
export type S8KikuInput = Partial<S8KikuDimensions> & {
  /** Shift the first marking ray by one eighth-turn for the second working set. */
  phase?: 0 | 1;
  stage?: S8KikuStage;
  /** Complete uwagake rows to plan; defaults to 2 for row2 and 1 otherwise. */
  rows?: number;
  handedness?: 1 | -1;
  /** A Simple 8 pole; the default is +Y. */
  center?: PointMm;
  /** Upper tip where the thread starts (0, 2, 4 or 6); the stage is congruent for every choice. */
  startTip?: number;
  /** Diagnostic only: a non-canonical ladder can never be accepted. */
  factors?: readonly number[];
  solverOptions?: SpatialContactOptions;
};
export type S8Tip = {
  index: number;
  role: 'upper' | 'lower';
  distanceMm: number;
  markMm: PointMm;
  /** Unit radial, outward ray direction (away from the pole) and working direction. */
  frame: { radial: PointMm; outward: PointMm; progress: PointMm };
  entry: PointMm;
  exit: PointMm;
};
export type S8Window = {
  id: string;
  kind: 'approach' | 'departure' | 'closing';
  tip: number;
  /** Uwagake row of the stitch the window belongs to (a closing window: the row it enters). */
  row: number;
  /** Round in which the window is laid (the row of the stitch its leg leaves); a closing window finishes its round. */
  round: number;
  seed: ThreadCurve[];
  seedLengthMm: number;
  minimumSpans: number;
};
export type S8KikuLevel = {
  factor: number;
  /** Constraint probes per spline span (4; the conditioning rebuild doubles it). */
  samplesPerSpan: number;
  /** Windows of rounds below this number were taken from the earlier-round construction. */
  reusedRounds: number;
  coupon: C8ThreadCoupon;
  /** restarts: warm restarts used; settleMoveMm: the last restart's shape change (NaN if none ran). */
  solves: { windowId: string; controlCount: number; result: SpatialContactResult; obstacles: number; restarts: number; settleMoveMm: number }[];
  validation: PathValidation;
  /** Surface crossings present in projection but not declared (must be empty). */
  undeclaredCrossings: string[];
  /** Certified r*kappa over every working span. */
  curvature: CurvatureBound;
  /** Certified r*kappa over the prescribed hidden spans only. */
  hiddenCurvature: CurvatureBound;
  lengthMm: number;
  diagnostics: string[];
};
export type S8KikuRefinement = { windowId: string; from: number; to: number; lengthDifferenceMm: number; shapeDifferenceMm: number };
export type S8KikuResult = {
  status: 'accepted' | 'rejected' | 'unresolved';
  stage: S8KikuStage;
  rows: number;
  dimensions: S8KikuDimensions;
  factors: number[];
  canonical: boolean;
  tips: S8Tip[];
  windows: S8Window[];
  levels: S8KikuLevel[];
  /** The finest level rebuilt with twice as many constraint probes per span. */
  perturbed: S8KikuLevel;
  refinements: S8KikuRefinement[];
  conditioning: S8KikuRefinement[];
  /** Measured puncture half-widths: where the bite centre line crosses the ball surface. */
  bites: { tip: number; row: number; entryHalfWidthMm: number; exitHalfWidthMm: number }[];
  metrics: { lengthDifferenceMm: number; maxShapeDifferenceMm: number; curvatureLimit: number };
  /** Finest level; diagnostic even when not accepted. */
  coupon: C8ThreadCoupon;
  diagnostics: string[];
  /**
   * Earlier rounds, each accepted or not by its own ladder. The levels above
   * refine only the last round and reuse the finest level of these (rule 1).
   */
  earlierRounds?: S8KikuResult[];
};

type V = PointMm;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V, b: V): V => add(a, mul(b, -1));
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V) => mul(a, 1 / norm(a));
const angleBetween = (a: V, b: V) => Math.atan2(norm(cross(a, b)), dot(a, b));
/** Unit tangent at a toward b along their great circle. */
const toward = (a: V, b: V) => { const p = unit(a), q = unit(b); return unit(sub(q, mul(p, dot(p, q)))); };
const bezier = (a: V, b: V, c: V, d: V): ThreadCurve => ({ kind: 'bezier', controls: [a, b, c, d] });
const start = (c: ThreadCurve) => c.kind === 'arc' ? c.from : c.controls[0];
const end = (c: ThreadCurve) => c.kind === 'arc' ? c.to : c.controls[3];

/** A great-circle leg between two ports at the same radius. */
function greatCircle(from: V, to: V) {
  const p = unit(from), d = toward(from, to), radius = norm(from), angle = angleBetween(from, to);
  return {
    length: angle * radius,
    at: (s: number, r = radius): V => mul(add(mul(p, Math.cos(s / radius)), mul(d, Math.sin(s / radius))), r),
    tangent: (s: number): V => add(mul(p, -Math.sin(s / radius)), mul(d, Math.cos(s / radius))),
  };
}
type Leg = ReturnType<typeof greatCircle>;

/**
 * Surface -> raised plateau -> surface along a leg. The window ends take the
 * given tangents (a port may dive into or rise out of the wrapping).
 */
function raisedSeed(leg: Leg, s0: number, s1: number, rise: number, fall: number, lift: number, surface: number, startTangent?: V, endTangent?: V): ThreadCurve[] {
  if (!(s1 - s0 > rise + fall + 1e-6)) throw new RangeError('A window seed needs a positive plateau.');
  const p0 = leg.at(s0, surface), p1 = leg.at(s0 + rise, surface + lift), p2 = leg.at(s1 - fall, surface + lift), p3 = leg.at(s1, surface);
  return [
    bezier(p0, add(p0, mul(startTangent ?? leg.tangent(s0), rise / 3)), sub(p1, mul(leg.tangent(s0 + rise), rise / 3)), p1),
    { kind: 'arc', from: p1, to: p2 },
    bezier(p2, add(p2, mul(leg.tangent(s1 - fall), fall / 3)), sub(p3, mul(endTangent ?? leg.tangent(s1), fall / 3)), p3),
  ];
}

const polyline = (curves: readonly ThreadCurve[]) => curves.flatMap(c => sampleCurve(c, .05).points);
/** Whether a piece of earlier material comes within distance of the route (sampling error included). */
function near(curve: ThreadCurve, route: readonly V[], distance: number) {
  const sample = sampleCurve(curve, .05), points = sample.points;
  for (let i = 1; i < route.length; i++) for (let j = 1; j < points.length; j++)
    if (closestSegmentApproach(route[i - 1], route[i], points[j - 1], points[j]).distanceMm < distance + sample.errorBoundMm) return true;
  return false;
}

/**
 * Earlier material as exact tubes: its Bezier pieces near the route form one
 * curve support, its arcs (about the ball centre) are arc supports. Nothing is
 * approximated, so no cover tolerance enters the solve.
 */
function tubes(id: string, curves: readonly ThreadCurve[], radius: number, route: readonly V[], distance: number): SpatialSupport[] {
  const out: SpatialSupport[] = [], pieces: SpatialCubicMm[] = [];
  curves.forEach((curve, i) => {
    if (!near(curve, route, distance + radius)) return;
    if (curve.kind === 'bezier') pieces.push(curve.controls);
    else out.push({ id: `${id}-a${i + 1}`, kind: 'arc', centerMm: [0, 0, 0], fromMm: curve.from, toMm: curve.to, radiusMm: radius });
  });
  if (pieces.length) out.unshift({ id, kind: 'curve', piecesMm: pieces, radiusMm: radius });
  return out;
}

/**
 * Surface crossings in the central projection onto the tangent plane at the
 * pole (valid for material in the pole's open hemisphere). Returns pairs that
 * certainly cross or cannot be separated from a crossing, excluding
 * neighbouring pieces of one thread. With includeHidden, piercing and buried
 * spans are projected too (a hidden passage under surface material).
 */
export function projectedCrossings(coupon: C8ThreadCoupon, pole: V, tolerance: number, includeHidden = false) {
  const e1 = unit(Math.abs(pole[0]) < .9 ? cross(pole, [1, 0, 0]) : cross(pole, [0, 1, 0])), e2 = cross(pole, e1);
  type Seg = { a: [number, number]; b: [number, number]; error: number };
  const project = (curve: ThreadCurve) => {
    const s = sampleCurve(curve, tolerance), segs: Seg[] = [];
    for (let i = 1; i < s.points.length; i++) {
      const p = s.points[i - 1], q = s.points[i], dp = dot(p, pole), dq = dot(q, pole), e = s.errorBoundMm, dmin = Math.min(dp, dq);
      if (!(dmin > e)) throw new RangeError('Material leaves the projection hemisphere.');
      segs.push({ a: [dot(p, e1) / dp, dot(p, e2) / dp], b: [dot(q, e1) / dq, dot(q, e2) / dq],
        error: e / (dmin - e) + Math.max(norm(p), norm(q)) * e / (dmin * (dmin - e)) });
    }
    return segs;
  };
  const box = (segs: Seg[]) => {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const s of segs) for (const p of [s.a, s.b]) {
      b[0] = Math.min(b[0], p[0] - s.error); b[1] = Math.min(b[1], p[1] - s.error);
      b[2] = Math.max(b[2], p[0] + s.error); b[3] = Math.max(b[3], p[1] + s.error);
    }
    return b;
  };
  const items = [
    ...coupon.spans.map((span, index) => {
      const used = includeHidden || span.zone === 'surface';
      return { id: span.id, index, surface: used, segs: used ? project(span.curve) : [] };
    }),
    ...coupon.supports.map(support => ({ id: support.id, index: -1, surface: true, segs: project(support.curve) })),
  ].filter(item => item.surface).map(item => ({ ...item, box: box(item.segs) }));
  const orient = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const relation = (s: Seg, t: Seg) => {
    const margin = s.error + t.error;
    const ls = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), lt = Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]);
    const o1 = orient(s.a, s.b, t.a), o2 = orient(s.a, s.b, t.b), o3 = orient(t.a, t.b, s.a), o4 = orient(t.a, t.b, s.b);
    if (o1 * o2 < 0 && o3 * o4 < 0 && Math.min(Math.abs(o1), Math.abs(o2)) > ls * margin && Math.min(Math.abs(o3), Math.abs(o4)) > lt * margin) return 'cross';
    const lift = (p: [number, number]): V => [p[0], p[1], 0];
    const dist = closestSegmentApproach(lift(s.a), lift(s.b), lift(t.a), lift(t.b)).distanceMm;
    return dist <= margin ? 'touch' : 'apart';
  };
  const found: { a: string; b: string; certain: boolean }[] = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    if (A.index >= 0 && B.index >= 0 && coupon.spans[A.index].threadId === coupon.spans[B.index].threadId && Math.abs(A.index - B.index) <= 1) continue;
    if (A.box[0] > B.box[2] || B.box[0] > A.box[2] || A.box[1] > B.box[3] || B.box[1] > A.box[3]) continue;
    let certain = false, touch = false;
    for (const s of A.segs) for (const t of B.segs) {
      const r = relation(s, t);
      if (r === 'cross') certain = true; else if (r === 'touch') touch = true;
    }
    if (certain || touch) found.push({ a: A.id, b: B.id, certain });
  }
  return found;
}

/** Shared, level-independent construction plan. */
export function planS8Kiku(input: S8KikuInput = {}) {
  const d: S8KikuDimensions = { ...S8_KIKU_DIMENSIONS };
  for (const key of Object.keys(d) as (keyof S8KikuDimensions)[]) {
    if (input[key] !== undefined) d[key] = input[key]!;
    if (key === 'maxSettleRestarts') {
      if (!Number.isInteger(d[key]) || d[key] < 0 || d[key] > 16) throw new RangeError('maxSettleRestarts must be an integer from 0 to 16');
    } else if (!Number.isFinite(d[key]) || d[key] <= 0) throw new RangeError(`${key} must be finite and positive`);
  }
  const stage = input.stage ?? 'stitch', handedness = input.handedness ?? 1, s0 = input.startTip ?? 0;
  const requestedRows = input.rows ?? (stage === 'row2' ? 2 : 1);
  const phase = input.phase ?? 0;
  if (phase !== 0 && phase !== 1) throw new RangeError('Simple 8 phase must be 0 or 1.');
  if (![0, 2, 4, 6].includes(s0)) throw new RangeError('startTip must be an upper tip: 0, 2, 4 or 6.');
  const tipAt = (k: number) => (s0 + k) % 8;
  const factors = [...(input.factors ?? S8_KIKU_LADDER)];
  const canonical = factors.length === S8_KIKU_LADDER.length && factors.every((f, i) => f === S8_KIKU_LADDER[i]);
  const overridden = [...S8_KIKU_ACCEPTANCE_KEYS.filter(k => d[k] !== S8_KIKU_DIMENSIONS[k]),
    ...(input.solverOptions && Object.keys(input.solverOptions).length ? ['solverOptions'] : [])];
  if (stage !== 'stitch' && stage !== 'round' && stage !== 'row2') throw new RangeError('Unknown Simple 8 stage.');
  if (!Number.isInteger(requestedRows) || requestedRows < 1 || requestedRows > 10
    || (stage === 'stitch' && requestedRows !== 1)) {
    throw new RangeError('Simple 8 rows must be an integer from 1 to 10 (stitch stage is one row).');
  }
  if (handedness !== 1 && handedness !== -1) throw new RangeError('handedness must be +1 or -1');
  if (factors.length < 3 || factors.length > 6 || factors.some((f, i) => !(f >= 1) || (i > 0 && f < factors[i - 1] * 1.25)))
    throw new RangeError('A Simple 8 ladder needs three to six factors, each at least 1.25 times the previous one.');
  const R = d.circumferenceMm / (2 * Math.PI), r = d.threadRadiusMm, S = R + r + d.portGuardMm;
  const outerMm = d.circumferenceMm / 4 * d.outerFractionOfQuarter;
  const beta = d.portAngleDeg * Math.PI / 180;
  if (d.minBendRadiusMm <= r || r / d.minBendRadiusMm + d.curvatureToleranceRKappa >= 1 || d.outerFractionOfQuarter >= 1
    || d.innerMm >= outerMm || d.halfBiteMm <= r || d.wrapHalfBiteMm <= d.halfBiteMm || d.depthMm >= R / 4
    || d.innerMm <= d.poleGapMm || d.portAngleDeg >= 90 || d.contraction >= 1 || d.rowAdvanceMm <= 2 * r || d.lowerRowAdvanceMm <= 2 * r || !Number.isInteger(d.maxObstacles))
    throw new RangeError('Simple 8 dimensions do not define a valid control kiku.');

  // Actual Simple 8 rays at the pole; the eight rays alternate upper/lower marks.
  const center = unit(input.center ?? [0, 1, 0]);
  const circles: MarkingCircle[] = jiwariNormals('simple').map((normal, i) => ({ id: `s8-${i}`, normal }));
  const first = circles.find(c => Math.abs(dot(center, unit(c.normal))) < 1e-9);
  if (!first) throw new RangeError('The center is not a Simple 8 pole.');
  const rays = localMarkingRays({ center, circles, handedness, firstRay: { circleId: first.id, tangent: unit(cross(first.normal, center)) } });
  if (rays.length !== 8 || rays.some((ray, i) => Math.abs(ray.angleRad - i * Math.PI / 4) > 1e-9))
    throw new RangeError('A Simple 8 pole requires eight equally spaced rays.');
  const orderedRays = phase ? [...rays.slice(1), rays[0]] : rays;
  const frames = orderedRays.map((ray, index) => {
    const role = index % 2 === 0 ? 'upper' as const : 'lower' as const;
    const distanceMm = role === 'upper' ? d.innerMm : outerMm, theta = distanceMm / R;
    const markMm = pointOnMarkingRayMm(center, ray.tangent, distanceMm, d.circumferenceMm), m = unit(markMm);
    const outward = unit(add(mul(center, -Math.sin(theta)), mul(ray.tangent, Math.cos(theta))));
    const progress = mul(unit(cross(center, m)), handedness);
    const at = (across: number, along: number, radius: number) => mul(unit(add(m, add(mul(progress, across / R), mul(outward, along / R)))), radius);
    return { index, role, distanceMm, markMm, m, outward, progress, at, circleId: ray.circleId };
  });
  const tips: S8Tip[] = frames.map(f => ({ index: f.index, role: f.role, distanceMm: f.distanceMm, markMm: f.markMm,
    frame: { radial: f.m, outward: f.outward, progress: f.progress },
    entry: f.at(d.halfBiteMm, 0, S), exit: f.at(-d.halfBiteMm, 0, S) }));
  const windowLength = (tip: number) => frames[tip].role === 'upper' ? d.upperWindowMm : d.lowerWindowMm;
  // Packed lower pierce: snug flank lay (one diameter) into the tip V meets the
  // guideline this far along the ray. Used when the caller did not override.
  const lowerPackedAdvanceMm = (() => {
    const lower = frames.find(f => f.role === 'lower');
    if (!lower) return d.lowerRowAdvanceMm;
    const left = frames[(lower.index + 7) % 8]!, right = frames[(lower.index + 1) % 8]!;
    const half = angleBetween(toward(lower.markMm, left.markMm), toward(lower.markMm, right.markMm)) / 2;
    const s = Math.sin(half);
    return s > 1e-9 ? (2 * r) / s : d.lowerRowAdvanceMm;
  })();
  if (!('lowerRowAdvanceMm' in input) || input.lowerRowAdvanceMm === undefined) {
    (d as S8KikuDimensions).lowerRowAdvanceMm = lowerPackedAdvanceMm;
  }
  // Row k: upper stitches k thread widths lower and wider (round 2: wrapHalfBite);
  // lower stitches k packed pierces farther out (snug flank lay → ray crossing).
  const rowHalf = (tip: number, row: number) => frames[tip].role === 'lower' || row === 0 ? d.halfBiteMm
    : row === 1 ? d.wrapHalfBiteMm : d.halfBiteMm + row * (d.wrapHalfBiteMm - d.halfBiteMm);
  const rowAlong = (tip: number, row: number) => row * (frames[tip].role === 'upper' ? d.rowAdvanceMm : d.lowerRowAdvanceMm);
  /** Entry (+q) or exit (-q) port of a stitch. */
  const port = (c: S8Catch, side: 1 | -1): V => c.row === 0 ? (side > 0 ? tips[c.tip].entry : tips[c.tip].exit)
    : frames[c.tip].at(side * rowHalf(c.tip, c.row), rowAlong(c.tip, c.row), S);
  /** Where the stitch crosses its marking line on the ball surface. */
  const markOf = (c: S8Catch): V => c.row === 0 ? frames[c.tip].markMm : frames[c.tip].at(0, rowAlong(c.tip, c.row), R);
  const same = (a: S8Catch, b: S8Catch) => a.tip === b.tip && a.row === b.row;

  // Chronology: catches in working order; the leg between consecutive ports.
  const rows = requestedRows, round = [1, 2, 3, 4, 5, 6, 7];
  const catches: S8Catch[] = stage === 'stitch' ? [1, 2].map(k => ({ tip: tipAt(k), row: 0 }))
    : Array.from({ length: rows }, (_, row) => [...(row ? [{ tip: s0, row }] : []), ...round.map(k => ({ tip: tipAt(k), row }))]).flat();
  const openEnd: S8Catch = stage === 'stitch' ? { tip: tipAt(3), row: 0 } : { tip: s0, row: rows };
  const legs = [...catches, openEnd].map((to, i) => {
    const from = i ? catches[i - 1] : { tip: s0, row: 0 };
    return { from, to, open: i === catches.length, leg: greatCircle(port(from, -1), port(to, 1)) };
  });
  const legInto = (c: S8Catch) => legs.find(l => same(l.to, c))!;
  const legOut = (c: S8Catch) => legs.find(l => same(l.from, c))!;
  // Port tangents dive into / rise out of the wrapping at portAngleDeg.
  const diving = (p: V, along: V): V => unit(add(mul(along, Math.cos(beta)), mul(unit(p), -Math.sin(beta))));
  const rising = (p: V, along: V): V => unit(add(mul(along, Math.cos(beta)), mul(unit(p), Math.sin(beta))));
  const entryTangent = (c: S8Catch) => { const l = legInto(c).leg; return diving(port(c, 1), l.tangent(l.length)); };
  const exitTangent = (c: S8Catch) => rising(port(c, -1), legOut(c).leg.tangent(0));

  const windows: S8Window[] = [];
  const windowId = (kind: S8Window['kind'], c: S8Catch) => kind === 'closing'
    ? (c.row === 1 ? `closing-${c.tip}` : `closing-${c.tip}-r${c.row}`)
    : (c.row ? `${kind}-${c.tip}-r${c.row + 1}` : `${kind}-${c.tip}`);
  const addWindow = (kind: S8Window['kind'], c: S8Catch, round: number, seed: ThreadCurve[]) => {
    const seedLengthMm = curvesLength(seed);
    const w: S8Window = { id: windowId(kind, c), kind, tip: c.tip, row: c.row, round, seed, seedLengthMm, minimumSpans: Math.ceil(seedLengthMm / d.minBendRadiusMm) };
    windows.push(w);
    return w;
  };
  // Later rows are laid over earlier ones: their window seeds start one thread diameter higher per row.
  const rowLift = (row: number) => row * 2 * r;
  type Piece = { kind: 'window'; window: S8Window } | { kind: 'arc'; curve: ThreadCurve };
  const legPieces = legs.map(({ from, to, open, leg }) => {
    const pieces: Piece[] = [], upperFrom = frames[from.tip].role === 'upper', out = windowLength(from.tip);
    pieces.push({ kind: 'window', window: addWindow('departure', from, from.row, raisedSeed(leg, 0, out,
      upperFrom ? d.upperDepartureRiseMm : d.lowerDepartureRiseMm, d.departureFallMm, d.departureLiftMm + rowLift(from.row), S, exitTangent(from))) });
    if (stage === 'stitch' && open) return pieces; // open end of the stitch stage
    const into = windowLength(to.tip);
    if (!(leg.length - out - into > 1)) throw new RangeError('Leg windows overlap; the leg is too short.');
    pieces.push({ kind: 'arc', curve: { kind: 'arc', from: leg.at(out), to: leg.at(leg.length - into) } });
    // Entering the start tip of a new row carries the thread over the start of the previous row.
    const closing = to.tip === s0 && to.row > 0;
    const seed = closing
      ? raisedSeed(leg, leg.length - into, leg.length, d.approachRiseMm, d.closingFallMm, d.closingLiftMm + rowLift(to.row - 1), S, undefined, diving(port(to, 1), leg.tangent(leg.length)))
      : raisedSeed(leg, leg.length - into, leg.length, d.approachRiseMm,
        frames[to.tip].role === 'upper' ? d.upperApproachFallMm : d.lowerApproachFallMm, d.approachLiftMm + rowLift(to.row), S, undefined, entryTangent(to));
    pieces.push({ kind: 'window', window: addWindow(closing ? 'closing' : 'approach', to, from.row, seed) });
    return pieces;
  });
  for (const w of windows) if (Math.ceil(w.minimumSpans * factors.at(-1)!) + 3 > 256)
    throw new RangeError(`${w.id}: the finest level exceeds the solver's control budget.`);

  // Physical marking segments around each tip, disjoint near the pole.
  // The same segments for every stage, so an earlier round is solved against the same marking.
  const supports: MarkingSupport[] = frames.map(f => {
    const reach = windowLength(f.index) + d.supportMarginMm;
    const inner = f.role === 'upper' ? Math.min(reach, f.distanceMm - d.poleGapMm) : reach;
    return { id: `jiwari-${f.index}`, circleId: f.circleId, radiusMm: d.markingRadiusMm,
      curve: { kind: 'arc', from: f.at(0, -inner, R + d.markingRadiusMm), to: f.at(0, reach, R + d.markingRadiusMm) } };
  });

  // Prescribed needle passages: in at +q, under the marking line, out at -q.
  const bite = (c: S8Catch): ThreadCurve[] => {
    const f = frames[c.tip], E = port(c, 1), X = port(c, -1), B = mul(c.row ? unit(markOf(c)) : f.m, R - d.depthMm);
    const first = [E, add(E, mul(entryTangent(c), d.biteEndHandleMm)), add(B, mul(f.progress, d.biteBottomHandleMm)), B] as const;
    const second = [B, sub(B, mul(f.progress, d.biteBottomHandleMm)), sub(X, mul(exitTangent(c), d.biteEndHandleMm)), X] as const;
    // Convex hulls on opposite sides of the marking plane give one transverse passage.
    if (first.slice(0, 3).some(p => dot(p, f.progress) <= 0) || second.slice(1).some(p => dot(p, f.progress) >= 0))
      throw new RangeError('The prescribed bite would not cross its marking line once.');
    return [bezier(...first), bezier(...second)];
  };
  const hullCorridor = (curves: readonly ThreadCurve[], centerMm: V, maxDepthMm: number): PiercingCorridor => ({ centerMm,
    // Bezier control hulls contain the curves, so this radius is a certified bound.
    radiusMm: Math.max(...curves.flatMap(c => c.kind === 'arc' ? [c.from, c.to] : [...c.controls]).map(p => norm(sub(p, centerMm)))) + r + d.corridorMarginMm,
    maxDepthMm });
  const puncture = (curve: ThreadCurve, fromStart: boolean) => {
    // First parameter (from the port) where the centre line reaches the ball surface.
    for (let i = 0; i <= 4096; i++) {
      const t = fromStart ? i / 4096 : 1 - i / 4096;
      if (norm(evaluateCurve(curve, t)) <= R) return evaluateCurve(curve, t);
    }
    return fromStart ? start(curve) : end(curve);
  };
  const bites = catches.map(c => {
    const [a, b] = bite(c), f = frames[c.tip], mark = markOf(c);
    return { tip: c.tip, row: c.row, entryHalfWidthMm: Math.abs(dot(sub(puncture(a, true), mark), f.progress)),
      exitHalfWidthMm: Math.abs(dot(sub(puncture(b, false), mark), f.progress)) };
  });
  const startDir = exitTangent({ tip: s0, row: 0 }), startExit = tips[s0].exit, tailRadius = R - d.tailDepthMm;
  const along0 = legs[0].leg.tangent(0);
  const back = (angle: number) => mul(add(mul(unit(startExit), Math.cos(angle)), mul(along0, -Math.sin(angle))), tailRadius);
  const startJoin = back(d.tailLeadMm / R), startAnchor = back((d.tailLeadMm + d.tailLengthMm) / R);
  const startCurves: { zone: ThreadZone; curve: ThreadCurve }[] = [
    { zone: 'buried', curve: { kind: 'arc', from: startAnchor, to: startJoin } },
    { zone: 'piercing', curve: bezier(startJoin, add(startJoin, mul(toward(startJoin, startExit), d.tailLeadMm / 3)),
      sub(startExit, mul(startDir, d.tailLeadMm / 3)), startExit) },
  ];
  // Every stitch (and the open end) must lie within the window reach of its marking segment
  // (the segment extends supportMarginMm farther).
  for (const c of [...catches, openEnd]) if (!(rowAlong(c.tip, c.row) <= windowLength(c.tip)))
    throw new RangeError(`Stitch at tip ${c.tip}, row ${c.row} lies beyond the window reach of its marking segment.`);
  // The crossing checks project onto the tangent plane at the pole; fail before solving if the
  // prescribed material cannot be projected (solved windows are checked after solving).
  const horizon = (p: V) => dot(unit(p), center) > Math.sin(Math.PI / 180);
  if (!supports.every(s => horizon(start(s.curve)) && horizon(end(s.curve))) || !windows.every(w => w.seed.every(c => horizon(start(c)) && horizon(end(c)))))
    throw new RangeError('Marking segments or windows reach within 1 degree of the pole\'s horizon; the crossing check cannot project them.');
  const hiddenCurves = [...startCurves.map(c => c.curve), ...catches.flatMap(bite)];
  const hiddenCurvature = boundCurvatureTimesRadius(hiddenCurves, r);
  return { d, stage, handedness, phase, startTip: s0, factors, canonical, overridden, R, r, S, center, frames, tips, rows, catches, openEnd, legs, legPieces, windows, supports,
    bite, markOf, hullCorridor, bites, startCurves, hiddenCurves, hiddenCurvature, solverOptions: input.solverOptions };
}
export type S8KikuPlan = ReturnType<typeof planS8Kiku>;

/**
 * Deterministic unsolved construction used only to inspect/integrate the
 * sourced topology. Acceptance still requires `buildS8KikuLevel` and its
 * contact solve; callers must not label this seed as a finished Kiku.
 */
export function seedS8KikuCoupon(plan: S8KikuPlan): C8ThreadCoupon {
  const spans: ThreadSpan[] = [], operations: ThreadOperation[] = [];
  const op = (kind: ThreadOperationKind, step: number, markIndex?: number) => {
    const value: ThreadOperation = {
      id: `s8-seed-op-${operations.length + 1}-${kind}`,
      order: operations.length,
      step,
      kind,
      spanIds: [],
      ...(markIndex === undefined ? {} : { markId: `mark-${markIndex + 1}` }),
      ...(kind === 'catch' ? { captureIds: [`jiwari-${markIndex}`], pass: 'under' as const } : {}),
    };
    operations.push(value);
    return value;
  };
  const put = (operation: ThreadOperation, zone: ThreadZone, curve: ThreadCurve) => {
    const span: ThreadSpan = {
      id: `s8-seed-span-${spans.length + 1}`,
      opId: operation.id,
      threadId: 's8-kiku-seed-thread',
      step: operation.step,
      zone,
      curve,
    };
    spans.push(span);
    operation.spanIds.push(span.id);
  };
  const startOp = op('start', 0);
  plan.startCurves.forEach(s => put(startOp, s.zone, s.curve));
  plan.legPieces.forEach((pieces, legIndex) => {
    const lay = op('lay', legIndex + 1);
    pieces.forEach(piece => {
      const curves = piece.kind === 'arc' ? [piece.curve] : piece.window.seed;
      curves.forEach(curve => put(lay, 'surface', curve));
    });
    const { to, open } = plan.legs[legIndex];
    if (!open) {
      const capture = op('catch', legIndex + 1, to.tip);
      plan.bite(to).forEach(curve => put(capture, 'piercing', curve));
    }
  });
  op('finish', plan.legPieces.length);
  return {
    kind: 'engineering-thread-path',
    bodyRadiusMm: plan.R,
    threadId: 's8-kiku-seed-thread',
    threadRadiusMm: plan.r,
    spans,
    operations,
    supports: plan.supports,
    marks: plan.frames.map(f => ({
      id: `mark-${f.index + 1}`,
      rayIndex: f.index,
      circleId: f.circleId,
      role: f.role === 'upper' ? 'inner' : 'outer',
      distanceMm: f.distanceMm,
      positionMm: f.markMm,
    })),
    fixture: { ...plan.d, rows: plan.rows, seedOnly: 1 },
    assumptions: [
      'Unsolved S8 Kiku seed: sourced operation order and explicit needle passages, not an accepted contact path.',
    ],
  };
}

/** Fixed environment for a later, independent working thread. Never a renderer lift. */
export type S8KikuEnvironment = {
  marking: MarkingSupport[];
  laidThreads: C8ThreadCoupon[];
};

/**
 * One complete construction at one resolution factor and constraint sampling
 * (probes per span, default the solver's). With `earlier`, windows laid in an
 * earlier round are not solved again: their solves (curves, metrics) are taken
 * from that level, the finest construction of the earlier round, and only the
 * last round is solved at this factor. Everything else - bites, arcs, obstacles,
 * crossings and the complete-path check - is built as usual.
 */
export function buildS8KikuLevel(plan: S8KikuPlan, factor: number, samplesPerSpan = plan.solverOptions?.samplesPerSpan ?? 4, earlier?: S8KikuLevel, environment?: S8KikuEnvironment): S8KikuLevel {
  const { d, R, r, legs, legPieces, bite, markOf, hullCorridor, startCurves } = plan;
  const supports = [...plan.supports, ...(environment?.marking ?? [])];
  const s0 = plan.startTip;
  const markingObstacles: SpatialSupport[] = supports.map(s => ({ id: s.id, kind: 'arc', centerMm: [0, 0, 0],
    fromMm: start(s.curve), toMm: end(s.curve), radiusMm: s.radiusMm + d.numericalClearanceMm }));
  const spans: ThreadSpan[] = [], operations: ThreadOperation[] = [], crossings: ThreadCrossing[] = [];
  // Earlier material grouped as it was laid: whole windows, whole bites, arcs.
  const groups: { id: string; curves: ThreadCurve[]; startMm: V; endMm: V }[] = [];
  const windowSpans = new Map<string, string[]>();
  const biteSpans: { name: string; round: number; op: ThreadOperation; ids: string[] }[] = [];
  const solves: S8KikuLevel['solves'] = [], diagnostics: string[] = [];
  // Upper-tip departures rest on their approach in a soft valley (stiffness
  // about 0.36 T/mm under a 0.9 T wrap load), so a looser penetration or
  // stationarity test moves the finest window by 2e-3 mm; these stop within
  // 1.4e-4 mm of the strictest setting tried (spec/s8-control-kiku.md).
  const solverOptions: SpatialContactOptions = { maxIterations: 8000, maxOuterIterations: 60, feasibilityToleranceMm: .0001,
    stationarityTolerance: 2e-6, complementarityToleranceMm: 5e-7, curvatureTolerance: d.curvatureToleranceRKappa, maxConstraintSamples: 4096,
    ...plan.solverOptions, samplesPerSpan };
  const op = (kind: ThreadOperationKind, step: number, markIndex?: number) => {
    const o: ThreadOperation = { id: `s8-op-${operations.length + 1}-${kind}`, order: operations.length, step, kind, spanIds: [],
      ...(markIndex === undefined ? {} : { markId: `mark-${markIndex + 1}` }),
      ...(kind === 'catch' ? { captureIds: [`jiwari-${markIndex}`], pass: 'under' as const } : {}) };
    operations.push(o);
    return o;
  };
  const put = (o: ThreadOperation, zone: ThreadZone, curve: ThreadCurve, corridor?: PiercingCorridor) => {
    const id = `s8-span-${spans.length + 1}`;
    spans.push({ id, threadId: 's8-kiku-thread', opId: o.id, step: o.step, zone, curve, ...(corridor ? { corridor } : {}) });
    o.spanIds.push(id);
    return id;
  };
  const record = (id: string, curves: ThreadCurve[]) => { if (curves.length) groups.push({ id, curves, startMm: start(curves[0]), endMm: end(curves.at(-1)!) }); };
  const lastRound = plan.rows - 1;
  const solveWindow = (o: ThreadOperation, w: S8Window) => {
    if (earlier && w.round < lastRound) {
      const reused = earlier.solves.find(x => x.windowId === w.id);
      if (!reused) throw new RangeError(`${w.id}: the earlier-round level has no solve for this window.`);
      solves.push(reused);
      if (!reused.result.curves.length) diagnostics.push(`${w.id}: the earlier round has no curve for this window.`);
      windowSpans.set(w.id, reused.result.curves.map(curve => put(o, 'surface', curve)));
      record(w.id, reused.result.curves);
      return;
    }
    const route = polyline(w.seed), from = start(w.seed[0]);
    const obstacles = [...markingObstacles];
    for (const thread of environment?.laidThreads ?? []) {
      obstacles.push(...tubes(`laid-${thread.threadId}`, thread.spans.map(s => s.curve),
        thread.threadRadiusMm + d.numericalClearanceMm, route, d.obstacleSearchMm));
    }
    for (const g of groups) {
      // The group ending at this window's start port is its neighbour, not an obstacle.
      if (norm(sub(g.endMm, from)) < 1e-9) continue;
      obstacles.push(...tubes(`prior-${g.id}`, g.curves, r + d.numericalClearanceMm, route, d.obstacleSearchMm));
    }
    const controlCount = Math.ceil(w.minimumSpans * factor) + 3;
    let result: SpatialContactResult, restarts = 0, settleMoveMm = NaN;
    if (obstacles.length > d.maxObstacles) {
      diagnostics.push(`${w.id}: ${obstacles.length} obstacles exceed the budget of ${d.maxObstacles}.`);
      result = { status: 'failed', controlPointsMm: [], curves: [], lengthMm: NaN, reactions: [], diagnostics: [{ code: 'obstacle-budget', message: 'Too many obstacles.' }],
        metrics: {} as SpatialContactResult['metrics'] };
    } else {
      const solve = (controlPointsMm: PointMm[]) => solveSpatialContact({ controlPointsMm, threadRadiusMm: r,
        minBendRadiusMm: d.minBendRadiusMm, body: { centerMm: [0, 0, 0], radiusMm: R + d.numericalClearanceMm },
        supports: obstacles, options: solverOptions });
      const settled = settleSolve(solve, fitSpatialSeed(w.seed, controlCount), d.settleToleranceMm, d.maxSettleRestarts);
      ({ result, restarts } = settled);
      settleMoveMm = settled.moveMm;
      if (!settled.settled) diagnostics.push(`${w.id}: no fixed point after ${restarts} restarts (last move ${settleMoveMm.toExponential(2)} mm).`);
    }
    solves.push({ windowId: w.id, controlCount, result, obstacles: obstacles.length, restarts, settleMoveMm });
    if (!result.curves.length) diagnostics.push(`${w.id}: the solver returned no curve (${result.diagnostics.map(x => x.code).join(', ')}).`);
    windowSpans.set(w.id, result.curves.map(curve => put(o, 'surface', curve)));
    record(w.id, result.curves);
  };
  const chain = (ids: string[]): ThreadWindow[] => ids.map(spanId => ({ spanId, t0: 0, t1: 1 }));
  const declare = (id: string, o: ThreadOperation, working: string[], target: string | string[], pass: 'over' | 'under') => {
    if (!working.length || (Array.isArray(target) && !target.length)) return; // a failed solve is reported separately
    const targetChain = Array.isArray(target) ? chain(target) : undefined;
    crossings.push({ id, opId: o.id, working: chain(working), pass,
      target: targetChain ? { id: targetChain[0].spanId, t0: 0, t1: 1 } : { id: target as string, t0: 0, t1: 1 },
      ...(targetChain ? { targetChain } : {}) });
  };

  const startOp = op('start', 0);
  const startCorridor = hullCorridor([startCurves[1].curve], mul(unit(plan.tips[plan.startTip].exit), R), d.tailDepthMm + r + d.corridorMarginMm);
  for (const c of startCurves) put(startOp, c.zone, c.curve, c.zone === 'piercing' ? startCorridor : undefined);
  record('start', startCurves.map(c => c.curve));
  legPieces.forEach((pieces, legIndex) => {
    const lay = op('lay', legIndex + 1);
    for (const piece of pieces) {
      if (piece.kind === 'arc') { put(lay, 'surface', piece.curve); record(`arc-${legIndex + 1}`, [piece.curve]); continue; }
      const w = piece.window;
      solveWindow(lay, w);
      const ids = windowSpans.get(w.id)!;
      declare(`${w.id}-over-jiwari`, lay, ids, `jiwari-${w.tip}`, 'over');
      // A departure crosses over its own approach; at the start tip of a later row that approach is the closing window.
      const approach = w.row === 0 ? `approach-${w.tip}` : w.tip === s0 ? (w.row === 1 ? `closing-${s0}` : `closing-${s0}-r${w.row}`) : `approach-${w.tip}-r${w.row + 1}`;
      if (w.kind === 'departure' && windowSpans.has(approach)) declare(`${w.id}-over-approach`, lay, ids, windowSpans.get(approach)!, 'over');
      if (w.kind === 'closing') {
        const startOfRow = w.row === 1 ? `departure-${s0}` : `departure-${s0}-r${w.row}`;
        declare(`${w.id}-over-start`, lay, ids, windowSpans.get(startOfRow)!, 'over');
      }
    }
    const { to, open } = legs[legIndex];
    if (!open) {
      const name = to.row ? `bite-${to.tip}-r${to.row + 1}` : `bite-${to.tip}`;
      const c = op('catch', legIndex + 1, to.tip), curves = bite(to);
      const corridor = hullCorridor(curves, to.row ? mul(unit(markOf(to)), R) : mul(plan.frames[to.tip].m, R), d.depthMm + r + d.corridorMarginMm);
      const ids = curves.map(curve => put(c, 'piercing', curve, corridor));
      declare(`${name}-under-jiwari`, c, ids, `jiwari-${to.tip}`, 'under');
      biteSpans.push({ name, round: to.row, op: c, ids });
      record(name, curves);
    }
  });
  op('finish', legPieces.length);
  const coupon: C8ThreadCoupon = {
    kind: 'engineering-thread-path', bodyRadiusMm: R, threadId: 's8-kiku-thread', threadRadiusMm: r, spans, operations, supports,
    marks: plan.frames.map(f => ({ id: `mark-${f.index + 1}`, rayIndex: f.index, circleId: f.circleId,
      role: f.role === 'upper' ? 'inner' : 'outer', distanceMm: f.distanceMm, positionMm: f.markMm })),
    fixture: { ...d, factor, samplesPerSpan, stage: plan.stage === 'stitch' ? 1 : plan.stage === 'round' ? 2 : 3 }, crossings,
    assumptions: [
      'Simple 8 control kiku: GT14 mark placement; bite, port angle, window and lift sizes are engineering values.',
      'Thick-rope model: every visible window is a shortest centre line with curvature at most 1/minBendRadius.',
      'Beyond each window the taut thread lies on the great circle between the ports.',
      'Needle passages are prescribed boundary data; the open end is a boundary condition, not an anchor.',
    ],
  };
  const working = spans.map(s => s.curve);
  let undeclaredCrossings: string[] = [];
  try {
    const owners = new Map(spans.map(s => [s.id, s.opId]));
    // A declared window crossing covers its pieces; windows are identified by their span lists.
    const windowOf = new Map<string, string>();
    for (const [id, ids] of windowSpans) for (const s of ids) windowOf.set(s, id);
    const covered = (a: string, b: string) => crossings.some(c => {
      const ws = new Set(c.working.map(w => w.spanId)), ts = new Set((c.targetChain ?? [{ spanId: c.target.id }]).map(t => t.spanId));
      return (ws.has(a) && ts.has(b)) || (ws.has(b) && ts.has(a));
    });
    const projected = projectedCrossings(coupon, plan.center, d.validationToleranceMm);
    if (plan.rows > 1) {
      // Uwagake: a later row's stitch is taken under the whole bundle. A hidden passage that
      // meets an earlier round's window in projection is declared under it. The projection test
      // cannot separate a crossing at a sample or span joint from a touch, so both are declared.
      // The validator then needs one certified transverse crossing on the declared side: a
      // missing or wrong-side crossing fails the level, a tangent or ambiguous one leaves it
      // unresolved.
      const roundOf = new Map(plan.windows.map(w => [w.id, w.round]));
      const biteOf = new Map(biteSpans.flatMap(b => b.ids.map(id => [id, b] as const)));
      const under = new Map<string, { bite: typeof biteSpans[number]; window: string }>();
      for (const x of projectedCrossings(coupon, plan.center, d.validationToleranceMm, true)) {
        for (const [p, q] of [[x.a, x.b], [x.b, x.a]]) {
          const b = biteOf.get(p), w = windowOf.get(q);
          if (b && b.round > 0 && w && roundOf.get(w)! < b.round) under.set(`${b.name}|${w}`, { bite: b, window: w });
        }
      }
      for (const { bite: b, window: w } of under.values()) declare(`${b.name}-under-${w}`, b.op, b.ids, windowSpans.get(w)!, 'under');
      // Uwagake: a later row is laid over an earlier one. Surface crossings between computed
      // windows of different rows are declared in that order; the validator checks the side.
      const rowOf = new Map(plan.windows.map(w => [w.id, w.row])), order = new Map(plan.windows.map((w, i) => [w.id, i]));
      const pairs = new Map<string, [string, string]>();
      for (const x of projected) {
        const wa = windowOf.get(x.a), wb = windowOf.get(x.b);
        if (!wa || !wb || rowOf.get(wa) === rowOf.get(wb) || covered(x.a, x.b)) continue;
        const [later, earlier] = order.get(wa)! > order.get(wb)! ? [wa, wb] : [wb, wa];
        pairs.set(`${later}|${earlier}`, [later, earlier]);
      }
      for (const [later, earlier] of pairs.values()) {
        const opId = owners.get(windowSpans.get(later)![0])!;
        declare(`${later}-over-${earlier}`, operations.find(o => o.id === opId)!, windowSpans.get(later)!, windowSpans.get(earlier)!, 'over');
      }
    }
    for (const x of projected) {
      if (covered(x.a, x.b)) continue;
      // Pieces of one computed window are consecutive; a non-adjacent self crossing would be a loop.
      const sameWindow = windowOf.get(x.a) && windowOf.get(x.a) === windowOf.get(x.b);
      const sameOp = owners.get(x.a) && owners.get(x.a) === owners.get(x.b);
      if (!x.certain && (sameWindow || sameOp)) continue;
      undeclaredCrossings.push(`${x.certain ? 'crossing' : 'near-crossing'} ${x.a} / ${x.b}`);
    }
  } catch (error) { undeclaredCrossings = [`projection check unresolved: ${String(error)}`]; }
  return { factor, samplesPerSpan, reusedRounds: earlier ? lastRound : 0, coupon, solves, undeclaredCrossings, diagnostics,
    validation: validateThreadCoupon(coupon, d.validationToleranceMm),
    curvature: boundCurvatureTimesRadius(working, r),
    hiddenCurvature: plan.hiddenCurvature, lengthMm: curvesLength(working) };
}

function compare(windows: readonly S8Window[], a: S8KikuLevel, b: S8KikuLevel): S8KikuRefinement[] {
  return windows.map(w => {
    const x = a.solves.find(s => s.windowId === w.id)!, y = b.solves.find(s => s.windowId === w.id)!;
    const valid = x.result.curves.length && y.result.curves.length;
    return { windowId: w.id, from: x.controlCount, to: y.controlCount,
      lengthDifferenceMm: valid ? Math.abs(x.result.lengthMm - y.result.lengthMm) : Infinity,
      shapeDifferenceMm: valid ? shapeDifferenceMm(x.result.curves, y.result.curves) : Infinity };
  });
}

/**
 * Decision rule, fixed independently of any particular result: rules 1-5 over the levels. `judged` selects the windows whose refinement and
 * sampling sensitivity are judged (default: all); every level is still checked
 * as a complete construction.
 */
export function judgeS8Kiku(plan: S8KikuPlan, levels: S8KikuLevel[], perturbed: S8KikuLevel, judged: (w: S8Window) => boolean = () => true): S8KikuResult {
  const { d } = plan, limit = plan.r / d.minBendRadiusMm, diagnostics: string[] = [];
  let rejected = false;
  if (!plan.canonical) diagnostics.push(`Non-canonical ladder ${plan.factors.join('/')} is diagnostic only.`);
  if (d.maxSettleRestarts === 0) diagnostics.push('Windows were not checked for a fixed point: diagnostic only.');
  if (plan.overridden.length) diagnostics.push(`Non-default acceptance or solver settings (${plan.overridden.join(', ')}): diagnostic only.`);
  const roundOf = new Map(plan.windows.map(w => [w.id, w.round]));
  for (const level of [...levels, perturbed]) {
    const tag = level === perturbed ? `x${level.factor} (${level.samplesPerSpan} probes per span)` : `x${level.factor}`;
    diagnostics.push(...level.diagnostics.map(x => `${tag} ${x}`));
    // Windows reused from an earlier round are reported by that round's own ladder.
    for (const s of level.solves) if (!(roundOf.get(s.windowId)! < level.reusedRounds) && s.result.status !== 'converged') {
      diagnostics.push(`${tag} ${s.windowId}: numerical solve ${s.result.status}.`);
      if (s.result.status === 'failed') rejected = true;
    }
    if (level.validation.status !== 'passed') {
      diagnostics.push(`${tag}: complete path ${level.validation.status}: ${[...new Set(level.validation.diagnostics.map(x => x.code))].join(', ')}.`);
      if (level.validation.status === 'failed') rejected = true;
    }
    if (level.undeclaredCrossings.length) { diagnostics.push(`${tag}: undeclared crossings: ${level.undeclaredCrossings.join('; ')}.`); rejected = true; }
    if (level.curvature.status !== 'certified') diagnostics.push(`${tag}: curvature bound unresolved.`);
    else if (!(level.curvature.upper < 1)) { diagnostics.push(`${tag}: certified r*kappa ${level.curvature.upper.toFixed(4)} is not below 1.`); rejected = true; }
  }
  if (plan.hiddenCurvature.status !== 'certified' || plan.hiddenCurvature.upper > limit) {
    diagnostics.push(`A prescribed hidden span bends tighter than the rope model allows (${plan.hiddenCurvature.upper.toFixed(3)} > ${limit}).`);
    rejected = true;
  }
  const windows = plan.windows.filter(judged);
  const refinements = levels.slice(1).flatMap((level, i) => compare(windows, levels[i], level));
  const conditioning = compare(windows, levels.at(-1)!, perturbed);
  const perWindow = (list: S8KikuRefinement[], id: string) => list.filter(x => x.windowId === id);
  for (const w of windows) {
    const steps = perWindow(refinements, w.id), last = steps.slice(-S8_KIKU_ASYMPTOTIC_REFINEMENTS);
    for (const [metric, tolerance] of [['lengthDifferenceMm', d.lengthToleranceMm], ['shapeDifferenceMm', d.shapeToleranceMm]] as const) {
      if (last.some(x => !(x[metric] <= tolerance)))
        diagnostics.push(`${w.id}: ${metric === 'lengthDifferenceMm' ? 'length' : 'shape'} has not stabilised in the last refinements (${last.map(x => x[metric].toExponential(2)).join(', ')}).`);
      else if (!(last[1][metric] <= d.contraction * last[0][metric] || last[1][metric] <= tolerance / 4))
        diagnostics.push(`${w.id}: ${metric === 'lengthDifferenceMm' ? 'length' : 'shape'} differences do not contract (${last.map(x => x[metric].toExponential(2)).join(', ')}).`);
    }
    const c = perWindow(conditioning, w.id)[0];
    if (!(c.lengthDifferenceMm <= d.lengthToleranceMm && c.shapeDifferenceMm <= d.shapeToleranceMm))
      diagnostics.push(`${w.id}: sensitive to the constraint sampling (length ${c.lengthDifferenceMm.toExponential(2)}, shape ${c.shapeDifferenceMm.toExponential(2)}).`);
  }
  const asymptotic = refinements.filter(x => perWindow(refinements, x.windowId).slice(-S8_KIKU_ASYMPTOTIC_REFINEMENTS).includes(x));
  return { status: rejected ? 'rejected' : diagnostics.length ? 'unresolved' : 'accepted',
    stage: plan.stage, rows: plan.rows, dimensions: d,
    factors: plan.factors, canonical: plan.canonical, tips: plan.tips, windows: plan.windows, levels, perturbed, refinements, conditioning,
    bites: plan.bites,
    metrics: { lengthDifferenceMm: Math.max(0, ...asymptotic.map(x => x.lengthDifferenceMm)),
      maxShapeDifferenceMm: Math.max(0, ...asymptotic.map(x => x.shapeDifferenceMm)), curvatureLimit: limit },
    coupon: levels.at(-1)!.coupon, diagnostics };
}

/**
 * Builds and judges one Simple 8 stage. The needle passages are prescribed;
 * every visible window is a thick-rope solve with all earlier material as
 * obstacles. Every level of the canonical ladder is a complete construction
 * checked independently; acceptance needs the asymptotic refinements to be
 * within tolerance and contracting, and the finest level to be insensitive to
 * twice as many constraint probes.
 */
export function computeS8Kiku(input: S8KikuInput = {}): S8KikuResult {
  const plan = planS8Kiku(input), probes = plan.solverOptions?.samplesPerSpan ?? 4;
  if (plan.rows === 1) {
    const levels = plan.factors.map(f => buildS8KikuLevel(plan, f));
    return judgeS8Kiku(plan, levels, buildS8KikuLevel(plan, plan.factors.at(-1)!, 2 * probes));
  }
  // Rule 1 for later rounds: all earlier rows are laid thread, accepted by
  // their own ladders; the current ladder refines only its last row over the
  // finest complete construction of rows 0…n-2.
  const earlier = computeS8Kiku({
    ...input,
    stage: plan.rows === 2 ? 'round' : 'row2',
    rows: plan.rows - 1,
  });
  const base = earlier.levels.at(-1)!, lastRound = plan.rows - 1;
  const levels = plan.factors.map(f => buildS8KikuLevel(plan, f, probes, base));
  const perturbed = buildS8KikuLevel(plan, plan.factors.at(-1)!, 2 * probes, base);
  return combineS8Rounds(earlier, judgeS8Kiku(plan, levels, perturbed, w => w.round === lastRound));
}

/**
 * A stage of two rounds: accepted only when both are, rejected when either is.
 * Refinement and sampling results and metrics cover both rounds; the levels are
 * those of the last round (complete threads over the finest first round).
 */
export function combineS8Rounds(earlier: S8KikuResult, last: S8KikuResult): S8KikuResult {
  const status = earlier.status === 'rejected' || last.status === 'rejected' ? 'rejected'
    : earlier.status === 'accepted' && last.status === 'accepted' ? 'accepted' : 'unresolved';
  const earlierLabel = earlier.rows === 1 ? 'Round 1' : `Rows 1…${earlier.rows}`;
  return { ...last, status,
    refinements: [...earlier.refinements, ...last.refinements], conditioning: [...earlier.conditioning, ...last.conditioning],
    metrics: { ...last.metrics, lengthDifferenceMm: Math.max(earlier.metrics.lengthDifferenceMm, last.metrics.lengthDifferenceMm),
      maxShapeDifferenceMm: Math.max(earlier.metrics.maxShapeDifferenceMm, last.metrics.maxShapeDifferenceMm) },
    diagnostics: [...earlier.diagnostics.map(x => `${earlierLabel}: ${x}`),
      ...last.diagnostics.map(x => `Round ${last.rows} (complete thread): ${x}`)],
    earlierRounds: [...(earlier.earlierRounds ?? []), earlier] };
}
