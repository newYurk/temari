import { boundCurvatureTimesRadius } from './curvature-bound';
import { KIKU_8_POINT } from './kagari';
import { traceKagariOperations } from './kagari-topology';
import { compileKiku } from './patterns';
import { planS8Kiku } from './s8-kiku';
import { interThreadClearance } from './s8-kiku-ab';
import { curveDerivative, evaluateCurve, validateThreadCoupon } from './thread-geometry';
import { curvesLength, THICK_ROPE_LADDER } from './thick-rope-ladder';
import { UPPER_KIKU_FACTORS, UPPER_KIKU_INPUT } from './upper-kiku';
import type { C8ThreadCoupon, MarkingSupport, PathValidation, PointMm, ThreadCurve, ThreadSpan, ThreadWindow } from './thread-path';

export const UPPER_BUNDLE_MODEL = 'upper-bundle-seed-v1';
export type UpperBundlePort = {
  id: string; positionMm: PointMm; tangent: PointMm; spanId: string; t: 0 | 1;
};
export type UpperBundleBoundary = UpperBundlePort & {
  kind: 'observation-cut'; sourceOperationId: string; exchange: 'unspecified';
};
export type UpperBundleOperation = {
  id: string; sourceOperationId: string; sourceOrder: number; substep: 0 | 1;
  role: 'entry-boundary' | 'incoming' | 'return' | 'outgoing' | 'exit-boundary';
  spanIds: string[];
};
export type UpperBundleVisit = {
  /** Zero based visit index; diagnostic row colours do not change thread identity. */
  row: number; id: string; threadId: string; spanIds: string[];
  incomingSpanIds: string[]; returnSpanIds: string[]; outgoingSpanIds: string[];
  sourceOrders: { enteringPassage: number; upperCatch: number; leavingPassage: number };
  operations: UpperBundleOperation[];
  /** Exact endpoints of the prescribed return, outside the base by the port guard. Not measured punctures. */
  ports: { entry: UpperBundlePort; exit: UpperBundlePort };
  boundaries: { entry: UpperBundleBoundary; exit: UpperBundleBoundary };
  /** Length of the displayed engineering reference, not a conserved/rest material length. */
  referenceGeometryLengthMm: number;
};
export type UpperBundle = {
  id: string; model: typeof UPPER_BUNDLE_MODEL;
  status: 'unresolved'; mechanics: 'not-solved'; topology: 'partial'; geometryState: 'seed';
  bodyRadiusMm: number; threadRadiusMm: number; section: { kind: 'round'; radiusMm: number };
  focusMm: PointMm; spans: ThreadSpan[]; supports: MarkingSupport[]; visits: UpperBundleVisit[];
  input: Record<string, number | string>;
  referenceGeometryLengthMm: number;
  omittedContinuations: {
    id: string; threadId: string; fromBoundaryId: string | null; toBoundaryId: string | null;
    geometry: 'not-represented'; contacts: 'not-checked'; materialLength: 'unknown';
  }[];
  constraints: {
    earlierExposedMaterial: 'intended-movable-not-solved';
    hiddenPassages: 'prescribed-engineering-geometry';
    boundaryExchange: 'unspecified'; materialLength: 'reference-only-not-rest-length';
  };
  /** Recipe intent names finite branches; these are not established geometric captures. */
  captureCandidates: {
    id: string; visitId: string; sourceOperationId: string;
    expectation: 'recipe-declared-bundle'; status: 'candidate-not-verified';
    branches: { visitId: string; branch: 'incoming' | 'outgoing'; windows: ThreadWindow[] }[];
  }[];
  /** A side rule where an actual transverse crossing exists, not a claim that it must exist. */
  crossingRequirements: {
    id: string; workingVisitId: string; targetVisitId: string;
    working: ThreadWindow[]; target: ThreadWindow[]; pass: 'over';
    applicability: 'if-transverse-crossing-exists'; status: 'not-checked'; source: string;
  }[];
  assumptions: string[];
};

const unit = (p: PointMm): PointMm => {
  const n = Math.hypot(...p);
  if (!(n > 0)) throw new RangeError('An observation boundary must have a nonzero tangent.');
  return [p[0] / n, p[1] / n, p[2] / n];
};
const windows = (ids: readonly string[]): ThreadWindow[] => ids.map(spanId => ({ spanId, t0: 0, t1: 1 }));

/** Cheap, serializable seed construction. No numerical solve or material relaxation occurs here. */
export function buildUpperBundle(): UpperBundle {
  const input = { ...UPPER_KIKU_INPUT, rows: 3 };
  const plan = planS8Kiku(input);
  const traces = traceKagariOperations(compileKiku('simple', 'out', 'even', 0, 0, 3, 0), KIKU_8_POINT.id);
  const at = (row: number, mark: string) => {
    const trace = traces.find(t => t.operationId.endsWith(`/r${row}/${mark}`));
    if (!trace) throw new Error(`Missing source operation r${row}/${mark}.`);
    return trace;
  };
  const seed = (row: number, to: number): ThreadCurve[] => {
    const i = plan.legs.findIndex(l => l.to.row === row && l.to.tip === to);
    if (i < 0) throw new Error(`Missing whole reference leg r${row}/${to}.`);
    return plan.legPieces[i].flatMap(p => p.kind === 'arc' ? [p.curve] : p.window.seed);
  };
  const spans: ThreadSpan[] = [];
  const byId = new Map<string, ThreadSpan>();
  const port = (id: string, spanId: string, t: 0 | 1): UpperBundlePort => {
    const span = byId.get(spanId)!;
    return { id, spanId, t, positionMm: evaluateCurve(span.curve, t), tangent: unit(curveDerivative(span.curve, t)) };
  };
  const visits: UpperBundleVisit[] = [0, 1, 2].map(row => {
    const left = at(row, 'outer-1'), upper = at(row, 'inner-2'), right = at(row, 'outer-3');
    const id = `${upper.threadId}/ordinary-upper/r${row}`;
    const operations: UpperBundleOperation[] = [];
    const append = (role: UpperBundleOperation['role'], source: typeof upper, substep: 0 | 1,
      curves: ThreadCurve[], tip?: number): string[] => {
      const op: UpperBundleOperation = { id: `${id}/${role}`, sourceOperationId: source.operationId,
        sourceOrder: source.order, substep, role, spanIds: [] };
      operations.push(op);
      const corridor = tip === undefined ? undefined
        : plan.hullCorridor(curves, plan.markOf({ tip, row }), plan.d.depthMm + plan.r + plan.d.corridorMarginMm);
      curves.forEach((curve, i) => {
        const span: ThreadSpan = { id: `${op.id}/${i}`, threadId: upper.threadId, opId: op.id,
          step: source.order, zone: tip === undefined ? 'surface' : 'piercing', curve, ...(corridor ? { corridor } : {}) };
        op.spanIds.push(span.id); spans.push(span); byId.set(span.id, span);
      });
      return op.spanIds;
    };
    const entering = append('entry-boundary', left, 1, [plan.bite({ tip: 1, row })[1]], 1);
    const incoming = append('incoming', upper, 0, seed(row, 2));
    const returning = append('return', upper, 1, plan.bite({ tip: 2, row }), 2);
    const outgoing = append('outgoing', right, 0, seed(row, 3));
    const leaving = append('exit-boundary', right, 1, [plan.bite({ tip: 3, row })[0]], 3);
    const spanIds = operations.flatMap(op => op.spanIds);
    return { id, row, threadId: upper.threadId, spanIds, incomingSpanIds: incoming, returnSpanIds: returning, outgoingSpanIds: outgoing,
      sourceOrders: { enteringPassage: left.order, upperCatch: upper.order, leavingPassage: right.order }, operations,
      ports: { entry: port(`${id}/entry-port`, returning[0], 0), exit: port(`${id}/exit-port`, returning.at(-1)!, 1) },
      boundaries: {
        entry: { ...port(`${id}/observation-entry`, entering[0], 0), kind: 'observation-cut', sourceOperationId: left.operationId, exchange: 'unspecified' },
        exit: { ...port(`${id}/observation-exit`, leaving.at(-1)!, 1), kind: 'observation-cut', sourceOperationId: right.operationId, exchange: 'unspecified' },
      },
      referenceGeometryLengthMm: curvesLength(spanIds.map(spanId => byId.get(spanId)!.curve)),
    };
  });
  const omittedContinuations: UpperBundle['omittedContinuations'] = Array.from({ length: visits.length + 1 }, (_, i) => ({
    id: `omitted-${i}`, threadId: visits[0].threadId,
    fromBoundaryId: i ? visits[i - 1].boundaries.exit.id : null,
    toBoundaryId: i < visits.length ? visits[i].boundaries.entry.id : null,
    geometry: 'not-represented', contacts: 'not-checked', materialLength: 'unknown',
  }));
  const captureCandidates: UpperBundle['captureCandidates'] = visits.slice(1).map(visit => {
    const trace = at(visit.row, 'inner-2');
    const earlier = visits.filter(v => trace.overOperations.includes(at(v.row, 'inner-2').operationId));
    return { id: `${visit.id}/capture-intent`, visitId: visit.id, sourceOperationId: trace.operationId,
      expectation: 'recipe-declared-bundle', status: 'candidate-not-verified',
      branches: earlier.flatMap(v => (['incoming', 'outgoing'] as const).map(branch => ({ visitId: v.id, branch,
        windows: windows(branch === 'incoming' ? v.incomingSpanIds : v.outgoingSpanIds) }))),
    };
  });
  const crossingRequirements: UpperBundle['crossingRequirements'] = visits.flatMap(visit => visits.filter(v => v.row < visit.row).map(earlier => ({
    id: `${visit.id}/incoming-over/${earlier.id}/outgoing`, workingVisitId: visit.id, targetVisitId: earlier.id,
    working: windows(visit.incomingSpanIds), target: windows(earlier.outgoingSpanIds), pass: 'over',
    applicability: 'if-transverse-crossing-exists', status: 'not-checked',
    source: 'https://www.temarikai.com/HowToPages/ToolKit/uwagakechidori.html',
  })));
  return { id: 's8-ordinary-upper-three-visits', model: UPPER_BUNDLE_MODEL,
    status: 'unresolved', mechanics: 'not-solved', topology: 'partial', geometryState: 'seed',
    bodyRadiusMm: plan.R, threadRadiusMm: plan.r, section: { kind: 'round', radiusMm: plan.r },
    focusMm: plan.markOf({ tip: 2, row: 1 }), spans, supports: plan.supports, visits, input,
    referenceGeometryLengthMm: visits.reduce((sum, v) => sum + v.referenceGeometryLengthMm, 0),
    omittedContinuations, captureCandidates, crossingRequirements,
    constraints: { earlierExposedMaterial: 'intended-movable-not-solved', hiddenPassages: 'prescribed-engineering-geometry',
      boundaryExchange: 'unspecified', materialLength: 'reference-only-not-rest-length' },
    assumptions: [
      'Three separated visits of one physical thread at an ordinary S8 upper point. Omitted continuations are not joined or checked.',
      'Displayed paths are engineering seeds from the whole-span planner, not relaxed geometry or a confirmed copy of the studio recipe ports.',
      'Geometry and thickness are expressed in millimetres. The round section is identical for checks and rendering.',
      'Ports are the endpoints of the prescribed hidden return, outside the mari by the declared guard; they are not measured surface punctures.',
      'Observation cuts lie inside the neighbouring lower needle passages and do not introduce physical starts, finishes, or anchors.',
      'Earlier exposed branches are intended to move in a future coupled model. No relaxation, force balance, or thread-length conservation has been solved.',
      'Material exchange at every observation cut is unspecified. Reference geometry lengths are neither rest lengths nor full-thread consumption.',
      'Prescribed hidden passages, fixed sphere, round rigid yarn, and marking supports are engineering boundary data, not calibrated material mechanics.',
      'Capture candidates and conditional crossing rules record partial recipe intent; they are not verified geometric captures.',
    ],
  };
}

/**
 * Legacy validator adapter for ONE connected visit. Synthetic start/finish
 * belong only to this adapter and mean observation cuts, never material events.
 */
export function toUpperBundleCoupon(bundle: UpperBundle, visitId: string): C8ThreadCoupon {
  const visit = bundle.visits.find(v => v.id === visitId);
  if (!visit) throw new RangeError(`Unknown upper visit ${visitId}.`);
  const byId = new Map(bundle.spans.map(s => [s.id, s]));
  return { kind: 'engineering-thread-path', bodyRadiusMm: bundle.bodyRadiusMm, threadRadiusMm: bundle.threadRadiusMm,
    threadId: visit.threadId, spans: visit.spanIds.map(id => {
      const span = byId.get(id);
      if (!span) throw new RangeError(`Missing upper span ${id}.`);
      return span;
    }),
    operations: visit.operations.map(op => ({ id: op.id, order: 2 * op.sourceOrder + op.substep, step: op.sourceOrder,
      kind: op.role === 'entry-boundary' ? 'start' : op.role === 'exit-boundary' ? 'finish' : op.role === 'return' ? 'catch' : 'lay',
      spanIds: [...op.spanIds] })),
    supports: bundle.supports, marks: [], fixture: { row: visit.row },
    assumptions: [...bundle.assumptions, 'The adapter start/finish are observation boundaries required by the old single-path validator.'],
  };
}

export type UpperBundleLocalChecks = {
  visits: { visitId: string; validation: PathValidation; curvature: ReturnType<typeof boundCurvatureTimesRadius> }[];
  betweenVisits: { earlierVisitId: string; laterVisitId: string; clearance: ReturnType<typeof interThreadClearance> }[];
};

/** Local success cannot promote an unsolved, partially specified material problem to accepted. */
export function judgeUpperBundleAudit(checks: UpperBundleLocalChecks): 'unresolved' | 'rejected' {
  // lower is an evaluated witness; upper >= 1 only means regularity was not
  // certified at this precision. It does not prove a violating curvature.
  return checks.visits.some(v => v.validation.status === 'failed' || v.curvature.lower >= 1)
    || checks.betweenVisits.some(p => p.clearance.status === 'failed') ? 'rejected' : 'unresolved';
}

/** Optional geometry audit of the displayed seeds. It never launches a solver. */
export function auditUpperBundle(bundle: UpperBundle) {
  const coupons = bundle.visits.map(v => toUpperBundleCoupon(bundle, v.id));
  const visits = coupons.map((coupon, i) => ({ visitId: bundle.visits[i].id,
    validation: validateThreadCoupon(coupon, .001),
    curvature: boundCurvatureTimesRadius(coupon.spans.map(s => s.curve), bundle.threadRadiusMm),
  }));
  const betweenVisits = coupons.flatMap((coupon, i) => coupons.slice(0, i).map((earlier, j) => ({
    earlierVisitId: bundle.visits[j].id, laterVisitId: bundle.visits[i].id, clearance: interThreadClearance(earlier, coupon, .001),
  })));
  const byId = new Map(bundle.spans.map(s => [s.id, s]));
  const minBendRadiusMm = Number(bundle.input.minBendRadiusMm);
  const wholeSpanBudget = bundle.visits.flatMap(visit => (['incoming', 'outgoing'] as const).map(branch => {
    const ids = branch === 'incoming' ? visit.incomingSpanIds : visit.outgoingSpanIds;
    const referenceGeometryLengthMm = curvesLength(ids.map(id => byId.get(id)!.curve));
    // A chosen mesh recipe, not a proof of the minimum resolution or a yarn law.
    const requestedSpans = Math.ceil(referenceGeometryLengthMm / minBendRadiusMm);
    return { visitId: visit.id, row: visit.row, branch, referenceGeometryLengthMm, requestedSpans,
      discretizationRule: 'ceil(referenceGeometryLengthMm / minBendRadiusMm)' as const,
      controlCountRule: 'ceil(requestedSpans * factor) + 3' as const,
      levels: UPPER_KIKU_FACTORS.map(factor => { const controlCount = Math.ceil(requestedSpans * factor) + 3;
        return { factor, controlCount, withinBudget: controlCount <= THICK_ROPE_LADDER.maxControls }; }),
      maxControls: THICK_ROPE_LADDER.maxControls,
    };
  }));
  const diagnostics: { code: string; message: string; visitId?: string }[] = [
    { code: 'mechanics-not-solved', message: 'The earlier bundle has not been relaxed jointly with the new visit.' },
    { code: 'material-exchange-unspecified', message: 'No-slip, prescribed slip, or material supply at the observation cuts must be specified before mechanical acceptance.' },
    { code: 'topology-partial', message: 'Conditional incoming-over rules and recipe capture candidates do not establish the complete crossing/capture table.' },
    { code: 'omitted-continuations', message: 'Contacts and material length of omitted continuations remain outside this observation.' },
  ];
  for (const v of visits) {
    if (v.validation.status !== 'passed') diagnostics.push({ code: 'seed-path', visitId: v.visitId,
      message: `Reference path ${v.validation.status}: ${[...new Set(v.validation.diagnostics.map(d => d.code))].join(', ')}.` });
    if (v.curvature.status !== 'certified' || !(v.curvature.upper < 1)) diagnostics.push({ code: 'seed-curvature', visitId: v.visitId,
      message: 'The complete reference path does not have a certified regular round tube.' });
  }
  for (const pair of betweenVisits) if (pair.clearance.status !== 'passed') diagnostics.push({ code: 'seed-inter-visit-clearance', visitId: pair.laterVisitId,
    message: `Reference clearance against ${pair.earlierVisitId}: ${pair.clearance.status}.` });
  for (const budget of wholeSpanBudget) for (const level of budget.levels) if (!level.withinBudget)
    diagnostics.push({ code: 'whole-span-budget', visitId: budget.visitId,
      message: `${budget.branch} at factor ${level.factor}: the chosen ceil(length / bend-radius) discretization requests ${level.controlCount} controls, above the budget of ${budget.maxControls}; this is not a physical minimum, and the level was not truncated or solved.` });
  return { model: bundle.model, status: judgeUpperBundleAudit({ visits, betweenVisits }), mechanics: 'not-solved' as const,
    topology: 'partial' as const, geometryState: 'seed' as const, visits, betweenVisits, wholeSpanBudget, diagnostics };
}

export type UpperBundleAudit = ReturnType<typeof auditUpperBundle>;
