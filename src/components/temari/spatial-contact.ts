import { closestSegmentApproach, sampleCurve } from "./thread-geometry";
import { boundCurvatureTimesRadius } from "./curvature-bound";
import type { PointMm, ThreadCurve } from "./thread-path";

export type SpatialPointMm = PointMm;
export type SpatialSupport = {
  id: string; kind: "arc"; centerMm: SpatialPointMm;
  fromMm: SpatialPointMm; toMm: SpatialPointMm; radiusMm: number;
} | {
  id: string; kind: "segment"; fromMm: SpatialPointMm; toMm: SpatialPointMm; radiusMm: number;
};
export type SpatialContactOptions = {
  feasibilityToleranceMm?: number;
  stationarityTolerance?: number;
  complementarityToleranceMm?: number;
  lengthToleranceMm?: number;
  maxIterations?: number;
  maxOuterIterations?: number;
  maxConstraintSamples?: number;
  samplesPerSpan?: number;
  /** Allowed certified excess of r*kappa over r/minBendRadius between probes. */
  curvatureTolerance?: number;
  /** Regularity floor |x'(u)| >= minRelativeSpeed * reference length. */
  minRelativeSpeed?: number;
  /** Width of the certified curvature interval used for acceptance. */
  curvaturePrecision?: number;
  /**
   * Homotopy guard, in thread radii: no control moves farther per accepted step,
   * and a step may not deepen probe penetration beyond this depth. A probe point
   * then cannot jump across an obstacle centre line, whose inflated radius is at
   * least one thread radius. Final crossing/topology checks remain mandatory.
   */
  maxStepThreadRadii?: number;
};
export type SpatialContactInput = {
  /**
   * Open uniform cubic B-spline. Controls 0 and n-1 are fixed ports. Controls
   * 1 and n-2 fix only the oriented port tangents; their handle lengths are
   * free positive variables. The initial handles must be nonzero.
   */
  controlPointsMm: readonly SpatialPointMm[];
  body: { centerMm: SpatialPointMm; radiusMm: number };
  supports: readonly SpatialSupport[];
  threadRadiusMm: number;
  /**
   * Smallest admissible centre-line bend radius. The thick-rope model needs
   * minBendRadiusMm > threadRadiusMm (tube regularity, r*kappa < 1). The
   * default is SPATIAL_CONTACT_DEFAULTS.bendRadiusFactor * threadRadiusMm.
   */
  minBendRadiusMm?: number;
  options?: SpatialContactOptions;
};
export type SpatialContactMetrics = {
  iterations: number; outerIterations: number; constraintSamples: number;
  /** Conservative upper bound, including between-probe curve intervals. */
  maxPenetrationMm: number;
  samplePenetrationMm: number; continuousLowerGapMm: number;
  kktStationarity: number; complementarityMm: number;
  lengthQuadratureDifferenceMm: number; lengthChangeMm: number;
  /** Formulation bound r / minBendRadius. */
  curvatureLimit: number;
  /** Largest r*kappa at the constraint probes. */
  sampleCurvatureTimesRadius: number;
  /** Certified interval for max r*kappa over the whole spline. */
  curvatureTimesRadiusLower: number;
  curvatureTimesRadiusUpper: number;
  /** Certified lower bound of |dx/du| divided by the length (1 = constant speed). */
  minRelativeSpeedBound: number;
  /** E / L^2 - 1 >= 0; zero only for a constant-speed parametrisation. */
  parametrizationDefect: number;
  /** Seed length that normalises the energy objective. */
  referenceLengthMm: number;
};
export type SpatialConstraintKind = "body" | "support" | "curvature" | "speed";
export type SpatialContactResult = {
  status: "converged" | "failed" | "unresolved";
  controlPointsMm: SpatialPointMm[];
  curves: ThreadCurve[];
  lengthMm: number;
  /**
   * Multipliers of the normalised energy E/(2 L_ref). For body/support rows,
   * gapMm is the clearance and the multiplier is a multiple of the tension
   * scale L/L_ref. Curvature and speed rows are dimensionless constraints
   * (slack = (limit |x'|^3 - |x' x x''|) / L_ref^3, or |x'|/L_ref - floor), scaled by the thread radius.
   */
  reactions: { parameter: number; kind: SpatialConstraintKind; supportId: string; multiplier: number; gapMm: number | null; slack: number }[];
  metrics: SpatialContactMetrics;
  diagnostics: { code: string; message: string }[];
};

/**
 * Local finite-dimensional thick-rope reference, not a general yarn equilibrium
 * solver. The continuous problem is: shortest centre line between fixed ports
 * with prescribed oriented tangents, outside inflated obstacles, with curvature
 * at most 1/minBendRadius. The curvature bound makes this problem well posed
 * (curves of bounded curvature are compact in C^1); without it the infimum is
 * approached by kinks at the ports and refinement does not converge.
 *
 * The discrete objective is the energy E = int |x'(u)|^2 du. By Cauchy-Schwarz
 * E >= L^2 with equality only at constant speed, so continuous E-minimisers are
 * constant-speed length minimisers; the energy removes the reparametrisation
 * null space of L that let controls collapse into cusps.
 *
 * A converged result certifies this spline's discrete first-order residual,
 * bounded continuous obstacle gaps and a rigorous curvature bound. It does not
 * certify global optimality, material calibration, self-clearance or the
 * prescribed over/under order; callers MUST verify those before acceptance.
 */
export const SPATIAL_CONTACT_DEFAULTS = Object.freeze({
  feasibilityToleranceMm: .002,
  stationarityTolerance: 2e-4,
  complementarityToleranceMm: 2e-5,
  lengthToleranceMm: 2e-5,
  maxIterations: 2400,
  maxOuterIterations: 30,
  maxConstraintSamples: 2048,
  samplesPerSpan: 4,
  curvatureTolerance: .02,
  minRelativeSpeed: .25,
  curvaturePrecision: 1e-3,
  maxStepThreadRadii: .5,
  /** Engineering default: bend radius 1.25 r, i.e. r*kappa <= 0.8. */
  bendRadiusFactor: 1.25,
});

const add = (a: PointMm, b: PointMm): PointMm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: PointMm, s: number): PointMm => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: PointMm, b: PointMm): PointMm => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: PointMm) => Math.hypot(...a);
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const finite = (a: PointMm) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);
/** Distance between the axis-aligned boxes of two segments (a lower bound of their distance). */
const boxGap = (a: PointMm, b: PointMm, c: PointMm, d: PointMm) => {
  let square = 0;
  for (let k = 0; k < 3; k++) {
    const gap = Math.max(0, Math.min(a[k], b[k]) - Math.max(c[k], d[k]), Math.min(c[k], d[k]) - Math.max(a[k], b[k]));
    square += gap * gap;
  }
  return Math.sqrt(square);
};

export function spatialSplineKnots(controlCount: number): number[] {
  if (!Number.isInteger(controlCount) || controlCount < 4) throw new RangeError("A cubic spline requires at least four controls.");
  const spans = controlCount - 3;
  return [0, 0, 0, 0, ...Array.from({ length: spans - 1 }, (_, i) => (i + 1) / spans), 1, 1, 1, 1];
}

/**
 * Basis and its first two derivatives with respect to u in [0,1]. The second
 * derivative is piecewise linear and continuous at the simple interior knots.
 */
export function spatialSplineBasis(controlCount: number, u: number): { values: number[]; derivatives: number[]; secondDerivatives: number[] } {
  const knots = spatialSplineKnots(controlCount), layers: number[][] = [];
  layers[0] = Array.from({ length: controlCount + 3 }, (_, i) =>
    (u >= knots[i] && u < knots[i + 1]) || (u === 1 && i === controlCount - 1) ? 1 : 0);
  for (let degree = 1; degree <= 3; degree++) {
    layers[degree] = Array.from({ length: controlCount + 3 - degree }, (_, i) => {
      const left = knots[i + degree] - knots[i], right = knots[i + degree + 1] - knots[i + 1];
      return (left ? (u - knots[i]) / left * layers[degree - 1][i] : 0)
        + (right ? (knots[i + degree + 1] - u) / right * layers[degree - 1][i + 1] : 0);
    });
  }
  // d/du N_{i,2} from the linear layer, then d^2/du^2 N_{i,3}.
  const quadratic = Array.from({ length: controlCount + 1 }, (_, i) => {
    const left = knots[i + 2] - knots[i], right = knots[i + 3] - knots[i + 1];
    return (left ? 2 * layers[1][i] / left : 0) - (right ? 2 * layers[1][i + 1] / right : 0);
  });
  const derivatives: number[] = [], secondDerivatives: number[] = [];
  for (let i = 0; i < controlCount; i++) {
    const left = knots[i + 3] - knots[i], right = knots[i + 4] - knots[i + 1];
    derivatives.push((left ? 3 * layers[2][i] / left : 0) - (right ? 3 * layers[2][i + 1] / right : 0));
    secondDerivatives.push((left ? 3 * quadratic[i] / left : 0) - (right ? 3 * quadratic[i + 1] / right : 0));
  }
  return { values: layers[3], derivatives, secondDerivatives };
}

function combine(controls: readonly PointMm[], basis: readonly number[]): PointMm {
  const p = [0, 0, 0];
  for (let i = 0; i < controls.length; i++) for (let k = 0; k < 3; k++) p[k] += basis[i] * controls[i][k];
  return p as unknown as PointMm;
}

export function sampleSpatialSpline(controls: readonly PointMm[], u: number): PointMm {
  return combine(controls, spatialSplineBasis(controls.length, clamp(u)).values);
}

/** Exact polynomial conversion, with no fitting, smoothing or collision repair. */
export function splineToBezier(controls: readonly PointMm[]): ThreadCurve[] {
  const count = controls.length - 3;
  return Array.from({ length: count }, (_, i) => {
    const a = spatialSplineBasis(controls.length, i / count), b = spatialSplineBasis(controls.length, (i + 1) / count);
    const p = combine(controls, a.values), q = combine(controls, b.values);
    return { kind: "bezier" as const, controls: [p, add(p, mul(combine(controls, a.derivatives), 1 / (3 * count))),
      sub(q, mul(combine(controls, b.derivatives), 1 / (3 * count))), q] as const };
  });
}

/** Exact distance to the FINITE support centreline, including its end caps. */
export function closestSpatialSupport(point: PointMm, support: SpatialSupport): { pointMm: PointMm; distanceMm: number; normal: PointMm; parameter: number } {
  let q: PointMm, parameter: number;
  if (support.kind === "segment") {
    const v = sub(support.toMm, support.fromMm), vv = dot3(v, v);
    parameter = vv ? clamp(dot3(sub(point, support.fromMm), v) / vv) : 0;
    q = add(support.fromMm, mul(v, parameter));
  } else {
    const a = sub(support.fromMm, support.centerMm), b = sub(support.toMm, support.centerMm), radius = norm(a);
    const e1 = mul(a, 1 / radius), cosine = clamp(dot3(e1, b) / radius, -1, 1), angle = Math.acos(cosine);
    const e2 = mul(sub(mul(b, 1 / radius), mul(e1, cosine)), 1 / Math.sin(angle));
    const p = sub(point, support.centerMm), phi = Math.atan2(dot3(p, e2), dot3(p, e1));
    const angles = [0, angle];
    if (phi >= 0 && phi <= angle) angles.push(phi);
    const candidates = angles.map(theta => ({ theta, q: add(support.centerMm,
      mul(add(mul(e1, Math.cos(theta)), mul(e2, Math.sin(theta))), radius)) }));
    const best = candidates.reduce((a, b) => norm(sub(point, a.q)) <= norm(sub(point, b.q)) ? a : b);
    q = best.q; parameter = best.theta / angle;
  }
  const delta = sub(point, q), distanceMm = norm(delta);
  return { pointMm: q, distanceMm, normal: distanceMm ? mul(delta, 1 / distanceMm) : [0, 0, 0], parameter };
}

const GL = [
  [-.9602898564975363, .1012285362903763], [-.7966664774136267, .2223810344533745],
  [-.525532409916329, .3137066458778873], [-.1834346424956498, .362683783378362],
  [.1834346424956498, .362683783378362], [.525532409916329, .3137066458778873],
  [.7966664774136267, .2223810344533745], [.9602898564975363, .1012285362903763],
];
type QuadraturePoint = { weight: number; derivative: number[] };
function quadrature(controlCount: number, subdivisions: number): QuadraturePoint[] {
  const intervals = (controlCount - 3) * subdivisions;
  return Array.from({ length: intervals }, (_, i) => GL.map(([x, w]) => ({
    weight: w / (2 * intervals), derivative: spatialSplineBasis(controlCount, (i + (x + 1) / 2) / intervals).derivatives,
  }))).flat();
}

type Parameter = { u: number; values: number[]; d1: number[]; d2: number[]; end: -1 | 0 | 1 };
type Probe = { parameter: number; kind: SpatialConstraintKind; obstacle: number; lambda: number };
type Evaluation = { value: number; gradient: number[]; length: number; energy: number; slacks: number[]; curvatures: number[] };

export function solveSpatialContact(input: SpatialContactInput): SpatialContactResult {
  const o = { ...SPATIAL_CONTACT_DEFAULTS, ...input.options };
  const result: SpatialContactResult = { status: "failed", controlPointsMm: input.controlPointsMm.map(p => [...p] as PointMm),
    curves: [], lengthMm: 0, reactions: [], diagnostics: [], metrics: { iterations: 0, outerIterations: 0, constraintSamples: 0,
      maxPenetrationMm: Infinity, samplePenetrationMm: Infinity, continuousLowerGapMm: -Infinity, kktStationarity: Infinity, complementarityMm: Infinity,
      lengthQuadratureDifferenceMm: Infinity, lengthChangeMm: Infinity, curvatureLimit: NaN, sampleCurvatureTimesRadius: Infinity,
      curvatureTimesRadiusLower: Infinity, curvatureTimesRadiusUpper: Infinity, minRelativeSpeedBound: 0,
      parametrizationDefect: Infinity, referenceLengthMm: NaN } };
  const stop = (code: string, message: string, failed = false) => {
    result.status = failed ? "failed" : "unresolved"; result.diagnostics.push({ code, message }); return result;
  };
  const minBend = input.minBendRadiusMm ?? o.bendRadiusFactor * input.threadRadiusMm;
  if (input.controlPointsMm.length < 6 || input.controlPointsMm.length > 256 || !input.controlPointsMm.every(finite)
    || !finite(input.body.centerMm) || !(input.body.radiusMm > 0) || !Number.isFinite(input.body.radiusMm)
    || !(input.threadRadiusMm > 0) || !Number.isFinite(input.threadRadiusMm)
    || Object.values(o).some(x => !Number.isFinite(x) || x <= 0)
    || ![o.maxIterations, o.maxOuterIterations, o.maxConstraintSamples, o.samplesPerSpan].every(Number.isInteger)
    || o.samplesPerSpan > 32 || o.maxIterations > 20000 || o.maxOuterIterations > 100 || o.maxConstraintSamples > 10000
    || o.minRelativeSpeed >= 1
    || input.supports.length > 256 || new Set(input.supports.map(s => s.id)).size !== input.supports.length) {
    return stop("invalid-input", "Invalid spline, dimensions, numerical tolerances or bounded solver limits.", true);
  }
  // Tube regularity: an accepted curve must satisfy r*kappa < 1 with margin.
  if (!Number.isFinite(minBend) || input.threadRadiusMm / minBend + o.curvatureTolerance >= 1)
    return stop("invalid-input", "The thick-rope model requires r/minBendRadius + curvatureTolerance < 1.", true);
  if (o.maxConstraintSamples < (input.controlPointsMm.length - 3) * o.samplesPerSpan + 1)
    return stop("invalid-input", "The constraint sample budget must include the initial complete probe grid.", true);
  if (norm(sub(input.controlPointsMm[1], input.controlPointsMm[0])) === 0
    || norm(sub(input.controlPointsMm.at(-1)!, input.controlPointsMm.at(-2)!)) === 0)
    return stop("invalid-port", "Fixed end handles must define nonzero endpoint tangents.", true);
  for (const s of input.supports) {
    if (typeof s.id !== "string" || !s.id || s.id === "body" || !finite(s.fromMm) || !finite(s.toMm) || !(s.radiusMm > 0) || !Number.isFinite(s.radiusMm)
      || (s.kind !== "arc" && s.kind !== "segment")) return stop("invalid-support", "Supports require finite named geometry and positive radius.", true);
    if (s.kind === "arc") {
      if (!finite(s.centerMm)) return stop("invalid-support", "A finite circular arc requires its centre.", true);
      const a = sub(s.fromMm, s.centerMm), b = sub(s.toMm, s.centerMm), ra = norm(a), rb = norm(b);
      const angle = Math.acos(clamp(dot3(a, b) / (ra * rb), -1, 1));
      if (!(ra > 0) || Math.abs(ra - rb) > ra * 1e-9 || !(angle > 1e-7 && angle < Math.PI - 1e-7))
        return stop("invalid-support", "Support arcs require equal nonzero radii and an unambiguous minor circular interval.", true);
    }
  }
  const unit = input.threadRadiusMm, origin = input.controlPointsMm[0], scalePoint = (p: PointMm) => mul(sub(p, origin), 1 / unit);
  const controls = input.controlPointsMm.map(scalePoint), m = controls.length, spans = m - 3;
  // In units of the thread radius, kappa is already r*kappa.
  const limit = unit / minBend;
  result.metrics.curvatureLimit = limit;
  const body = { centerMm: scalePoint(input.body.centerMm), radiusMm: input.body.radiusMm / unit };
  const supports: SpatialSupport[] = input.supports.map(s => s.kind === "arc"
    ? { ...s, centerMm: scalePoint(s.centerMm), fromMm: scalePoint(s.fromMm), toMm: scalePoint(s.toMm), radiusMm: s.radiusMm / unit }
    : { ...s, fromMm: scalePoint(s.fromMm), toMm: scalePoint(s.toMm), radiusMm: s.radiusMm / unit });
  const startHandle = sub(controls[1], controls[0]), endHandle = sub(controls[m - 1], controls[m - 2]);
  const tangentStart = mul(startHandle, 1 / norm(startHandle)), tangentEnd = mul(endHandle, 1 / norm(endHandle));
  // Variables: interior controls, then the two positive handle lengths.
  let x = [...controls.slice(2, -2).flat(), norm(startHandle), norm(endHandle)];
  const dimensions = x.length;
  const unpack = (values: number[]) => controls.map((p, i): PointMm => i === 0 || i === m - 1 ? p
    : i === 1 ? add(controls[0], mul(tangentStart, values[dimensions - 2]))
    : i === m - 2 ? sub(controls[m - 1], mul(tangentEnd, values[dimensions - 1]))
    : [values[(i - 2) * 3], values[(i - 2) * 3 + 1], values[(i - 2) * 3 + 2]]);
  const pullback = (force: PointMm[]) => {
    const gradient = Array<number>(dimensions).fill(0);
    for (let i = 2; i < m - 2; i++) for (let k = 0; k < 3; k++) gradient[3 * (i - 2) + k] = force[i][k];
    gradient[dimensions - 2] = dot3(force[1], tangentStart);
    gradient[dimensions - 1] = -dot3(force[m - 2], tangentEnd);
    return gradient;
  };
  // Exact Gram matrix of basis derivatives: three Gauss points integrate quartics.
  const gram = Array.from({ length: m }, () => Array<number>(m).fill(0));
  for (let span = 0; span < spans; span++) for (const [node, weight] of [[-Math.sqrt(.6), 5 / 9], [0, 8 / 9], [Math.sqrt(.6), 5 / 9]]) {
    const d = spatialSplineBasis(m, (span + (node + 1) / 2) / spans).derivatives;
    for (let a = 0; a < m; a++) if (d[a]) for (let b = 0; b < m; b++) gram[a][b] += weight / (2 * spans) * d[a] * d[b];
  }
  const integrate = quadrature(m, 2), integrateFine = quadrature(m, 4);
  // Variable v moves control owner[v] along axis[v]. The energy Hessian in these
  // variables is constant, so its Cholesky factor preconditions L-BFGS without
  // changing the problem, its KKT conditions or the acceptance checks.
  const owner: number[] = [], axis: PointMm[] = [];
  for (let i = 2; i < m - 2; i++) for (let k = 0; k < 3; k++) { owner.push(i); axis.push([k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0]); }
  owner.push(1, m - 2); axis.push(tangentStart, mul(tangentEnd, -1));
  const energyHessian = Array.from({ length: dimensions }, (_, a) => Array.from({ length: dimensions }, (_, b) =>
    gram[owner[a]][owner[b]] * dot3(axis[a], axis[b])));
  const choleskyOf = (matrix: number[][]) => {
    const f = matrix.map(row => [...row]);
    for (let j = 0; j < dimensions; j++) {
      for (let k = 0; k < j; k++) f[j][j] -= f[j][k] ** 2;
      if (!(f[j][j] > 0)) return null;
      f[j][j] = Math.sqrt(f[j][j]);
      for (let i = j + 1; i < dimensions; i++) {
        for (let k = 0; k < j; k++) f[i][j] -= f[i][k] * f[j][k];
        f[i][j] /= f[j][j];
      }
    }
    return f;
  };
  const maybeFactor = choleskyOf(energyHessian);
  if (!maybeFactor) return stop("invalid-input", "The spline energy is not positive definite in the free variables.", true);
  const energyFactor: number[][] = maybeFactor;
  let factor = energyFactor;
  /** Solve M z = g with the current preconditioner M (energy Hessian, optionally plus active penalty terms). */
  const precondition = (g: number[]) => {
    const z = [...g];
    for (let i = 0; i < dimensions; i++) { for (let k = 0; k < i; k++) z[i] -= factor[i][k] * z[k]; z[i] /= factor[i][i]; }
    for (let i = dimensions - 1; i >= 0; i--) { for (let k = i + 1; k < dimensions; k++) z[i] -= factor[k][i] * z[k]; z[i] /= factor[i][i]; }
    return z;
  };
  const lengthOf = (c: PointMm[], rule: QuadraturePoint[]) => rule.reduce((sum, q) => sum + q.weight * norm(combine(c, q.derivative)), 0);
  const energyOf = (c: PointMm[]) => c.reduce((sum, p, a) => sum + dot3(p, combine(c, gram[a])), 0);
  const referenceLength = lengthOf(controls, integrateFine);
  result.metrics.referenceLengthMm = referenceLength * unit;
  if (!(referenceLength > 0)) return stop("invalid-input", "The seed spline has no length.", true);

  const parameters: Parameter[] = [], probes: Probe[] = [], keys = new Set<string>();
  let sampleLimit = false;
  const addParameter = (u: number) => {
    const key = u.toFixed(12); if (keys.has(key)) return false;
    if (keys.size >= o.maxConstraintSamples) { sampleLimit = true; return false; }
    keys.add(key);
    const b = spatialSplineBasis(m, u), index = parameters.length;
    parameters.push({ u, values: b.values, d1: b.derivatives, d2: b.secondDerivatives, end: u === 0 ? -1 : u === 1 ? 1 : 0 });
    probes.push({ parameter: index, kind: "body", obstacle: -1, lambda: 0 });
    supports.forEach((_, k) => probes.push({ parameter: index, kind: "support", obstacle: k, lambda: 0 }));
    probes.push({ parameter: index, kind: "curvature", obstacle: -1, lambda: 0 }, { parameter: index, kind: "speed", obstacle: -1, lambda: 0 });
    return true;
  };
  const intervals = spans * o.samplesPerSpan;
  for (let i = 0; i <= intervals; i++) addParameter(i / intervals);

  type State = { point: PointMm; v: PointMm; acc: PointMm; w: PointMm; speed: number; bend: number; curvature: number };
  const statesOf = (c: PointMm[]): State[] => parameters.map(p => {
    const v = combine(c, p.d1), acc = combine(c, p.d2), w = cross3(v, acc), speed = norm(v), bend = norm(w);
    return { point: combine(c, p.values), v, acc, w, speed, bend, curvature: speed > 1e-12 ? bend / speed ** 3 : Infinity };
  });
  /** Slack and gradient terms: grad = sum over terms of weights_i * vector at control i. */
  function constraint(probe: Probe, s: State): { slack: number; terms: [number[], PointMm][] } {
    const p = parameters[probe.parameter];
    if (probe.kind === "body" || probe.kind === "support") {
      const closest = probe.kind === "support" ? closestSpatialSupport(s.point, supports[probe.obstacle]) : null;
      const delta = sub(s.point, body.centerMm), distance = closest?.distanceMm ?? norm(delta);
      const normal = closest?.normal ?? (distance ? mul(delta, 1 / distance) : [0, 0, 0] as PointMm);
      return { slack: distance - 1 - (closest ? supports[probe.obstacle].radiusMm : body.radiusMm), terms: [[p.values, normal]] };
    }
    if (probe.kind === "curvature") {
      // Homogeneous form of kappa <= limit: (limit |v|^3 - |v x a|) / L_ref^3 >= 0.
      // It is polynomial, bounded near cusps and equivalent wherever |v| > 0.
      const cube = referenceLength ** 3, unitBend = s.bend > 1e-14 ? 1 / s.bend : 0;
      return { slack: (limit * s.speed ** 3 - s.bend) / cube,
        terms: [[p.d1, mul(sub(mul(s.v, 3 * limit * s.speed), mul(cross3(s.acc, s.w), unitBend)), 1 / cube)],
          [p.d2, mul(cross3(s.w, s.v), -unitBend / cube)]] };
    }
    // Signed at the ports, so a handle cannot flip the prescribed tangent.
    const direction = p.end < 0 ? tangentStart : p.end > 0 ? tangentEnd : s.speed > 1e-12 ? mul(s.v, 1 / s.speed) : [0, 0, 0] as PointMm;
    return { slack: dot3(s.v, direction) / referenceLength - o.minRelativeSpeed, terms: [[p.d1, mul(direction, 1 / referenceLength)]] };
  }
  const energyForce = (c: PointMm[]) => {
    let energy = 0;
    const force = c.map((point, a) => { const row = combine(c, gram[a]); energy += dot3(point, row); return mul(row, 1 / referenceLength); });
    return { energy, force };
  };
  const accumulate = (force: PointMm[], terms: [number[], PointMm][], factor: number) => {
    for (const [weights, vector] of terms) for (let i = 0; i < m; i++) if (weights[i]) force[i] = add(force[i], mul(vector, factor * weights[i]));
  };

  function evaluate(values: number[], penalty: number, multipliers?: readonly number[]): Evaluation {
    const c = unpack(values), { energy, force } = energyForce(c), states = statesOf(c);
    let value = energy / (2 * referenceLength);
    const slacks: number[] = [];
    probes.forEach((probe, j) => {
      const { slack, terms } = constraint(probe, states[probe.parameter]);
      slacks.push(slack);
      const lambda = multipliers ? multipliers[j] : probe.lambda;
      const reaction = penalty ? Math.max(0, lambda - penalty * slack) : lambda;
      if (penalty) value += (reaction * reaction - lambda * lambda) / (2 * penalty);
      if (reaction) accumulate(force, terms, -reaction);
    });
    return { value, gradient: pullback(force), length: lengthOf(c, integrate), energy, slacks, curvatures: states.map(s => s.curvature) };
  }
  /**
   * First-order certificate with the best nonnegative multipliers on nearly
   * active probes (projected Gauss-Seidel NNLS, warm-started from the AL
   * estimate). Any lambda >= 0 bounds the optimal residual from above, so the
   * certificate stays valid when dense active curvature probes violate LICQ.
   */
  function probeGradient(c: PointMm[], states: State[], j: number) {
    const force = c.map(() => [0, 0, 0] as PointMm);
    accumulate(force, constraint(probes[j], states[probes[j].parameter]).terms, 1);
    return pullback(force);
  }
  /**
   * Gauss-Newton preconditioner of the AL subproblem: energy Hessian plus
   * penalty * grad g grad g^T for currently loaded probes. Only the search path
   * changes; stationarity and feasibility are still measured on the true problem.
   */
  function updatePreconditioner(values: number[], penalty: number) {
    const c = unpack(values), states = statesOf(c), matrix = energyHessian.map(row => [...row]);
    probes.forEach((probe, j) => {
      const { slack } = constraint(probe, states[probe.parameter]);
      if (!(probe.lambda - penalty * slack > 0)) return;
      const g = probeGradient(c, states, j);
      for (let a = 0; a < dimensions; a++) if (g[a]) for (let b = 0; b < dimensions; b++) matrix[a][b] += penalty * g[a] * g[b] * referenceLength;
    });
    factor = choleskyOf(matrix) ?? energyFactor;
  }
  function certifyMultipliers(values: number[], slacks: readonly number[]): number[] {
    const c = unpack(values), states = statesOf(c), b = pullback(energyForce(c).force);
    const lambda = probes.map(p => p.lambda);
    const columns: { j: number; g: number[]; norm2: number }[] = [];
    probes.forEach((probe, j) => {
      const window = probe.kind === "body" || probe.kind === "support" ? o.feasibilityToleranceMm / unit : o.curvatureTolerance / 4;
      if (slacks[j] > window) { lambda[j] = 0; return; }
      const g = probeGradient(c, states, j), norm2 = dot(g, g);
      if (norm2 > 0) columns.push({ j, g, norm2 }); else lambda[j] = 0;
    });
    const residual = [...b];
    for (const col of columns) if (lambda[col.j]) for (let k = 0; k < dimensions; k++) residual[k] -= lambda[col.j] * col.g[k];
    for (let sweep = 0; sweep < 400; sweep++) {
      let change = 0;
      for (const col of columns) {
        const next = Math.max(0, lambda[col.j] + dot(col.g, residual) / col.norm2), delta = next - lambda[col.j];
        if (!delta) continue;
        for (let k = 0; k < dimensions; k++) residual[k] -= delta * col.g[k];
        lambda[col.j] = next; change = Math.max(change, Math.abs(delta) * Math.sqrt(col.norm2));
      }
      if (change < 1e-12) break;
    }
    return lambda;
  }
  const gradNorm = (gradient: number[]) => Math.max(Math.abs(gradient[dimensions - 2]), Math.abs(gradient[dimensions - 1]),
    ...Array.from({ length: m - 4 }, (_, i) => Math.hypot(gradient[3 * i], gradient[3 * i + 1], gradient[3 * i + 2])));
  /** Largest control displacement (in thread radii) produced by a unit step. */
  const controlDisplacement = (direction: number[]) => Math.max(Math.abs(direction[dimensions - 2]), Math.abs(direction[dimensions - 1]),
    ...Array.from({ length: m - 4 }, (_, i) => Math.hypot(direction[3 * i], direction[3 * i + 1], direction[3 * i + 2])));
  const violation = (e: Evaluation, kind: SpatialConstraintKind | "geometric") => probes.reduce((maximum, p, i) =>
    (kind === "geometric" ? p.kind === "body" || p.kind === "support" : p.kind === kind) ? Math.max(maximum, -e.slacks[i]) : maximum, 0);
  let penalty = 10, previousViolation = Infinity;
  let current = evaluate(x, penalty);
  let previousLength = current.length * unit;
  // Fixed ports/handles may make the boundary data infeasible. Do not move them.
  for (let i = 0; i < probes.length; i++) if ((probes[i].kind === "body" || probes[i].kind === "support")
    && parameters[probes[i].parameter].end !== 0 && current.slacks[i] * unit < -o.feasibilityToleranceMm / 4)
    return stop("invalid-port", "A fixed geometric port penetrates an obstacle.", true);

  function continuousCheck(c: PointMm[]) {
    const tolerance = o.feasibilityToleranceMm / 32 / unit;
    const targets = supports.map(s => s.kind === "segment"
      ? { points: [s.fromMm, s.toMm], error: 0 }
      : (() => {
        const sample = sampleCurve({ kind: "arc", from: sub(s.fromMm, s.centerMm), to: sub(s.toMm, s.centerMm) }, tolerance);
        return { points: sample.points.map(p => add(p, s.centerMm)), error: sample.errorBoundMm };
      })());
    let lower = Infinity;
    const witnesses: number[] = [];
    const curves = splineToBezier(c);
    curves.forEach((curve, span) => {
      const sample = sampleCurve(curve, tolerance);
      for (let j = 1; j < sample.points.length; j++) {
        const a = sample.points[j - 1], b = sample.points[j];
        const check = (value: number, t: number) => {
          lower = Math.min(lower, value);
          if (value * unit < -o.feasibilityToleranceMm * .75)
            witnesses.push((span + sample.parameters[j - 1] + t * (sample.parameters[j] - sample.parameters[j - 1])) / curves.length);
        };
        const bodyDistance = closestSegmentApproach(a, b, body.centerMm, body.centerMm);
        check(bodyDistance.distanceMm - sample.errorBoundMm - body.radiusMm - 1, bodyDistance.s);
        targets.forEach((target, k) => {
          const offset = sample.errorBoundMm + target.error + supports[k].radiusMm + 1;
          for (let v = 1; v < target.points.length; v++) {
            // A pair whose box distance already exceeds the running minimum and
            // cannot be a violation witness does not change either result.
            const bound = boxGap(a, b, target.points[v - 1], target.points[v]) - offset;
            if (bound > lower && bound * unit >= -o.feasibilityToleranceMm * .75) continue;
            const closest = closestSegmentApproach(a, b, target.points[v - 1], target.points[v]);
            check(closest.distanceMm - offset, closest.s);
          }
        });
      }
    });
    // Rigorous curvature interval over the whole spline, in scaled units.
    const bend = boundCurvatureTimesRadius(curves, 1, { precision: o.curvaturePrecision, witnessAbove: limit + o.curvatureTolerance / 2 });
    for (const witness of bend.witnesses) witnesses.push((witness.curve + witness.t) / curves.length);
    return { lowerMm: lower * unit, witnesses, bend };
  }
  let lastBend: ReturnType<typeof boundCurvatureTimesRadius> | undefined;
  /** NNLS multipliers used by the last KKT check, when better than the AL estimate. */
  let certified: number[] | null = null;

  for (let outer = 0; outer < o.maxOuterIterations && result.metrics.iterations < o.maxIterations; outer++) {
    result.metrics.outerIterations = outer + 1;
    updatePreconditioner(x, penalty);
    current = evaluate(x, penalty);
    const history: { s: number[]; y: number[]; rho: number }[] = [];
    for (let inner = 0; inner < 180 && result.metrics.iterations < o.maxIterations; inner++) {
      result.metrics.iterations++;
      if (gradNorm(current.gradient) < Math.min(2e-5, o.stationarityTolerance / 8)) break;
      let direction = [...current.gradient];
      const alphas: number[] = [];
      for (let j = history.length - 1; j >= 0; j--) {
        const h = history[j], alpha = h.rho * dot(h.s, direction); alphas[j] = alpha;
        direction = direction.map((v, k) => v - alpha * h.y[k]);
      }
      const last = history.at(-1);
      direction = precondition(direction);
      const scaling = last ? clamp(dot(last.s, last.y) / dot(last.y, precondition(last.y)), 1e-8, 1e4) : referenceLength;
      direction = direction.map(v => v * scaling);
      for (let j = 0; j < history.length; j++) {
        const h = history[j], beta = h.rho * dot(h.y, direction);
        direction = direction.map((v, k) => v + h.s[k] * (alphas[j] - beta));
      }
      direction = direction.map(v => -v);
      if (dot(direction, current.gradient) >= 0) { history.length = 0; direction = precondition(current.gradient).map(v => -v * referenceLength); }
      const slope = dot(direction, current.gradient), depth = Math.max(o.maxStepThreadRadii, violation(current, "geometric"));
      let step = Math.min(1, o.maxStepThreadRadii / Math.max(1e-300, controlDisplacement(direction))), next: Evaluation | null = null, trial: number[] = [];
      for (let backtrack = 0; backtrack < 40; backtrack++, step *= .5) {
        trial = x.map((v, k) => v + step * direction[k]);
        const candidate = evaluate(trial, penalty);
        if (Number.isFinite(candidate.value) && candidate.value <= current.value + 1e-4 * step * slope
          && violation(candidate, "geometric") <= depth) { next = candidate; break; }
      }
      if (!next) break;
      const s = trial.map((v, k) => v - x[k]), y = next.gradient.map((v, k) => v - current.gradient[k]), sy = dot(s, y);
      if (sy > 1e-12 * Math.sqrt(dot(s, s) * dot(y, y))) {
        history.push({ s, y, rho: 1 / sy }); if (history.length > 10) history.shift();
      }
      x = trial; current = next;
    }
    for (let i = 0; i < probes.length; i++) probes[i].lambda = Math.max(0, probes[i].lambda - penalty * current.slacks[i]);
    let kkt = evaluate(x, 0), penetration = violation(kkt, "geometric") * unit;
    const bendExcess = violation(kkt, "curvature"), speedExcess = violation(kkt, "speed");
    // Violations are bounded by the feasibility tests; complementarity asks
    // that constraints with positive slack carry no force.
    const complementarity = (e: Evaluation, lambda: readonly number[]) => lambda.reduce((maximum, l, i) => Math.max(maximum, l * Math.max(0, e.slacks[i]) * unit), 0);
    let stationarity = gradNorm(kkt.gradient), complement = complementarity(kkt, probes.map(p => p.lambda));
    if (stationarity > o.stationarityTolerance || complement > o.complementarityToleranceMm) {
      const lambda = certifyMultipliers(x, kkt.slacks), check = evaluate(x, 0, lambda);
      const s2 = gradNorm(check.gradient), c2 = complementarity(check, lambda);
      if (Math.max(s2 / o.stationarityTolerance, c2 / o.complementarityToleranceMm)
        < Math.max(stationarity / o.stationarityTolerance, complement / o.complementarityToleranceMm)) {
        certified = lambda; kkt = check; stationarity = s2; complement = c2;
      } else certified = null;
    } else certified = null;
    result.metrics.samplePenetrationMm = penetration;
    result.metrics.kktStationarity = stationarity;
    result.metrics.complementarityMm = complement;
    result.metrics.lengthChangeMm = Math.abs(kkt.length * unit - previousLength); previousLength = kkt.length * unit;
    result.metrics.constraintSamples = keys.size;
    const probeFeasible = penetration <= o.feasibilityToleranceMm / 4 && bendExcess <= o.curvatureTolerance / 4
      && speedExcess <= o.curvatureTolerance / 4 && x[dimensions - 2] > 0 && x[dimensions - 1] > 0;
    if (probeFeasible && result.metrics.kktStationarity <= o.stationarityTolerance
      && result.metrics.complementarityMm <= o.complementarityToleranceMm) {
      const c = unpack(x), check = continuousCheck(c); result.metrics.continuousLowerGapMm = check.lowerMm; lastBend = check.bend;
      const bendCertified = check.bend.status === "certified" && check.bend.upper <= limit + o.curvatureTolerance && check.bend.minSpeedBound > 0;
      if (check.lowerMm >= -o.feasibilityToleranceMm && bendCertified) {
        const fineLength = lengthOf(c, integrateFine);
        result.metrics.lengthQuadratureDifferenceMm = Math.abs(fineLength - kkt.length) * unit;
        if (result.metrics.lengthQuadratureDifferenceMm <= o.lengthToleranceMm) { result.status = "converged"; break; }
      }
      let added = false; for (const u of check.witnesses) added = addParameter(clamp(u)) || added;
      if (added) { penalty = Math.min(penalty, 100); previousViolation = Infinity; continue; }
    }
    const worst = Math.max(penetration / (o.feasibilityToleranceMm / 4), bendExcess / (o.curvatureTolerance / 4),
      speedExcess / (o.curvatureTolerance / 4), result.metrics.complementarityMm / o.complementarityToleranceMm);
    if (worst > 1 && worst > previousViolation * .4) penalty = Math.min(penalty * 5, 1e7);
    previousViolation = worst;
  }
  if (result.status !== "converged") certified = null;
  const multipliers = certified ?? probes.map(p => p.lambda);
  const final = evaluate(x, 0, multipliers), c = unpack(x);
  result.controlPointsMm = c.map((p, i) => i === 0 || i === m - 1 ? [...input.controlPointsMm[i]] as PointMm : add(origin, mul(p, unit)));
  result.curves = splineToBezier(result.controlPointsMm);
  result.lengthMm = final.length * unit;
  result.metrics.constraintSamples = keys.size;
  const checked = continuousCheck(c); result.metrics.continuousLowerGapMm = checked.lowerMm;
  if (result.status !== "converged") lastBend = checked.bend;
  const bend = lastBend ?? checked.bend;
  result.metrics.curvatureTimesRadiusLower = bend.lower;
  result.metrics.curvatureTimesRadiusUpper = bend.status === "certified" ? bend.upper : Infinity;
  const fineLength = lengthOf(c, integrateFine);
  result.metrics.minRelativeSpeedBound = spans * bend.minSpeedBound / fineLength;
  result.metrics.parametrizationDefect = Math.max(0, energyOf(c) / fineLength ** 2 - 1);
  result.metrics.maxPenetrationMm = Math.max(0, -checked.lowerMm);
  result.metrics.samplePenetrationMm = violation(final, "geometric") * unit;
  result.metrics.sampleCurvatureTimesRadius = Math.max(0, ...final.curvatures);
  result.metrics.kktStationarity = gradNorm(final.gradient);
  result.metrics.complementarityMm = multipliers.reduce((maximum, l, i) => Math.max(maximum, l * Math.max(0, final.slacks[i]) * unit), 0);
  result.metrics.lengthQuadratureDifferenceMm = Math.abs(fineLength - final.length) * unit;
  result.reactions = probes.map((p, i) => ({ parameter: parameters[p.parameter].u, kind: p.kind,
    supportId: p.kind === "support" ? supports[p.obstacle].id : p.kind,
    multiplier: multipliers[i], gapMm: p.kind === "body" || p.kind === "support" ? final.slacks[i] * unit : null,
    slack: final.slacks[i] })).filter(p => p.multiplier > 1e-8);
  if (result.status !== "converged") return stop(sampleLimit ? "constraint-limit" : "iteration-limit",
    "The bounded solve did not satisfy all discrete KKT, quadrature, continuous-gap and certified-curvature tolerances.");
  return result;
}
