/**
 * A planar, weightless, frictionless string with zero bending stiffness.
 *
 * This reference tightens a prescribed external wrap of the convex envelope of
 * 1–3 fixed round supports. It does not model a C8 cross-section, deform the old
 * yarns, solve a rod/elastica, or conserve slack between two material clamps.
 * Endpoints are geometric ports: surplus length is withdrawn through a port.
 * The route is a tangent, one directed envelope interval (< one full turn), and
 * a tangent. No fallback switches the wrapping side or silently unties a loop.
 *
 * Inflating support radii by the working radius is an exact nonpenetration
 * construction for circular sections in this plane. A positive clearance adds
 * a VIRTUAL obstacle margin for comparison; that path is not physical contact.
 * Positive uniform tension scales the reactions but not this B=0 geometry.
 * Numbers use millimetres; roundoff guards are numerical, not material data.
 */

export type ContactPointMm = readonly [number, number];
export type TautSupport = { id: string; centerMm: ContactPointMm; radiusMm: number };
export type TautContactInput = {
  startMm: ContactPointMm;
  endMm: ContactPointMm;
  supports: readonly TautSupport[];
  threadRadiusMm: number;
  /** +1 is counterclockwise around the envelope; -1 is clockwise. */
  direction: 1 | -1;
  /** Geometric comparison only. Default zero means actual section contact. */
  clearanceMm?: number;
};
export type TautLine = {
  kind: "line"; from: ContactPointMm; to: ContactPointMm; lengthMm: number;
};
export type TautArc = {
  kind: "arc"; from: ContactPointMm; to: ContactPointMm;
  centerMm: ContactPointMm; radiusMm: number; startAngleRad: number;
  /** Signed sweep follows direction and never exceeds one full turn. */
  sweepRad: number; supportId: string; lengthMm: number;
};
export type TautSegment = TautLine | TautArc;
export type TautDiagnostic = {
  code: "invalid-input" | "physical-overlap" | "endpoint-inside-envelope"
    | "endpoint-on-envelope" | "route-unresolved" | "support-penetration"
    | "self-penetration" | "self-contact-unresolved";
  message: string;
};
export type TautContactResult = {
  status: "passed" | "failed" | "unresolved";
  segments: TautSegment[];
  /** Zero-angle grazing contacts are included. With clearance>0 these are virtual. */
  contacts: { supportId: string; angleRad: number; lengthMm: number }[];
  lengthMm: number;
  maxCurvatureTimesRadius: number;
  minSupportGapMm: number | null;
  clearanceMm: number;
  toleranceMm: number;
  diagnostics: TautDiagnostic[];
};

const TAU = 2 * Math.PI;
const ANGLE_EPS = 2e-12;
const add = (a: ContactPointMm, b: ContactPointMm): ContactPointMm => [a[0] + b[0], a[1] + b[1]];
const sub = (a: ContactPointMm, b: ContactPointMm): ContactPointMm => [a[0] - b[0], a[1] - b[1]];
const mul = (a: ContactPointMm, s: number): ContactPointMm => [a[0] * s, a[1] * s];
const dot = (a: ContactPointMm, b: ContactPointMm) => a[0] * b[0] + a[1] * b[1];
const norm = (a: ContactPointMm) => Math.hypot(a[0], a[1]);
const unitAt = (a: number): ContactPointMm => [Math.cos(a), Math.sin(a)];
const mod = (a: number, period = TAU) => ((a % period) + period) % period;
const clamp = (a: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, a));
const finitePoint = (p: ContactPointMm) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/** Rendering uses the exact same line/arc data as the length and contact checks. */
export function evaluateTautSegment(segment: TautSegment, t: number): ContactPointMm {
  if (segment.kind === "line") return add(segment.from, mul(sub(segment.to, segment.from), t));
  return add(segment.centerMm, mul(unitAt(segment.startAngleRad + t * segment.sweepRad), segment.radiusMm));
}

function tangent(segment: TautSegment, t: number): ContactPointMm {
  if (segment.kind === "line") return mul(sub(segment.to, segment.from), 1 / segment.lengthMm);
  const a = segment.startAngleRad + t * segment.sweepRad, sign = Math.sign(segment.sweepRad);
  return [-sign * Math.sin(a), sign * Math.cos(a)];
}

function line(a: ContactPointMm, b: ContactPointMm): TautLine {
  return { kind: "line", from: a, to: b, lengthMm: norm(sub(b, a)) };
}

function arc(centerMm: ContactPointMm, radiusMm: number, startAngleRad: number,
  sweepRad: number, supportId: string): TautArc {
  return { kind: "arc", centerMm, radiusMm, startAngleRad, sweepRad, supportId,
    from: add(centerMm, mul(unitAt(startAngleRad), radiusMm)),
    to: add(centerMm, mul(unitAt(startAngleRad + sweepRad), radiusMm)),
    lengthMm: Math.abs(sweepRad) * radiusMm };
}

function slice(segment: TautSegment, a: number, b: number): TautSegment {
  return segment.kind === "line"
    ? line(evaluateTautSegment(segment, a), evaluateTautSegment(segment, b))
    : arc(segment.centerMm, segment.radiusMm, segment.startAngleRad + a * segment.sweepRad,
      (b - a) * segment.sweepRad, segment.supportId);
}

/** Minimum centreline distance to a point, including interior circular extrema. */
export function tautSegmentPointDistance(segment: TautSegment, point: ContactPointMm): number {
  if (segment.kind === "line") {
    const v = sub(segment.to, segment.from), vv = dot(v, v);
    const t = vv === 0 ? 0 : clamp(dot(sub(point, segment.from), v) / vv);
    return norm(sub(point, evaluateTautSegment(segment, t)));
  }
  const relative = sub(point, segment.centerMm), d = norm(relative);
  if (d === 0) return segment.radiusMm;
  const target = Math.atan2(relative[1], relative[0]);
  const offset = mod(Math.sign(segment.sweepRad) * (target - segment.startAngleRad));
  let distance = Math.min(norm(sub(point, segment.from)), norm(sub(point, segment.to)));
  if (offset <= Math.abs(segment.sweepRad) + ANGLE_EPS || TAU - offset <= ANGLE_EPS) {
    distance = Math.min(distance, Math.abs(d - segment.radiusMm));
  }
  return distance;
}

type BoundaryPiece = { segment: TautSegment; at: number };
type Tangency = { point: ContactPointMm; at: number; distance: number };

function makeBoundary(supports: readonly TautSupport[], inflation: number, eps: number): BoundaryPiece[] {
  const angles = [0, TAU];
  // h_i(n)=c_i·n+R_i+inflation. Only pair equalities can change the active disk.
  for (let i = 0; i < supports.length; i++) for (let j = i + 1; j < supports.length; j++) {
    const delta = sub(supports[i].centerMm, supports[j].centerMm), d = norm(delta);
    const ratio = (supports[j].radiusMm - supports[i].radiusMm) / d;
    if (Math.abs(ratio) >= 1) continue; // Nested physical disks were rejected earlier.
    const a = Math.atan2(delta[1], delta[0]), b = Math.acos(ratio);
    for (const theta of [mod(a - b), mod(a + b)]) if (theta > ANGLE_EPS && TAU - theta > ANGLE_EPS) angles.push(theta);
  }
  angles.sort((a, b) => a - b);
  const breaks = angles.filter((a, i) => i === 0 || a - angles[i - 1] > ANGLE_EPS);
  const intervals: { from: number; to: number; support: TautSupport }[] = [];
  for (let k = 1; k < breaks.length; k++) {
    const from = breaks[k - 1], to = breaks[k], n = unitAt((from + to) / 2);
    const support = supports.reduce((best, s) => dot(s.centerMm, n) + s.radiusMm > dot(best.centerMm, n) + best.radiusMm ? s : best);
    const previous = intervals.at(-1);
    if (previous?.support.id === support.id) previous.to = to;
    else intervals.push({ from, to, support });
  }
  const pieces: BoundaryPiece[] = [];
  let at = 0;
  const append = (segment: TautSegment) => {
    if (segment.lengthMm > eps) { pieces.push({ segment, at }); at += segment.lengthMm; }
  };
  for (let i = 0; i < intervals.length; i++) {
    const current = intervals[i], next = intervals[(i + 1) % intervals.length];
    const s = current.support, nextSupport = next.support;
    const curved = arc(s.centerMm, s.radiusMm + inflation, current.from, current.to - current.from, s.id);
    append(curved);
    // The support function's derivative jump is the exposed common tangent.
    append(line(curved.to, add(nextSupport.centerMm, mul(unitAt(current.to), nextSupport.radiusMm + inflation))));
  }
  return pieces;
}

function findTangency(point: ContactPointMm, boundary: BoundaryPiece[], supports: readonly TautSupport[],
  inflation: number, direction: 1 | -1, entry: boolean, eps: number): Tangency | null {
  const candidates: Tangency[] = [];
  for (const { segment, at } of boundary) {
    if (segment.kind !== "arc") continue;
    const relative = sub(point, segment.centerMm), d = norm(relative);
    if (d <= segment.radiusMm) continue;
    const alpha = Math.atan2(relative[1], relative[0]), beta = Math.acos(clamp(segment.radiusMm / d, -1, 1));
    for (const theta of [alpha - beta, alpha + beta]) {
      let offset = mod(theta - segment.startAngleRad);
      if (TAU - offset <= ANGLE_EPS) offset = 0;
      if (offset > segment.sweepRad + ANGLE_EPS) continue;
      const normal = unitAt(theta), q = add(segment.centerMm, mul(normal, segment.radiusMm));
      const supportingHeight = dot(point, normal);
      if (supports.some(s => dot(s.centerMm, normal) + s.radiusMm + inflation > supportingHeight + eps)) continue;
      const v = entry ? sub(q, point) : sub(point, q), distance = norm(v);
      const forward: ContactPointMm = [-direction * normal[1], direction * normal[0]];
      if (distance <= eps || dot(v, forward) <= 0) continue;
      if (Math.abs(dot(v, normal)) > eps * 4) continue;
      candidates.push({ point: q, at: at + clamp(offset / segment.sweepRad) * segment.lengthMm, distance });
    }
  }
  // On an exposed flat face the two tangent points describe the same straight
  // route. Keep the first actual touch from the port; do not invent an arc there.
  candidates.sort((a, b) => a.distance - b.distance || a.at - b.at);
  return candidates[0] ?? null;
}

function walkBoundary(boundary: BoundaryPiece[], start: number, end: number, direction: 1 | -1,
  perimeter: number, eps: number): TautSegment[] {
  const travel = mod(direction * (end - start), perimeter);
  if (travel <= eps) return [];
  const candidates: { at: number; segment: TautSegment }[] = [];
  // Unwrap one turn of cumulative boundary length; splitting only crops exact
  // primitives and never substitutes chords for contact arcs.
  const low = direction === 1 ? start : start - travel;
  const high = direction === 1 ? start + travel : start;
  for (const piece of boundary) for (const turn of [-1, 0, 1]) {
    const a = piece.at + turn * perimeter, b = a + piece.segment.lengthMm;
    const from = Math.max(low, a), to = Math.min(high, b);
    if (to - from > eps) candidates.push({ at: from,
      segment: slice(piece.segment, (from - a) / piece.segment.lengthMm, (to - a) / piece.segment.lengthMm) });
  }
  candidates.sort((a, b) => a.at - b.at);
  return direction === 1 ? candidates.map(x => x.segment)
    : candidates.reverse().map(x => slice(x.segment, 1, 0));
}

function closestChords(a: ContactPointMm, b: ContactPointMm, c: ContactPointMm, d: ContactPointMm) {
  const u = sub(b, a), v = sub(d, c), w = sub(a, c);
  const aa = dot(u, u), bb = dot(u, v), cc = dot(v, v), dd = dot(u, w), ee = dot(v, w);
  const candidates: [number, number][] = [];
  const cross = (p: ContactPointMm, q: ContactPointMm) => p[0] * q[1] - p[1] * q[0];
  // In the plane an interior minimum not at an endpoint is an intersection.
  // A determinant aa*cc-bb*bb loses the crossing of nearly parallel chords.
  const determinant = cross(u, v);
  if (determinant !== 0) {
    const s = -cross(w, v) / determinant, t = -cross(w, u) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) candidates.push([s, t]);
  }
  candidates.push([0, cc ? clamp(ee / cc) : 0], [1, cc ? clamp((ee + bb) / cc) : 0],
    [aa ? clamp(-dd / aa) : 0, 0], [aa ? clamp((bb - dd) / aa) : 0, 1]);
  return candidates.map(([s, t]) => ({ s, t, distance: norm(sub(add(a, mul(u, s)), add(c, mul(v, t)))) }))
    .reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
}

type CurvePiece = { segment: TautSegment; a: number; b: number; start: number };
function checkSelf(segments: readonly TautSegment[], radius: number, eps: number): "clear" | "penetration" | "unresolved" {
  const pieces: CurvePiece[] = [];
  let start = 0;
  for (const segment of segments) {
    // A single line or circular interval <=pi/2 cannot meet itself away from
    // its local tube neighbourhood when r*kappa<1. Other pairs stay in the test.
    const count = segment.kind === "arc" ? Math.ceil(Math.abs(segment.sweepRad) / (Math.PI / 2)) : 1;
    for (let j = 0; j < count; j++) pieces.push({ segment, a: j / count, b: (j + 1) / count, start });
    start += segment.lengthMm;
  }
  let budget = 100000;
  const compare = (a: CurvePiece, b: CurvePiece, depth: number): "clear" | "penetration" | "unresolved" => {
    if (--budget < 0 || depth > 40) return "unresolved";
    const sa = (t: number) => a.start + t * a.segment.lengthMm;
    const sb = (t: number) => b.start + t * b.segment.lengthMm;
    if (sb(b.b) - sa(a.a) <= Math.PI * radius) return "clear";
    const chord = closestChords(evaluateTautSegment(a.segment, a.a), evaluateTautSegment(a.segment, a.b),
      evaluateTautSegment(b.segment, b.a), evaluateTautSegment(b.segment, b.b));
    const sag = (p: CurvePiece) => p.segment.kind === "line" ? 0
      : p.segment.radiusMm * 2 * Math.sin(Math.abs(p.segment.sweepRad) * (p.b - p.a) / 4) ** 2;
    const error = sag(a) + sag(b);
    if (chord.distance - error > 2 * radius + eps) return "clear";
    const ta = a.a + chord.s * (a.b - a.a), tb = b.a + chord.t * (b.b - b.a);
    const witness = norm(sub(evaluateTautSegment(a.segment, ta), evaluateTautSegment(b.segment, tb)));
    if (sb(tb) - sa(ta) > Math.PI * radius && witness < 2 * radius - eps) return "penetration";
    const extentA = (a.b - a.a) * a.segment.lengthMm, extentB = (b.b - b.a) * b.segment.lengthMm;
    if (Math.max(extentA, extentB) <= eps * 4) return "unresolved";
    let left: ReturnType<typeof compare>, right: ReturnType<typeof compare>;
    if (extentA >= extentB) {
      const m = (a.a + a.b) / 2;
      left = compare({ ...a, b: m }, b, depth + 1);
      if (left === "penetration") return left;
      right = compare({ ...a, a: m }, b, depth + 1);
    } else {
      const m = (b.a + b.b) / 2;
      left = compare(a, { ...b, b: m }, depth + 1);
      if (left === "penetration") return left;
      right = compare(a, { ...b, a: m }, depth + 1);
    }
    return left === "unresolved" || right === "unresolved" ? "unresolved" : right;
  };
  let unresolved = false;
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    const result = compare(pieces[i], pieces[j], 0);
    if (result === "penetration") return result;
    if (result === "unresolved") unresolved = true;
  }
  return unresolved ? "unresolved" : "clear";
}

export function solveTautContact(input: TautContactInput): TautContactResult {
  const clearanceMm = input.clearanceMm ?? 0;
  const result: TautContactResult = { status: "failed", segments: [], contacts: [], lengthMm: 0,
    maxCurvatureTimesRadius: 0, minSupportGapMm: null, clearanceMm, toleranceMm: 0, diagnostics: [] };
  const stop = (code: TautDiagnostic["code"], message: string, unresolved = false) => {
    result.status = unresolved ? "unresolved" : "failed"; result.diagnostics.push({ code, message }); return result;
  };
  const { supports: rawSupports, threadRadiusMm: radius } = input;
  if (!finitePoint(input.startMm) || !finitePoint(input.endMm) || !Number.isFinite(radius) || radius <= 0
    || !Number.isFinite(clearanceMm) || clearanceMm < 0 || ![1, -1].includes(input.direction)
    || !Array.isArray(rawSupports) || rawSupports.length < 1 || rawSupports.length > 3
    || rawSupports.some(s => !s || typeof s.id !== "string" || !s.id || !finitePoint(s.centerMm)
      || !Number.isFinite(s.radiusMm) || s.radiusMm <= 0)
    || new Set(rawSupports.map(s => s.id)).size !== rawSupports.length) {
    return stop("invalid-input", "Expected finite endpoints, 1–3 uniquely named positive circular supports, positive thread radius, and a directed wrap.");
  }
  // Local coordinates avoid unnecessary loss from a common world translation.
  const origin = rawSupports[0].centerMm;
  const supports = rawSupports.map(s => ({ ...s, centerMm: sub(s.centerMm, origin) }));
  const start = sub(input.startMm, origin), end = sub(input.endMm, origin);
  const scale = Math.max(radius, clearanceMm, norm(start), norm(end), ...supports.map(s => norm(s.centerMm) + s.radiusMm));
  const eps = scale * 1e-10; result.toleranceMm = eps;
  if (!Number.isFinite(scale) || Math.min(radius, ...supports.map(s => s.radiusMm)) <= eps * 100) {
    return stop("route-unresolved", "The length scales exceed this reference's numerical resolution.", true);
  }
  for (let i = 0; i < supports.length; i++) for (let j = i + 1; j < supports.length; j++) {
    if (norm(sub(supports[i].centerMm, supports[j].centerMm)) < supports[i].radiusMm + supports[j].radiusMm - eps) {
      return stop("physical-overlap", "Fixed physical support sections overlap; virtual inflated sections may overlap, physical sections may not.");
    }
  }
  const inflation = radius + clearanceMm;
  const boundary = makeBoundary(supports, inflation, eps);
  const perimeter = boundary.reduce((sum, p) => sum + p.segment.lengthMm, 0);
  if (!Number.isFinite(perimeter) || perimeter <= eps) return stop("route-unresolved", "Could not resolve the convex envelope.", true);
  for (const endpoint of [start, end]) {
    const onBoundary = boundary.some(p => tautSegmentPointDistance(p.segment, endpoint) <= eps);
    if (onBoundary) return stop("endpoint-on-envelope", "Place both geometric ports strictly outside the inflated convex envelope.");
  }
  const entry = findTangency(start, boundary, supports, inflation, input.direction, true, eps);
  const exit = findTangency(end, boundary, supports, inflation, input.direction, false, eps);
  if (!entry || !exit) return stop("endpoint-inside-envelope", "Both geometric ports must be outside the convex envelope, including gaps between its supports.");
  const segments: TautSegment[] = [line(start, entry.point),
    ...walkBoundary(boundary, entry.at, exit.at, input.direction, perimeter, eps), line(exit.point, end)]
    .filter(s => s.lengthMm > eps);
  for (let i = 1; i < segments.length; i++) {
    if (norm(sub(segments[i - 1].to, segments[i].from)) > eps * 8
      || dot(tangent(segments[i - 1], 1), tangent(segments[i], 0)) < 1 - 1e-10) {
      return stop("route-unresolved", "The directed tangent/envelope join could not be resolved continuously.", true);
    }
  }
  result.lengthMm = segments.reduce((sum, s) => sum + s.lengthMm, 0);
  result.maxCurvatureTimesRadius = Math.max(0, ...segments.map(s => s.kind === "arc" ? radius / s.radiusMm : 0));
  let minGap = Infinity;
  for (const support of supports) {
    const gap = Math.min(...segments.map(s => tautSegmentPointDistance(s, support.centerMm))) - support.radiusMm - radius;
    minGap = Math.min(minGap, gap);
    if (gap < clearanceMm - eps * 8) return stop("support-penetration", "A route segment penetrates a support or the requested virtual clearance.");
    if (gap <= clearanceMm + eps * 8) {
      const arcs = segments.filter((s): s is TautArc => s.kind === "arc" && s.supportId === support.id);
      result.contacts.push({ supportId: support.id, angleRad: arcs.reduce((sum, s) => sum + Math.abs(s.sweepRad), 0),
        lengthMm: arcs.reduce((sum, s) => sum + s.lengthMm, 0) });
    }
  }
  result.minSupportGapMm = minGap;
  result.segments = segments.map(s => s.kind === "line"
    ? { ...s, from: add(s.from, origin), to: add(s.to, origin) }
    : { ...s, from: add(s.from, origin), to: add(s.to, origin), centerMm: add(s.centerMm, origin) });
  const self = checkSelf(segments, radius, eps);
  if (self === "penetration") return stop("self-penetration", "Remote portions of the working section intersect on this prescribed wrap; the route was not switched or untied.");
  if (self === "unresolved") return stop("self-contact-unresolved", "Numerical bounds cannot separate remote working sections on this wrap.", true);
  result.status = "passed";
  return result;
}
