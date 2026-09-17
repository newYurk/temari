import { closestSegmentApproach, sampleCurve } from "./thread-geometry";
import { boundCurvatureTimesRadius } from "./curvature-bound";
import type { PointMm, ThreadCurve } from "./thread-path";

export type SpatialPointMm = PointMm;
export type SpatialCubicMm = readonly [SpatialPointMm, SpatialPointMm, SpatialPointMm, SpatialPointMm];
export type SpatialSupport = {
  id: string; kind: "arc"; centerMm: SpatialPointMm;
  fromMm: SpatialPointMm; toMm: SpatialPointMm; radiusMm: number;
} | {
  id: string; kind: "segment"; fromMm: SpatialPointMm; toMm: SpatialPointMm; radiusMm: number;
} | {
  /**
   * Centre line of earlier thread given by its own cubic Bezier pieces (they
   * need not be contiguous), inflated by radiusMm. The distance is exact, so a
   * smooth earlier thread stays smooth: no chord cover, no cover tolerance.
   */
  id: string; kind: "curve"; piecesMm: readonly SpatialCubicMm[]; radiusMm: number;
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
  /**
   * Test oracle only: dense basis sums and gradients, every support probe with
   * direct distances and recomputed slacks, dense Cholesky, and no reuse of the
   * last continuous check. The default path must match it bit for bit,
   * iteration counters aside. Code shared by both paths (slack/gradient
   * formulas, the null-step exit) is not independently checked by this oracle.
   */
  referenceEvaluation?: boolean;
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
  /** Inner loops ended without an accepted step: backtracking exhausted, or a step that rounds to no change. */
  lineSearchFailures: number;
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
const norm = (a: PointMm) => Math.hypot(a[0], a[1], a[2]);
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

/** Basis entries of controls lo..lo+values.length-1; the entries of all other controls are exactly +0. */
type BasisRange = { lo: number; values: number[]; derivatives: number[]; secondDerivatives: number[] };

/**
 * spatialSplineBasis restricted to the four controls whose basis can be nonzero
 * at u in [0,1], with the same Cox-de Boor arithmetic. The dense recursion
 * leaves every other entry at exactly +0 (outside the span its two terms are
 * +0 times factors of opposite sign), and zero terms do not change the sums
 * that consume a basis, which start at +0.
 */
function localSplineBasis(knots: readonly number[], controlCount: number, u: number): BasisRange {
  let span = u === 1 ? controlCount - 1 : -1;
  for (let i = 3; i < controlCount && span < 0; i++) if (u >= knots[i] && u < knots[i + 1]) span = i;
  if (span < 0) return { lo: 0, values: [], derivatives: [], secondDerivatives: [] };
  // layers[d][t] is N_{span-d+t,d}; other indices are the dense version's +0.
  const layers: number[][] = [[1]];
  const at = (degree: number, i: number) => i >= span - degree && i <= span ? layers[degree][i - span + degree] : 0;
  for (let degree = 1; degree <= 3; degree++) {
    const row: number[] = [];
    for (let i = span - degree; i <= span; i++) {
      const left = knots[i + degree] - knots[i], right = knots[i + degree + 1] - knots[i + 1];
      row.push((left ? (u - knots[i]) / left * at(degree - 1, i) : 0)
        + (right ? (knots[i + degree + 1] - u) / right * at(degree - 1, i + 1) : 0));
    }
    layers.push(row);
  }
  const quadratic = (i: number) => {
    const left = knots[i + 2] - knots[i], right = knots[i + 3] - knots[i + 1];
    return (left ? 2 * at(1, i) / left : 0) - (right ? 2 * at(1, i + 1) / right : 0);
  };
  const derivatives: number[] = [], secondDerivatives: number[] = [];
  for (let i = span - 3; i <= span; i++) {
    const left = knots[i + 3] - knots[i], right = knots[i + 4] - knots[i + 1];
    derivatives.push((left ? 3 * at(2, i) / left : 0) - (right ? 3 * at(2, i + 1) / right : 0));
    secondDerivatives.push((left ? 3 * quadratic(i) / left : 0) - (right ? 3 * quadratic(i + 1) / right : 0));
  }
  return { lo: span - 3, values: layers[3], derivatives, secondDerivatives };
}

/** Sum of basis[i] * controls[lo + i] in increasing i. */
function combine(controls: readonly PointMm[], basis: readonly number[], lo = 0): PointMm {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < basis.length; i++) {
    const b = basis[i], c = controls[lo + i];
    x += b * c[0]; y += b * c[1]; z += b * c[2];
  }
  return [x, y, z];
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

type ArcPoint = { theta: number; q: PointMm };
type ArcFrame = { radius: number; e1: PointMm; e2: PointMm; angle: number; ends: readonly [ArcPoint, ArcPoint] };
const arcPoint = (center: PointMm, e1: PointMm, e2: PointMm, radius: number, theta: number): ArcPoint =>
  ({ theta, q: add(center, mul(add(mul(e1, Math.cos(theta)), mul(e2, Math.sin(theta))), radius)) });
function arcFrame(support: Extract<SpatialSupport, { kind: "arc" }>): ArcFrame {
  const a = sub(support.fromMm, support.centerMm), b = sub(support.toMm, support.centerMm), radius = norm(a);
  const e1 = mul(a, 1 / radius), cosine = clamp(dot3(e1, b) / radius, -1, 1), angle = Math.acos(cosine);
  const e2 = mul(sub(mul(b, 1 / radius), mul(e1, cosine)), 1 / Math.sin(angle));
  return { radius, e1, e2, angle, ends: [arcPoint(support.centerMm, e1, e2, radius, 0), arcPoint(support.centerMm, e1, e2, radius, angle)] };
}

/** Per-support data computed once per solve: an arc frame or a curve tree. */
type Prepared = ArcFrame | CurveTree;
const unitOrZero = (delta: PointMm, distance: number): PointMm => distance ? mul(delta, 1 / distance) : [0, 0, 0];

type Cubic = SpatialCubicMm;
const cubicPoint = (c: Cubic, t: number): PointMm => {
  const s = 1 - t, a = s * s * s, b = 3 * s * s * t, d = 3 * s * t * t, e = t * t * t;
  return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0],
    a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1],
    a * c[0][2] + b * c[1][2] + d * c[2][2] + e * c[3][2]];
};
/** C(3,i) C(2,j) / C(5,i+j): Bernstein product of a cubic and a quadratic. */
const PRODUCT = [[1, .4, .1], [.6, .6, .3], [.3, .6, .6], [.1, .4, 1]];
const CUBIC_DEPTH = 40;
/** Work space of closestOnCubic (never re-entered): coefficient blocks and the interval stack. */
const cubicPool = new Float64Array(6 * (CUBIC_DEPTH + 2)), cubicStack = new Float64Array(2 * (CUBIC_DEPTH + 2));
/** Result of the last closestOnCubic call. */
let cubicT = 0, cubicDistance = 0;

/**
 * Nearest point of one cubic Bezier piece; sets cubicT and cubicDistance. The
 * candidates are both ends and every zero of g(t) = (B(t) - p) . B'(t), the
 * derivative of |B - p|^2 / 2 (degree 5). Zeros are isolated by de Casteljau
 * subdivision of g's Bernstein coefficients: no sign change (zero counts as
 * positive) means no zero, one change means exactly one, found by bracketed
 * bisection. Intervals are visited left to right, and the first nearest
 * candidate in increasing t wins.
 */
function closestOnCubic(point: PointMm, c: Cubic) {
  const px = point[0], py = point[1], pz = point[2];
  const x0 = c[0][0], y0 = c[0][1], z0 = c[0][2], x1 = c[1][0], y1 = c[1][1], z1 = c[1][2];
  const x2 = c[2][0], y2 = c[2][1], z2 = c[2][2], x3 = c[3][0], y3 = c[3][1], z3 = c[3][2];
  const ax = x0 - px, ay = y0 - py, az = z0 - pz, bx = x1 - px, by = y1 - py, bz = z1 - pz;
  const cx = x2 - px, cy = y2 - py, cz = z2 - pz, ex = x3 - px, ey = y3 - py, ez = z3 - pz;
  const ux = 3 * (x1 - x0), uy = 3 * (y1 - y0), uz = 3 * (z1 - z0), vx = 3 * (x2 - x1), vy = 3 * (y2 - y1), vz = 3 * (z2 - z1);
  const wx = 3 * (x3 - x2), wy = 3 * (y3 - y2), wz = 3 * (z3 - z2);
  // Coefficient k sums PRODUCT[i][j] (q_i . d_j) over i + j = k, in increasing i (as a dense double loop would).
  const p00 = ax * ux + ay * uy + az * uz, p01 = ax * vx + ay * vy + az * vz, p02 = ax * wx + ay * wy + az * wz;
  const p10 = bx * ux + by * uy + bz * uz, p11 = bx * vx + by * vy + bz * vz, p12 = bx * wx + by * wy + bz * wz;
  const p20 = cx * ux + cy * uy + cz * uz, p21 = cx * vx + cy * vy + cz * vz, p22 = cx * wx + cy * wy + cz * wz;
  const p30 = ex * ux + ey * uy + ez * uz, p31 = ex * vx + ey * vy + ez * vz, p32 = ex * wx + ey * wy + ez * wz;
  cubicPool[0] = 0 + PRODUCT[0][0] * p00;
  cubicPool[1] = 0 + PRODUCT[0][1] * p01 + PRODUCT[1][0] * p10;
  cubicPool[2] = 0 + PRODUCT[0][2] * p02 + PRODUCT[1][1] * p11 + PRODUCT[2][0] * p20;
  cubicPool[3] = 0 + PRODUCT[1][2] * p12 + PRODUCT[2][1] * p21 + PRODUCT[3][0] * p30;
  cubicPool[4] = 0 + PRODUCT[2][2] * p22 + PRODUCT[3][1] * p31;
  cubicPool[5] = 0 + PRODUCT[3][2] * p32;
  cubicT = 0; cubicDistance = Math.hypot(ax, ay, az);
  const distanceAt = (t: number) => {
    const s = 1 - t, a = s * s * s, b = 3 * s * s * t, d = 3 * s * t * t, e = t * t * t;
    return Math.hypot(a * x0 + b * x1 + d * x2 + e * x3 - px, a * y0 + b * y1 + d * y2 + e * y3 - py, a * z0 + b * z1 + d * z2 + e * z3 - pz);
  };
  const g = (t: number) => {
    const s = 1 - t, a = s * s * s, b = 3 * s * s * t, d = 3 * s * t * t, e = t * t * t, u = 3 * s * s, v = 6 * s * t, w = 3 * t * t;
    return (a * x0 + b * x1 + d * x2 + e * x3 - px) * (u * (x1 - x0) + v * (x2 - x1) + w * (x3 - x2))
      + (a * y0 + b * y1 + d * y2 + e * y3 - py) * (u * (y1 - y0) + v * (y2 - y1) + w * (y3 - y2))
      + (a * z0 + b * z1 + d * z2 + e * z3 - pz) * (u * (z1 - z0) + v * (z2 - z1) + w * (z3 - z2));
  };
  const consider = (t: number) => { const distance = distanceAt(t); if (distance < cubicDistance) { cubicT = t; cubicDistance = distance; } };
  // Stack entry n: interval cubicStack[2n..2n+1], coefficients cubicPool[6n..6n+5], depth = n's level.
  const depths: number[] = [0];
  cubicStack[0] = 0; cubicStack[1] = 1;
  while (depths.length) {
    const n = depths.length - 1, depth = depths.pop()!, base = 6 * n, a = cubicStack[2 * n], b = cubicStack[2 * n + 1];
    let changes = 0;
    for (let i = 1; i < 6; i++) if ((cubicPool[base + i - 1] < 0) !== (cubicPool[base + i] < 0)) changes++;
    if (!changes) continue;
    if (changes === 1) {
      let lo = a, hi = b;
      const negativeAtLo = cubicPool[base] < 0;
      for (let k = 0; k < 60 && hi - lo > 1e-15; k++) {
        const m = (lo + hi) / 2;
        if ((g(m) < 0) === negativeAtLo) lo = m; else hi = m;
      }
      consider((lo + hi) / 2);
      continue;
    }
    if (depth >= CUBIC_DEPTH) { consider((a + b) / 2); continue; }
    // Split in place: entry n becomes the right half, entry n+1 the left half (visited first).
    const left = base + 6;
    for (let level = 0; level < 6; level++) {
      cubicPool[left + level] = cubicPool[base];
      for (let i = 0; i < 5 - level; i++) cubicPool[base + i] = (cubicPool[base + i] + cubicPool[base + i + 1]) / 2;
    }
    // cubicPool[base..base+5] now holds the right half's coefficients.
    const m = (a + b) / 2;
    cubicStack[2 * n] = m; cubicStack[2 * n + 1] = b; depths.push(depth + 1);
    cubicStack[2 * n + 2] = a; cubicStack[2 * n + 3] = m; depths.push(depth + 1);
  }
  const end = Math.hypot(ex, ey, ez);
  if (end < cubicDistance) { cubicT = 1; cubicDistance = end; }
}

/** Bounding-box tree over the pieces of a curve support (control boxes contain the pieces). */
type CurveTree = { lo: PointMm; hi: PointMm; piece: number; left: CurveTree | null; right: CurveTree | null;
  /** Leaves: the chord and the largest distance of the inner controls from it (the piece lies within). */
  from?: PointMm; to?: PointMm; bulge?: number };
function curveTree(pieces: readonly Cubic[]): CurveTree {
  const box = (indices: number[]) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const i of indices) for (const p of pieces[i]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    return { lo: lo as unknown as PointMm, hi: hi as unknown as PointMm };
  };
  const build = (indices: number[]): CurveTree => {
    const { lo, hi } = box(indices);
    if (indices.length === 1) {
      const c = pieces[indices[0]], chord = (p: PointMm) => segmentDistance(p, c[0], c[3]);
      return { lo, hi, piece: indices[0], left: null, right: null, from: c[0], to: c[3], bulge: Math.max(chord(c[1]), chord(c[2])) };
    }
    const extent = [0, 1, 2].map(k => hi[k] - lo[k]), axis = extent.indexOf(Math.max(...extent));
    const centre = (i: number) => (pieces[i][0][axis] + pieces[i][3][axis]) / 2;
    const sorted = [...indices].sort((a, b) => centre(a) - centre(b) || a - b), half = sorted.length >> 1;
    return { lo, hi, piece: -1, left: build(sorted.slice(0, half)), right: build(sorted.slice(half)) };
  };
  return build(pieces.map((_, i) => i));
}
const segmentDistance = (p: PointMm, a: PointMm, b: PointMm) => {
  const v0 = b[0] - a[0], v1 = b[1] - a[1], v2 = b[2] - a[2], vv = v0 * v0 + v1 * v1 + v2 * v2;
  const t = vv ? clamp(((p[0] - a[0]) * v0 + (p[1] - a[1]) * v1 + (p[2] - a[2]) * v2) / vv) : 0;
  return Math.hypot(p[0] - (a[0] + v0 * t), p[1] - (a[1] + v1 * t), p[2] - (a[2] + v2 * t));
};
const boxDistance = (p: PointMm, lo: PointMm, hi: PointMm) =>
  Math.hypot(Math.max(0, lo[0] - p[0], p[0] - hi[0]), Math.max(0, lo[1] - p[1], p[1] - hi[1]), Math.max(0, lo[2] - p[2], p[2] - hi[2]));

const treeStack: CurveTree[] = [];
/**
 * Nearest point of a curve support: the least (distance, parameter) over its
 * pieces, parameter = (piece + t) / pieces (a piece end and the next piece's
 * start share a value). Without a tree every piece is visited (reference);
 * the tree only skips pieces whose box, or chord distance less the bulge of
 * the control polygon, is strictly farther than the best distance so far. The
 * piece lies within that distance of its chord (convex hull), so a skipped
 * piece is strictly farther, up to rounding in exact ties at a shared end
 * point, where both pieces give the same point and distance.
 */
function closestOnCurve(point: PointMm, support: Extract<SpatialSupport, { kind: "curve" }>, tree?: CurveTree) {
  const pieces = support.piecesMm, count = pieces.length;
  let distance = Infinity, parameter = Infinity, piece = 0, t = 0;
  const consider = (index: number) => {
    closestOnCubic(point, pieces[index]);
    const at = (index + cubicT) / count;
    if (cubicDistance < distance || (cubicDistance === distance && at < parameter)) { distance = cubicDistance; parameter = at; piece = index; t = cubicT; }
  };
  if (!tree) for (let i = 0; i < count; i++) consider(i);
  else {
    treeStack.length = 0; treeStack.push(tree);
    while (treeStack.length) {
      const node = treeStack.pop()!;
      if (boxDistance(point, node.lo, node.hi) > distance) continue;
      if (node.piece >= 0) {
        if (segmentDistance(point, node.from!, node.to!) - node.bulge! <= distance) consider(node.piece);
        continue;
      }
      const left = node.left!, right = node.right!;
      if (boxDistance(point, left.lo, left.hi) <= boxDistance(point, right.lo, right.hi)) treeStack.push(right, left);
      else treeStack.push(left, right);
    }
  }
  const c = pieces[piece];
  return { q: t === 0 ? c[0] : t === 1 ? c[3] : cubicPoint(c, t), distance, parameter };
}

/** Exact distance to the FINITE support centreline, including its end caps. */
export function closestSpatialSupport(point: PointMm, support: SpatialSupport): { pointMm: PointMm; distanceMm: number; normal: PointMm; parameter: number } {
  const { pointMm, distanceMm, delta, parameter } = closestOnSupport(point, support);
  return { pointMm, distanceMm, normal: unitOrZero(delta, distanceMm), parameter };
}

/**
 * closestSpatialSupport with delta = point - pointMm, optionally with the arc frame
 * computed in advance (same arithmetic). With a shared frame, pointMm may be the
 * frame's own end point.
 */
function closestOnSupport(point: PointMm, support: SpatialSupport, prepared?: Prepared): { pointMm: PointMm; distanceMm: number; delta: PointMm; parameter: number } {
  let q: PointMm, parameter: number, delta: PointMm, distanceMm: number;
  if (support.kind === "curve") {
    const best = closestOnCurve(point, support, prepared as CurveTree | undefined);
    q = best.q; parameter = best.parameter; delta = sub(point, q); distanceMm = norm(delta);
  } else if (support.kind === "segment") {
    const v = sub(support.toMm, support.fromMm), vv = dot3(v, v);
    parameter = vv ? clamp(dot3(sub(point, support.fromMm), v) / vv) : 0;
    q = add(support.fromMm, mul(v, parameter));
    delta = sub(point, q); distanceMm = norm(delta);
  } else {
    const { radius, e1, e2, angle, ends } = (prepared as ArcFrame | undefined) ?? arcFrame(support);
    const p = sub(point, support.centerMm), phi = Math.atan2(dot3(p, e2), dot3(p, e1));
    const candidates = phi >= 0 && phi <= angle ? [ends[1], arcPoint(support.centerMm, e1, e2, radius, phi)] : [ends[1]];
    // Start, end, interior: the first nearest candidate wins.
    let best = ends[0];
    delta = sub(point, best.q); distanceMm = norm(delta);
    for (const candidate of candidates) {
      const d = sub(point, candidate.q), n = norm(d);
      if (!(distanceMm <= n)) { best = candidate; delta = d; distanceMm = n; }
    }
    q = best.q; parameter = best.theta / angle;
  }
  return { pointMm: q, distanceMm, delta, parameter };
}

/** closestOnSupport(point, support, prepared).distanceMm with the same arithmetic, without allocating (except for curves). */
function supportDistance(point: PointMm, support: SpatialSupport, prepared?: Prepared): number {
  // Equal to norm(point - q) of closestOnSupport: the same sums, negated components.
  if (support.kind === "curve") return closestOnCurve(point, support, prepared as CurveTree | undefined).distance;
  if (support.kind === "segment") {
    const from = support.fromMm, to = support.toMm;
    const v0 = to[0] - from[0], v1 = to[1] - from[1], v2 = to[2] - from[2], vv = v0 * v0 + v1 * v1 + v2 * v2;
    const t = vv ? clamp(((point[0] - from[0]) * v0 + (point[1] - from[1]) * v1 + (point[2] - from[2]) * v2) / vv) : 0;
    return Math.hypot(point[0] - (from[0] + v0 * t), point[1] - (from[1] + v1 * t), point[2] - (from[2] + v2 * t));
  }
  const { radius, e1, e2, angle, ends } = (prepared as ArcFrame | undefined) ?? arcFrame(support), c = support.centerMm;
  const p0 = point[0] - c[0], p1 = point[1] - c[1], p2 = point[2] - c[2];
  const phi = Math.atan2(p0 * e2[0] + p1 * e2[1] + p2 * e2[2], p0 * e1[0] + p1 * e1[1] + p2 * e1[2]);
  const start = ends[0].q, end = ends[1].q;
  let distance = Math.hypot(point[0] - start[0], point[1] - start[1], point[2] - start[2]);
  const toEnd = Math.hypot(point[0] - end[0], point[1] - end[1], point[2] - end[2]);
  if (!(distance <= toEnd)) distance = toEnd;
  if (phi >= 0 && phi <= angle) {
    const cos = Math.cos(phi), sin = Math.sin(phi);
    const inside = Math.hypot(point[0] - (c[0] + (e1[0] * cos + e2[0] * sin) * radius),
      point[1] - (c[1] + (e1[1] * cos + e2[1] * sin) * radius), point[2] - (c[2] + (e1[2] * cos + e2[2] * sin) * radius));
    if (!(distance <= inside)) distance = inside;
  }
  return distance;
}

const GL = [
  [-.9602898564975363, .1012285362903763], [-.7966664774136267, .2223810344533745],
  [-.525532409916329, .3137066458778873], [-.1834346424956498, .362683783378362],
  [.1834346424956498, .362683783378362], [.525532409916329, .3137066458778873],
  [.7966664774136267, .2223810344533745], [.9602898564975363, .1012285362903763],
];
type QuadraturePoint = { weight: number; lo: number; derivative: number[] };
function quadrature(basis: (u: number) => BasisRange, spans: number, subdivisions: number): QuadraturePoint[] {
  const intervals = spans * subdivisions;
  return Array.from({ length: intervals }, (_, i) => GL.map(([x, w]) => {
    const { lo, derivatives } = basis((i + (x + 1) / 2) / intervals);
    return { weight: w / (2 * intervals), lo, derivative: derivatives };
  })).flat();
}

type Parameter = { u: number; lo: number; values: number[]; d1: number[]; d2: number[]; variables: number[]; end: -1 | 0 | 1 };
type Probe = { parameter: number; kind: SpatialConstraintKind; obstacle: number; lambda: number };
type Term = [weights: number[], vector: PointMm];
type State = { point: PointMm; v: PointMm; acc: PointMm; w: PointMm; speed: number; bend: number; curvature: number };
type Evaluation = {
  value: number; slacks: Float64Array; controls: PointMm[]; states: State[];
  /** Built on first use; a rejected line-search trial never needs it. */
  readonly gradient: number[];
  /** Largest -slack per constraint group, starting from 0. */
  violations: { geometric: number; curvature: number; speed: number };
};
/** Solve with M = energy Hessian + penalty * L_ref * sum g g^T; each g is given on its variables. */
type Factorization = (gradients: readonly { g: number[]; variables: readonly number[] }[], penalty: number) => ((v: number[]) => number[]) | null;
/** Support slacks of one parameter at ref: those not in near were >= farMin and unloaded. */
type FarRecord = { ref: PointMm; near: number[]; farMin: number; threshold: number };

export function solveSpatialContact(input: SpatialContactInput): SpatialContactResult {
  const { referenceEvaluation, ...numericOptions } = input.options ?? {};
  const o = { ...SPATIAL_CONTACT_DEFAULTS, ...numericOptions }, reference = referenceEvaluation === true;
  const result: SpatialContactResult = { status: "failed", controlPointsMm: input.controlPointsMm.map(p => [...p] as PointMm),
    curves: [], lengthMm: 0, reactions: [], diagnostics: [], metrics: { iterations: 0, outerIterations: 0, constraintSamples: 0, lineSearchFailures: 0,
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
    const geometry = s.kind === "curve"
      ? Array.isArray(s.piecesMm) && s.piecesMm.length > 0 && s.piecesMm.length <= 4096 && s.piecesMm.every(c => Array.isArray(c) && c.length === 4 && c.every(finite))
      : (s.kind === "arc" || s.kind === "segment") && finite(s.fromMm) && finite(s.toMm);
    if (typeof s.id !== "string" || !s.id || s.id === "body" || !geometry || !(s.radiusMm > 0) || !Number.isFinite(s.radiusMm))
      return stop("invalid-support", "Supports require finite named geometry (at most 4096 curve pieces) and positive radius.", true);
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
    : s.kind === "segment" ? { ...s, fromMm: scalePoint(s.fromMm), toMm: scalePoint(s.toMm), radiusMm: s.radiusMm / unit }
    : { ...s, piecesMm: s.piecesMm.map(c => c.map(scalePoint) as unknown as Cubic), radiusMm: s.radiusMm / unit });
  const startHandle = sub(controls[1], controls[0]), endHandle = sub(controls[m - 1], controls[m - 2]);
  const tangentStart = mul(startHandle, 1 / norm(startHandle)), tangentEnd = mul(endHandle, 1 / norm(endHandle));
  // Variables: interior controls, then the two positive handle lengths.
  let x = [...controls.slice(2, -2).flat(), norm(startHandle), norm(endHandle)];
  const dimensions = x.length;
  const unpack = (values: number[]) => controls.map((p, i): PointMm => i === 0 || i === m - 1 ? p
    : i === 1 ? add(controls[0], mul(tangentStart, values[dimensions - 2]))
    : i === m - 2 ? sub(controls[m - 1], mul(tangentEnd, values[dimensions - 1]))
    : [values[(i - 2) * 3], values[(i - 2) * 3 + 1], values[(i - 2) * 3 + 2]]);
  /** Variables moved by controls lo..lo+count-1, in increasing order (interior, start handle, end handle). */
  const variablesOf = (lo: number, count: number) => {
    const variables: number[] = [];
    for (let i = Math.max(lo, 2); i < Math.min(lo + count, m - 2); i++) variables.push(3 * i - 6, 3 * i - 5, 3 * i - 4);
    if (lo <= 1 && lo + count > 1) variables.push(dimensions - 2);
    if (lo <= m - 2 && lo + count > m - 2) variables.push(dimensions - 1);
    return variables;
  };
  /** Gradient on variablesOf(lo, force.length) of forces on controls lo..lo+force.length-1. */
  const pullbackRange = (force: PointMm[], lo: number) => {
    const gradient: number[] = [];
    for (let i = Math.max(lo, 2); i < Math.min(lo + force.length, m - 2); i++) gradient.push(...force[i - lo]);
    if (lo <= 1 && lo + force.length > 1) gradient.push(dot3(force[1 - lo], tangentStart));
    if (lo <= m - 2 && lo + force.length > m - 2) gradient.push(-dot3(force[m - 2 - lo], tangentEnd));
    return gradient;
  };
  const pullback = (force: PointMm[]) => pullbackRange(force, 0);
  const knots = spatialSplineKnots(m);
  const basisAt = (u: number): BasisRange => reference || !Number.isFinite(u) ? { lo: 0, ...spatialSplineBasis(m, u) } : localSplineBasis(knots, m, u);
  // Exact Gram matrix of basis derivatives: three Gauss points integrate quartics.
  const gram = Array.from({ length: m }, () => Array<number>(m).fill(0));
  for (let span = 0; span < spans; span++) for (const [node, weight] of [[-Math.sqrt(.6), 5 / 9], [0, 8 / 9], [Math.sqrt(.6), 5 / 9]]) {
    const { lo, derivatives: d } = basisAt((span + (node + 1) / 2) / spans);
    for (let a = 0; a < d.length; a++) if (d[a]) for (let b = 0; b < d.length; b++) gram[lo + a][lo + b] += weight / (2 * spans) * d[a] * d[b];
  }
  // Controls more than three apart share no span, so those Gram entries are exactly +0.
  const gramRows = gram.map((row, a) => reference ? { lo: 0, values: row } : { lo: Math.max(0, a - 3), values: row.slice(Math.max(0, a - 3), a + 4) });
  const integrate = quadrature(basisAt, spans, 2), integrateFine = quadrature(basisAt, spans, 4);
  // Variable v moves control owner[v] along axis[v]. The energy Hessian in these
  // variables is constant, so its Cholesky factor preconditions L-BFGS without
  // changing the problem, its KKT conditions or the acceptance checks.
  const owner: number[] = [], axis: PointMm[] = [];
  for (let i = 2; i < m - 2; i++) for (let k = 0; k < 3; k++) { owner.push(i); axis.push([k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0]); }
  owner.push(1, m - 2); axis.push(tangentStart, mul(tangentEnd, -1));
  const hessianEntry = (a: number, b: number) => gram[owner[a]][owner[b]] * dot3(axis[a], axis[b]);
  /** Reference: the dense Hessian, column Cholesky and full triangular solves. */
  const denseFactorization = (): Factorization => {
    const energyHessian = Array.from({ length: dimensions }, (_, a) => Array.from({ length: dimensions }, (_, b) => hessianEntry(a, b)));
    return (gradients, penalty) => {
      const f = energyHessian.map(row => [...row]);
      // In the reference every probe gradient is dense (its variables are all variables).
      for (const { g } of gradients) for (let a = 0; a < dimensions; a++) if (g[a]) for (let b = 0; b < dimensions; b++) f[a][b] += penalty * g[a] * g[b] * referenceLength;
      for (let j = 0; j < dimensions; j++) {
        for (let k = 0; k < j; k++) f[j][j] -= f[j][k] ** 2;
        if (!(f[j][j] > 0)) return null;
        f[j][j] = Math.sqrt(f[j][j]);
        for (let i = j + 1; i < dimensions; i++) {
          for (let k = 0; k < j; k++) f[i][j] -= f[i][k] * f[j][k];
          f[i][j] /= f[j][j];
        }
      }
      return v => {
        const z = [...v];
        for (let i = 0; i < dimensions; i++) { for (let k = 0; k < i; k++) z[i] -= f[i][k] * z[k]; z[i] /= f[i][i]; }
        for (let i = dimensions - 1; i >= 0; i--) { for (let k = i + 1; k < dimensions; k++) z[i] -= f[k][i] * z[k]; z[i] /= f[i][i]; }
        return z;
      };
    };
  };
  /**
   * Variables couple only when their controls are at most three apart, so row i
   * of the factor is structurally zero left of first[i] (no fill-in outside the
   * envelope). Rows are eliminated with the dense operation order; every skipped
   * product has an exactly zero factor, which can only flip the sign of a zero.
   * Row i holds columns first[i]..i at offsets[i] + column.
   */
  const envelopeFactorization = (): Factorization => {
    const first = owner.map(a => owner.findIndex(b => Math.abs(a - b) <= 3)), offsets: number[] = [];
    let size = 0;
    for (let i = 0; i < dimensions; i++) { offsets.push(size - first[i]); size += i - first[i] + 1; }
    const below: number[][] = Array.from({ length: dimensions }, () => []);
    for (let k = 0; k < dimensions; k++) for (let i = first[k]; i < k; i++) below[i].push(k);
    const energyHessian = new Float64Array(size);
    for (let i = 0; i < dimensions; i++) for (let j = first[i]; j <= i; j++) energyHessian[offsets[i] + j] = hessianEntry(i, j);
    return (gradients, penalty) => {
      const f = energyHessian.slice();
      for (const { g, variables } of gradients) for (let s = 0; s < variables.length; s++) {
        if (!g[s]) continue;
        const a = variables[s], scaled = penalty * g[s];
        for (let t = 0; t < variables.length; t++) {
          const b = variables[t];
          if (b <= a && b >= first[a]) f[offsets[a] + b] += scaled * g[t] * referenceLength;
        }
      }
      for (let i = 0; i < dimensions; i++) {
        const row = offsets[i];
        for (let j = first[i]; j < i; j++) {
          let value = f[row + j];
          for (let k = Math.max(first[i], first[j]); k < j; k++) value -= f[row + k] * f[offsets[j] + k];
          f[row + j] = value / f[offsets[j] + j];
        }
        let diagonal = f[row + i];
        for (let k = first[i]; k < i; k++) diagonal -= f[row + k] ** 2;
        if (!(diagonal > 0)) return null;
        f[row + i] = Math.sqrt(diagonal);
      }
      return v => {
        const z = [...v];
        for (let i = 0; i < dimensions; i++) {
          let value = z[i];
          for (let k = first[i]; k < i; k++) value -= f[offsets[i] + k] * z[k];
          z[i] = value / f[offsets[i] + i];
        }
        for (let i = dimensions - 1; i >= 0; i--) {
          let value = z[i];
          for (const k of below[i]) value -= f[offsets[k] + i] * z[k];
          z[i] = value / f[offsets[i] + i];
        }
        return z;
      };
    };
  };
  const factorize = reference ? denseFactorization() : envelopeFactorization();
  const maybeEnergySolve = factorize([], 0);
  if (!maybeEnergySolve) return stop("invalid-input", "The spline energy is not positive definite in the free variables.", true);
  const energySolve = maybeEnergySolve;
  /** Solve M z = g with the current preconditioner M (energy Hessian, optionally plus active penalty terms). */
  let precondition = energySolve;
  const lengthOf = (c: PointMm[], rule: QuadraturePoint[]) => rule.reduce((sum, q) => sum + q.weight * norm(combine(c, q.derivative, q.lo)), 0);
  const energyOf = (c: PointMm[]) => c.reduce((sum, p, a) => sum + dot3(p, combine(c, gramRows[a].values, gramRows[a].lo)), 0);
  const referenceLength = lengthOf(controls, integrateFine);
  result.metrics.referenceLengthMm = referenceLength * unit;
  if (!(referenceLength > 0)) return stop("invalid-input", "The seed spline has no length.", true);

  const supportCount = supports.length, block = supportCount + 3;
  const frames: (Prepared | undefined)[] = supports.map(s => reference ? undefined : s.kind === "arc" ? arcFrame(s) : s.kind === "curve" ? curveTree(s.piecesMm) : undefined);
  /**
   * Far-support skip (never in the reference). A record keeps the exact support
   * slacks of one parameter at ref: every support outside near had slack
   * >= farMin > gapWindow + skin and a zero multiplier. The computed distance is
   * 1-Lipschitz up to rounding and, for arcs, up to the frame's defect from an
   * orthonormal one (arcs with a defect above 1e-12 always stay near); a curve
   * distance is the least exact piece distance (bisected zeros); at the
   * coordinate scale used in threshold that error is far below
   * threshold - gapWindow. So while farMin - |q - ref| > threshold at the new
   * point q, every far slack exceeds gapWindow: the far probes are not evaluated
   * and slacks[] holds that positive lower bound instead. Results stay exact
   * because every consumer of a body/support slack either compares it with a
   * bound <= gapWindow (penetration, fixed-port check, certificate window) or
   * uses it only through its zero multiplier (penalty reaction
   * max(0, 0 - penalty * slack) = 0, preconditioner load test, multiplier
   * update, complementarity, reported reactions). Where multipliers change,
   * records whose far probes became loaded are dropped.
   */
  const records: (FarRecord | null)[] = [], gapWindow = o.feasibilityToleranceMm / unit, skin = 2;
  const skippable = frames.map(f => !reference && (!f || !("e1" in f)
    || Math.abs(norm(f.e1) - 1) + Math.abs(norm(f.e2) - 1) + 2 * Math.abs(dot3(f.e1, f.e2)) <= 1e-12));
  const supportScale = Math.max(0, ...supports.map(s => s.kind === "curve"
    ? 2 * Math.max(...s.piecesMm.flatMap(c => c.map(norm))) + 1 + s.radiusMm
    : norm(s.fromMm) + norm(s.toMm) + 1 + s.radiusMm + (s.kind === "arc" ? norm(s.centerMm) + norm(sub(s.fromMm, s.centerMm)) : 0)));
  /** Whether a support probe of the parameter outside near has a nonzero weight. */
  const farLoaded = (index: number, near: readonly number[], weight: (j: number) => number) => {
    for (let k = 0, n = 0; k < supportCount; k++) {
      if (near[n] === k) n++;
      else if (weight(index * block + 1 + k) !== 0) return true;
    }
    return false;
  };

  const parameters: Parameter[] = [], probes: Probe[] = [], keys = new Set<string>();
  let sampleLimit = false;
  const addParameter = (u: number) => {
    const key = u.toFixed(12); if (keys.has(key)) return false;
    if (keys.size >= o.maxConstraintSamples) { sampleLimit = true; return false; }
    keys.add(key);
    const b = basisAt(u), index = parameters.length;
    parameters.push({ u, lo: b.lo, values: b.values, d1: b.derivatives, d2: b.secondDerivatives,
      variables: variablesOf(b.lo, b.values.length), end: u === 0 ? -1 : u === 1 ? 1 : 0 });
    records.push(null);
    // Each parameter owns the probe block [body, supports..., curvature, speed] at index * block.
    probes.push({ parameter: index, kind: "body", obstacle: -1, lambda: 0 });
    supports.forEach((_, k) => probes.push({ parameter: index, kind: "support", obstacle: k, lambda: 0 }));
    probes.push({ parameter: index, kind: "curvature", obstacle: -1, lambda: 0 }, { parameter: index, kind: "speed", obstacle: -1, lambda: 0 });
    return true;
  };
  const intervals = spans * o.samplesPerSpan;
  for (let i = 0; i <= intervals; i++) addParameter(i / intervals);

  const statesOf = (c: PointMm[]): State[] => parameters.map(p => {
    const v = combine(c, p.d1, p.lo), acc = combine(c, p.d2, p.lo), w = cross3(v, acc), speed = norm(v), bend = norm(w);
    return { point: combine(c, p.values, p.lo), v, acc, w, speed, bend, curvature: speed > 1e-12 ? bend / speed ** 3 : Infinity };
  });
  // Signed at the ports, so a handle cannot flip the prescribed tangent.
  const speedDirection = (p: Parameter, s: State): PointMm =>
    p.end < 0 ? tangentStart : p.end > 0 ? tangentEnd : s.speed > 1e-12 ? mul(s.v, 1 / s.speed) : [0, 0, 0];
  function slackOf(probe: Probe, s: State): number {
    if (probe.kind === "support") {
      const support = supports[probe.obstacle];
      return (reference ? closestOnSupport(s.point, support).distanceMm : supportDistance(s.point, support, frames[probe.obstacle])) - 1 - support.radiusMm;
    }
    if (probe.kind === "body") {
      const p = s.point, center = body.centerMm;
      return Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) - 1 - body.radiusMm;
    }
    // Homogeneous form of kappa <= limit: (limit |v|^3 - |v x a|) / L_ref^3 >= 0.
    // It is polynomial, bounded near cusps and equivalent wherever |v| > 0.
    if (probe.kind === "curvature") return (limit * s.speed ** 3 - s.bend) / referenceLength ** 3;
    return dot3(s.v, speedDirection(parameters[probe.parameter], s)) / referenceLength - o.minRelativeSpeed;
  }
  /** Gradient terms of slackOf: grad = sum over terms of weights_i * vector at control lo + i. */
  function termsOf(probe: Probe, s: State): Term[] {
    const p = parameters[probe.parameter];
    if (probe.kind === "support") {
      const { distanceMm, delta } = closestOnSupport(s.point, supports[probe.obstacle], frames[probe.obstacle]);
      return [[p.values, unitOrZero(delta, distanceMm)]];
    }
    if (probe.kind === "body") { const delta = sub(s.point, body.centerMm); return [[p.values, unitOrZero(delta, norm(delta))]]; }
    if (probe.kind === "curvature") {
      const cube = referenceLength ** 3, unitBend = s.bend > 1e-14 ? 1 / s.bend : 0;
      return [[p.d1, mul(sub(mul(s.v, 3 * limit * s.speed), mul(cross3(s.acc, s.w), unitBend)), 1 / cube)],
        [p.d2, mul(cross3(s.w, s.v), -unitBend / cube)]];
    }
    return [[p.d1, mul(speedDirection(p, s), 1 / referenceLength)]];
  }
  const energyForce = (c: PointMm[]) => {
    let energy = 0;
    const force = c.map((point, a) => { const row = combine(c, gramRows[a].values, gramRows[a].lo); energy += dot3(point, row); return mul(row, 1 / referenceLength); });
    return { energy, force };
  };
  const accumulate = (force: PointMm[], terms: Term[], factor: number, lo: number) => {
    for (const [weights, vector] of terms) for (let i = 0; i < weights.length; i++)
      if (weights[i]) force[lo + i] = add(force[lo + i], mul(vector, factor * weights[i]));
  };

  /**
   * Slack buffer of an evaluation that is no longer referenced (a rejected trial or
   * a replaced inner-loop state); evaluate overwrites every entry.
   */
  let spareSlacks: Float64Array | null = null;
  function evaluate(values: number[], penalty: number, multipliers?: readonly number[]): Evaluation {
    const c = unpack(values), { energy, force } = energyForce(c), states = statesOf(c);
    const slacks = spareSlacks?.length === probes.length ? spareSlacks : new Float64Array(probes.length);
    spareSlacks = null;
    const violations = { geometric: 0, curvature: 0, speed: 0 }, loaded: number[] = [], reactions: number[] = [];
    let value = energy / (2 * referenceLength);
    // Probes are visited in index order, so the value sum and the recorded reactions keep that order.
    const visit = (j: number, state: State) => {
      const probe = probes[j], slack = slackOf(probe, state);
      slacks[j] = slack;
      const lambda = multipliers ? multipliers[j] : probe.lambda;
      const reaction = penalty ? Math.max(0, lambda - penalty * slack) : lambda;
      if (penalty) value += (reaction * reaction - lambda * lambda) / (2 * penalty);
      if (reaction) { loaded.push(j); reactions.push(reaction); }
      return slack;
    };
    states.forEach((state, index) => {
      const base = index * block, point = state.point, record = records[index];
      violations.geometric = Math.max(violations.geometric, -visit(base, state));
      const bound = record ? record.farMin - Math.hypot(point[0] - record.ref[0], point[1] - record.ref[1], point[2] - record.ref[2]) : NaN;
      if (record && bound > record.threshold && !(multipliers && farLoaded(index, record.near, j => multipliers[j]))) {
        slacks.fill(bound, base + 1, base + 1 + supportCount);
        for (const k of record.near) violations.geometric = Math.max(violations.geometric, -visit(base + 1 + k, state));
      } else if (supportCount) {
        const near: number[] = [];
        let farMin = Infinity;
        for (let k = 0; k < supportCount; k++) {
          const j = base + 1 + k, slack = visit(j, state);
          violations.geometric = Math.max(violations.geometric, -slack);
          if (skippable[k] && slack > gapWindow + skin && probes[j].lambda === 0 && !(multipliers && multipliers[j] !== 0)) farMin = Math.min(farMin, slack);
          else near.push(k);
        }
        records[index] = near.length < supportCount
          ? { ref: point, near, farMin, threshold: gapWindow + 1e-9 + 1e-10 * (norm(point) + supportScale + farMin) } : null;
      }
      violations.curvature = Math.max(violations.curvature, -visit(base + supportCount + 1, state));
      violations.speed = Math.max(violations.speed, -visit(base + supportCount + 2, state));
    });
    let gradient: number[] | undefined;
    return { value, slacks, controls: c, states, violations, get gradient() {
      if (!gradient) {
        loaded.forEach((j, t) => accumulate(force, termsOf(probes[j], states[probes[j].parameter]), -reactions[t], parameters[probes[j].parameter].lo));
        gradient = pullback(force);
      }
      return gradient;
    } };
  }
  /** Constraint gradient on the probe parameter's variables; all other entries are exactly zero. */
  function probeGradient(e: Evaluation, j: number) {
    const probe = probes[j], p = parameters[probe.parameter], force = p.values.map(() => [0, 0, 0] as PointMm);
    accumulate(force, termsOf(probe, e.states[probe.parameter]), 1, 0);
    return pullbackRange(force, p.lo);
  }
  /**
   * Gauss-Newton preconditioner of the AL subproblem: energy Hessian plus
   * penalty * grad g grad g^T for currently loaded probes. Only the search path
   * changes; stationarity and feasibility are still measured on the true problem.
   */
  function updatePreconditioner(e: Evaluation, penalty: number) {
    const gradients: { g: number[]; variables: number[] }[] = [];
    probes.forEach((probe, j) => {
      const slack = reference ? slackOf(probe, e.states[probe.parameter]) : e.slacks[j];
      if (probe.lambda - penalty * slack > 0) gradients.push({ g: probeGradient(e, j), variables: parameters[probe.parameter].variables });
    });
    precondition = factorize(gradients, penalty) ?? energySolve;
  }
  /**
   * First-order certificate with the best nonnegative multipliers on nearly
   * active probes (projected Gauss-Seidel NNLS, warm-started from the AL
   * estimate). Any lambda >= 0 bounds the optimal residual from above, so the
   * certificate stays valid when dense active curvature probes violate LICQ.
   * Columns are stored on their variables, in the dense summation order.
   */
  function certifyMultipliers(e: Evaluation): number[] {
    const b = pullback(energyForce(e.controls).force), lambda = probes.map(p => p.lambda);
    const columns: { j: number; variables: number[]; g: number[]; norm2: number }[] = [];
    probes.forEach((probe, j) => {
      const window = probe.kind === "body" || probe.kind === "support" ? o.feasibilityToleranceMm / unit : o.curvatureTolerance / 4;
      if (e.slacks[j] > window) { lambda[j] = 0; return; }
      const g = probeGradient(e, j), norm2 = dot(g, g);
      if (norm2 > 0) columns.push({ j, variables: parameters[probe.parameter].variables, g, norm2 }); else lambda[j] = 0;
    });
    const residual = [...b];
    for (const { j, variables, g } of columns) if (lambda[j]) for (let t = 0; t < g.length; t++) residual[variables[t]] -= lambda[j] * g[t];
    for (let sweep = 0; sweep < 400; sweep++) {
      let change = 0;
      for (const { j, variables, g, norm2 } of columns) {
        let projection = 0;
        for (let t = 0; t < g.length; t++) projection += g[t] * residual[variables[t]];
        const next = Math.max(0, lambda[j] + projection / norm2), delta = next - lambda[j];
        if (!delta) continue;
        for (let t = 0; t < g.length; t++) residual[variables[t]] -= delta * g[t];
        lambda[j] = next; change = Math.max(change, Math.abs(delta) * Math.sqrt(norm2));
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
  let penalty = 10, previousViolation = Infinity;
  let current = evaluate(x, penalty);
  let previousLength = lengthOf(current.controls, integrate) * unit;
  // Fixed ports/handles may make the boundary data infeasible. Do not move them.
  for (let i = 0; i < probes.length; i++) if ((probes[i].kind === "body" || probes[i].kind === "support")
    && parameters[probes[i].parameter].end !== 0 && current.slacks[i] * unit < -o.feasibilityToleranceMm / 4)
    return stop("invalid-port", "A fixed geometric port penetrates an obstacle.", true);

  const checkTolerance = o.feasibilityToleranceMm / 32 / unit;
  /**
   * Certified polylines of each support: one chain for a segment or an arc, one
   * chain per piece for a curve (pieces need not be contiguous), with a common
   * sampling error bound and, for curves, the box of each chain.
   */
  type Chain = { points: PointMm[]; lo: PointMm; hi: PointMm };
  const chainOf = (points: PointMm[]): Chain => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of points) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    return { points, lo: lo as unknown as PointMm, hi: hi as unknown as PointMm };
  };
  const targets = supports.map(s => {
    if (s.kind === "segment") return { chains: [chainOf([s.fromMm, s.toMm])], error: 0 };
    if (s.kind === "arc") {
      const sample = sampleCurve({ kind: "arc", from: sub(s.fromMm, s.centerMm), to: sub(s.toMm, s.centerMm) }, checkTolerance);
      return { chains: [chainOf(sample.points.map(p => add(p, s.centerMm)))], error: sample.errorBoundMm };
    }
    const samples = s.piecesMm.map(c => sampleCurve({ kind: "bezier", controls: c }, checkTolerance));
    return { chains: samples.map(x => chainOf(x.points)), error: Math.max(...samples.map(x => x.errorBoundMm)) };
  });
  function continuousCheck(c: PointMm[]) {
    let lower = Infinity;
    const witnesses: number[] = [];
    const curves = splineToBezier(c);
    curves.forEach((curve, span) => {
      const sample = sampleCurve(curve, checkTolerance), piece = chainOf(sample.points);
      // Chains of curve supports whose box cannot matter for this whole piece. The
      // per-segment test below would skip each of their segments (their box gaps are
      // no smaller and lower only decreases), so the result is unchanged.
      const skip = targets.map((target, k) => supports[k].kind !== "curve" ? null : target.chains.map(chain => {
        const bound = boxGap(piece.lo, piece.hi, chain.lo, chain.hi) - (sample.errorBoundMm + target.error + supports[k].radiusMm + 1);
        return bound > lower && bound * unit >= -o.feasibilityToleranceMm * .75;
      }));
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
          target.chains.forEach(({ points }, c) => {
            if (skip[k]?.[c]) return;
            for (let v = 1; v < points.length; v++) {
              // A pair whose box distance already exceeds the running minimum and
              // cannot be a violation witness does not change either result.
              const bound = boxGap(a, b, points[v - 1], points[v]) - offset;
              if (bound > lower && bound * unit >= -o.feasibilityToleranceMm * .75) continue;
              const closest = closestSegmentApproach(a, b, points[v - 1], points[v]);
              check(closest.distanceMm - offset, closest.s);
            }
          });
        });
      }
    });
    // Rigorous curvature interval over the whole spline, in scaled units.
    const bend = boundCurvatureTimesRadius(curves, 1, { precision: o.curvaturePrecision, witnessAbove: limit + o.curvatureTolerance / 2 });
    for (const witness of bend.witnesses) witnesses.push((witness.curve + witness.t) / curves.length);
    return { lowerMm: lower * unit, witnesses, bend };
  }
  let lastBend: ReturnType<typeof boundCurvatureTimesRadius> | undefined;
  /** The last continuous check and the variables (never mutated in place) it checked. */
  let lastCheck: { x: number[]; check: ReturnType<typeof continuousCheck> } | null = null;
  /** NNLS multipliers used by the last KKT check, when better than the AL estimate. */
  let certified: number[] | null = null;

  for (let outer = 0; outer < o.maxOuterIterations && result.metrics.iterations < o.maxIterations; outer++) {
    result.metrics.outerIterations = outer + 1;
    current = evaluate(x, penalty);
    updatePreconditioner(current, penalty);
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
      const slope = dot(direction, current.gradient), depth = Math.max(o.maxStepThreadRadii, current.violations.geometric);
      let step = Math.min(1, o.maxStepThreadRadii / Math.max(1e-300, controlDisplacement(direction))), next: Evaluation | null = null, trial: number[] = [];
      for (let backtrack = 0; backtrack < 40; backtrack++, step *= .5) {
        trial = x.map((v, k) => v + step * direction[k]);
        // A step that rounds away leaves every input bit unchanged, and so would every
        // shorter one. Accepting it would repeat this iteration bit for bit until the
        // inner cap, so ending here changes only the iteration counters (unless those
        // repeats would have used up maxIterations).
        if (trial.every((v, k) => Object.is(v, x[k]))) break;
        const candidate = evaluate(trial, penalty);
        if (Number.isFinite(candidate.value) && candidate.value <= current.value + 1e-4 * step * slope
          && candidate.violations.geometric <= depth) { next = candidate; break; }
        spareSlacks = candidate.slacks;
      }
      if (!next) { result.metrics.lineSearchFailures++; break; }
      const s = trial.map((v, k) => v - x[k]), y = next.gradient.map((v, k) => v - current.gradient[k]), sy = dot(s, y);
      if (sy > 1e-12 * Math.sqrt(dot(s, s) * dot(y, y))) {
        history.push({ s, y, rho: 1 / sy }); if (history.length > 10) history.shift();
      }
      spareSlacks = current.slacks; x = trial; current = next;
    }
    for (let i = 0; i < probes.length; i++) probes[i].lambda = Math.max(0, probes[i].lambda - penalty * current.slacks[i]);
    // Safety net, currently redundant: a far probe can only gain a multiplier from a negative
    // exact slack, and then the bound below the threshold already forces a full rescan.
    records.forEach((record, index) => { if (record && farLoaded(index, record.near, j => probes[j].lambda)) records[index] = null; });
    let kkt = evaluate(x, 0), penetration = kkt.violations.geometric * unit;
    const bendExcess = kkt.violations.curvature, speedExcess = kkt.violations.speed, length = lengthOf(kkt.controls, integrate);
    // Violations are bounded by the feasibility tests; complementarity asks
    // that constraints with positive slack carry no force.
    const complementarity = (e: Evaluation, lambda: readonly number[]) => lambda.reduce((maximum, l, i) => Math.max(maximum, l * Math.max(0, e.slacks[i]) * unit), 0);
    let stationarity = gradNorm(kkt.gradient), complement = complementarity(kkt, probes.map(p => p.lambda));
    if (stationarity > o.stationarityTolerance || complement > o.complementarityToleranceMm) {
      const lambda = certifyMultipliers(kkt), check = evaluate(x, 0, lambda);
      const s2 = gradNorm(check.gradient), c2 = complementarity(check, lambda);
      if (Math.max(s2 / o.stationarityTolerance, c2 / o.complementarityToleranceMm)
        < Math.max(stationarity / o.stationarityTolerance, complement / o.complementarityToleranceMm)) {
        certified = lambda; kkt = check; stationarity = s2; complement = c2;
      } else certified = null;
    } else certified = null;
    result.metrics.samplePenetrationMm = penetration;
    result.metrics.kktStationarity = stationarity;
    result.metrics.complementarityMm = complement;
    result.metrics.lengthChangeMm = Math.abs(length * unit - previousLength); previousLength = length * unit;
    result.metrics.constraintSamples = keys.size;
    const probeFeasible = penetration <= o.feasibilityToleranceMm / 4 && bendExcess <= o.curvatureTolerance / 4
      && speedExcess <= o.curvatureTolerance / 4 && x[dimensions - 2] > 0 && x[dimensions - 1] > 0;
    if (probeFeasible && result.metrics.kktStationarity <= o.stationarityTolerance
      && result.metrics.complementarityMm <= o.complementarityToleranceMm) {
      const c = kkt.controls, check = continuousCheck(c); result.metrics.continuousLowerGapMm = check.lowerMm; lastBend = check.bend;
      lastCheck = { x, check };
      const bendCertified = check.bend.status === "certified" && check.bend.upper <= limit + o.curvatureTolerance && check.bend.minSpeedBound > 0;
      if (check.lowerMm >= -o.feasibilityToleranceMm && bendCertified) {
        const fineLength = lengthOf(c, integrateFine);
        result.metrics.lengthQuadratureDifferenceMm = Math.abs(fineLength - length) * unit;
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
  const final = evaluate(x, 0, multipliers), c = final.controls, length = lengthOf(c, integrate);
  result.controlPointsMm = c.map((p, i) => i === 0 || i === m - 1 ? [...input.controlPointsMm[i]] as PointMm : add(origin, mul(p, unit)));
  result.curves = splineToBezier(result.controlPointsMm);
  result.lengthMm = length * unit;
  result.metrics.constraintSamples = keys.size;
  // continuousCheck is a pure function of x, and a converged solve stops right after checking x.
  const checked = !reference && lastCheck && lastCheck.x === x ? lastCheck.check : continuousCheck(c);
  result.metrics.continuousLowerGapMm = checked.lowerMm;
  if (result.status !== "converged") lastBend = checked.bend;
  const bend = lastBend ?? checked.bend;
  result.metrics.curvatureTimesRadiusLower = bend.lower;
  result.metrics.curvatureTimesRadiusUpper = bend.status === "certified" ? bend.upper : Infinity;
  const fineLength = lengthOf(c, integrateFine);
  result.metrics.minRelativeSpeedBound = spans * bend.minSpeedBound / fineLength;
  result.metrics.parametrizationDefect = Math.max(0, energyOf(c) / fineLength ** 2 - 1);
  result.metrics.maxPenetrationMm = Math.max(0, -checked.lowerMm);
  result.metrics.samplePenetrationMm = final.violations.geometric * unit;
  result.metrics.sampleCurvatureTimesRadius = Math.max(0, ...final.states.map(s => s.curvature));
  result.metrics.kktStationarity = gradNorm(final.gradient);
  result.metrics.complementarityMm = multipliers.reduce((maximum, l, i) => Math.max(maximum, l * Math.max(0, final.slacks[i]) * unit), 0);
  result.metrics.lengthQuadratureDifferenceMm = Math.abs(fineLength - length) * unit;
  result.reactions = probes.map((p, i) => ({ parameter: parameters[p.parameter].u, kind: p.kind,
    supportId: p.kind === "support" ? supports[p.obstacle].id : p.kind,
    multiplier: multipliers[i], gapMm: p.kind === "body" || p.kind === "support" ? final.slacks[i] * unit : null,
    slack: final.slacks[i] })).filter(p => p.multiplier > 1e-8);
  if (result.status !== "converged") return stop(sampleLimit ? "constraint-limit" : "iteration-limit",
    "The bounded solve did not satisfy all discrete KKT, quadrature, continuous-gap and certified-curvature tolerances.");
  return result;
}
