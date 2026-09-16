import { createLowerKagariFixture, type LowerKagariFixture, type LowerKagariInput } from './lower-kagari';
import { fitSpatialSeed } from './spatial-spline-seed';
import { solveSpatialContact, splineToBezier, type SpatialContactOptions, type SpatialContactResult, type SpatialSupport } from './spatial-contact';
import { sampleCurve, validateThreadCoupon } from './thread-geometry';
import type { C8ThreadCoupon, PathValidation, PointMm, ThreadCurve, ThreadSpan } from './thread-path';

export type ComputedLowerKagariOptions = {
  /** At least two increasing control counts: one passing mesh is insufficient. */
  controlCounts?: readonly number[];
  numericalClearanceMm?: number;
  obstacleToleranceMm?: number;
  validationToleranceMm?: number;
  lengthToleranceMm?: number;
  shapeToleranceMm?: number;
  solverOptions?: SpatialContactOptions;
};
export type LowerKagariResolution = { controlCount: number; result: SpatialContactResult; validation: PathValidation };
export type ComputedLowerKagari = {
  status: 'accepted' | 'rejected' | 'unresolved';
  fixture: LowerKagariFixture;
  /** Finest diagnostic candidate, even when rejected. Check status before acceptance. */
  coupon: C8ThreadCoupon;
  result: SpatialContactResult;
  obstacles: SpatialSupport[];
  checks: { seed: PathValidation; candidate: PathValidation; resolutions: LowerKagariResolution[] };
  metrics: { numericalClearanceMm: number; obstacleToleranceMm: number;
    lengthDifferenceMm: number;
    /** Maximum at 201 equal arclength samples, not a continuous Hausdorff bound. */
    maxShapeDifferenceMm: number;
    lengthToleranceMm: number; shapeToleranceMm: number };
  diagnostics: string[];
};

const DEFAULTS = Object.freeze({
  controlCounts: [10, 12] as readonly number[],
  numericalClearanceMm: .003,
  obstacleToleranceMm: .0005,
  validationToleranceMm: .001,
  lengthToleranceMm: .002,
  shapeToleranceMm: .02,
});

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
      'A stationary spline is rejected unless independent full-path checks and at least two resolutions pass.'],
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

/**
 * Isolated integration experiment. The fixed lower backbite is never fitted or
 * moved. AL convergence alone cannot make this result accepted: the complete
 * thread still has to satisfy curvature, G1, self-distance and finite crossings.
 * Even accepted means this explicitly bounded engineering model, not a craft
 * calibration, physical anchoring strength, or the complete C8/S8 pattern.
 */
export function computeLowerKagari(input: LowerKagariInput = {}, options: ComputedLowerKagariOptions = {}): ComputedLowerKagari {
  const o = { ...DEFAULTS, ...options }, counts = [...o.controlCounts];
  if (counts.length < 2 || counts.length > 4 || counts.some((n, i) => !Number.isInteger(n) || n < 6 || n > 48 || (i > 0 && n <= counts[i - 1]))
    || [o.numericalClearanceMm, o.obstacleToleranceMm, o.validationToleranceMm, o.lengthToleranceMm, o.shapeToleranceMm]
      .some(value => !(value > 0) || !Number.isFinite(value))) throw new RangeError('Computed backbite requires increasing resolutions and positive numerical tolerances.');
  const fixture = createLowerKagariFixture(input);
  const obstacles = obstaclesFor(fixture, o.numericalClearanceMm, o.obstacleToleranceMm);
  const seed = validateThreadCoupon(fixture.coupon, o.validationToleranceMm);
  const resolutions: LowerKagariResolution[] = [];
  const coupons: C8ThreadCoupon[] = [];
  for (const controlCount of counts) {
    const result = solveSpatialContact({ controlPointsMm: fitSpatialSeed(fixture.looseOutgoing, controlCount),
      threadRadiusMm: fixture.threadRadiusMm, body: { centerMm: [0, 0, 0], radiusMm: fixture.bodyRadiusMm + o.numericalClearanceMm },
      supports: obstacles, options: { maxIterations: 8000, maxOuterIterations: 60, feasibilityToleranceMm: .0005,
        complementarityToleranceMm: .000005, ...o.solverOptions } });
    const coupon = assemble(fixture, result, controlCount, o.numericalClearanceMm);
    coupons.push(coupon);
    resolutions.push({ controlCount, result, validation: validateThreadCoupon(coupon, o.validationToleranceMm) });
  }
  let lengthDifferenceMm = 0, maxShapeDifferenceMm = 0;
  for (let i = 1; i < resolutions.length; i++) {
    lengthDifferenceMm = Math.max(lengthDifferenceMm, Math.abs(resolutions[i].result.lengthMm - resolutions[i - 1].result.lengthMm));
    const curves = (coupon: C8ThreadCoupon) => coupon.spans.filter(s => s.opId === 'lower-outgoing').map(s => s.curve);
    const a = arcLengthSampler(curves(coupons[i - 1]), .0001), b = arcLengthSampler(curves(coupons[i]), .0001);
    for (let j = 0; j <= 200; j++) {
      const p = a(j / 200), q = b(j / 200);
      maxShapeDifferenceMm = Math.max(maxShapeDifferenceMm, Math.hypot(...p.map((v, k) => v - q[k])));
    }
  }
  const last = resolutions.at(-1)!, diagnostics: string[] = [];
  if (seed.status !== 'passed') diagnostics.push('The engineering seed does not pass the complete path validator.');
  for (const check of resolutions) {
    if (check.result.status !== 'converged') diagnostics.push(`${check.controlCount} controls: numerical solve ${check.result.status}.`);
    if (check.validation.status !== 'passed') diagnostics.push(`${check.controlCount} controls: complete path ${check.validation.status}: ${[...new Set(check.validation.diagnostics.map(d => d.code))].join(', ')}.`);
  }
  if (lengthDifferenceMm > o.lengthToleranceMm) diagnostics.push('Outgoing length has not stabilised between resolutions.');
  if (maxShapeDifferenceMm > o.shapeToleranceMm) diagnostics.push('Outgoing shape has not stabilised between resolutions.');
  const rejected = seed.status === 'failed' || resolutions.some(c => c.result.status === 'failed' || c.validation.status === 'failed');
  return { status: rejected ? 'rejected' : diagnostics.length ? 'unresolved' : 'accepted', fixture, coupon: coupons.at(-1)!, result: last.result, obstacles,
    checks: { seed, candidate: last.validation, resolutions },
    metrics: { numericalClearanceMm: o.numericalClearanceMm, obstacleToleranceMm: o.obstacleToleranceMm,
      lengthDifferenceMm, maxShapeDifferenceMm, lengthToleranceMm: o.lengthToleranceMm, shapeToleranceMm: o.shapeToleranceMm }, diagnostics };
}
