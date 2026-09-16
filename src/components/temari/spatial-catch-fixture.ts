import { curveDerivative, evaluateCurve, polynomialRoots01 } from './thread-geometry';
import type { C8ThreadCoupon, MarkingSupport, PointMm, ThreadCapture, ThreadCurve, ThreadSpan } from './thread-path';

export type SpatialCurveFragment = {
  curve: ThreadCurve;
  sourceSpanId: string;
  opId: string;
  step: number;
  t0: number;
  t1: number;
};
export type SpatialCatchPort = {
  positionMm: PointMm;
  /** Unit tangent in chronological thread direction. */
  tangent: PointMm;
  sourceSpanId: string;
  t: number;
};
export type SpatialCatchTarget = {
  id: string;
  kind: 'thread' | 'support';
  curve: ThreadCurve;
  radiusMm: number;
  t0: number;
  t1: number;
};
export type SpatialCatchFixture = {
  coupon: C8ThreadCoupon;
  step: 10;
  capture: ThreadCapture;
  bodyRadiusMm: number;
  threadRadiusMm: number;
  /** Numerical separation of the fixed bite from the free exterior; not material. */
  portGuardMm: number;
  portRadiusMm: number;
  start: SpatialCatchPort;
  entry: SpatialCatchPort;
  exit: SpatialCatchPort;
  free: SpatialCurveFragment[];
  fixed: SpatialCurveFragment[];
  freeCurves: ThreadCurve[];
  fixedCurves: ThreadCurve[];
  targets: SpatialCatchTarget[];
  /** All material laid before this approach, including the adjacent catch. */
  previousSpans: ThreadSpan[];
  /** Explicit adjacency only; not an exemption from remote self-contact checks. */
  adjacentCatchSpans: ThreadSpan[];
  previousSupports: MarkingSupport[];
};

const dot = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: PointMm) => Math.hypot(...a);
const scale = (a: PointMm, k: number): PointMm => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: PointMm, b: PointMm): PointMm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: PointMm, b: PointMm): PointMm => add(a, scale(b, -1));
const mix = (a: PointMm, b: PointMm, t: number) => add(scale(a, 1 - t), scale(b, t));
const unit = (a: PointMm) => {
  const length = norm(a);
  if (!(length > 0)) throw new RangeError('spatial catch requires regular boundary tangents');
  return scale(a, 1 / length);
};

function split(curve: Extract<ThreadCurve, { kind: 'bezier' }>, t: number): [ThreadCurve, ThreadCurve] {
  const [a, b, c, d] = curve.controls;
  const ab = mix(a, b, t), bc = mix(b, c, t), cd = mix(c, d, t);
  const abc = mix(ab, bc, t), bcd = mix(bc, cd, t), middle = mix(abc, bcd, t);
  return [{ kind: 'bezier', controls: [a, ab, abc, middle] }, { kind: 'bezier', controls: [middle, bcd, cd, d] }];
}

/** Exact restriction of an existing arc or cubic; never refits sampled points. */
function restrict(curve: ThreadCurve, t0: number, t1: number): ThreadCurve {
  if (t0 === 0 && t1 === 1) return curve;
  if (curve.kind === 'arc') return { kind: 'arc', from: evaluateCurve(curve, t0), to: evaluateCurve(curve, t1) };
  let part = t1 === 1 ? curve : split(curve, t1)[0];
  if (t0 > 0) part = split(part as Extract<ThreadCurve, { kind: 'bezier' }>, t0 / t1)[1];
  return part;
}

function radialPolynomial(curve: Extract<ThreadCurve, { kind: 'bezier' }>, radius: number) {
  const [a, b, c, d] = curve.controls;
  const powers = [a, scale(sub(b, a), 3), scale(add(sub(c, scale(b, 2)), a), 3), add(sub(d, scale(c, 3)), sub(scale(b, 3), a))];
  const polynomial = Array(7).fill(0) as number[];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) polynomial[i + j] += dot(powers[i], powers[j]);
  polynomial[0] = (norm(a) - radius) * (norm(a) + radius);
  return polynomial;
}

function requireJoined(a: ThreadCurve, b: ThreadCurve, tolerance: number) {
  const positionGap = norm(sub(evaluateCurve(a, 1), evaluateCurve(b, 0)));
  const tangentGap = norm(sub(unit(curveDerivative(a, 1)), unit(curveDerivative(b, 0))));
  if (positionGap > tolerance || tangentGap > 1e-8) throw new RangeError('spatial catch source path must be continuous and G1');
}

/**
 * Extract the ordinary inner catch of the second round, preserving its needle
 * route through the base. This adapter does not tighten or validate equilibrium.
 * A zone label is not a geometric boundary: the approach contains piercing spans,
 * and the emergence was assigned to the following lay by the source compiler.
 */
export function createSpatialCatchFixture(coupon: C8ThreadCoupon, portGuardMm = 0.01): SpatialCatchFixture {
  const step = 10;
  const R = coupon.bodyRadiusMm, r = coupon.threadRadiusMm, portRadiusMm = R + r + portGuardMm;
  if (![R, r, portGuardMm].every(x => Number.isFinite(x) && x > 0) || r >= R)
    throw new RangeError('spatial catch radii and numerical port guard must be finite and positive');
  const tolerance = R * 1e-9;
  const operation = (at: number, kind: 'lay' | 'catch') => {
    const matches = coupon.operations.filter(op => op.step === at && op.kind === kind);
    if (matches.length !== 1) throw new RangeError(`spatial catch requires one ${kind} at step ${at}`);
    return matches[0];
  };
  const previousCatch = operation(step - 1, 'catch'), lay = operation(step, 'lay');
  const currentCatch = operation(step, 'catch'), nextLay = operation(step + 1, 'lay');
  if (!(previousCatch.order + 1 === lay.order && lay.order + 1 === currentCatch.order && currentCatch.order + 1 === nextLay.order))
    throw new RangeError('spatial catch operations must be chronological neighbours');
  const spanById = new Map(coupon.spans.map(span => [span.id, span]));
  if (spanById.size !== coupon.spans.length) throw new RangeError('spatial catch source span IDs must be unique');
  const sourceSpans = (ids: string[]) => ids.map(id => {
    const span = spanById.get(id);
    if (!span) throw new RangeError(`missing spatial catch source span ${id}`);
    return span;
  });
  const chain = sourceSpans([...lay.spanIds, ...currentCatch.spanIds, ...nextLay.spanIds]);
  const adjacentCatchSpans = sourceSpans(previousCatch.spanIds);
  if (!chain.length || !adjacentCatchSpans.length) throw new RangeError('spatial catch source operations may not be empty');
  const ownerById = new Map(coupon.operations.map(op => [op.id, op]));
  for (const span of [...adjacentCatchSpans, ...chain]) {
    const owner = ownerById.get(span.opId);
    if (!owner || !owner.spanIds.includes(span.id) || owner.step !== span.step)
      throw new RangeError('spatial catch source ownership is inconsistent');
  }
  requireJoined(adjacentCatchSpans.at(-1)!.curve, chain[0].curve, tolerance);
  for (let i = 1; i < chain.length; i++) requireJoined(chain[i - 1].curve, chain[i].curve, tolerance);
  if (norm(evaluateCurve(chain[0].curve, 0)) <= portRadiusMm + tolerance || norm(evaluateCurve(chain.at(-1)!.curve, 1)) <= portRadiusMm + tolerance)
    throw new RangeError('spatial catch approach and departure must start outside the guarded port sphere');

  const roots: { index: number; t: number; radialDerivative: number }[] = [];
  chain.forEach((span, index) => {
    if (span.curve.kind === 'arc') {
      if (Math.abs(norm(span.curve.from) - portRadiusMm) <= tolerance)
        throw new RangeError('spatial catch port is ambiguous on a concentric arc');
      return;
    }
    for (const t of polynomialRoots01(radialPolynomial(span.curve, portRadiusMm))) {
      if (t <= 1e-10 || t >= 1 - 1e-10) throw new RangeError('spatial catch port at a source join is unresolved');
      const position = evaluateCurve(span.curve, t);
      if (Math.abs(norm(position) - portRadiusMm) > tolerance) throw new RangeError('spatial catch radial root did not converge');
      const radialDerivative = dot(position, curveDerivative(span.curve, t)) / norm(position);
      if (Math.abs(radialDerivative) <= tolerance) throw new RangeError('spatial catch tangent port is unresolved');
      roots.push({ index, t, radialDerivative });
    }
  });
  if (roots.length !== 2 || roots[0].radialDerivative >= 0 || roots[1].radialDerivative <= 0)
    throw new RangeError('spatial catch requires one entrance and one emergence through the guarded sphere');
  const [entryRoot, exitRoot] = roots;
  if (chain[entryRoot.index].opId !== currentCatch.id || chain[exitRoot.index].opId !== nextLay.id || chain[entryRoot.index].zone !== 'piercing' || chain[exitRoot.index].zone !== 'piercing')
    throw new RangeError('spatial catch ports must lie inside the catch and following emergence');

  const fragment = (span: ThreadSpan, t0: number, t1: number): SpatialCurveFragment => ({
    curve: restrict(span.curve, t0, t1), sourceSpanId: span.id, opId: span.opId, step: span.step, t0, t1,
  });
  const free = chain.slice(0, entryRoot.index).map(span => fragment(span, 0, 1));
  free.push(fragment(chain[entryRoot.index], 0, entryRoot.t));
  const fixed = chain.slice(entryRoot.index, exitRoot.index + 1).map((span, offset) => fragment(span,
    offset === 0 ? entryRoot.t : 0, entryRoot.index + offset === exitRoot.index ? exitRoot.t : 1));
  const port = (span: ThreadSpan, t: number): SpatialCatchPort => ({
    positionMm: evaluateCurve(span.curve, t), tangent: unit(curveDerivative(span.curve, t)), sourceSpanId: span.id, t,
  });
  const capture = coupon.captures?.find(item => item.opId === currentCatch.id);
  if (!capture || capture.targets.length !== 3) throw new RangeError('spatial catch requires the ordinary two-branch capture');
  const targets: SpatialCatchTarget[] = capture.targets.map(target => {
    const span = spanById.get(target.id), support = coupon.supports.find(item => item.id === target.id);
    if (!!span === !!support || target.t0 < 0 || target.t1 > 1 || !(target.t1 > target.t0))
      throw new RangeError('spatial catch requires unambiguous finite capture targets');
    if (span && !(ownerById.get(span.opId)!.order < lay.order)) throw new RangeError('spatial catch targets must already exist');
    return { ...target, kind: span ? 'thread' : 'support', curve: (span ?? support)!.curve, radiusMm: span ? r : support!.radiusMm };
  });
  if (targets.filter(target => target.kind === 'thread').length !== 2 || targets.filter(target => target.kind === 'support').length !== 1)
    throw new RangeError('spatial catch requires two old branches and one marking support');
  const previousSpans = coupon.spans.filter(span => {
    const owner = ownerById.get(span.opId);
    if (!owner) throw new RangeError('spatial catch source span has no operation');
    return owner.order < lay.order;
  });
  return {
    coupon, step, capture, bodyRadiusMm: R, threadRadiusMm: r, portGuardMm, portRadiusMm,
    start: port(chain[0], 0), entry: port(chain[entryRoot.index], entryRoot.t), exit: port(chain[exitRoot.index], exitRoot.t),
    free, fixed, freeCurves: free.map(item => item.curve), fixedCurves: fixed.map(item => item.curve),
    targets, previousSpans, adjacentCatchSpans, previousSupports: coupon.supports,
  };
}
