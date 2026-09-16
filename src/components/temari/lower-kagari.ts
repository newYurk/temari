import { evaluateCurve, curveDerivative } from './thread-geometry';
import type { C8ThreadCoupon, MarkingSupport, PointMm, ThreadCrossing, ThreadCurve, ThreadOperation, ThreadSpan } from './thread-path';

/** Engineering dimensions; the backbite ordering is distinct from these sizes. */
export const LOWER_KAGARI_DIMENSIONS = Object.freeze({
  circumferenceMm: 230,
  threadRadiusMm: 0.2,
  markingRadiusMm: 0.08,
  markingHalfLengthMm: 3,
  halfBiteMm: 0.6,
  depthMm: 1,
  flankLengthMm: 8,
  flankHalfWidthMm: 3,
  portGuardMm: 0.01,
  entryRampMm: 1,
  looseLiftMm: 0.8,
  looseRiseMm: 1.2,
  looseFallMm: 2,
  biteEndHandleMm: 0.8,
  biteBottomHandleMm: 0.9,
});
export type LowerKagariDimensions = { -readonly [K in keyof typeof LOWER_KAGARI_DIMENSIONS]: number };
export type LowerKagariInput = Partial<LowerKagariDimensions> & {
  radial?: PointMm;
  outward?: PointMm;
  handedness?: 1 | -1;
};
export type LowerKagariPort = { positionMm: PointMm; tangent: PointMm };
export type LowerKagariFixture = {
  dimensions: LowerKagariDimensions;
  bodyRadiusMm: number;
  threadRadiusMm: number;
  portGuardMm: number;
  frame: { radial: PointMm; outward: PointMm; progress: PointMm };
  incoming: ThreadCurve[];
  fixed: ThreadCurve[];
  looseOutgoing: ThreadCurve[];
  incomingStart: LowerKagariPort;
  entry: LowerKagariPort;
  exit: LowerKagariPort;
  next: LowerKagariPort;
  markingSupport: MarkingSupport;
  incomingTarget: { id: string; curve: ThreadCurve; radiusMm: number; t0: number; t1: number };
  crossing: ThreadCrossing;
  /** Existing validators may inspect this engineering path; ports are not anchors. */
  coupon: C8ThreadCoupon;
};

const add = (a: PointMm, b: PointMm): PointMm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: PointMm, s: number): PointMm => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a: PointMm, b: PointMm) => add(a, scale(b, -1));
const dot = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: PointMm, b: PointMm): PointMm => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: PointMm) => Math.hypot(...a);
const unit = (a: PointMm) => {
  if (!a.every(Number.isFinite) || norm(a) < 1e-12) throw new RangeError('lower kagari requires finite nonzero frame vectors');
  return scale(a, 1 / norm(a));
};
const toward = (a: PointMm, b: PointMm) => unit(sub(unit(b), scale(unit(a), dot(unit(a), unit(b)))));
const arc = (from: PointMm, to: PointMm): ThreadCurve => ({ kind: 'arc', from, to });
const cubic = (a: PointMm, b: PointMm, c: PointMm, d: PointMm): ThreadCurve => ({ kind: 'bezier', controls: [a, b, c, d] });
const port = (curve: ThreadCurve, t: number): LowerKagariPort => ({ positionMm: evaluateCurve(curve, t), tangent: unit(curveDerivative(curve, t)) });

/**
 * One isolated lower backbite: approach from -q, enter on +q, pass under the
 * base to -q, then depart toward +q over the incoming flank. The fixed needle
 * route and raised outgoing seed are assumptions, not a tension solution.
 */
export function createLowerKagariFixture(input: LowerKagariInput = {}): LowerKagariFixture {
  const d: LowerKagariDimensions = { ...LOWER_KAGARI_DIMENSIONS };
  for (const key of Object.keys(d) as (keyof LowerKagariDimensions)[]) {
    if (input[key] !== undefined) d[key] = input[key]!;
    if (!Number.isFinite(d[key]) || d[key] <= 0) throw new RangeError(`${key} must be finite and positive`);
  }
  const R = d.circumferenceMm / (2 * Math.PI), r = d.threadRadiusMm;
  const m = unit(input.radial ?? [0, 1, 0]), rawV = input.outward ?? [0, 0, 1];
  const v = unit(sub(rawV, scale(m, dot(rawV, m))));
  const handedness = input.handedness ?? 1;
  if (handedness !== 1 && handedness !== -1) throw new RangeError('lower kagari handedness must be +1 or -1');
  const q = scale(unit(cross(m, v)), handedness), surface = R + r + d.portGuardMm;
  if (Math.max(d.depthMm, d.markingHalfLengthMm, d.flankLengthMm, d.flankHalfWidthMm) >= R / 2 || d.halfBiteMm <= r || d.depthMm <= r || d.flankHalfWidthMm <= d.halfBiteMm)
    throw new RangeError('lower kagari dimensions exceed the local fixture');
  const point = (across: number, along: number, radius: number) => scale(unit(add(m, add(scale(q, across / R), scale(v, along / R)))), radius);
  const entry = point(d.halfBiteMm, 0, surface), exit = point(-d.halfBiteMm, 0, surface);
  // Incoming passes over a real finite marking support, then returns to the port.
  const incomingRadius = surface + 2 * d.markingRadiusMm;
  const start = point(-d.flankHalfWidthMm, -d.flankLengthMm, incomingRadius);
  const startDirection = toward(start, entry);
  const incomingAngle = Math.acos(Math.max(-1, Math.min(1, dot(unit(start), unit(entry)))));
  const alongArc = (from: PointMm, direction: PointMm, angle: number, radius: number) => scale(add(scale(unit(from), Math.cos(angle)), scale(direction, Math.sin(angle))), radius);
  if (d.entryRampMm >= incomingAngle * R) throw new RangeError('lower kagari entry ramp exceeds its flank');
  const rampStart = alongArc(start, startDirection, incomingAngle - d.entryRampMm / R, incomingRadius);
  const incomingTangent = scale(toward(entry, start), -1), entryHandle = d.entryRampMm / 3;
  const incoming: ThreadCurve[] = [arc(start, rampStart), cubic(rampStart, add(rampStart, scale(toward(rampStart, entry), entryHandle)), sub(entry, scale(incomingTangent, entryHandle)), entry)];

  const nextPoint = point(d.flankHalfWidthMm, -d.flankLengthMm, surface);
  const outgoingTangent = toward(exit, nextPoint);
  const bottom = point(0, 0, R - d.depthMm);
  const bottomTangent = scale(q, -1);
  const fixed: ThreadCurve[] = [
    cubic(entry, add(entry, scale(incomingTangent, d.biteEndHandleMm)), sub(bottom, scale(bottomTangent, d.biteBottomHandleMm)), bottom),
    cubic(bottom, add(bottom, scale(bottomTangent, d.biteBottomHandleMm)), sub(exit, scale(outgoingTangent, d.biteEndHandleMm)), exit),
  ];
  const outgoingAngle = Math.acos(Math.max(-1, Math.min(1, dot(unit(exit), unit(nextPoint)))));
  if (d.looseRiseMm + d.looseFallMm >= outgoingAngle * R) throw new RangeError('lower kagari outgoing ramps exceed the flank');
  const raisedRadius = surface + d.looseLiftMm;
  const raisedStart = alongArc(exit, outgoingTangent, d.looseRiseMm / R, raisedRadius);
  const raisedEnd = alongArc(exit, outgoingTangent, outgoingAngle - d.looseFallMm / R, raisedRadius);
  const riseHandle = d.looseRiseMm / 3, fallHandle = d.looseFallMm / 3;
  const nextTangent = scale(toward(nextPoint, exit), -1);
  const looseOutgoing: ThreadCurve[] = [
    cubic(exit, add(exit, scale(outgoingTangent, riseHandle)), sub(raisedStart, scale(toward(raisedStart, nextPoint), riseHandle)), raisedStart),
    arc(raisedStart, raisedEnd),
    cubic(raisedEnd, add(raisedEnd, scale(toward(raisedEnd, nextPoint), fallHandle)), sub(nextPoint, scale(nextTangent, fallHandle)), nextPoint),
  ];
  const markingSupport: MarkingSupport = {
    id: 'lower-marking', circleId: 'lower-guide', radiusMm: d.markingRadiusMm,
    curve: arc(point(0, -d.markingHalfLengthMm, R + d.markingRadiusMm), point(0, d.markingHalfLengthMm, R + d.markingRadiusMm)),
  };
  const operations: ThreadOperation[] = [
    { id: 'lower-incoming', kind: 'start', order: 0, step: 0, spanIds: [] },
    { id: 'lower-fixed-bite', kind: 'catch', order: 1, step: 1, spanIds: [], captureIds: [markingSupport.id], pass: 'under' },
    { id: 'lower-outgoing', kind: 'finish', order: 2, step: 2, spanIds: [] },
  ];
  const spans: ThreadSpan[] = [];
  for (const [index, curves] of [incoming, fixed, looseOutgoing].entries()) for (const [part, curve] of curves.entries()) {
    const operation = operations[index], id = `${operation.id}-${part + 1}`;
    operation.spanIds.push(id);
    spans.push({ id, threadId: 'lower-thread', opId: operation.id, step: operation.step, zone: index === 1 ? 'piercing' : 'surface', curve,
      ...(index === 1 ? { corridor: { centerMm: scale(m, R), radiusMm: d.halfBiteMm + d.depthMm + d.biteEndHandleMm + r,
        maxDepthMm: d.depthMm + d.biteEndHandleMm + r } } : {}) });
  }
  const incomingTarget = { id: operations[0].spanIds[0], curve: incoming[0], radiusMm: r, t0: 0, t1: 1 };
  const crossing: ThreadCrossing = { id: 'lower-outgoing-over-incoming', opId: operations[2].id,
    working: operations[2].spanIds.map(spanId => ({ spanId, t0: 0, t1: 1 })), target: { id: incomingTarget.id, t0: 0, t1: 1 }, pass: 'over' };
  const crossings: ThreadCrossing[] = [crossing,
    { id: 'lower-incoming-over-marking', opId: operations[0].id, working: operations[0].spanIds.map(spanId => ({ spanId, t0: 0, t1: 1 })), target: { id: markingSupport.id, t0: 0, t1: 1 }, pass: 'over' },
    { id: 'lower-fixed-under-marking', opId: operations[1].id, working: operations[1].spanIds.map(spanId => ({ spanId, t0: 0, t1: 1 })), target: { id: markingSupport.id, t0: 0, t1: 1 }, pass: 'under' },
    { id: 'lower-outgoing-over-marking', opId: operations[2].id, working: operations[2].spanIds.map(spanId => ({ spanId, t0: 0, t1: 1 })), target: { id: markingSupport.id, t0: 0, t1: 1 }, pass: 'over' },
  ];
  const coupon: C8ThreadCoupon = {
    kind: 'engineering-thread-path', bodyRadiusMm: R, threadId: 'lower-thread', threadRadiusMm: r,
    spans, operations, supports: [markingSupport], marks: [], fixture: { ...d }, crossings,
    assumptions: ['Isolated lower backbite with fixed geometric boundary ports; no anchoring strength or equilibrium is modelled.',
      'Incoming crosses above finite marking thread; the outgoing seed crosses above the incoming flank.',
      'Needle depth, circular cross-sections and raised seed are engineering dimensions, not measurements of a master stitch.'],
  };
  return { dimensions: d, bodyRadiusMm: R, threadRadiusMm: r, portGuardMm: d.portGuardMm, frame: { radial: m, outward: v, progress: q },
    incoming, fixed, looseOutgoing, incomingStart: port(incoming[0], 0), entry: port(fixed[0], 0), exit: port(fixed.at(-1)!, 1), next: port(looseOutgoing.at(-1)!, 1),
    markingSupport, incomingTarget, crossing, coupon };
}
