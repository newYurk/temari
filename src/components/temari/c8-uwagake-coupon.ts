import { createC8ThreadCoupon, C8_THREAD_FIXTURE, type C8ThreadCouponInput } from './c8-thread-coupon';
import { createC8EngineeringCoupon } from './c8-engineering-coupon';
import type { MarkingVector as V } from './local-marking';
import type { C8ThreadCoupon, ThreadCurve, ThreadOperation, ThreadOperationKind, ThreadZone, PiercingCorridor, ThreadCrossing, ThreadCapture } from './thread-path';
/** Deliberate engineering clearances for a rigid circular yarn; not measured craft dimensions. */
export const C8_UWAGAKE_FIXTURE = Object.freeze({
  surfaceClearanceMm: 0.03,
  innerAdvanceMm: 0.6,
  outerAdvanceMm: 1.5,
  wrapHalfWidthMm: 4.2,
  wrapPitchMm: 2,
  wrapTopMm: 1.8,
  wrapDepthMm: 2.2,
  wrapExitLiftMm: 1.2,
  wrapHandleMm: 1.8,
  returnSideExtensionMm: 0.8,
  supportOutwardLengthMm: 6,
  departurePlateauMm: 7,
  departureRampMm: 3,
  outerDepartureRiseMm: 2,
  outerDeparturePlateauMm: 3,
  finalOuterDeparturePlateauMm: 3,
  finalOuterExitHalfBiteMm: 3,
  outerDepartureLiftMm: 1,
  corridorDepthMarginMm: 0.5,
  seamEntryHalfWidthMm: 1.2,
  finalSeamAdvanceMm: 1.4,
  finalSeamHalfWidthMm: 5.8,
  finalSeamEntryHalfWidthMm: 2.5,
  finalSeamEntryLiftMm: 3.5,
  finalSeamApproachRampMm: 5,
  finalSeamTopMm: 3,
  finalSeamDepthMm: 3.2,
  finalExitSideExtensionMm: 1.5,
});
export type C8UwagakeFixture = {
  [K in keyof typeof C8_UWAGAKE_FIXTURE]: number;
};
export type C8UwagakeCouponInput = C8ThreadCouponInput & {
  uwagakeFixture?: Partial<C8UwagakeFixture>;
};
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V) => mul(a, 1 / Math.hypot(...a));
const move = (a: V, t: V, angle: number) => add(mul(a, Math.cos(angle)), mul(t, Math.sin(angle)));
const tangent = (a: V, b: V) => unit(add(unit(b), mul(unit(a), -dot(unit(a), unit(b)))));
const bezier = (a: V, b: V, c: V, d: V): ThreadCurve => ({ kind: 'bezier', controls: [a, b, c, d] });
/** Two chronological rounds. Geometry must pass the independent path/crossing validators. */
export function createC8UwagakeCoupon(input: C8UwagakeCouponInput): C8ThreadCoupon {
  const baseline = createC8ThreadCoupon(input);
  const intent = createC8EngineeringCoupon(input);
  const f = { ...C8_THREAD_FIXTURE, ...input.threadFixture };
  const u = { ...C8_UWAGAKE_FIXTURE, ...input.uwagakeFixture };
  for (const [key, value] of Object.entries(u))
    if (!Number.isFinite(value) || value <= 0)
      throw new RangeError(`${key} must be finite and positive`);
  const R = baseline.bodyRadiusMm, r = f.threadRadiusMm, S = R + r + u.surfaceClearanceMm;
  const sh = r + u.surfaceClearanceMm;
  if (Math.max(u.wrapDepthMm, u.finalSeamDepthMm, u.finalSeamHalfWidthMm + u.finalExitSideExtensionMm) >= R / 2 || u.wrapHalfWidthMm >= input.innerMm || u.outerAdvanceMm >= f.supportHalfLengthMm || u.innerAdvanceMm + 2 * u.wrapPitchMm >= u.supportOutwardLengthMm)
    throw new RangeError('uwagake fixture exceeds its local support neighbourhood');
  const frames = intent.marks.map((mark, i) => {
    const a = mark.distanceMm / R, m = unit(mark.positionMm);
    const v = unit(add(mul(unit(input.center), -Math.sin(a)), mul(intent.rays[i].tangent, Math.cos(a))));
    const q = mul(unit(cross(m, v)), input.handedness);
    // Along is arc length on the marking circle; across is a gnomonic
    // tangent coordinate in mm. Height is the radial centreline offset.
    const point = (along: number, across: number, height: number) => {
      const m1 = move(m, v, along / R);
      return mul(unit(add(m1, mul(q, across / R))), R + height);
    };
    return { m, v, q, point };
  });
  const enter = frames.map((x, i) => i % 2 === 0 ? x.point(u.innerAdvanceMm, -u.wrapHalfWidthMm, sh) : x.point(u.outerAdvanceMm, -f.halfBiteMm, sh));
  const exit = frames.map((x, i) => i % 2 === 0 ? x.point(u.innerAdvanceMm + u.wrapPitchMm, -u.wrapHalfWidthMm, sh + u.wrapExitLiftMm) : x.point(u.outerAdvanceMm, f.halfBiteMm, sh));
  exit[7] = frames[7].point(u.outerAdvanceMm, u.finalOuterExitHalfBiteMm, sh);
  enter[0] = frames[0].point(u.innerAdvanceMm, -u.seamEntryHalfWidthMm, sh);
  const finalEnter = frames[0].point(u.finalSeamAdvanceMm, -u.finalSeamEntryHalfWidthMm, sh + u.finalSeamEntryLiftMm);
  const finalExit = frames[0].point(u.finalSeamAdvanceMm + u.wrapPitchMm, -u.finalSeamHalfWidthMm - u.finalExitSideExtensionMm, sh + u.wrapExitLiftMm);
  // Reuse the first seven stitches and hidden start; retarget the seventh catch exit below.
  const keep = baseline.operations.filter(op => op.step <= 7);
  const keepIds = new Set(keep.flatMap(op => op.spanIds));
  const operations: ThreadOperation[] = keep.map(op => ({ ...op, spanIds: [...op.spanIds], captureIds: op.captureIds ? [...op.captureIds] : undefined }));
  const spans = baseline.spans.filter(s => keepIds.has(s.id)).map(s => ({ ...s }));
  function op(kind: ThreadOperationKind, step: number, mark?: number) {
    const result: ThreadOperation = { id: `uw-op-${operations.length + 1}-${kind}`, order: operations.length, kind, step, spanIds: [], ...(mark === undefined ? {} : { markId: intent.marks[mark].id }) };
    operations.push(result);
    return result;
  }
  function put(operation: ThreadOperation, zone: ThreadZone, curve: ThreadCurve, corridor?: PiercingCorridor) {
    const id = `uw-span-${spans.length + 1}`;
    spans.push({ id, threadId: baseline.threadId, opId: operation.id, step: operation.step, zone, curve, ...(corridor ? { corridor } : {}) });
    operation.spanIds.push(id);
    return id;
  }
  const corridor = (i: number): PiercingCorridor => ({ centerMm: mul(frames[i].m, R), radiusMm: u.innerAdvanceMm + 2 * u.wrapPitchMm + u.wrapHalfWidthMm + u.wrapDepthMm + u.wrapHandleMm + r + 2 * f.corridorMarginMm, maxDepthMm: Math.max(u.wrapDepthMm, u.finalSeamDepthMm) + r + u.corridorDepthMarginMm });
  function lay(operation: ThreadOperation, from: V, to: V, lifted: boolean) {
    const a = unit(from), direction = tangent(from, to), angle = Math.acos(Math.max(-1, Math.min(1, dot(a, unit(to)))));
    if (operation.step === 8) {
      put(operation, 'surface', { kind: 'arc', from, to });
      return;
    }
    const lift = lifted ? u.wrapExitLiftMm : u.outerDepartureLiftMm;
    const rise = lifted ? 0 : u.outerDepartureRiseMm;
    const plateau = lifted ? u.departurePlateauMm : operation.step === 16 ? u.finalOuterDeparturePlateauMm : u.outerDeparturePlateauMm;
    if ((rise + plateau + u.departureRampMm + (operation.step === 16 ? u.finalSeamApproachRampMm : 0)) / R >= angle)
      throw new RangeError('departure lift exceeds the finite flank');
    const at = (s: number, radius: number) => mul(move(a, direction, s / R), radius);
    const dir = (p: V) => tangent(p, to);
    const ramp = (p: V, q: V, length: number) => { const h = length / 3; put(operation, 'surface', bezier(p, add(p, mul(dir(p), h)), add(q, mul(dir(q), -h)), q)); };
    let start = from;
    if (rise) {
      start = at(rise, S + lift);
      ramp(from, start, rise);
    }
    const b = at(rise + plateau, S + lift), c = at(rise + plateau + u.departureRampMm, S);
    put(operation, 'surface', { kind: 'arc', from: start, to: b });
    ramp(b, c, u.departureRampMm);
    if (operation.step === 16) {
      const endRamp = at(angle * R - u.finalSeamApproachRampMm, S);
      put(operation, 'surface', { kind: 'arc', from: c, to: endRamp });
      const h = u.finalSeamApproachRampMm / 3;
      put(operation, 'surface', bezier(endRamp, add(endRamp, mul(dir(endRamp), h)), add(to, mul(tangent(to, from), h)), to));
    }
    else
      put(operation, 'surface', { kind: 'arc', from: c, to });
  }
  function wrap(operation: ThreadOperation, i: number, incoming: V, outgoing: V, final = false) {
    const frame = frames[i], advance = final ? u.finalSeamAdvanceMm : u.innerAdvanceMm, pitch = u.wrapPitchMm;
    const width = final ? u.finalSeamHalfWidthMm : u.wrapHalfWidthMm, depth = final ? u.finalSeamDepthMm : u.wrapDepthMm, top = final ? u.finalSeamTopMm : u.wrapTopMm;
    const E = enter[i], X = final ? finalExit : exit[i];
    const T = frame.point(advance + pitch * .25, 0, r + top);
    const Q = frame.point(advance + pitch * .5, width, -r);
    const B = frame.point(advance + pitch * .75, 0, -depth);
    const td = unit(add(frame.q, mul(frame.v, pitch / (2 * width))));
    const qd = unit(add(mul(unit(Q), -1), mul(frame.v, pitch / (2 * depth))));
    const bd = unit(add(mul(frame.q, -1), mul(frame.v, pitch / (2 * width))));
    const h = u.wrapHandleMm, co = corridor(i);
    put(operation, 'piercing', bezier(E, add(E, mul(incoming, h)), add(T, mul(td, -h)), T), co);
    put(operation, 'piercing', bezier(T, add(T, mul(td, h)), add(Q, mul(qd, -h)), Q), co);
    put(operation, 'piercing', bezier(Q, add(Q, mul(qd, h)), add(B, mul(bd, -h)), B), co);
    const L = frame.point(advance + pitch, -width - u.returnSideExtensionMm, -depth * .55);
    const ld = unit(L);
    put(operation, 'piercing', bezier(B, add(B, mul(bd, h)), add(L, mul(ld, -h)), L), co);
    put(operation, 'piercing', bezier(L, add(L, mul(ld, h)), add(X, mul(outgoing, -h)), X), co);
  }
  const lastBaseline = spans.at(-1)!;
  if (lastBaseline.curve.kind === 'bezier') {
    const p = lastBaseline.curve.controls, end = mul(unit(p[3]), S);
    lastBaseline.curve = bezier(p[0], p[1], add(end, mul(tangent(end, enter[0]), -f.catchEndHandleMm)), end);
  }
  const baselineEnd = spans.at(-1)!.curve;
  let from = baselineEnd.kind === 'arc' ? baselineEnd.to : baselineEnd.controls[3];
  for (let step = 8; step <= 16; step++) {
    const i = step % 8, last = step === 16;
    const E = last ? finalEnter : enter[i];
    const layOp = op('lay', step);
    lay(layOp, from, E, step > 8 && (i - 1 + 8) % 8 % 2 === 0);
    const catchOp = op('catch', step, i);
    const incoming = mul(tangent(E, from), -1);
    const X = last ? finalExit : exit[i];
    const nextEnter = step === 15 ? finalEnter : enter[(i + 1) % 8];
    const outgoing = last ? unit(add(mul(frames[0].q, -1), mul(unit(X), dot(frames[0].q, unit(X))))) : tangent(X, nextEnter);
    if (i % 2 === 0) {
      // The seam uses the same progression as the subsequent upper wraps.
      if (last)
        enter[i] = E;
      wrap(catchOp, i, incoming, outgoing, last);
    }
    else {
      const B = frames[i].point(u.outerAdvanceMm, 0, -f.catchDepthMm);
      put(catchOp, 'piercing', bezier(E, add(E, mul(incoming, f.catchEndHandleMm)), add(B, mul(frames[i].q, -f.catchBottomHandleMm)), B), corridor(i));
      put(catchOp, 'piercing', bezier(B, add(B, mul(frames[i].q, f.catchBottomHandleMm)), add(X, mul(outgoing, -f.catchEndHandleMm)), X), corridor(i));
      catchOp.captureIds = [`support-${i + 1}`];
      catchOp.pass = 'under';
    }
    from = X;
  }
  const finishDirection = unit(add(mul(frames[0].q, -1), mul(unit(finalExit), dot(frames[0].q, unit(finalExit)))));
  const tailRadius = R - f.tailDepthMm;
  const join = mul(move(unit(finalExit), finishDirection, f.tailLeadMm / R), tailRadius);
  const middle = mul(move(unit(finalExit), finishDirection, (f.tailLeadMm + f.tailLengthMm / 2) / R), tailRadius);
  const anchor = mul(move(unit(finalExit), finishDirection, (f.tailLeadMm + f.tailLengthMm) / R), tailRadius);
  const transfer = op('transfer', 16), h = f.tailLeadMm / 3;
  put(transfer, 'piercing', bezier(finalExit, add(finalExit, mul(finishDirection, h)), add(join, mul(tangent(join, finalExit), h)), join), { centerMm: mul(unit(finalExit), R), radiusMm: f.tailLeadMm + f.tailDepthMm + u.wrapExitLiftMm + r + 2 * f.corridorMarginMm, maxDepthMm: f.tailDepthMm + r + 2 * f.corridorMarginMm });
  put(transfer, 'buried', { kind: 'arc', from: join, to: middle });
  put(op('finish', 16), 'buried', { kind: 'arc', from: middle, to: anchor });
  // The completed bite ends at the buried side point L. Its final emergence
  // belongs to the next lay: this keeps a crossing that moves across the G1
  // emergence/surface join inside one operation for every body size.
  for (const step of [8, 10, 12, 14]) {
    const catchOp = operations.find(x => x.step === step && x.kind === 'catch')!;
    const nextLay = operations.find(x => x.step === step + 1 && x.kind === 'lay')!;
    const id = catchOp.spanIds.pop()!;
    nextLay.spanIds.unshift(id);
    const emergence = spans.find(x => x.id === id)!;
    emergence.opId = nextLay.id;
    emergence.step = nextLay.step;
  }
  const crossings: ThreadCrossing[] = [], captures: ThreadCapture[] = [];
  const operationAt = (step: number, kind: ThreadOperationKind) => operations.find(x => x.step === step && x.kind === kind)!;
  const firstSurface = (operation: ThreadOperation) => operation.spanIds.find(id => spans.find(s => s.id === id)!.zone === 'surface')!;
  const finite = (id: string) => ({ id, t0: 0, t1: 1 });
  const windows = (ids: string[]) => ids.map(spanId => ({ spanId, t0: 0, t1: 1 }));
  const secondRowDeparture = firstSurface(operationAt(9, 'lay'));
  for (const operation of operations.filter(x => x.kind === 'catch')) {
    const step = operation.step, mark = step % 8;
    const upper = step >= 8 && mark % 2 === 0;
    const targets = [finite(`support-${mark + 1}`)];
    if (upper) {
      if (step === 8) {
        // Only the initial outgoing flank exists before the first seam catch.
        targets.push(finite(firstSurface(operationAt(1, 'lay'))));
      } else {
        targets.push(finite(firstSurface(operationAt(mark === 0 ? 8 : mark, 'lay'))));
        targets.push(finite(firstSurface(operationAt(mark + 1, 'lay'))));
        if (step === 16) targets.push(finite(secondRowDeparture));
      }
    }
    const overCrossingIds: string[] = [], underCrossingIds: string[] = [];
    for (const target of targets) {
      const underId = `cross-${step}-${target.id}-under`;
      const underSpans = upper ? operation.spanIds.slice(2, 4) : operation.spanIds;
      crossings.push({ id: underId, opId: operation.id, target, pass: 'under', working: windows(underSpans) });
      underCrossingIds.push(underId);
      if (!target.id.startsWith('support-')) {
        const id = `cross-${step}-${target.id}-over`;
        // The final incoming flank crosses the prior raised departure before
        // the final catch crosses the two older flanks and goes beneath all three.
        const approach = step === 16 && target.id === secondRowDeparture ? operationAt(16, 'lay') : operation;
        const above = approach === operation ? operation.spanIds.slice(0, 2) : approach.spanIds;
        crossings.push({ id, opId: approach.id, target, pass: 'over', working: windows(above) });
        overCrossingIds.push(id);
      }
    }
    operation.captureIds = targets.map(x => x.id);
    captures.push({ id: `capture-${step}`, opId: operation.id, targets, overCrossingIds, underCrossingIds });
  }
  // These are additional crossings, not extra members of a capture. In
  // particular a later over passage must not replace the earlier over→under.
  const extra = (id: string, operation: ThreadOperation, ids: string[], targetId: string, pass: 'over' | 'under') => {
    crossings.push({ id, opId: operation.id, working: windows(ids), target: finite(targetId), pass });
  };
  const incomingFirstSeam = firstSurface(operationAt(8, 'lay'));
  extra('extra-seam8-under-incoming', operationAt(8, 'catch'), [operationAt(8, 'catch').spanIds[3]], incomingFirstSeam, 'under');
  extra('extra-departure9-over-incoming', operationAt(9, 'lay'), [firstSurface(operationAt(9, 'lay'))], incomingFirstSeam, 'over');
  for (const step of [9, 11, 13, 15]) {
    const layOp = operationAt(step, 'lay');
    extra(`extra-departure${step}-over-support`, layOp, [firstSurface(layOp)], `support-${step - 8}`, 'over');
  }
  for (const step of [11, 13, 15]) {
    const layOp = operationAt(step, 'lay');
    extra(`extra-emergence${step}-over-old-incoming`, layOp, layOp.spanIds.slice(0, 2), firstSurface(operationAt(step - 9, 'lay')), 'over');
  }
  const finalLay = operationAt(16, 'lay'), finalCatch = operationAt(16, 'catch');
  extra('extra-final-approach-over-old-incoming', finalLay, [finalLay.spanIds.at(-1)!], incomingFirstSeam, 'over');
  extra('extra-final-return-under-current-incoming', finalCatch, [finalCatch.spanIds[3]], finalLay.spanIds.at(-1)!, 'under');
  extra('extra-finish-under-old-flank', transfer, [transfer.spanIds[0]], firstSurface(operationAt(7, 'lay')), 'under');
  extra('extra-finish-under-new-flank', transfer, [transfer.spanIds[1]], operationAt(15, 'lay').spanIds.at(-1)!, 'under');
  return {
    ...baseline,
    supports: baseline.supports.map((support, i) => ({
      ...support,
      curve: {
        kind: 'arc' as const,
        from: support.curve.kind === 'arc' ? support.curve.from : support.curve.controls[0],
        to: mul(move(frames[i].m, frames[i].v, u.supportOutwardLengthMm / R), R + f.supportRadiusMm),
      },
    })),
    spans, operations, crossings, captures,
    fixture: { ...baseline.fixture, ...u, rounds: 2 },
    assumptions: [
      ...baseline.assumptions.filter(s => !s.startsWith('One round')),
      'Two-round experimental uwagake route; dimensions are engineering assumptions and require independent validation.',
      'Raised crossings describe a static clearance construction, not the equilibrium shape of a tensioned thread.',
      'The eight marks remain the first-row reference marks; later needle routes use the explicit fixture offsets.',
    ],
  };
}
