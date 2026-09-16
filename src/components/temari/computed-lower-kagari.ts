import { boundCurvatureTimesRadius, type CurvatureBound } from './curvature-bound';
import { createLowerKagariFixture, type LowerKagariFixture, type LowerKagariInput } from './lower-kagari';
import { fitSpatialSeed } from './spatial-spline-seed';
import { solveSpatialContact, splineToBezier, type SpatialContactOptions, type SpatialContactResult, type SpatialSupport } from './spatial-contact';
import { curveDerivative, sampleCurve, validateThreadCoupon } from './thread-geometry';
import type { C8ThreadCoupon, PathValidation, PointMm, ThreadCurve, ThreadSpan } from './thread-path';

export type ComputedLowerKagariOptions = {
  /**
   * Increasing control counts. The default ladder is derived from the model:
   * spans = ceil(spansPerBendRadius * seed length / minBendRadius) * [1, 1.5, 2].
   */
  controlCounts?: readonly number[];
  /** Resolution rule: spline spans per minimum bend radius of seed length. */
  spansPerBendRadius?: number;
  numericalClearanceMm?: number;
  obstacleToleranceMm?: number;
  validationToleranceMm?: number;
  lengthToleranceMm?: number;
  shapeToleranceMm?: number;
  solverOptions?: SpatialContactOptions;
};
export type LowerKagariResolution = {
  controlCount: number;
  /** Seed length per spline span compared with the minimum bend radius. */
  resolved: boolean;
  result: SpatialContactResult;
  validation: PathValidation;
  /** Independent certified r*kappa bound over the complete working thread. */
  curvature: CurvatureBound;
};
export type LowerKagariRefinement = { from: number; to: number; lengthDifferenceMm: number; shapeDifferenceMm: number };
export type ComputedLowerKagari = {
  status: 'accepted' | 'rejected' | 'unresolved';
  fixture: LowerKagariFixture;
  /** Finest diagnostic candidate, even when rejected. Check status before acceptance. */
  coupon: C8ThreadCoupon;
  result: SpatialContactResult;
  obstacles: SpatialSupport[];
  checks: { seed: PathValidation; candidate: PathValidation; resolutions: LowerKagariResolution[]; refinements: LowerKagariRefinement[] };
  metrics: { numericalClearanceMm: number; obstacleToleranceMm: number;
    seedLengthMm: number; minBendRadiusMm: number; minimumSpans: number;
    /** Largest successive difference over the whole ladder. */
    lengthDifferenceMm: number;
    /** Maximum at 201 equal arclength samples, not a continuous Hausdorff bound. */
    maxShapeDifferenceMm: number;
    lengthToleranceMm: number; shapeToleranceMm: number };
  diagnostics: string[];
};

const DEFAULTS = Object.freeze({
  spansPerBendRadius: 1,
  numericalClearanceMm: .003,
  obstacleToleranceMm: .0005,
  validationToleranceMm: .001,
  lengthToleranceMm: .002,
  shapeToleranceMm: .02,
});
const LADDER = [1, 1.5, 2];
const MAX_CONTROLS = 128;

function obstaclesFor(fixture: LowerKagariFixture, margin: number, tolerance: number): SpatialSupport[] {
  const obstacles: SpatialSupport[] = [];
  const append = (id: string, curve: ThreadCurve, radius: number) => {
    if (curve.kind === 'arc') {
      obstacles.push({ id, kind: 'arc', centerMm: [0, 0, 0], fromMm: curve.from, toMm: curve.to, radiusMm: radius + margin });
    } else {
      const sample = sampleCurve(curve, tolerance);
      for (let i = 1; i < sample.points.length; i++) obstacles.push({ id: `${id}-capsule-${i}`, kind: 'segment',
        fromMm: sample.points[i - 1], toMm: sample.points[i], radiusMm: radius + margin + sample.errorBoundMm });
    }
  };
  fixture.incoming.forEach((curve, i) => append(`incoming-${i + 1}`, curve, fixture.threadRadiusMm));
  append(fixture.markingSupport.id, fixture.markingSupport.curve, fixture.markingSupport.radiusMm);
  return obstacles;
}

function assemble(fixture: LowerKagariFixture, result: SpatialContactResult, controls: number, margin: number): C8ThreadCoupon {
  const source = fixture.coupon, operationId = 'lower-outgoing';
  // This is an exact spline-to-Bezier conversion, including on rejected runs.
  // No renderer smoothing or geometry repair is applied after the solve.
  const curves = result.curves.length ? result.curves : splineToBezier(result.controlPointsMm);
  const spans: ThreadSpan[] = curves.map((curve, i) => ({ id: `lower-computed-${i + 1}`, opId: operationId,
    threadId: source.threadId, step: 2, zone: 'surface', curve }));
  const ids = spans.map(s => s.id);
  return { ...source, spans: [...source.spans.filter(s => s.opId !== operationId), ...spans],
    operations: source.operations.map(op => ({ ...op, spanIds: op.id === operationId ? ids : [...op.spanIds] })),
    crossings: source.crossings?.map(c => c.opId === operationId
      ? { ...c, working: ids.map(spanId => ({ spanId, t0: 0, t1: 1 })) } : c),
    fixture: { ...source.fixture, contactControlCount: controls, contactNumericalClearanceMm: margin },
    assumptions: [...source.assumptions,
      'Only the outgoing free span is optimised. Incoming and needle passage remain fixed engineering boundary data.',
      'Obstacle/body inflation is an explicit numerical clearance, not measured yarn compression or exact force contact.',
      'Thick-rope model: centre-line curvature is bounded by the minimum bend radius; no bending stiffness is claimed.',
      'A stationary spline is rejected unless a resolved ladder of resolutions passes independent full-path checks.'],
  };
}

function arcLengthSampler(curves: readonly ThreadCurve[], tolerance: number) {
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

function curveLength(curves: readonly ThreadCurve[]) {
  let total = 0;
  for (const curve of curves) {
    const n = 2048;
    let integral = Math.hypot(...curveDerivative(curve, 0)) + Math.hypot(...curveDerivative(curve, 1));
    for (let i = 1; i < n; i++) integral += (i % 2 ? 4 : 2) * Math.hypot(...curveDerivative(curve, i / n));
    total += integral / (3 * n);
  }
  return total;
}

/**
 * Isolated integration experiment. The fixed lower backbite is never fitted or
 * moved. Solver convergence alone cannot make this result accepted: every
 * resolution of a model-derived ladder must be resolved, converge and pass the
 * complete thread checks (G1, body zones, finite crossings, self-distance,
 * sampled and independently certified curvature), and successive length and
 * shape differences must stay within tolerance. Even accepted means this
 * explicitly bounded thick-rope model, not a craft calibration, physical
 * anchoring strength, or the complete C8/S8 pattern.
 */
export function computeLowerKagari(input: LowerKagariInput = {}, options: ComputedLowerKagariOptions = {}): ComputedLowerKagari {
  const o = { ...DEFAULTS, ...options };
  if ([o.numericalClearanceMm, o.obstacleToleranceMm, o.validationToleranceMm, o.lengthToleranceMm, o.shapeToleranceMm, o.spansPerBendRadius]
    .some(value => !(value > 0) || !Number.isFinite(value))) throw new RangeError('Computed backbite requires positive numerical tolerances.');
  const fixture = createLowerKagariFixture(input);
  const seedLengthMm = curveLength(fixture.looseOutgoing), bend = fixture.dimensions.minBendRadiusMm;
  const minimumSpans = Math.ceil(o.spansPerBendRadius * seedLengthMm / bend);
  const counts = [...(o.controlCounts ?? LADDER.map(f => Math.ceil(minimumSpans * f) + 3))];
  if (counts.length < 2 || counts.length > 4 || counts.some((n, i) => !Number.isInteger(n) || n < 6 || n > MAX_CONTROLS || (i > 0 && n <= counts[i - 1])))
    throw new RangeError('Computed backbite requires two to four increasing resolutions of at most 128 controls.');
  const obstacles = obstaclesFor(fixture, o.numericalClearanceMm, o.obstacleToleranceMm);
  const seed = validateThreadCoupon(fixture.coupon, o.validationToleranceMm);
  const resolutions: LowerKagariResolution[] = [];
  const coupons: C8ThreadCoupon[] = [];
  for (const controlCount of counts) {
    const result = solveSpatialContact({ controlPointsMm: fitSpatialSeed(fixture.looseOutgoing, controlCount),
      threadRadiusMm: fixture.threadRadiusMm, minBendRadiusMm: bend, body: { centerMm: [0, 0, 0], radiusMm: fixture.bodyRadiusMm + o.numericalClearanceMm },
      supports: obstacles, options: { maxIterations: 8000, maxOuterIterations: 60, feasibilityToleranceMm: .0005,
        complementarityToleranceMm: .000005, ...o.solverOptions } });
    const coupon = assemble(fixture, result, controlCount, o.numericalClearanceMm);
    coupons.push(coupon);
    resolutions.push({ controlCount, resolved: controlCount - 3 >= minimumSpans, result,
      validation: validateThreadCoupon(coupon, o.validationToleranceMm),
      curvature: boundCurvatureTimesRadius(coupon.spans.map(span => span.curve), coupon.threadRadiusMm) });
  }
  const refinements: LowerKagariRefinement[] = [];
  const outgoing = (coupon: C8ThreadCoupon) => coupon.spans.filter(s => s.opId === 'lower-outgoing').map(s => s.curve);
  for (let i = 1; i < resolutions.length; i++) {
    let shapeDifferenceMm = 0;
    const a = arcLengthSampler(outgoing(coupons[i - 1]), .0001), b = arcLengthSampler(outgoing(coupons[i]), .0001);
    for (let j = 0; j <= 200; j++) {
      const p = a(j / 200), q = b(j / 200);
      shapeDifferenceMm = Math.max(shapeDifferenceMm, Math.hypot(...p.map((v, k) => v - q[k])));
    }
    refinements.push({ from: counts[i - 1], to: counts[i], shapeDifferenceMm,
      lengthDifferenceMm: Math.abs(resolutions[i].result.lengthMm - resolutions[i - 1].result.lengthMm) });
  }
  const lengthDifferenceMm = Math.max(...refinements.map(r => r.lengthDifferenceMm));
  const maxShapeDifferenceMm = Math.max(...refinements.map(r => r.shapeDifferenceMm));
  const last = resolutions.at(-1)!, diagnostics: string[] = [];
  if (seed.status !== 'passed') diagnostics.push('The engineering seed does not pass the complete path validator.');
  for (const check of resolutions) {
    if (!check.resolved) diagnostics.push(`${check.controlCount} controls: under-resolved, a span is longer than the minimum bend radius.`);
    if (check.result.status !== 'converged') diagnostics.push(`${check.controlCount} controls: numerical solve ${check.result.status}.`);
    if (check.validation.status !== 'passed') diagnostics.push(`${check.controlCount} controls: complete path ${check.validation.status}: ${[...new Set(check.validation.diagnostics.map(d => d.code))].join(', ')}.`);
    if (check.curvature.status !== 'certified') diagnostics.push(`${check.controlCount} controls: curvature bound unresolved.`);
    else if (!(check.curvature.upper < 1)) diagnostics.push(`${check.controlCount} controls: certified r*kappa bound ${check.curvature.upper.toFixed(4)} is not below 1.`);
  }
  if (lengthDifferenceMm > o.lengthToleranceMm) diagnostics.push('Outgoing length has not stabilised between resolutions.');
  if (maxShapeDifferenceMm > o.shapeToleranceMm) diagnostics.push('Outgoing shape has not stabilised between resolutions.');
  const rejected = seed.status === 'failed' || resolutions.some(c => c.result.status === 'failed' || c.validation.status === 'failed'
    || (c.curvature.status === 'certified' && !(c.curvature.upper < 1)));
  return { status: rejected ? 'rejected' : diagnostics.length ? 'unresolved' : 'accepted', fixture, coupon: coupons.at(-1)!, result: last.result, obstacles,
    checks: { seed, candidate: last.validation, resolutions, refinements },
    metrics: { numericalClearanceMm: o.numericalClearanceMm, obstacleToleranceMm: o.obstacleToleranceMm,
      seedLengthMm, minBendRadiusMm: bend, minimumSpans,
      lengthDifferenceMm, maxShapeDifferenceMm, lengthToleranceMm: o.lengthToleranceMm, shapeToleranceMm: o.shapeToleranceMm }, diagnostics };
}
