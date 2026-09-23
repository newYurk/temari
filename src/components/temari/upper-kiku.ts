import { boundCurvatureTimesRadius } from './curvature-bound';
import { KIKU_8_POINT } from './kagari';
import { traceKagariOperations, type KagariTrace } from './kagari-topology';
import { compileKiku } from './patterns';
import { interThreadClearance } from './s8-kiku-ab';
import { planS8Kiku, type S8KikuPlan } from './s8-kiku';
import { solveSpatialContact, type SpatialSupport } from './spatial-contact';
import { fitSpatialSeed } from './spatial-spline-seed';
import { curvesLength, settleSolve, shapeDifferenceMm, THICK_ROPE_LADDER } from './thick-rope-ladder';
import { validateThreadCrossings } from './thread-crossings';
import { validateThreadCoupon } from './thread-geometry';
import type { C8ThreadCoupon, ThreadCurve, ThreadOperation, ThreadSpan } from './thread-path';

export const UPPER_KIKU_MODEL = 'upper-whole-span-v1';
export const UPPER_KIKU_FACTORS = Object.freeze([1.5, 2, 2.5]);
const R = 240 / (2 * Math.PI), radius = .355, depth = 6 * radius, clearance = .003;
export const UPPER_KIKU_INPUT = Object.freeze({
  stage: 'row2' as const,
  circumferenceMm: 240,
  threadRadiusMm: .355,
  minBendRadiusMm: 1.25 * .355,
  markingRadiusMm: .1,
  outerFractionOfQuarter: 2 / 3 + .71 / 60,
  // A thread-width arc on the surface is narrower at the depth of the return.
  // This is an engineering separation rule; clearance is checked independently.
  rowAdvanceMm: (2 * radius + 2 * clearance) * R / (R - depth),
  lowerRowAdvanceMm: 2,
  halfBiteMm: 3 * .355,
  wrapHalfBiteMm: 5 * .355,
  depthMm: 6 * .355,
  biteEndHandleMm: 4 * .355,
  biteBottomHandleMm: 4 * .355,
});

export type UpperVisit = {
  row: number;
  incoming: KagariTrace;
  outgoing: KagariTrace;
  /** Cuts inside existing lower needle passages, not thread starts or colour changes. */
  boundaries: { enteringPassage: string; leavingPassage: string };
  incomingSeed: ThreadCurve[];
  outgoingSeed: ThreadCurve[];
};

export function planUpperKiku() {
  const geometry = planS8Kiku(UPPER_KIKU_INPUT);
  const traces = traceKagariOperations(compileKiku('simple', 'out', 'even', 0, 0, 2, 0), KIKU_8_POINT.id);
  const at = (row: number, mark: string) => {
    const trace = traces.find(t => t.operationId.endsWith(`/r${row}/${mark}`));
    if (!trace) throw new Error(`Missing upper control operation r${row}/${mark}.`);
    return trace;
  };
  const seed = (row: number, to: number) => {
    const i = geometry.legs.findIndex(l => l.to.row === row && l.to.tip === to);
    if (i < 0) throw new Error(`Missing complete upper control leg r${row}/${to}.`);
    return geometry.legPieces[i].flatMap(p => p.kind === 'arc' ? [p.curve] : p.window.seed);
  };
  const visits: UpperVisit[] = [0, 1].map(row => ({
    row, incoming: at(row, 'inner-2'), outgoing: at(row, 'outer-3'),
    boundaries: { enteringPassage: at(row, 'outer-1').operationId, leavingPassage: at(row, 'outer-3').operationId },
    incomingSeed: seed(row, 2), outgoingSeed: seed(row, 3),
  }));
  return { geometry, visits };
}

/** Local fragment bounds delimit observation, not the material identity or real execution. */
export function upperFragment(plan: S8KikuPlan, visit: UpperVisit, incoming: readonly ThreadCurve[], outgoing: readonly ThreadCurve[]): C8ThreadCoupon {
  const { row } = visit, operations: ThreadOperation[] = [], spans: ThreadSpan[] = [];
  const append = (id: string, kind: ThreadOperation['kind'], curves: readonly ThreadCurve[], tip?: number) => {
    const step = row * 5 + operations.length;
    const operation: ThreadOperation = { id, order: step, step, kind, spanIds: [] };
    operations.push(operation);
    const corridor = tip === undefined ? undefined
      : plan.hullCorridor(curves, plan.markOf({ tip, row }), plan.d.depthMm + plan.r + plan.d.corridorMarginMm);
    curves.forEach((curve, i) => {
      const span: ThreadSpan = { id: `${id}/${i}`, opId: id, threadId: visit.incoming.threadId,
        step, zone: tip === undefined ? 'surface' : 'piercing', curve, ...(corridor ? { corridor } : {}) };
      spans.push(span); operation.spanIds.push(span.id);
    });
  };
  append(`${visit.boundaries.enteringPassage}/fragment-entry`, 'start', [plan.bite({ tip: 1, row })[1]], 1);
  append(`${visit.incoming.operationId}/incoming`, 'lay', incoming);
  append(`${visit.incoming.operationId}/return`, 'catch', plan.bite({ tip: 2, row }), 2);
  append(`${visit.outgoing.operationId}/outgoing`, 'lay', outgoing);
  append(`${visit.boundaries.leavingPassage}/fragment-exit`, 'finish', [plan.bite({ tip: 3, row })[0]], 3);
  return {
    kind: 'engineering-thread-path', bodyRadiusMm: plan.R, threadRadiusMm: plan.r,
    threadId: visit.incoming.threadId, spans, operations, supports: plan.supports, marks: [],
    fixture: { ...plan.d, upperTip: 2, row },
    assumptions: [
      'One ordinary upper point, two visits of the SAME thread. The rest of each round is omitted, not joined or solved.',
      'Start/finish delimit this observed fragment inside lower needle passages; they are not real thread anchors.',
      'Needle passages and ports are prescribed engineering boundary data, not recovered from photographs.',
      'Every complete exposed leg is optimised; window bumps belong only to the initial guess.',
      'Round rigid section, fixed earlier material, no friction, compression or calibrated bending stiffness.',
      'Numerical obstacle inflation is .003 mm, not measured compression.',
      'Craft topology remains partial: incoming-over and buried-return-under are sourced; a complete outgoing crossing map is not.',
    ],
  };
}

function supportsFor(plan: S8KikuPlan, previous: readonly C8ThreadCoupon[], incoming?: readonly ThreadCurve[]): SpatialSupport[] {
  const margin = plan.d.numericalClearanceMm;
  const supports: SpatialSupport[] = [];
  const append = (id: string, curves: readonly ThreadCurve[], radiusMm: number) => {
    const pieces = curves.flatMap(c => c.kind === 'bezier' ? [c.controls] : []);
    if (pieces.length) supports.push({ id, kind: 'curve', piecesMm: pieces, radiusMm: radiusMm + margin });
    curves.forEach((c, i) => {
      if (c.kind === 'arc') supports.push({ id: `${id}/arc-${i}`, kind: 'arc',
        centerMm: [0, 0, 0], fromMm: c.from, toMm: c.to, radiusMm: radiusMm + margin });
    });
  };
  plan.supports.forEach(s => append(s.id, [s.curve], s.radiusMm));
  previous.forEach(c => c.operations.forEach(op => append(op.id, c.spans.filter(s => s.opId === op.id).map(s => s.curve), c.threadRadiusMm)));
  if (incoming) append('current-incoming', incoming, plan.r);
  return supports;
}

export function upperIncomingCrossing(earlier: C8ThreadCoupon, later: C8ThreadCoupon) {
  const incoming = later.operations.find(op => op.id.endsWith('/incoming'));
  const outgoing = earlier.operations.find(op => op.id.endsWith('/outgoing'));
  if (!incoming || !outgoing || !incoming.spanIds.length || !outgoing.spanIds.length)
    throw new Error('Upper incoming crossing requires two complete, identified branches.');
  const chain = (ids: string[]) => ids.map(spanId => ({ spanId, t0: 0, t1: 1 }));
  // Only the crossing checker sees this carrier; disconnected visits are never
  // passed to the single continuous-thread path validator.
  return validateThreadCrossings({ ...later, spans: [...earlier.spans, ...later.spans],
    operations: [...earlier.operations, ...later.operations],
    crossings: [{ id: 'I2-over-O1', opId: incoming.id, working: chain(incoming.spanIds),
      target: { id: outgoing.spanIds[0], t0: 0, t1: 1 }, targetChain: chain(outgoing.spanIds), pass: 'over' }] }, .001);
}

export function computeUpperKiku(progress: (message: string) => void = () => {}) {
  const { geometry: plan, visits } = planUpperKiku();
  const diagnostics: string[] = [];
  let rejected = false;
  const previous: C8ThreadCoupon[] = [];
  const byRow = visits.map(visit => {
    const resolutions = UPPER_KIKU_FACTORS.map(factor => {
      const solve = (seed: ThreadCurve[], supports: SpatialSupport[]) => {
        const minimumSpans = Math.ceil(curvesLength(seed) / plan.d.minBendRadiusMm);
        const controlCount = Math.ceil(minimumSpans * factor) + 3;
        if (controlCount > THICK_ROPE_LADDER.maxControls) throw new RangeError('Whole upper leg exceeds the declared spline budget.');
        const settled = settleSolve(controlPointsMm => solveSpatialContact({
          controlPointsMm, supports, body: { centerMm: [0, 0, 0], radiusMm: plan.R + clearance },
          threadRadiusMm: plan.r, minBendRadiusMm: plan.d.minBendRadiusMm,
          options: { maxIterations: 8000, maxOuterIterations: 60, feasibilityToleranceMm: .0001,
            stationarityTolerance: 2e-6, complementarityToleranceMm: 5e-7, maxConstraintSamples: 4096 },
        }), fitSpatialSeed(seed, controlCount), .0001, 4);
        return { controlCount, minimumSpans, supports, result: settled.result, restarts: settled.restarts, settleMoveMm: settled.moveMm };
      };
      progress(`Разрешение ${factor}, ряд ${visit.row + 1}: целый входящий пролёт.`);
      const incoming = solve(visit.incomingSeed, supportsFor(plan, previous));
      progress(`Разрешение ${factor}, ряд ${visit.row + 1}: целый выходящий пролёт.`);
      const outgoing = solve(visit.outgoingSeed, supportsFor(plan, previous, incoming.result.curves));
      for (const [branch, check] of [['incoming', incoming], ['outgoing', outgoing]] as const) {
        if (check.result.status !== 'converged' || !(check.settleMoveMm <= .0001))
          diagnostics.push(`${factor}/r${visit.row}/${branch}: ${check.result.status}, settle=${check.settleMoveMm} mm.`);
        rejected ||= check.result.status === 'failed';
      }
      progress(`Разрешение ${factor}, ряд ${visit.row + 1}: независимая проверка полного фрагмента.`);
      const coupon = upperFragment(plan, visit, incoming.result.curves, outgoing.result.curves);
      const validation = validateThreadCoupon(coupon, .001);
      const curvature = boundCurvatureTimesRadius(coupon.spans.map(s => s.curve), plan.r);
      const earlier = previous.map(c => interThreadClearance(c, coupon));
      const crossings = previous.flatMap(c => upperIncomingCrossing(c, coupon));
      if (validation.status !== 'passed') diagnostics.push(`${factor}/r${visit.row}: path ${validation.status}: ${[...new Set(validation.diagnostics.map(d => d.code))].join(', ')}.`);
      if (curvature.status !== 'certified' || !(curvature.upper <= plan.r / plan.d.minBendRadiusMm + .02))
        diagnostics.push(`${factor}/r${visit.row}: curvature not certified within the model bound.`);
      if (earlier.some(c => c.status !== 'passed')) diagnostics.push(`${factor}/r${visit.row}: inter-visit clearance not certified.`);
      if (crossings.length) diagnostics.push(`${factor}/r${visit.row}: incoming-over-previous-outgoing not certified.`);
      rejected ||= validation.status === 'failed' || earlier.some(c => c.status === 'failed') || crossings.some(c => c.severity === 'error');
      return { factor, row: { visit, coupon, incoming, outgoing,
        fixedEarlierFactor: previous.length ? UPPER_KIKU_FACTORS.at(-1)! : null,
        checks: { validation, curvature, earlier, crossings } } };
    });
    // Earlier material is fixed boundary data, identical at all resolutions of
    // the next visit. Never compare different obstacle shapes as one solve.
    previous.push(resolutions.at(-1)!.row.coupon);
    return resolutions;
  });
  const levels = UPPER_KIKU_FACTORS.map((factor, i) => ({ factor, rows: byRow.map(row => row[i].row) }));
  const refinements = levels.slice(1).flatMap((level, i) => level.rows.flatMap((row, j) =>
    (['incoming', 'outgoing'] as const).map(branch => {
      const a = levels[i].rows[j][branch].result, b = row[branch].result;
      return { from: levels[i].factor, to: level.factor, row: j, branch,
        lengthDifferenceMm: Math.abs(a.lengthMm - b.lengthMm), shapeDifferenceMm: shapeDifferenceMm(a.curves, b.curves) };
    })));
  for (const r of refinements) {
    if (!(r.lengthDifferenceMm <= .002 && r.shapeDifferenceMm <= .02))
      diagnostics.push(`${r.from}→${r.to}/r${r.row}/${r.branch}: refinement exceeds .002 mm length or .02 mm shape.`);
  }
  return { model: UPPER_KIKU_MODEL, input: UPPER_KIKU_INPUT, factors: UPPER_KIKU_FACTORS,
    status: rejected ? 'rejected' as const : 'unresolved' as const, topologyStatus: 'partial' as const,
    geometryStatus: rejected ? 'failed' as const : diagnostics.length ? 'unresolved' as const : 'passed' as const,
    diagnostics: [...diagnostics, 'The complete outgoing crossing table needs independent craft evidence; this is not an accepted Kiku.'],
    levels, refinements, rows: levels.at(-1)!.rows };
}

export type UpperKikuResult = ReturnType<typeof computeUpperKiku>;
