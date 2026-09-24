import { compileKiku } from './patterns';
import { MARI_C_CM } from './measure';
import { buildNeedleChannel, type NeedleChannel } from './needle-channel';
import { boundCurvatureTimesRadius } from './curvature-bound';
import { curveDerivative, evaluateCurve, validateThreadCoupon } from './thread-geometry';
import type { C8ThreadCoupon, PointMm, ThreadCurve } from './thread-path';

/** Studio recipe bites of the first ordinary upper visit. Not the S8 planner seed. */
export const FIRST_VISIT_PORT_SOURCE = 'studio-recipe-bite' as const;
const MARKS = ['outer-1', 'inner-2', 'outer-3'] as const;
/** Same declared test layer as the straight-channel control, not a measured wrap. */
const LAYER_MM = 1.2;
const THREAD_RADIUS_MM = 0.355;
const NEEDLE_RADIUS_MM = 0.2;
const EXTERIOR_MM = 6;

const add = (a: PointMm, b: PointMm): PointMm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: PointMm, s: number): PointMm => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: PointMm) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: PointMm): PointMm => mul(a, 1 / norm(a));

const cubic = (a: PointMm, b: PointMm, c: PointMm, d: PointMm): ThreadCurve =>
  ({ kind: 'bezier', controls: [a, b, c, d] });

const tangentAt = (curve: ThreadCurve, t: 0 | 1) => unit(curveDerivative(curve, t));

/** Angle in degrees between two unit tangents. Zero means the joint continues straight. */
export function tangentAngleDeg(a: PointMm, b: PointMm) {
  const c = Math.min(1, Math.max(-1, dot(unit(a), unit(b))));
  return Math.acos(c) * 180 / Math.PI;
}

/**
 * First full upper visit as three straight recipe channels plus finite exterior
 * transitions. Mouth tangents match the channel axes. Not a mechanical solve
 * and not a replacement for the rejected upper-bundle seed.
 */
export function buildFirstVisitRoute() {
  const R = MARI_C_CM * 10 / (2 * Math.PI);
  const ops = compileKiku('simple', 'out', 'even', 0, 0, 1, 0)
    .filter(op => op.pole === 0 && op.set === 0 && op.kai === 0);
  const selected = ops.slice(0, MARKS.length);
  const marks = selected.map(op => `${op.mark.t}-${op.mark.line}`);
  if (marks.join() !== MARKS.join()) throw new Error(`Expected first-visit marks ${MARKS.join()}, got ${marks.join()}.`);
  const onSphere = (p: PointMm): PointMm => {
    const q = mul(p, R);
    if (Math.abs(norm(q) - R) > 1e-6 * R) throw new Error('A recipe bite is not on the nominal sphere.');
    return q;
  };
  const channels: NeedleChannel[] = selected.map((op, i) => buildNeedleChannel({
    R, layerThickness: LAYER_MM, rNeedle: NEEDLE_RADIUS_MM, rThread: THREAD_RADIUS_MM,
    entry: onSphere(op.bite.enter), exit: onSphere(op.bite.exit), supports: [],
    id: `first-visit/${MARKS[i]}`, threadId: 'first-visit/physical-thread-1',
  }));
  const axis = (channel: NeedleChannel) => channel.spans[0].curve;
  const dir = (channel: NeedleChannel) => tangentAt(axis(channel), 0);
  const straight = (a: PointMm, b: PointMm) => cubic(a, add(a, mul(sub(b, a), 1 / 3)), add(a, mul(sub(b, a), 2 / 3)), b);
  const reach = (origin: PointMm, direction: PointMm) => {
    const target = R + THREAD_RADIUS_MM + 0.2;
    let hi = 1;
    while (norm(add(origin, mul(direction, hi))) < target) hi *= 2;
    let lo = 0;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (norm(add(origin, mul(direction, mid))) < target) lo = mid; else hi = mid;
    }
    return add(origin, mul(direction, hi));
  };
  const bridge = (from: NeedleChannel, to: NeedleChannel): [ThreadCurve, ThreadCurve, ThreadCurve] => {
    const a = evaluateCurve(axis(from), 1), b = evaluateCurve(axis(to), 0);
    const ta = dir(from), tb = dir(to);
    const leave = reach(a, ta), arrive = reach(b, mul(tb, -1));
    const span = norm(sub(arrive, leave));
    return [straight(a, leave), cubic(leave, add(leave, mul(ta, span)), sub(arrive, mul(tb, span)), arrive), straight(arrive, b)];
  };
  const first = channels[0], last = channels[2];
  const entry = evaluateCurve(axis(first), 0), exit = evaluateCurve(axis(last), 1);
  const approach = cubic(sub(entry, mul(dir(first), EXTERIOR_MM)), sub(entry, mul(dir(first), EXTERIOR_MM * 2 / 3)),
    sub(entry, mul(dir(first), EXTERIOR_MM / 3)), entry);
  const departure = cubic(exit, add(exit, mul(dir(last), EXTERIOR_MM / 3)),
    add(exit, mul(dir(last), EXTERIOR_MM * 2 / 3)), add(exit, mul(dir(last), EXTERIOR_MM)));
  const bridges = [...bridge(channels[0], channels[1]), ...bridge(channels[1], channels[2])];
  const joints = [
    { id: 'approach/outer-1', angleDeg: tangentAngleDeg(tangentAt(approach, 1), dir(first)) },
    { id: 'outer-1/bridge', angleDeg: tangentAngleDeg(dir(channels[0]), tangentAt(bridges[0], 0)) },
    { id: 'bridge/inner-2', angleDeg: tangentAngleDeg(tangentAt(bridges[2], 1), dir(channels[1])) },
    { id: 'inner-2/bridge', angleDeg: tangentAngleDeg(dir(channels[1]), tangentAt(bridges[3], 0)) },
    { id: 'bridge/outer-3', angleDeg: tangentAngleDeg(tangentAt(bridges[5], 1), dir(channels[2])) },
    { id: 'outer-3/departure', angleDeg: tangentAngleDeg(dir(last), tangentAt(departure, 0)) },
  ];
  return {
    model: 'first-visit-route-v1' as const,
    portSource: FIRST_VISIT_PORT_SOURCE,
    mechanics: 'not-solved' as const,
    status: 'not-certified' as const,
    R, layerMm: LAYER_MM, threadRadiusMm: THREAD_RADIUS_MM,
    bridgePolicy: 'axis-to-exterior-then-cubic' as const,
    marks: [...MARKS],
    channels, approach, bridges, departure, joints,
  };
}

/** Round-tube check of the recipe route. Does not start the solver. */
export function auditFirstVisitRoute(route = buildFirstVisitRoute()) {
  const threadId = 'first-visit/physical-thread-1';
  const curves: [string, ThreadCurve][] = [
    ['approach', route.approach],
    ['outer-1', route.channels[0].spans[0].curve],
    ...route.bridges.slice(0, 3).map((curve, i) => [`bridge-0-${i}`, curve] as [string, ThreadCurve]),
    ['inner-2', route.channels[1].spans[0].curve],
    ...route.bridges.slice(3).map((curve, i) => [`bridge-1-${i}`, curve] as [string, ThreadCurve]),
    ['outer-3', route.channels[2].spans[0].curve],
    ['departure', route.departure],
  ];
  const spans: C8ThreadCoupon['spans'] = curves.map(([role, curve], i) => ({
    id: `${threadId}/${role}`, threadId, opId: `first-visit/${role}`, step: i, zone: 'surface', curve,
  }));
  const coupon: C8ThreadCoupon = {
    kind: 'engineering-thread-path',
    bodyRadiusMm: route.R - route.layerMm,
    threadRadiusMm: route.threadRadiusMm,
    threadId, spans,
    operations: spans.map((span, i) => ({
      id: span.opId, order: i, step: i,
      kind: i === 0 ? 'start' : i === spans.length - 1 ? 'finish' : 'lay',
      spanIds: [span.id],
    })),
    supports: [], marks: [], fixture: {},
    assumptions: [
      'Start and finish bound this represented visit. They are not craft anchors.',
      'The coupon body is the declared hard core. The nominal sphere is not treated as solid.',
    ],
  };
  const validation = validateThreadCoupon(coupon, 0.001);
  const curvature = boundCurvatureTimesRadius(curves.map(([, curve]) => curve), route.threadRadiusMm);
  const tube = validation.status === 'failed' || curvature.lower >= 1 ? 'rejected'
    : validation.status === 'passed' && curvature.status === 'certified' && curvature.upper < 1 ? 'passed' : 'unresolved';
  return { mechanics: 'not-solved' as const, status: 'not-certified' as const,
    coreRadiusMm: route.R - route.layerMm, tube, validation, curvature };
}
