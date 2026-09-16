import type { C8ThreadCoupon, PathDiagnostic, PathValidation, PointMm, ThreadCurve, ThreadSpan } from "./thread-path";

const add = (a: PointMm, b: PointMm): PointMm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: PointMm, n: number): PointMm => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: PointMm) => Math.hypot(...a);
const cross = (a: PointMm, b: PointMm): PointMm => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix = (a: PointMm, b: PointMm, t: number) => add(mul(a, 1 - t), mul(b, t));
const origin: PointMm = [0, 0, 0];
const clamp = (x: number) => Math.max(0, Math.min(1, x));

function arcData(curve: Extract<ThreadCurve, { kind: "arc" }>) {
  const r = norm(curve.from), r1 = norm(curve.to);
  if (!(r > 0) || Math.abs(r - r1) > Math.max(r, r1) * 1e-10) throw new RangeError("arc endpoints require the same positive radius");
  const u = mul(curve.from, 1 / r), w = mul(curve.to, 1 / r1);
  const cosine = Math.max(-1, Math.min(1, dot(u, w)));
  const tangent = sub(w, mul(u, cosine));
  const sine = norm(tangent);
  if (sine < 1e-12) throw new RangeError("coincident or antipodal arc endpoints need an explicit route");
  return { r, u, v: mul(tangent, 1 / sine), angle: Math.atan2(sine, cosine) };
}

function checkCurve(curve: ThreadCurve) {
  const points = curve.kind === "arc" ? [curve.from, curve.to] : curve.controls;
  if (!points.every((p) => p.length === 3 && p.every(Number.isFinite))) throw new RangeError("curve coordinates must be finite millimetres");
  if (curve.kind === "arc") arcData(curve);
}

export function evaluateCurve(curve: ThreadCurve, t: number): PointMm {
  if (curve.kind === "arc") {
    if (t === 0) return curve.from;
    if (t === 1) return curve.to;
    const { r, u, v, angle } = arcData(curve);
    return mul(add(mul(u, Math.cos(angle * t)), mul(v, Math.sin(angle * t))), r);
  }
  const [a, b, c, d] = curve.controls;
  return mix(mix(mix(a, b, t), mix(b, c, t), t), mix(mix(b, c, t), mix(c, d, t), t), t);
}

export function curveDerivative(curve: ThreadCurve, t: number): PointMm {
  if (curve.kind === "arc") {
    const { r, u, v, angle } = arcData(curve);
    return mul(add(mul(u, -Math.sin(angle * t)), mul(v, Math.cos(angle * t))), r * angle);
  }
  const [a, b, c, d] = curve.controls;
  return mul(add(add(mul(sub(b, a), (1 - t) ** 2), mul(sub(c, b), 2 * t * (1 - t))), mul(sub(d, c), t * t)), 3);
}

export function curveSecondDerivative(curve: ThreadCurve, t: number): PointMm {
  if (curve.kind === "arc") {
    const { angle } = arcData(curve);
    return mul(evaluateCurve(curve, t), -angle * angle);
  }
  const [a, b, c, d] = curve.controls;
  return mul(mix(add(sub(c, mul(b, 2)), a), add(sub(d, mul(c, 2)), b), t), 6);
}

/** Exact minimization for two straight segments, including degenerate/parallel ones. */
export function closestSegmentApproach(a: PointMm, b: PointMm, c: PointMm, d: PointMm) {
  return closestInPolygon(a, b, c, d, [[0, 0], [1, 0], [1, 1], [0, 1]])!;
}

type Pair = [number, number];
function closestInPolygon(a: PointMm, b: PointMm, c: PointMm, d: PointMm, polygon: Pair[]) {
  if (polygon.length === 0) return null;
  const u = sub(b, a), v = sub(d, c), w = sub(a, c);
  let best = { distanceMm: Infinity, s: 0, t: 0, a, b: c };
  const take = (s: number, t: number) => {
    const p = mix(a, b, s), q = mix(c, d, t), distanceMm = norm(sub(p, q));
    if (distanceMm < best.distanceMm) best = { distanceMm, s, t, a: p, b: q };
  };
  // Convex quadratic: minima are stationary in the interior or on an edge.
  const normal = cross(u, v), determinant = dot(normal, normal);
  if (determinant > 0) {
    const s = dot(cross(v, w), normal) / determinant;
    const t = dot(cross(u, w), normal) / determinant;
    let inside = true;
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!;
      if ((q[0] - p[0]) * (t - p[1]) - (q[1] - p[1]) * (s - p[0]) < -1e-12) inside = false;
    }
    if (inside) take(s, t);
  }
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!;
    const base = add(w, sub(mul(u, p[0]), mul(v, p[1])));
    const direction = sub(mul(u, q[0] - p[0]), mul(v, q[1] - p[1]));
    const length2 = dot(direction, direction);
    const k = length2 === 0 ? 0 : clamp(-dot(base, direction) / length2);
    take(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k);
  }
  return best;
}

function pointSegmentDistance(p: PointMm, a: PointMm, b: PointMm) {
  const ab = sub(b, a), length2 = dot(ab, ab);
  return norm(sub(p, mix(a, b, length2 === 0 ? 0 : clamp(dot(sub(p, a), ab) / length2))));
}

function splitBezier(controls: Extract<ThreadCurve, { kind: "bezier" }>["controls"]) {
  const [a, b, c, d] = controls;
  const e = mix(a, b, .5), f = mix(b, c, .5), g = mix(c, d, .5);
  const h = mix(e, f, .5), i = mix(f, g, .5), j = mix(h, i, .5);
  return [[a, e, h, j], [j, i, g, d]] as const;
}

export function sampleCurve(curve: ThreadCurve, toleranceMm: number): { points: PointMm[]; parameters: number[]; errorBoundMm: number } {
  if (!Number.isFinite(toleranceMm) || toleranceMm <= 0) throw new RangeError("sampling tolerance must be positive");
  checkCurve(curve);
  if (curve.kind === "arc") {
    const { r, angle } = arcData(curve);
    const maxAngle = 2 * Math.acos(Math.max(-1, 1 - Math.min(toleranceMm / r, 2)));
    const count = Math.max(1, Math.ceil(angle / Math.max(maxAngle, 1e-12)));
    if (count > 100000) throw new RangeError("arc sampling budget exceeded");
    const parameters = Array.from({ length: count + 1 }, (_, i) => i / count);
    return { parameters, points: parameters.map((t) => evaluateCurve(curve, t)), errorBoundMm: 2 * r * Math.sin(angle / count / 4) ** 2 };
  }
  const points: PointMm[] = [curve.controls[0]], parameters = [0];
  let errorBoundMm = 0;
  const visit = (controls: typeof curve.controls, a: number, b: number, depth: number) => {
    const bound = Math.max(pointSegmentDistance(controls[1], controls[0], controls[3]), pointSegmentDistance(controls[2], controls[0], controls[3]));
    if (bound <= toleranceMm) {
      errorBoundMm = Math.max(errorBoundMm, bound);
      points.push(controls[3]); parameters.push(b); return;
    }
    if (depth >= 24 || points.length > 100000) throw new RangeError("Bezier sampling budget exceeded");
    const [left, right] = splitBezier(controls), middle = (a + b) / 2;
    visit(left, a, middle, depth + 1); visit(right, middle, b, depth + 1);
  };
  visit(curve.controls, 0, 1, 0);
  return { points, parameters, errorBoundMm };
}

function integrateSpeed(curve: ThreadCurve, a: number, b: number, tolerance: number) {
  if (curve.kind === "arc") { const data = arcData(curve); return data.r * data.angle * (b - a); }
  const f = (t: number) => norm(curveDerivative(curve, t));
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) => (b - a) * (fa + 4 * fm + fb) / 6;
  const visit = (a: number, b: number, fa: number, fm: number, fb: number, whole: number, tol: number, depth: number): number => {
    const m = (a + b) / 2, fl = f((a + m) / 2), fr = f((m + b) / 2);
    const left = simpson(a, m, fa, fl, fm), right = simpson(m, b, fm, fr, fb), delta = left + right - whole;
    if (Math.abs(delta) <= 15 * tol) return left + right + delta / 15;
    if (depth >= 20) throw new RangeError("length integration did not converge");
    return visit(a, m, fa, fl, fm, left, tol / 2, depth + 1) + visit(m, b, fm, fr, fb, right, tol / 2, depth + 1);
  };
  const fa = f(a), fm = f((a + b) / 2), fb = f(b);
  return visit(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), tolerance, 0);
}

// Polynomial roots on [0,1], using derivative roots to isolate monotone intervals.
const sortedUniqueRoots = (values: number[]) => values.sort((a, b) => a - b).filter((t, i, sorted) => i === 0 || t - sorted[i - 1]! > 1e-12);
export function polynomialRoots01(poly: number[]): number[] {
  const scale = Math.max(...poly.map(Math.abs), 1e-300);
  while (poly.length > 1 && Math.abs(poly.at(-1)!) <= scale * 1e-14) poly = poly.slice(0, -1);
  if (poly.length <= 1) return [];
  if (poly.length === 2) { const t = -poly[0]! / poly[1]!; return t >= 0 && t <= 1 ? [t] : []; }
  const value = (t: number) => poly.reduceRight((sum, c) => sum * t + c, 0);
  const critical = polynomialRoots01(poly.slice(1).map((c, i) => c * (i + 1)));
  const cuts = sortedUniqueRoots([0, ...critical, 1]), out = cuts.filter((t) => Math.abs(value(t)) < scale * 1e-12);
  for (let i = 0; i + 1 < cuts.length; i++) {
    let a = cuts[i]!, b = cuts[i + 1]!, fa = value(a);
    if (fa * value(b) >= 0) continue;
    for (let k = 0; k < 60; k++) { const m = (a + b) / 2, fm = value(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
    out.push((a + b) / 2);
  }
  return sortedUniqueRoots(out);
}

function curvatureCheck(curve: ThreadCurve, radius: number) {
  if (curve.kind === "arc") return { max: radius / arcData(curve).r, converged: true };
  const [a, b, c, d] = curve.controls;
  const velocity = [mul(sub(b, a), 3), mul(add(sub(c, mul(b, 2)), a), 6), mul(add(sub(d, mul(c, 3)), sub(mul(b, 3), a)), 3)];
  const speedSquared = Array(5).fill(0) as number[];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) speedSquared[i + j]! += dot(velocity[i]!, velocity[j]!);
  const speedCritical = [0, 1, ...polynomialRoots01(speedSquared.slice(1).map((v, i) => v * (i + 1)))];
  const scale = Math.max(...velocity.map(norm), 1e-300);
  if (speedCritical.some((t) => norm(curveDerivative(curve, t)) <= scale * 1e-10)) return { max: Infinity, converged: true };
  const at = (t: number) => { const v = curveDerivative(curve, t); return radius * norm(cross(v, curveSecondDerivative(curve, t))) / norm(v) ** 3; };
  const product = (a: number[], b: number[]) => {
    const out = Array(a.length + b.length - 1).fill(0) as number[];
    a.forEach((x, i) => b.forEach((y, j) => { out[i + j]! += x * y; })); return out;
  };
  const derivative = (p: number[]) => p.slice(1).map((x, i) => x * (i + 1));
  const bend: PointMm[] = [origin, origin, origin, origin];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) bend[i + j] = add(bend[i + j]!, cross(velocity[i]!, mul(velocity[j + 1]!, j + 1)));
  const numerator = Array(7).fill(0) as number[];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) numerator[i + j]! += dot(bend[i]!, bend[j]!);
  const left = product(derivative(numerator), speedSquared), right = product(numerator, derivative(speedSquared));
  // Stationary kappa² = N/D³ occurs at N'D - 3ND' = 0. Root isolation
  // and the subsequent sampling convergence check are numerical, not a proof.
  const extrema = polynomialRoots01(left.map((x, i) => x - 3 * (right[i] ?? 0)));
  let maximum = Math.max(...[...speedCritical, ...extrema].map(at)), previous = -1, stable = 0;
  for (let n = 32; n <= 8192; n *= 2) {
    for (let i = 0; i <= n; i++) maximum = Math.max(maximum, at(i / n));
    stable = Math.abs(maximum - previous) <= 1e-5 * Math.max(1, maximum) ? stable + 1 : 0;
    if (stable >= 2 && n >= 256) return { max: maximum, converged: true };
    previous = maximum;
  }
  return { max: maximum, converged: false };
}

type Segment = { a: PointMm; b: PointMm; error: number; id: string; thread: string; radius: number; start: number; end: number };
function segments(curve: ThreadCurve, id: string, thread: string, radius: number, offset: number, tolerance: number): Segment[] {
  const sampled = sampleCurve(curve, tolerance), result: Segment[] = [];
  for (let i = 1; i < sampled.points.length; i++) {
    const length = integrateSpeed(curve, sampled.parameters[i - 1]!, sampled.parameters[i]!, tolerance * 1e-4);
    result.push({ a: sampled.points[i - 1]!, b: sampled.points[i]!, error: sampled.errorBoundMm, id, thread, radius, start: offset, end: offset + length });
    offset += length;
  }
  return result;
}

function distantParameterDomain(a: Segment, b: Segment, exclude: number, witness = false): Pair[] {
  // Chord fractions are not Bezier arc-length fractions. Distance from each
  // endpoint bounds the possible material coordinate. U retains every potentially
  // nonlocal pair; L admits only guaranteed nonlocal penetration witnesses.
  let polygon: Pair[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const la = norm(sub(a.b, a.a)), lb = norm(sub(b.b, b.a));
  const distance = (p: Pair) => witness
    ? b.start + lb * p[1] - a.end + la * (1 - p[0]) - exclude
    : b.end - lb * (1 - p[1]) - a.start - la * p[0] - exclude;
  const out: Pair[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!, dp = distance(p), dq = distance(q);
    if (dp >= 0) out.push(p);
    if ((dp < 0) !== (dq < 0)) { const k = dp / (dp - dq); out.push([p[0] + k * (q[0] - p[0]), p[1] + k * (q[1] - p[1])]); }
  }
  polygon = out;
  return polygon;
}

function boxDistance(a: Segment, b: Segment) {
  let square = 0;
  for (let axis = 0; axis < 3; axis++) {
    const gap = Math.max(0, Math.min(a.a[axis]!, a.b[axis]!) - Math.max(b.a[axis]!, b.b[axis]!), Math.min(b.a[axis]!, b.b[axis]!) - Math.max(a.a[axis]!, a.b[axis]!));
    square += gap * gap;
  }
  return Math.sqrt(square);
}

function scanGaps(working: Segment[], supports: Segment[], self: boolean, localExclusion: number) {
  let lower = Infinity, upper = Infinity, ids: string[] = [], witnessIds: string[] = [];
  for (let i = 0; i < working.length; i++) {
    const a = working[i]!;
    const other = self ? working : supports;
    for (let j = self ? i : 0; j < other.length; j++) {
      const b = other[j]!, radii = a.radius + b.radius, error = a.error + b.error;
      if (boxDistance(a, b) - radii - error > upper) continue;
      const same = self && a.thread === b.thread;
      const exclusion = Number.isNaN(localExclusion) ? Math.PI * a.radius : localExclusion;
      const polygon = same ? distantParameterDomain(a, b, exclusion) : [[0, 0], [1, 0], [1, 1], [0, 1]] as Pair[];
      const closest = closestInPolygon(a.a, a.b, b.a, b.b, polygon);
      if (!closest) continue;
      const gap = closest.distanceMm - radii;
      if (gap - error < lower) { lower = gap - error; ids = [...new Set([a.id, b.id])]; }
      const witness = same ? closestInPolygon(a.a, a.b, b.a, b.b, distantParameterDomain(a, b, exclusion, true)) : closest;
      if (witness && witness.distanceMm - radii + error < upper) {
        upper = witness.distanceMm - radii + error; witnessIds = [...new Set([a.id, b.id])];
      }
    }
  }
  return { lower, upper, ids, witnessIds };
}

/** Numerical geometric validation, not mechanical equilibrium or proof of catch topology. */
export function validateThreadCoupon(coupon: C8ThreadCoupon, toleranceMm = .005): PathValidation {
  const diagnostics: PathDiagnostic[] = [];
  const lengthMm = { total: 0, surface: 0, piercing: 0, buried: 0 };
  let maxCurvatureTimesRadius = 0, minSupportGapMm = Infinity, minSelfGapMm = Infinity;
  const addDiagnostic = (code: string, severity: PathDiagnostic["severity"], spanIds: string[], message: string, valueMm?: number) => diagnostics.push({ code, severity, spanIds, message, ...(valueMm === undefined ? {} : { valueMm }) });
  const finish = (): PathValidation => ({ status: diagnostics.some((d) => d.severity === "error") ? "failed" : diagnostics.length ? "unresolved" : "passed", diagnostics, toleranceMm, lengthMm, maxCurvatureTimesRadius, minSupportGapMm, minSelfGapMm });
  if (![coupon.bodyRadiusMm, coupon.threadRadiusMm, toleranceMm].every((n) => Number.isFinite(n) && n > 0) || coupon.threadRadiusMm >= coupon.bodyRadiusMm) {
    addDiagnostic("invalid-dimensions", "error", [], "Body radius, thread radius and tolerance require valid positive millimetres."); return finish();
  }
  const ids = new Set<string>(), previous = new Map<string, ThreadSpan>();
  const numeric = Math.max(coupon.bodyRadiusMm, coupon.threadRadiusMm) * 1e-11;
  for (const support of coupon.supports) {
    if (ids.has(support.id) || !support.id || !(support.radiusMm > 0) || !Number.isFinite(support.radiusMm)) addDiagnostic("invalid-support", "error", [support.id], "Support IDs and radii must be valid and unique.");
    ids.add(support.id);
    try {
      checkCurve(support.curve);
      const curvature = curvatureCheck(support.curve, support.radiusMm);
      maxCurvatureTimesRadius = Math.max(maxCurvatureTimesRadius, curvature.max);
      if (curvature.max >= 1) addDiagnostic("curvature-radius", "error", [support.id], "A support violates r*kappa < 1 or has zero speed.");
      else if (!curvature.converged) addDiagnostic("curvature-unresolved", "unresolved", [support.id], "Support curvature maxima did not stabilize.");
      let resolved = false;
      for (let refinement = 0; refinement <= 5; refinement++) {
        const sample = sampleCurve(support.curve, toleranceMm / 4 ** refinement);
        const witness = Math.min(...sample.points.map(norm)) - coupon.bodyRadiusMm - support.radiusMm;
        const lower = support.curve.kind === "arc" ? norm(support.curve.from) - coupon.bodyRadiusMm - support.radiusMm
          : Math.min(...sample.points.slice(1).map((p, i) => pointSegmentDistance(origin, sample.points[i]!, p))) - sample.errorBoundMm - coupon.bodyRadiusMm - support.radiusMm;
        if (witness < -numeric) { addDiagnostic("support-body-penetration", "error", [support.id], "A marking support penetrates the body.", witness); resolved = true; break; }
        if (lower >= -numeric) { resolved = true; break; }
      }
      if (!resolved) addDiagnostic("support-body-unresolved", "unresolved", [support.id], "Support clearance from the body could not be certified.");
    } catch (e) { addDiagnostic("invalid-curve", "error", [support.id], String(e)); }
  }
  const owned = new Set<string>(), operationIds = new Set<string>();
  const graphError = (message: string, spanIds: string[] = []) => addDiagnostic("operation-graph", "error", spanIds, message);
  if (!coupon.spans.length || coupon.operations[0]?.kind !== "start" || coupon.operations.at(-1)?.kind !== "finish") graphError("A coupon requires spans and explicit start/finish operations.");
  if (coupon.operations.filter((op) => op.kind === "start").length !== 1 || coupon.operations.filter((op) => op.kind === "finish").length !== 1) graphError("Start and finish must each occur exactly once.");
  let lastOrder = -Infinity, lastStep = -Infinity;
  for (const op of coupon.operations) {
    if (!op.id || operationIds.has(op.id) || !Number.isInteger(op.order) || op.order < 0 || op.order <= lastOrder || !Number.isInteger(op.step) || op.step < 0 || op.step < lastStep) graphError("Operations need unique IDs, increasing order and nondecreasing steps.");
    operationIds.add(op.id); lastOrder = op.order; lastStep = op.step;
    for (const id of op.spanIds) {
      const span = coupon.spans.find((s) => s.id === id);
      if (!span || owned.has(id) || span.opId !== op.id || span.step !== op.step) graphError("Every operation span must exist, match its owner/step and be owned exactly once.", [id]);
      owned.add(id);
    }
    if (op.captureIds?.some((id) => !coupon.supports.some((s) => s.id === id))) graphError("A capture refers to a missing marking support.", op.spanIds);
  }
  if (!coupon.threadId || coupon.spans.some((span) => span.threadId !== coupon.threadId)) graphError("A single-thread coupon requires one nonempty working thread ID shared by every span.");
  if (coupon.spans.some((span) => !owned.has(span.id))) graphError("A working span has no operation owner.");
  if (coupon.operations.flatMap((op) => op.spanIds).some((id, i) => coupon.spans[i]?.id !== id)) graphError("Operation order must agree with material span order.");
  for (const span of coupon.spans) {
    if (ids.has(span.id) || !span.id || !span.threadId) addDiagnostic("invalid-span", "error", [span.id], "Span IDs must be unique and every span requires a thread ID.");
    ids.add(span.id);
    try {
      checkCurve(span.curve);
      const length = integrateSpeed(span.curve, 0, 1, toleranceMm * 1e-4);
      lengthMm[span.zone] += length; lengthMm.total += length;
      const prior = previous.get(span.threadId);
      if (prior) {
        const gap = norm(sub(evaluateCurve(prior.curve, 1), evaluateCurve(span.curve, 0)));
        if (gap > numeric) addDiagnostic("thread-discontinuity", "error", [prior.id, span.id], "Consecutive spans of a working thread have different endpoints.", gap);
        const before = curveDerivative(prior.curve, 1), after = curveDerivative(span.curve, 0);
        const cosine = dot(before, after) / (norm(before) * norm(after));
        if (!Number.isFinite(cosine) || norm(sub(mul(before, 1 / norm(before)), mul(after, 1 / norm(after)))) > 1e-8) addDiagnostic("tangent-discontinuity", "error", [prior.id, span.id], "A yarn join must have a continuous oriented tangent (G1).");
      }
      previous.set(span.threadId, span);
      const curvature = curvatureCheck(span.curve, coupon.threadRadiusMm);
      maxCurvatureTimesRadius = Math.max(maxCurvatureTimesRadius, curvature.max);
      if (curvature.max >= 1) addDiagnostic("curvature-radius", "error", [span.id], "Sampled curvature violates r*kappa < 1 or the curve has zero speed.");
      else if (!curvature.converged) addDiagnostic("curvature-unresolved", "unresolved", [span.id], "Curvature maxima did not stabilize under sampling refinement.");
      // Bounds apply to the entire tube, not only its control points.
      let bodyResolved = false;
      for (let refinement = 0; refinement <= 5; refinement++) {
        const sample = sampleCurve(span.curve, toleranceMm / 4 ** refinement);
        let lower = Infinity, witness = Infinity;
        for (let i = 1; i < sample.points.length; i++) {
          const a = sample.points[i - 1]!, b = sample.points[i]!, error = sample.errorBoundMm;
          if (span.zone === "surface") {
            const exact = span.curve.kind === "arc" ? norm(span.curve.from) : null;
            lower = Math.min(lower, (exact ?? pointSegmentDistance(origin, a, b) - error) - coupon.bodyRadiusMm - coupon.threadRadiusMm);
            witness = Math.min(witness, Math.min(norm(a), norm(b)) - coupon.bodyRadiusMm - coupon.threadRadiusMm);
          } else if (span.zone === "buried") {
            const exact = span.curve.kind === "arc" ? norm(span.curve.from) : null;
            lower = Math.min(lower, coupon.bodyRadiusMm - coupon.threadRadiusMm - (exact ?? Math.max(norm(a), norm(b)) + error));
            witness = Math.min(witness, coupon.bodyRadiusMm - coupon.threadRadiusMm - Math.max(norm(a), norm(b)));
          } else {
            const corridor = span.corridor;
            if (!corridor || ![...corridor.centerMm, corridor.radiusMm, corridor.maxDepthMm].every(Number.isFinite) || corridor.radiusMm <= 0 || corridor.maxDepthMm <= 0) {
              addDiagnostic("missing-piercing-corridor", "error", [span.id], "A piercing span requires a finite, positive declared corridor."); bodyResolved = true; break;
            }
            const radialGap = pointSegmentDistance(origin, a, b) - coupon.threadRadiusMm - coupon.bodyRadiusMm + corridor.maxDepthMm;
            const corridorGap = corridor.radiusMm - coupon.threadRadiusMm - Math.max(norm(sub(a, corridor.centerMm)), norm(sub(b, corridor.centerMm)));
            lower = Math.min(lower, radialGap - error, corridorGap - error);
            witness = Math.min(witness, Math.min(norm(a), norm(b)) - coupon.threadRadiusMm - coupon.bodyRadiusMm + corridor.maxDepthMm, corridorGap);
          }
        }
        if (bodyResolved) break;
        if (witness < -numeric) { addDiagnostic("body-zone-violation", "error", [span.id], "The yarn leaves the allowed volume for its declared zone.", witness); bodyResolved = true; break; }
        if (lower >= -numeric) { bodyResolved = true; break; }
      }
      if (!bodyResolved) addDiagnostic("body-zone-unresolved", "unresolved", [span.id], "The curve approximation cannot certify the declared body/corridor clearance.");
    } catch (e) {
      const unresolved = /budget exceeded|did not converge/.test(String(e));
      addDiagnostic(unresolved ? "geometry-unresolved" : "invalid-curve", unresolved ? "unresolved" : "error", [span.id], String(e));
    }
  }
  if (diagnostics.some((d) => d.code === "invalid-curve")) return finish();
  try {
    for (const mode of ["support", "self", "support-support"] as const) {
      const self = mode === "self";
      let result: ReturnType<typeof scanGaps> | undefined;
      for (let refinement = 0; refinement <= 3; refinement++) {
        const tolerance = toleranceMm / 4 ** refinement;
        const offsets = new Map<string, number>(), working: Segment[] = [];
        for (const span of coupon.spans) {
          const batch = segments(span.curve, span.id, span.threadId, coupon.threadRadiusMm, offsets.get(span.threadId) ?? 0, tolerance);
          working.push(...batch); offsets.set(span.threadId, batch.at(-1)?.end ?? 0);
        }
        const supportSegments = self ? [] : coupon.supports.flatMap((support) => segments(support.curve, support.id, support.id, support.radiusMm, 0, tolerance));
        result = mode === "support-support" ? scanGaps(supportSegments, [], true, NaN)
          : scanGaps(working, supportSegments, self, maxCurvatureTimesRadius < 1 ? Math.PI * coupon.threadRadiusMm : 0);
        if (result.lower > numeric || result.upper < -numeric || result.lower === Infinity) break;
      }
      if (!result) continue;
      if (self) minSelfGapMm = result.lower; else if (mode === "support") minSupportGapMm = result.lower;
      if (result.upper < -numeric) addDiagnostic(self ? "self-penetration" : "support-penetration", "error", result.witnessIds, "Exact segment distances and curve error bounds certify intersecting yarn volumes.", result.upper);
      else if (result.lower <= numeric) addDiagnostic(self ? "self-contact-unresolved" : "support-contact-unresolved", "unresolved", result.ids, "Clearance interval contains zero after refinement; touching is not certified clearance.", result.lower);
    }
  } catch (e) { addDiagnostic("distance-unresolved", "unresolved", [], String(e)); }
  return finish();
}
