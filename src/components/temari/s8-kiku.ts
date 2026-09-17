import { boundCurvatureTimesRadius, type CurvatureBound } from './curvature-bound';
import { jiwariNormals } from './jiwari';
import { localMarkingRays, pointOnMarkingRayMm, type MarkingCircle } from './local-marking';
import { solveSpatialContact, type SpatialContactOptions, type SpatialContactResult, type SpatialSupport } from './spatial-contact';
import { fitSpatialSeed } from './spatial-spline-seed';
import { curvesLength, shapeDifferenceMm, THICK_ROPE_LADDER } from './thick-rope-ladder';
import { closestSegmentApproach, sampleCurve, validateThreadCoupon } from './thread-geometry';
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
  /** Bite depth and handles chosen so the hidden turn stays within the bend limit. */
  depthMm: 1.2,
  biteEndHandleMm: 1,
  biteBottomHandleMm: 1.2,
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
  /** Round-2 upper stitch: about one thread width lower and wide enough for the start bundle. */
  rowAdvanceMm: 0.4,
  wrapHalfBiteMm: 1,
  supportMarginMm: 2,
  poleGapMm: 1,
  tailLeadMm: 4,
  tailLengthMm: 3,
  tailDepthMm: 2,
  corridorMarginMm: 0.05,
  numericalClearanceMm: 0.003,
  obstacleToleranceMm: 0.002,
  obstacleSearchMm: 3,
  validationToleranceMm: 0.001,
  lengthToleranceMm: 0.002,
  shapeToleranceMm: 0.02,
});
export type S8KikuDimensions = { -readonly [K in keyof typeof S8_KIKU_DIMENSIONS]: number };
/**
 * stitch: hidden start, lower catch, upper catch, departure (open end).
 * round: hidden start, seven catches and the return carried over the start;
 * the open end is the entry of the first round-2 upper stitch (Toolkit:
 * carry over before the last stitch of round 1).
 */
export type S8KikuStage = 'stitch' | 'round';
export type S8KikuInput = Partial<S8KikuDimensions> & {
  stage?: S8KikuStage;
  handedness?: 1 | -1;
  /** A Simple 8 pole; the default is +Y. */
  center?: PointMm;
  /** Resolution factors of the ladder; each level is a complete construction. */
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
  seed: ThreadCurve[];
  seedLengthMm: number;
  minimumSpans: number;
};
export type S8KikuLevel = {
  factor: number;
  coupon: C8ThreadCoupon;
  solves: { windowId: string; controlCount: number; result: SpatialContactResult; obstacles: number }[];
  validation: PathValidation;
  /** Certified r*kappa over every working span. */
  curvature: CurvatureBound;
  /** Certified r*kappa over the prescribed hidden spans only. */
  hiddenCurvature: CurvatureBound;
  lengthMm: number;
};
export type S8KikuRefinement = { windowId: string; from: number; to: number; lengthDifferenceMm: number; shapeDifferenceMm: number };
export type S8KikuResult = {
  status: 'accepted' | 'rejected' | 'unresolved';
  stage: S8KikuStage;
  dimensions: S8KikuDimensions;
  tips: S8Tip[];
  windows: S8Window[];
  levels: S8KikuLevel[];
  refinements: S8KikuRefinement[];
  metrics: { lengthDifferenceMm: number; maxShapeDifferenceMm: number; curvatureLimit: number };
  /** Finest level; diagnostic even when not accepted. */
  coupon: C8ThreadCoupon;
  diagnostics: string[];
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

/** Surface -> raised plateau -> surface along a leg, with great-circle end tangents. */
function raisedSeed(leg: Leg, s0: number, s1: number, rise: number, fall: number, lift: number, surface: number): ThreadCurve[] {
  if (!(s1 - s0 > rise + fall + 1e-6)) throw new RangeError('A window seed needs a positive plateau.');
  const p0 = leg.at(s0, surface), p1 = leg.at(s0 + rise, surface + lift), p2 = leg.at(s1 - fall, surface + lift), p3 = leg.at(s1, surface);
  return [
    bezier(p0, add(p0, mul(leg.tangent(s0), rise / 3)), sub(p1, mul(leg.tangent(s0 + rise), rise / 3)), p1),
    { kind: 'arc', from: p1, to: p2 },
    bezier(p2, add(p2, mul(leg.tangent(s1 - fall), fall / 3)), sub(p3, mul(leg.tangent(s1), fall / 3)), p3),
  ];
}

/**
 * Obstacle capsules with a certified cover: dense chords (error e1) are merged
 * by Douglas-Peucker; each capsule is inflated by e1 plus its merge deviation.
 */
function capsules(id: string, curves: readonly ThreadCurve[], radius: number, tolerance: number): SpatialSupport[] {
  const points: V[] = [];
  let chordError = 0;
  for (const curve of curves) {
    const sample = sampleCurve(curve, tolerance / 4);
    chordError = Math.max(chordError, sample.errorBoundMm);
    for (const p of sample.points) if (!points.length || norm(sub(p, points.at(-1)!)) > 1e-12) points.push(p);
  }
  const segmentDistance = (p: V, a: V, b: V) => {
    const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-300)));
    return norm(sub(p, add(a, mul(ab, t))));
  };
  const out: SpatialSupport[] = [];
  const split = (i: number, j: number) => {
    let worst = 0, at = -1;
    for (let k = i + 1; k < j; k++) { const d = segmentDistance(points[k], points[i], points[j]); if (d > worst) { worst = d; at = k; } }
    if (worst > tolerance / 2 && at > 0) { split(i, at); split(at, j); return; }
    out.push({ id: `${id}-c${out.length + 1}`, kind: 'segment', fromMm: points[i], toMm: points[j], radiusMm: radius + chordError + worst });
  };
  if (points.length > 1) split(0, points.length - 1);
  return out;
}

function supportFor(id: string, curve: ThreadCurve, radius: number, tolerance: number): SpatialSupport[] {
  if (curve.kind === 'arc') return [{ id, kind: 'arc', centerMm: [0, 0, 0], fromMm: curve.from, toMm: curve.to, radiusMm: radius }];
  return capsules(id, [curve], radius, tolerance);
}

const polyline = (curves: readonly ThreadCurve[]) => curves.flatMap(c => sampleCurve(c, .05).points);
function near(obstacle: SpatialSupport, route: readonly V[], distance: number) {
  const ends: [V, V][] = obstacle.kind === 'segment' ? [[obstacle.fromMm, obstacle.toMm]]
    : sampleCurve({ kind: 'arc', from: obstacle.fromMm, to: obstacle.toMm }, .05).points.slice(1).map((p, i, all) => [i ? all[i - 1] : obstacle.fromMm, p] as [V, V]);
  for (let i = 1; i < route.length; i++) for (const [a, b] of ends)
    if (closestSegmentApproach(route[i - 1], route[i], a, b).distanceMm < distance + obstacle.radiusMm) return true;
  return false;
}

/**
 * Builds and solves one Simple 8 stage on a model-derived ladder. The needle
 * passages are prescribed; every visible window is a thick-rope solve with all
 * earlier material as obstacles. Acceptance requires every level to pass the
 * complete independent checks and all refinements to stay within tolerance.
 */
export function computeS8Kiku(input: S8KikuInput = {}): S8KikuResult {
  const d: S8KikuDimensions = { ...S8_KIKU_DIMENSIONS };
  for (const key of Object.keys(d) as (keyof S8KikuDimensions)[]) {
    if (input[key] !== undefined) d[key] = input[key]!;
    if (!Number.isFinite(d[key]) || d[key] <= 0) throw new RangeError(`${key} must be finite and positive`);
  }
  const stage = input.stage ?? 'stitch', handedness = input.handedness ?? 1;
  const factors = [...(input.factors ?? THICK_ROPE_LADDER.factors)];
  if (stage !== 'stitch' && stage !== 'round') throw new RangeError('Unknown Simple 8 stage.');
  if (handedness !== 1 && handedness !== -1) throw new RangeError('handedness must be +1 or -1');
  if (factors.length < 2 || factors.length > 4 || factors.some((f, i) => !(f >= 1) || (i > 0 && f <= factors[i - 1])))
    throw new RangeError('A Simple 8 ladder requires two to four increasing factors of at least one.');
  const R = d.circumferenceMm / (2 * Math.PI), r = d.threadRadiusMm, S = R + r + d.portGuardMm;
  const outerMm = d.circumferenceMm / 4 * d.outerFractionOfQuarter;
  if (d.minBendRadiusMm <= r || d.outerFractionOfQuarter >= 1 || d.innerMm >= outerMm || d.halfBiteMm <= r
    || d.wrapHalfBiteMm <= d.halfBiteMm || d.depthMm >= R / 4 || d.innerMm <= d.poleGapMm)
    throw new RangeError('Simple 8 dimensions do not define a valid control kiku.');

  // Actual Simple 8 rays at the pole; the eight rays alternate upper/lower marks.
  const center = unit(input.center ?? [0, 1, 0]);
  const circles: MarkingCircle[] = jiwariNormals('simple').map((normal, i) => ({ id: `s8-${i}`, normal }));
  const first = circles.find(c => Math.abs(dot(center, unit(c.normal))) < 1e-9);
  if (!first) throw new RangeError('The center is not a Simple 8 pole.');
  const rays = localMarkingRays({ center, circles, handedness, firstRay: { circleId: first.id, tangent: unit(cross(first.normal, center)) } });
  if (rays.length !== 8 || rays.some((ray, i) => Math.abs(ray.angleRad - i * Math.PI / 4) > 1e-9))
    throw new RangeError('A Simple 8 pole requires eight equally spaced rays.');
  const frames = rays.map((ray, index) => {
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
  const window = (tip: number) => frames[tip].role === 'upper' ? d.upperWindowMm : d.lowerWindowMm;
  const wrapEntry = frames[0].at(d.wrapHalfBiteMm, d.rowAdvanceMm, S);

  // Chronological plan: which catches exist and the leg between consecutive ports.
  const catches = stage === 'stitch' ? [1, 2] : [1, 2, 3, 4, 5, 6, 7];
  const legs: { from: number; to: number | 'wrap'; leg: Leg }[] = [];
  for (let i = 0; i < catches.length; i++) legs.push({ from: i ? catches[i - 1] : 0, to: catches[i], leg: greatCircle(tips[i ? catches[i - 1] : 0].exit, tips[catches[i]].entry) });
  const lastTip = catches.at(-1)!;
  if (stage === 'stitch') legs.push({ from: lastTip, to: 3, leg: greatCircle(tips[lastTip].exit, tips[3].entry) });
  else legs.push({ from: lastTip, to: 'wrap', leg: greatCircle(tips[lastTip].exit, wrapEntry) });

  const windows: S8Window[] = [];
  const addWindow = (id: string, kind: S8Window['kind'], tip: number, seed: ThreadCurve[]) => {
    const seedLengthMm = curvesLength(seed);
    const w: S8Window = { id, kind, tip, seed, seedLengthMm, minimumSpans: Math.ceil(seedLengthMm / d.minBendRadiusMm) };
    windows.push(w);
    return w;
  };
  type Piece = { kind: 'window'; window: S8Window } | { kind: 'arc'; curve: ThreadCurve };
  const legPieces = legs.map(({ from, to, leg }) => {
    const pieces: Piece[] = [], upperFrom = frames[from].role === 'upper';
    const out = window(from);
    pieces.push({ kind: 'window', window: addWindow(`departure-${from}`, 'departure', from,
      raisedSeed(leg, 0, out, upperFrom ? d.upperDepartureRiseMm : d.lowerDepartureRiseMm, d.departureFallMm, d.departureLiftMm, S)) });
    if (stage === 'stitch' && to === 3) return pieces; // open end of the stitch stage
    const toTip = to === 'wrap' ? 0 : to, into = window(toTip);
    if (!(leg.length - out - into > 1)) throw new RangeError('Leg windows overlap; the leg is too short.');
    pieces.push({ kind: 'arc', curve: { kind: 'arc', from: leg.at(out), to: leg.at(leg.length - into) } });
    const seed = to === 'wrap'
      ? raisedSeed(leg, leg.length - into, leg.length, d.approachRiseMm, d.closingFallMm, d.closingLiftMm, S)
      : raisedSeed(leg, leg.length - into, leg.length, d.approachRiseMm,
        frames[toTip].role === 'upper' ? d.upperApproachFallMm : d.lowerApproachFallMm, d.approachLiftMm, S);
    pieces.push({ kind: 'window', window: addWindow(to === 'wrap' ? 'closing-0' : `approach-${toTip}`, to === 'wrap' ? 'closing' : 'approach', toTip, seed) });
    return pieces;
  });
  for (const w of windows) if (Math.ceil(w.minimumSpans * factors.at(-1)!) + 3 > THICK_ROPE_LADDER.maxControls)
    throw new RangeError(`${w.id}: the finest level exceeds the solver's control budget.`);

  // Physical marking segments around each tip, disjoint near the pole.
  const supports: MarkingSupport[] = frames.map(f => {
    const reach = window(f.index) + d.supportMarginMm;
    const inner = f.role === 'upper' ? Math.min(reach, f.distanceMm - d.poleGapMm) : reach;
    return { id: `jiwari-${f.index}`, circleId: f.circleId, radiusMm: d.markingRadiusMm,
      curve: { kind: 'arc', from: f.at(0, -inner, R + d.markingRadiusMm), to: f.at(0, reach, R + d.markingRadiusMm) } };
  });
  const markingObstacles: SpatialSupport[] = supports.map(s => ({ id: s.id, kind: 'arc', centerMm: [0, 0, 0],
    fromMm: (s.curve as Extract<ThreadCurve, { kind: 'arc' }>).from, toMm: (s.curve as Extract<ThreadCurve, { kind: 'arc' }>).to,
    radiusMm: s.radiusMm + d.numericalClearanceMm }));

  // Prescribed needle passages.
  const legInto = (tip: number) => legs.find(l => l.to === tip)!;
  const legOut = (tip: number) => legs.find(l => l.from === tip)!;
  const bite = (tip: number): ThreadCurve[] => {
    const f = frames[tip], E = tips[tip].entry, X = tips[tip].exit, B = mul(f.m, R - d.depthMm);
    const into = legInto(tip).leg, inT = into.tangent(into.length), outT = legOut(tip).leg.tangent(0);
    const first = [E, add(E, mul(inT, d.biteEndHandleMm)), add(B, mul(f.progress, d.biteBottomHandleMm)), B] as const;
    const second = [B, sub(B, mul(f.progress, d.biteBottomHandleMm)), sub(X, mul(outT, d.biteEndHandleMm)), X] as const;
    // Convex hulls on opposite sides of the marking plane give one transverse passage.
    if (first.slice(0, 3).some(p => dot(p, f.progress) <= 0) || second.slice(1).some(p => dot(p, f.progress) >= 0))
      throw new RangeError('The prescribed bite would not cross its marking line once.');
    return [bezier(...first), bezier(...second)];
  };
  const biteCorridor = (tip: number): PiercingCorridor => ({ centerMm: mul(frames[tip].m, R),
    radiusMm: d.halfBiteMm + d.biteEndHandleMm + d.biteBottomHandleMm + d.depthMm + r + d.corridorMarginMm,
    maxDepthMm: d.depthMm + r + d.corridorMarginMm });
  const startDir = legs[0].leg.tangent(0), startExit = tips[0].exit, tailRadius = R - d.tailDepthMm;
  const back = (angle: number) => mul(add(mul(unit(startExit), Math.cos(angle)), mul(startDir, -Math.sin(angle))), tailRadius);
  const startJoin = back(d.tailLeadMm / R), startAnchor = back((d.tailLeadMm + d.tailLengthMm) / R);
  const startCurves: { zone: ThreadZone; curve: ThreadCurve }[] = [
    { zone: 'buried', curve: { kind: 'arc', from: startAnchor, to: startJoin } },
    { zone: 'piercing', curve: bezier(startJoin, add(startJoin, mul(toward(startJoin, startExit), d.tailLeadMm / 3)),
      sub(startExit, mul(startDir, d.tailLeadMm / 3)), startExit) },
  ];
  const startCorridor: PiercingCorridor = { centerMm: mul(unit(startExit), R),
    radiusMm: d.tailLeadMm + d.tailDepthMm + r + d.corridorMarginMm, maxDepthMm: d.tailDepthMm + r + d.corridorMarginMm };
  const hiddenCurves = [...startCurves.map(c => c.curve), ...catches.flatMap(bite)];

  const threadId = 's8-kiku-thread';
  const solverOptions: SpatialContactOptions = { maxIterations: 8000, maxOuterIterations: 60, feasibilityToleranceMm: .0005,
    complementarityToleranceMm: .000005, ...input.solverOptions };
  const levels: S8KikuLevel[] = factors.map(factor => {
    const spans: ThreadSpan[] = [], operations: ThreadOperation[] = [], crossings: ThreadCrossing[] = [];
    const windowSpans = new Map<string, string[]>();
    const solves: S8KikuLevel['solves'] = [];
    const op = (kind: ThreadOperationKind, step: number, markIndex?: number) => {
      const o: ThreadOperation = { id: `s8-op-${operations.length + 1}-${kind}`, order: operations.length, step, kind, spanIds: [],
        ...(markIndex === undefined ? {} : { markId: `mark-${markIndex + 1}` }),
        ...(kind === 'catch' ? { captureIds: [`jiwari-${markIndex}`], pass: 'under' as const } : {}) };
      operations.push(o);
      return o;
    };
    const put = (o: ThreadOperation, zone: ThreadZone, curve: ThreadCurve, corridor?: PiercingCorridor) => {
      const id = `s8-span-${spans.length + 1}`;
      spans.push({ id, threadId, opId: o.id, step: o.step, zone, curve, ...(corridor ? { corridor } : {}) });
      o.spanIds.push(id);
      return id;
    };
    const solveWindow = (o: ThreadOperation, w: S8Window) => {
      // Everything laid earlier is fixed; the span ending at this window's start port is adjacent.
      const route = polyline(w.seed), start = w.seed[0].kind === 'arc' ? w.seed[0].from : w.seed[0].controls[0];
      const obstacles = [...markingObstacles];
      for (const s of spans) {
        const end = s.curve.kind === 'arc' ? s.curve.to : s.curve.controls[3];
        if (norm(sub(end, start)) < 1e-9) continue;
        for (const o2 of supportFor(`prior-${s.id}`, s.curve, r + d.numericalClearanceMm, d.obstacleToleranceMm))
          if (near(o2, route, d.obstacleSearchMm)) obstacles.push(o2);
      }
      const controlCount = Math.ceil(w.minimumSpans * factor) + 3;
      const result = solveSpatialContact({ controlPointsMm: fitSpatialSeed(w.seed, controlCount), threadRadiusMm: r,
        minBendRadiusMm: d.minBendRadiusMm, body: { centerMm: [0, 0, 0], radiusMm: R + d.numericalClearanceMm },
        supports: obstacles, options: solverOptions });
      solves.push({ windowId: w.id, controlCount, result, obstacles: obstacles.length });
      windowSpans.set(w.id, result.curves.map(curve => put(o, 'surface', curve)));
    };
    const chain = (ids: string[]): ThreadWindow[] => ids.map(spanId => ({ spanId, t0: 0, t1: 1 }));
    const declare = (id: string, o: ThreadOperation, working: string[], target: string | string[], pass: 'over' | 'under') => {
      const targetChain = Array.isArray(target) ? chain(target) : undefined;
      crossings.push({ id, opId: o.id, working: chain(working), pass,
        target: targetChain ? { id: targetChain[0].spanId, t0: 0, t1: 1 } : { id: target as string, t0: 0, t1: 1 },
        ...(targetChain ? { targetChain } : {}) });
    };

    const start = op('start', 0);
    for (const c of startCurves) put(start, c.zone, c.curve, c.zone === 'piercing' ? startCorridor : undefined);
    legPieces.forEach((pieces, legIndex) => {
      const lay = op('lay', legIndex + 1);
      for (const piece of pieces) {
        if (piece.kind === 'arc') { put(lay, 'surface', piece.curve); continue; }
        const w = piece.window;
        solveWindow(lay, w);
        const ids = windowSpans.get(w.id)!;
        declare(`${w.id}-over-jiwari`, lay, ids, `jiwari-${w.tip}`, 'over');
        if (w.kind === 'departure' && windowSpans.has(`approach-${w.tip}`)) declare(`${w.id}-over-approach`, lay, ids, windowSpans.get(`approach-${w.tip}`)!, 'over');
        if (w.kind === 'closing') declare('closing-0-over-start', lay, ids, windowSpans.get('departure-0')!, 'over');
      }
      const tip = legs[legIndex].to;
      if (typeof tip === 'number' && catches.includes(tip)) {
        const c = op('catch', legIndex + 1, tip);
        const ids = bite(tip).map(curve => put(c, 'piercing', curve, biteCorridor(tip)));
        declare(`bite-${tip}-under-jiwari`, c, ids, `jiwari-${tip}`, 'under');
      }
    });
    op('finish', legPieces.length);
    const coupon: C8ThreadCoupon = {
      kind: 'engineering-thread-path', bodyRadiusMm: R, threadId, threadRadiusMm: r, spans, operations, supports,
      marks: frames.map(f => ({ id: `mark-${f.index + 1}`, rayIndex: f.index, circleId: f.circleId,
        role: f.role === 'upper' ? 'inner' : 'outer', distanceMm: f.distanceMm, positionMm: f.markMm })),
      fixture: { ...d, factor, stage: stage === 'stitch' ? 1 : 2 }, crossings,
      assumptions: [
        'Simple 8 control kiku: GT14 mark placement; bite, window and lift sizes are engineering values.',
        'Thick-rope model: every visible window is a shortest centre line with curvature at most 1/minBendRadius.',
        'Beyond each window the taut thread lies on the great circle between the ports.',
        'Needle passages are prescribed boundary data; the open end is a boundary condition, not an anchor.',
      ],
    };
    const working = spans.map(s => s.curve);
    return { factor, coupon, solves,
      validation: validateThreadCoupon(coupon, d.validationToleranceMm),
      curvature: boundCurvatureTimesRadius(working, r),
      hiddenCurvature: boundCurvatureTimesRadius(hiddenCurves, r),
      lengthMm: curvesLength(working) };
  });

  const refinements: S8KikuRefinement[] = [];
  for (let i = 1; i < levels.length; i++) for (const w of windows) {
    const a = levels[i - 1].solves.find(s => s.windowId === w.id)!, b = levels[i].solves.find(s => s.windowId === w.id)!;
    refinements.push({ windowId: w.id, from: a.controlCount, to: b.controlCount,
      lengthDifferenceMm: Math.abs(a.result.lengthMm - b.result.lengthMm), shapeDifferenceMm: shapeDifferenceMm(a.result.curves, b.result.curves) });
  }
  const lengthDifferenceMm = Math.max(0, ...refinements.map(x => x.lengthDifferenceMm));
  const maxShapeDifferenceMm = Math.max(0, ...refinements.map(x => x.shapeDifferenceMm));
  const limit = r / d.minBendRadiusMm, tolerance = 0.02, diagnostics: string[] = [];
  let rejected = false;
  for (const level of levels) {
    const tag = `x${level.factor}`;
    for (const s of level.solves) if (s.result.status !== 'converged') {
      diagnostics.push(`${tag} ${s.windowId}: numerical solve ${s.result.status}.`);
      if (s.result.status === 'failed') rejected = true;
    }
    if (level.validation.status !== 'passed') {
      diagnostics.push(`${tag}: complete path ${level.validation.status}: ${[...new Set(level.validation.diagnostics.map(x => x.code))].join(', ')}.`);
      if (level.validation.status === 'failed') rejected = true;
    }
    if (level.curvature.status !== 'certified') diagnostics.push(`${tag}: curvature bound unresolved.`);
    else if (!(level.curvature.upper < 1)) { diagnostics.push(`${tag}: certified r*kappa ${level.curvature.upper.toFixed(4)} is not below 1.`); rejected = true; }
    if (level.hiddenCurvature.upper > limit + tolerance) {
      diagnostics.push(`${tag}: a prescribed hidden span bends tighter than the rope model (${level.hiddenCurvature.upper.toFixed(3)}).`);
      rejected = true;
    }
  }
  if (lengthDifferenceMm > d.lengthToleranceMm) diagnostics.push('Window lengths have not stabilised between levels.');
  if (maxShapeDifferenceMm > d.shapeToleranceMm) diagnostics.push('Window shapes have not stabilised between levels.');
  return { status: rejected ? 'rejected' : diagnostics.length ? 'unresolved' : 'accepted', stage, dimensions: d, tips, windows, levels,
    refinements, metrics: { lengthDifferenceMm, maxShapeDifferenceMm, curvatureLimit: limit }, coupon: levels.at(-1)!.coupon, diagnostics };
}
