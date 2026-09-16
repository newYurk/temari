import { createC8EngineeringCoupon } from "./c8-engineering-coupon";
import type { LocalMarkingInput, MarkingVector } from "./local-marking";
import type {
  C8ThreadCoupon,
  PiercingCorridor,
  ThreadCurve,
  ThreadOperation,
  ThreadOperationKind,
  ThreadSpan,
  ThreadZone,
} from "./thread-path";

/** Engineering dimensions in mm, not measured yarn properties or GT55 parameters. */
export const C8_THREAD_FIXTURE = Object.freeze({
  threadRadiusMm: 0.2,
  halfBiteMm: 1.2,
  catchDepthMm: 1.2,
  catchEndHandleMm: 1,
  catchBottomHandleMm: 0.65,
  supportRadiusMm: 0.08,
  supportHalfLengthMm: 3,
  seamOffsetMm: 1.2,
  tailLeadMm: 5,
  tailLengthMm: 3,
  tailDepthMm: 2.5,
  corridorMarginMm: 0.05,
});

export type C8ThreadFixture = { [K in keyof typeof C8_THREAD_FIXTURE]: number };
export type C8ThreadCouponInput = LocalMarkingInput & {
  circumferenceMm: number;
  innerMm: number;
  outerMm: number;
  threadFixture?: Partial<C8ThreadFixture>;
};

const dot = (a: MarkingVector, b: MarkingVector) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (v: MarkingVector, k: number): MarkingVector => [v[0] * k, v[1] * k, v[2] * k];
const add = (a: MarkingVector, b: MarkingVector): MarkingVector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: MarkingVector, b: MarkingVector): MarkingVector => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const unit = (v: MarkingVector) => scale(v, 1 / Math.hypot(...v));
const move = (p: MarkingVector, tangent: MarkingVector, angle: number) =>
  add(scale(p, Math.cos(angle)), scale(tangent, Math.sin(angle)));
const arcTangent = (at: MarkingVector, toward: MarkingVector) => {
  const a = unit(at), b = unit(toward);
  return unit(add(b, scale(a, -dot(a, b))));
};
const bezier = (a: MarkingVector, b: MarkingVector, c: MarkingVector, d: MarkingVector): ThreadCurve =>
  ({ kind: "bezier", controls: [a, b, c, d] });

/**
 * One open thread with eight transverse catches and explicit buried end routes.
 * Construction is deterministic; an emitted path is NOT a validation certificate.
 * Run validateThreadCoupon before accepting any dimensions, including overrides.
 */
export function createC8ThreadCoupon(input: C8ThreadCouponInput): C8ThreadCoupon {
  const coupon = createC8EngineeringCoupon(input);
  const f: C8ThreadFixture = { ...C8_THREAD_FIXTURE, ...input.threadFixture };
  for (const [key, value] of Object.entries(f)) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${key} must be finite and positive`);
  }
  const radius = input.circumferenceMm / (2 * Math.PI);
  const surfaceRadius = radius + f.threadRadiusMm;
  if (f.catchDepthMm <= f.threadRadiusMm || f.tailDepthMm <= f.threadRadiusMm ||
      Math.max(f.catchDepthMm, f.tailDepthMm) >= radius / 2 ||
      f.halfBiteMm >= input.innerMm || f.supportHalfLengthMm >= input.innerMm ||
      f.seamOffsetMm <= 2 * f.threadRadiusMm ||
      f.tailLeadMm + f.tailLengthMm >= input.circumferenceMm / 4) {
    throw new RangeError("thread fixture dimensions do not define a local open coupon");
  }
  const marks = coupon.marks;
  const center = unit(input.center);
  const frames = marks.map((mark, i) => {
    const theta = mark.distanceMm / radius;
    const m = unit(mark.positionMm);
    const v = unit(add(scale(center, -Math.sin(theta)), scale(coupon.rays[i].tangent, Math.cos(theta))));
    const q = scale(unit(cross(m, v)), input.handedness);
    const enter = scale(move(m, q, -f.halfBiteMm / radius), surfaceRadius);
    const exit = scale(move(m, q, f.halfBiteMm / radius), surfaceRadius);
    return { m, v, q, enter, exit };
  });
  const seam = frames[0];
  const finishMark = move(seam.m, seam.v, f.seamOffsetMm / radius);
  const finishExit = scale(move(finishMark, seam.q, f.halfBiteMm / radius), surfaceRadius);
  const finishDirection = unit(add(seam.v, scale(unit(finishExit), -dot(seam.v, unit(finishExit)))));
  const layFrom = frames.map((frame) => frame.exit);
  const layTo = frames.map((_, i) => frames[(i + 1) % 8].enter);
  const threadId = "c8-coupon-thread-1";
  const operations: ThreadOperation[] = [];
  const spans: ThreadSpan[] = [];
  function operation(kind: ThreadOperationKind, step: number, markIndex?: number) {
    const op: ThreadOperation = {
      id: `op-${operations.length + 1}-${kind}`,
      order: operations.length,
      step,
      kind,
      spanIds: [],
      ...(markIndex === undefined ? {} : { markId: marks[markIndex].id }),
      ...(kind === "catch" ? { captureIds: [`support-${markIndex! + 1}`], pass: "under" as const } : {}),
    };
    operations.push(op);
    return op;
  }
  function span(op: ThreadOperation, zone: ThreadZone, curve: ThreadCurve, corridor?: PiercingCorridor) {
    const id = `span-${spans.length + 1}`;
    spans.push({ id, threadId, opId: op.id, step: op.step, zone, curve, ...(corridor ? { corridor } : {}) });
    op.spanIds.push(id);
  }
  const corridorAt = (center: MarkingVector, extent: number, depth: number): PiercingCorridor => ({
    centerMm: scale(unit(center), radius),
    radiusMm: extent + f.threadRadiusMm + f.corridorMarginMm,
    maxDepthMm: depth + f.threadRadiusMm + f.corridorMarginMm,
  });

  // Start below the sphere; its finite tail and emergence are actual path spans.
  const startExit = layFrom[0];
  const startUnit = unit(startExit);
  const startDirection = arcTangent(startExit, layTo[0]);
  const tailRadius = radius - f.tailDepthMm;
  const leadAngle = f.tailLeadMm / radius;
  const tailAngle = f.tailLengthMm / radius;
  const startJoinUnit = move(startUnit, startDirection, -leadAngle);
  const startJoin = scale(startJoinUnit, tailRadius);
  const startAnchor = scale(move(startUnit, startDirection, -leadAngle - tailAngle), tailRadius);
  const startTangent = arcTangent(startJoin, startExit);
  const leadHandle = f.tailLeadMm / 3;
  const startOp = operation("start", 0);
  span(startOp, "buried", { kind: "arc", from: startAnchor, to: startJoin });
  span(startOp, "piercing", bezier(
    startJoin, add(startJoin, scale(startTangent, leadHandle)),
    add(startExit, scale(startDirection, -leadHandle)), startExit,
  ), corridorAt(startExit, f.tailLeadMm + f.tailDepthMm, f.tailDepthMm));

  for (let i = 0; i < 8; i++) {
    const markIndex = (i + 1) % 8;
    const frame = frames[markIndex];
    const op = operation("lay", i + 1);
    span(op, "surface", { kind: "arc", from: layFrom[i], to: layTo[i] });
    const catchOp = operation("catch", i + 1, markIndex);
    const enter = frame.enter;
    const exit = markIndex === 0 ? finishExit : frame.exit;
    const incoming = scale(arcTangent(enter, layFrom[i]), -1);
    const outgoing = markIndex === 0 ? finishDirection : arcTangent(exit, layTo[markIndex]);
    const bottom = scale(frame.m, radius - f.catchDepthMm);
    const controls1 = [enter, add(enter, scale(incoming, f.catchEndHandleMm)),
      add(bottom, scale(frame.q, -f.catchBottomHandleMm)), bottom] as const;
    const controls2 = [bottom, add(bottom, scale(frame.q, f.catchBottomHandleMm)),
      add(exit, scale(outgoing, -f.catchEndHandleMm)), exit] as const;
    // A single transverse crossing is guaranteed by the Bézier convex hull sides.
    if (controls1.slice(0, 3).some((p) => dot(p, frame.q) >= 0) ||
        controls2.slice(1).some((p) => dot(p, frame.q) <= 0)) {
      throw new RangeError("catch handles would reverse the transverse marking crossing");
    }
    const corridor = corridorAt(frame.m,
      f.halfBiteMm + f.catchEndHandleMm + f.catchDepthMm + (markIndex === 0 ? f.seamOffsetMm : 0),
      f.catchDepthMm);
    span(catchOp, "piercing", { kind: "bezier", controls: controls1 }, corridor);
    span(catchOp, "piercing", { kind: "bezier", controls: controls2 }, corridor);
  }

  // The final catch exits next to, not on top of, the start. Hide a separate tail.
  const finishUnit = unit(finishExit);
  const finishJoinUnit = move(finishUnit, finishDirection, leadAngle);
  const finishJoin = scale(finishJoinUnit, tailRadius);
  const finishTangent = scale(arcTangent(finishJoin, finishExit), -1);
  const transferOp = operation("transfer", 8);
  span(transferOp, "piercing", bezier(
    finishExit, add(finishExit, scale(finishDirection, leadHandle)),
    add(finishJoin, scale(finishTangent, -leadHandle)), finishJoin,
  ), corridorAt(finishExit, f.tailLeadMm + f.tailDepthMm, f.tailDepthMm));
  const finishMid = scale(move(finishUnit, finishDirection, leadAngle + tailAngle / 2), tailRadius);
  span(transferOp, "buried", { kind: "arc", from: finishJoin, to: finishMid });
  const finishOp = operation("finish", 8);
  const finishAnchor = scale(move(finishUnit, finishDirection, leadAngle + tailAngle), tailRadius);
  span(finishOp, "buried", { kind: "arc", from: finishMid, to: finishAnchor });

  return {
    kind: "engineering-thread-path",
    bodyRadiusMm: radius,
    threadId,
    threadRadiusMm: f.threadRadiusMm,
    spans, operations, marks,
    supports: frames.map((frame, i) => ({
      id: `support-${i + 1}`,
      circleId: marks[i].circleId,
      radiusMm: f.supportRadiusMm,
      curve: {
        kind: "arc",
        from: scale(move(frame.m, frame.v, -f.supportHalfLengthMm / radius), radius + f.supportRadiusMm),
        to: scale(move(frame.m, frame.v, f.supportHalfLengthMm / radius), radius + f.supportRadiusMm),
      },
    })),
    fixture: { circumferenceMm: input.circumferenceMm, innerMm: input.innerMm, outerMm: input.outerMm, ...f },
    assumptions: [
      "Engineering fixture dimensions, not measured material properties or GT55 geometry.",
      "One round and one open working thread; no next-row or over-bundle model.",
      "Only eight short marking arcs are physical supports; the remaining grid is guide-only.",
      "Buried endpoints are fixed boundary conditions; anchoring strength and equilibrium are not modelled.",
      "Piercing is allowed only inside the explicit local depth-bounded corridors.",
      "Path construction requires independent curvature, body and collision validation.",
    ],
  };
}
