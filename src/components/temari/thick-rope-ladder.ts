import { fitSpatialSeed } from './spatial-spline-seed';
import { solveSpatialContact, type SpatialContactOptions, type SpatialContactResult, type SpatialSupport } from './spatial-contact';
import { curveDerivative, sampleCurve } from './thread-geometry';
import type { PointMm, ThreadCurve } from './thread-path';

export type ThickRopeLadderInput = {
  /** Seed curves between two fixed ports; their end tangents are the port tangents. */
  seed: readonly ThreadCurve[];
  body: { centerMm: PointMm; radiusMm: number };
  supports: readonly SpatialSupport[];
  threadRadiusMm: number;
  minBendRadiusMm: number;
  /** Explicit increasing counts; the default ladder is derived from the bend radius. */
  controlCounts?: readonly number[];
  /** Resolution rule: spline spans per minimum bend radius of seed length. */
  spansPerBendRadius?: number;
  solverOptions?: SpatialContactOptions;
  /** Fixed-point check of every resolution (see settleSolve); none when omitted. */
  settle?: { toleranceMm: number; maxRestarts: number };
};
/** restarts: warm restarts used; settleMoveMm: the last restart's shape change (NaN if none ran). */
export type ThickRopeResolution = { controlCount: number; resolved: boolean; result: SpatialContactResult; restarts: number; settleMoveMm: number };
export type ThickRopeRefinement = { from: number; to: number; lengthDifferenceMm: number; shapeDifferenceMm: number };
export type ThickRopeLadder = {
  seedLengthMm: number;
  minimumSpans: number;
  resolutions: ThickRopeResolution[];
  refinements: ThickRopeRefinement[];
  /** Largest successive differences over the whole ladder. */
  lengthDifferenceMm: number;
  /** Maximum at 201 equal arclength samples, not a continuous Hausdorff bound. */
  maxShapeDifferenceMm: number;
};

export const THICK_ROPE_LADDER = Object.freeze({ factors: [1, 1.5, 2] as readonly number[], maxControls: 256, spansPerBendRadius: 1 });

export function curvesLength(curves: readonly ThreadCurve[]) {
  let total = 0;
  for (const curve of curves) {
    const n = 2048;
    const speed = (t: number) => { const v = curveDerivative(curve, t); return Math.hypot(v[0], v[1], v[2]); };
    let integral = speed(0) + speed(1);
    for (let i = 1; i < n; i++) integral += (i % 2 ? 4 : 2) * speed(i / n);
    total += integral / (3 * n);
  }
  return total;
}

export function arcLengthSampler(curves: readonly ThreadCurve[], tolerance: number) {
  const points: PointMm[] = [], cumulative: number[] = [];
  let total = 0;
  for (const curve of curves) for (const point of sampleCurve(curve, tolerance).points) {
    if (points.length) {
      const previous = points.at(-1)!, distance = Math.hypot(...point.map((v, j) => v - previous[j]));
      if (distance < 1e-12) continue;
      total += distance;
    }
    points.push(point); cumulative.push(total);
  }
  return (fraction: number): PointMm => {
    const length = fraction * total;
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < length) i++;
    const t = (length - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]);
    return points[i - 1].map((v, j) => v + t * (points[i][j] - v)) as unknown as PointMm;
  };
}

export function shapeDifferenceMm(a: readonly ThreadCurve[], b: readonly ThreadCurve[]) {
  const p = arcLengthSampler(a, .0001), q = arcLengthSampler(b, .0001);
  let maximum = 0;
  for (let j = 0; j <= 200; j++) {
    const x = p(j / 200), y = q(j / 200);
    maximum = Math.max(maximum, Math.hypot(...x.map((v, k) => v - y[k])));
  }
  return maximum;
}

/**
 * Solves one free span on a model-derived ladder of spline resolutions. It
 * reports every resolution; acceptance (complete-path checks, tolerances) is
 * the caller's decision and must use all of them, never the best one.
 */
/**
 * Solve, then restart from the result (multipliers and penalty reset) until a
 * restart moves it by at most toleranceMm, at most maxRestarts times. In a
 * flat contact valley a converged stopping test can fire far from the discrete
 * minimum; a fixed point cannot. settled is false when a converged solve did
 * not reach one (callers must not accept it).
 */
export function settleSolve(solve: (controlPointsMm: PointMm[]) => SpatialContactResult, seed: PointMm[], toleranceMm: number, maxRestarts: number) {
  let result = solve(seed), restarts = 0, moveMm = NaN;
  while (result.status === 'converged' && restarts < maxRestarts) {
    const next = solve(result.controlPointsMm);
    restarts++;
    moveMm = next.curves.length ? shapeDifferenceMm(result.curves, next.curves) : Infinity;
    result = next;
    if (moveMm <= toleranceMm) break;
  }
  return { result, restarts, moveMm, settled: result.status !== 'converged' || maxRestarts === 0 || moveMm <= toleranceMm };
}

export function solveThickRopeLadder(input: ThickRopeLadderInput): ThickRopeLadder {
  const perRadius = input.spansPerBendRadius ?? THICK_ROPE_LADDER.spansPerBendRadius;
  if (!(perRadius > 0) || !Number.isFinite(perRadius) || !(input.minBendRadiusMm > 0))
    throw new RangeError('A thick-rope ladder requires a positive resolution rule and bend radius.');
  const seedLengthMm = curvesLength(input.seed);
  const minimumSpans = Math.ceil(perRadius * seedLengthMm / input.minBendRadiusMm);
  const counts = [...(input.controlCounts ?? THICK_ROPE_LADDER.factors.map(f => Math.ceil(minimumSpans * f) + 3))];
  if (counts.length < 2 || counts.length > 4 || counts.some((n, i) => !Number.isInteger(n) || n < 6
    || n > THICK_ROPE_LADDER.maxControls || (i > 0 && n <= counts[i - 1])))
    throw new RangeError('A thick-rope ladder requires two to four increasing resolutions of at most 256 controls.');
  const resolutions = counts.map((controlCount): ThickRopeResolution => {
    const solve = (controlPointsMm: PointMm[]) => solveSpatialContact({ controlPointsMm, threadRadiusMm: input.threadRadiusMm,
      minBendRadiusMm: input.minBendRadiusMm, body: input.body, supports: input.supports, options: input.solverOptions });
    const settled = settleSolve(solve, fitSpatialSeed(input.seed, controlCount), input.settle?.toleranceMm ?? 0, input.settle?.maxRestarts ?? 0);
    return { controlCount, resolved: controlCount - 3 >= minimumSpans, result: settled.result, restarts: settled.restarts, settleMoveMm: settled.moveMm };
  });
  const refinements = resolutions.slice(1).map((r, i): ThickRopeRefinement => ({ from: resolutions[i].controlCount, to: r.controlCount,
    lengthDifferenceMm: Math.abs(r.result.lengthMm - resolutions[i].result.lengthMm),
    shapeDifferenceMm: shapeDifferenceMm(resolutions[i].result.curves, r.result.curves) }));
  return { seedLengthMm, minimumSpans, resolutions, refinements,
    lengthDifferenceMm: Math.max(...refinements.map(r => r.lengthDifferenceMm)),
    maxShapeDifferenceMm: Math.max(...refinements.map(r => r.shapeDifferenceMm)) };
}
