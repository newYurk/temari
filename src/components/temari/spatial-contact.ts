import { closestSegmentApproach, sampleCurve } from "./thread-geometry";
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
};
export type SpatialContactInput = {
  /** Open uniform cubic B-spline. First two and last two controls stay fixed. */
  controlPointsMm: readonly SpatialPointMm[];
  body: { centerMm: SpatialPointMm; radiusMm: number };
  supports: readonly SpatialSupport[];
  threadRadiusMm: number;
  options?: SpatialContactOptions;
};
export type SpatialContactMetrics = {
  iterations: number; outerIterations: number; constraintSamples: number;
  /** Conservative upper bound, including between-probe curve intervals. */
  maxPenetrationMm: number;
  samplePenetrationMm: number; continuousLowerGapMm: number;
  kktStationarity: number; complementarityMm: number;
  lengthQuadratureDifferenceMm: number; lengthChangeMm: number;
};
export type SpatialContactResult = {
  status: "converged" | "failed" | "unresolved";
  controlPointsMm: SpatialPointMm[];
  curves: ThreadCurve[];
  lengthMm: number;
  /** Positive reactions are dimensionless multiples of the uniform tension. */
  reactions: { parameter: number; supportId: string; multiplier: number; gapMm: number }[];
  metrics: SpatialContactMetrics;
  diagnostics: { code: string; message: string }[];
};

/**
 * Local finite-dimensional reference, not a general yarn equilibrium solver.
 * It minimises central-line length (zero bending stiffness) with hard geometric
 * ports/handles. The AL iterations are not a physical tightening trajectory.
 * A converged result certifies this spline's discrete first-order residual and
 * bounded continuous obstacle gaps to stated tolerances, not global optimality,
 * material calibration, self-clearance, curvature, or prescribed over/under.
 * Callers MUST verify those latter constraints before accepting a stitch.
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
});

const add = (a: PointMm, b: PointMm): PointMm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: PointMm, s: number): PointMm => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: PointMm) => Math.hypot(...a);
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const finite = (a: PointMm) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);

export function spatialSplineKnots(controlCount: number): number[] {
  if (!Number.isInteger(controlCount) || controlCount < 4) throw new RangeError("A cubic spline requires at least four controls.");
  const spans = controlCount - 3;
  return [0, 0, 0, 0, ...Array.from({ length: spans - 1 }, (_, i) => (i + 1) / spans), 1, 1, 1, 1];
}

/** Basis and its first derivative with respect to u in [0,1]. */
export function spatialSplineBasis(controlCount: number, u: number): { values: number[]; derivatives: number[] } {
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
  return { values: layers[3], derivatives: Array.from({ length: controlCount }, (_, i) => {
    const left = knots[i + 3] - knots[i], right = knots[i + 4] - knots[i + 1];
    return (left ? 3 * layers[2][i] / left : 0) - (right ? 3 * layers[2][i + 1] / right : 0);
  }) };
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

type Probe = { u: number; basis: number[]; obstacle: number; lambda: number };
type Evaluation = { value: number; gradient: number[]; length: number; gaps: number[]; gapNormals: PointMm[] };

export function solveSpatialContact(input: SpatialContactInput): SpatialContactResult {
  const o = { ...SPATIAL_CONTACT_DEFAULTS, ...input.options };
  const result: SpatialContactResult = { status: "failed", controlPointsMm: input.controlPointsMm.map(p => [...p] as PointMm),
    curves: [], lengthMm: 0, reactions: [], diagnostics: [], metrics: { iterations: 0, outerIterations: 0, constraintSamples: 0,
      maxPenetrationMm: Infinity, samplePenetrationMm: Infinity, continuousLowerGapMm: -Infinity, kktStationarity: Infinity, complementarityMm: Infinity,
      lengthQuadratureDifferenceMm: Infinity, lengthChangeMm: Infinity } };
  const stop = (code: string, message: string, failed = false) => {
    result.status = failed ? "failed" : "unresolved"; result.diagnostics.push({ code, message }); return result;
  };
  if (input.controlPointsMm.length < 6 || input.controlPointsMm.length > 48 || !input.controlPointsMm.every(finite)
    || !finite(input.body.centerMm) || !(input.body.radiusMm > 0) || !Number.isFinite(input.body.radiusMm)
    || !(input.threadRadiusMm > 0) || !Number.isFinite(input.threadRadiusMm)
    || Object.values(o).some(x => !Number.isFinite(x) || x <= 0)
    || ![o.maxIterations, o.maxOuterIterations, o.maxConstraintSamples, o.samplesPerSpan].every(Number.isInteger)
    || o.samplesPerSpan > 32 || o.maxIterations > 20000 || o.maxOuterIterations > 100 || o.maxConstraintSamples > 10000
    || input.supports.length > 64 || new Set(input.supports.map(s => s.id)).size !== input.supports.length) {
    return stop("invalid-input", "Invalid spline, dimensions, numerical tolerances or bounded solver limits.", true);
  }
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
  const controls = input.controlPointsMm.map(scalePoint), m = controls.length, dimensions = 3 * (m - 4);
  const body = { centerMm: scalePoint(input.body.centerMm), radiusMm: input.body.radiusMm / unit };
  const supports: SpatialSupport[] = input.supports.map(s => s.kind === "arc"
    ? { ...s, centerMm: scalePoint(s.centerMm), fromMm: scalePoint(s.fromMm), toMm: scalePoint(s.toMm), radiusMm: s.radiusMm / unit }
    : { ...s, fromMm: scalePoint(s.fromMm), toMm: scalePoint(s.toMm), radiusMm: s.radiusMm / unit });
  let x = controls.slice(2, -2).flat();
  const unpack = (values: number[]) => controls.map((p, i): PointMm => i < 2 || i >= m - 2 ? p
    : [values[(i - 2) * 3], values[(i - 2) * 3 + 1], values[(i - 2) * 3 + 2]]);
  const integrate = quadrature(m, 2), integrateFine = quadrature(m, 4);
  const probes: Probe[] = [], parameters = new Set<string>();
  let sampleLimit = false;
  const addParameter = (u: number) => {
    const key = u.toFixed(12); if (parameters.has(key)) return false;
    if (parameters.size >= o.maxConstraintSamples) { sampleLimit = true; return false; }
    parameters.add(key); const basis = spatialSplineBasis(m, u).values;
    for (let obstacle = -1; obstacle < supports.length; obstacle++) probes.push({ u, basis, obstacle, lambda: 0 });
    return true;
  };
  const intervals = (m - 3) * o.samplesPerSpan;
  for (let i = 0; i <= intervals; i++) addParameter(i / intervals);

  function evaluate(values: number[], penalty: number): Evaluation {
    const c = unpack(values), gradient = Array<number>(dimensions).fill(0);
    let length = 0;
    for (const q of integrate) {
      const velocity = combine(c, q.derivative), speed = norm(velocity);
      length += q.weight * speed;
      if (speed > 1e-14) for (let i = 2; i < m - 2; i++) for (let k = 0; k < 3; k++)
        gradient[3 * (i - 2) + k] += q.weight * q.derivative[i] * velocity[k] / speed;
    }
    let value = length;
    const gaps: number[] = [], gapNormals: PointMm[] = [];
    for (const p of probes) {
      const point = combine(c, p.basis);
      const closest = p.obstacle < 0 ? null : closestSpatialSupport(point, supports[p.obstacle]);
      const delta = sub(point, body.centerMm), distance = closest?.distanceMm ?? norm(delta);
      const normal = closest?.normal ?? (distance ? mul(delta, 1 / distance) : [0, 0, 0] as PointMm);
      const gap = distance - 1 - (p.obstacle < 0 ? body.radiusMm : supports[p.obstacle].radiusMm);
      gaps.push(gap); gapNormals.push(normal);
      const reaction = penalty ? Math.max(0, p.lambda - penalty * gap) : p.lambda;
      if (penalty) value += (reaction * reaction - p.lambda * p.lambda) / (2 * penalty);
      if (reaction) for (let i = 2; i < m - 2; i++) for (let k = 0; k < 3; k++)
        gradient[3 * (i - 2) + k] -= reaction * p.basis[i] * normal[k];
    }
    return { value, gradient, length, gaps, gapNormals };
  }
  const gradNorm = (gradient: number[]) => Math.max(0, ...Array.from({ length: m - 4 }, (_, i) =>
    Math.hypot(gradient[3 * i], gradient[3 * i + 1], gradient[3 * i + 2])));
  let penalty = 10, previousViolation = Infinity;
  let current = evaluate(x, penalty);
  let previousLength = current.length * unit;
  // Fixed ports/handles may make the boundary data infeasible. Do not move them.
  for (let i = 0; i < probes.length; i++) if ((probes[i].u === 0 || probes[i].u === 1)
    && current.gaps[i] * unit < -o.feasibilityToleranceMm / 4)
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
          for (let v = 1; v < target.points.length; v++) {
            const closest = closestSegmentApproach(a, b, target.points[v - 1], target.points[v]);
            check(closest.distanceMm - sample.errorBoundMm - target.error - supports[k].radiusMm - 1, closest.s);
          }
        });
      }
    });
    return { lowerMm: lower * unit, witnesses };
  }

  for (let outer = 0; outer < o.maxOuterIterations && result.metrics.iterations < o.maxIterations; outer++) {
    result.metrics.outerIterations = outer + 1;
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
      const scaling = last ? clamp(dot(last.s, last.y) / dot(last.y, last.y), 1e-8, 1e4) : 1;
      direction = direction.map(v => v * scaling);
      for (let j = 0; j < history.length; j++) {
        const h = history[j], beta = h.rho * dot(h.y, direction);
        direction = direction.map((v, k) => v + h.s[k] * (alphas[j] - beta));
      }
      direction = direction.map(v => -v);
      if (dot(direction, current.gradient) >= 0) { history.length = 0; direction = current.gradient.map(v => -v); }
      const slope = dot(direction, current.gradient);
      let step = Math.min(1, 10 / Math.max(1, gradNorm(direction))), next: Evaluation | null = null, trial: number[] = [];
      for (let backtrack = 0; backtrack < 28; backtrack++, step *= .5) {
        trial = x.map((v, k) => v + step * direction[k]);
        const candidate = evaluate(trial, penalty);
        if (Number.isFinite(candidate.value) && candidate.value <= current.value + 1e-4 * step * slope) { next = candidate; break; }
      }
      if (!next) break;
      const s = trial.map((v, k) => v - x[k]), y = next.gradient.map((v, k) => v - current.gradient[k]), sy = dot(s, y);
      if (sy > 1e-12 * Math.sqrt(dot(s, s) * dot(y, y))) {
        history.push({ s, y, rho: 1 / sy }); if (history.length > 10) history.shift();
      }
      x = trial; current = next;
    }
    for (let i = 0; i < probes.length; i++) probes[i].lambda = Math.max(0, probes[i].lambda - penalty * current.gaps[i]);
    const kkt = evaluate(x, 0), penetration = kkt.gaps.reduce((maximum, gap) => Math.max(maximum, -gap), 0) * unit;
    result.metrics.samplePenetrationMm = penetration;
    result.metrics.kktStationarity = gradNorm(kkt.gradient);
    result.metrics.complementarityMm = probes.reduce((maximum, p, i) => Math.max(maximum, Math.abs(p.lambda * kkt.gaps[i]) * unit), 0);
    result.metrics.lengthChangeMm = Math.abs(kkt.length * unit - previousLength); previousLength = kkt.length * unit;
    result.metrics.constraintSamples = parameters.size;
    if (penetration <= o.feasibilityToleranceMm / 4 && result.metrics.kktStationarity <= o.stationarityTolerance
      && result.metrics.complementarityMm <= o.complementarityToleranceMm) {
      const c = unpack(x), check = continuousCheck(c); result.metrics.continuousLowerGapMm = check.lowerMm;
      if (check.lowerMm >= -o.feasibilityToleranceMm) {
        const fineLength = integrateFine.reduce((sum, q) => sum + q.weight * norm(combine(c, q.derivative)), 0);
        result.metrics.lengthQuadratureDifferenceMm = Math.abs(fineLength - kkt.length) * unit;
        if (result.metrics.lengthQuadratureDifferenceMm <= o.lengthToleranceMm) { result.status = "converged"; break; }
      }
      let added = false; for (const u of check.witnesses) added = addParameter(u) || added;
      if (added) { penalty = Math.min(penalty, 100); previousViolation = Infinity; continue; }
    }
    const violation = Math.max(penetration / (o.feasibilityToleranceMm / 4),
      result.metrics.complementarityMm / o.complementarityToleranceMm);
    if (violation > 1 && violation > previousViolation * .4) penalty = Math.min(penalty * 5, 1e7);
    previousViolation = violation;
  }
  const final = evaluate(x, 0), c = unpack(x);
  result.controlPointsMm = c.map((p, i) => i < 2 || i >= m - 2
    ? [...input.controlPointsMm[i]] as PointMm : add(origin, mul(p, unit)));
  result.curves = splineToBezier(result.controlPointsMm);
  result.lengthMm = final.length * unit;
  result.metrics.constraintSamples = parameters.size;
  const checked = continuousCheck(c); result.metrics.continuousLowerGapMm = checked.lowerMm;
  result.metrics.maxPenetrationMm = Math.max(0, -checked.lowerMm);
  result.metrics.samplePenetrationMm = final.gaps.reduce((maximum, gap) => Math.max(maximum, -gap), 0) * unit;
  result.metrics.kktStationarity = gradNorm(final.gradient);
  result.metrics.complementarityMm = probes.reduce((maximum, p, i) => Math.max(maximum, Math.abs(p.lambda * final.gaps[i]) * unit), 0);
  result.metrics.lengthQuadratureDifferenceMm = Math.abs(integrateFine.reduce((sum, q) =>
    sum + q.weight * norm(combine(c, q.derivative)), 0) - final.length) * unit;
  result.reactions = probes.map((p, i) => ({ parameter: p.u, supportId: p.obstacle < 0 ? "body" : supports[p.obstacle].id,
    multiplier: p.lambda, gapMm: final.gaps[i] * unit })).filter(p => p.multiplier > 1e-8);
  if (result.status !== "converged") return stop(sampleLimit ? "constraint-limit" : "iteration-limit",
    "The bounded solve did not satisfy all discrete KKT, quadrature and continuous-gap tolerances.");
  return result;
}
