import { planS8Kiku, projectedCrossings, type S8KikuLevel, type S8KikuResult } from './s8-kiku';
import { closestSegmentApproach, sampleCurve } from './thread-geometry';
import { validateThreadCrossings } from './thread-crossings';
import type { C8ThreadCoupon, PointMm, ThreadCrossing, ThreadSpan } from './thread-path';

export const S8_AB_SOURCE = 'https://www.temarikai.com/PatternsPages/Simple/GT14.html';
export type ABGroup = 'A' | 'B';
export const planS8AB = () => ({ A: planS8Kiku({ stage: 'round' }), B: planS8Kiku({ stage: 'round', phase: 1 }) });

/** Separate material identities and operation namespaces, without changing geometry. */
export function nameS8Thread(c: C8ThreadCoupon, group: ABGroup, orderOffset = 0): C8ThreadCoupon {
  const id = (s: string) => `${group}:${s}`;
  return {
    ...c, threadId: `${group}:s8-kiku-thread`,
    spans: c.spans.map(s => ({ ...s, id: id(s.id), opId: id(s.opId), threadId: `${group}:s8-kiku-thread` })),
    supports: c.supports.map(s => ({ ...s, id: id(s.id) })),
    marks: c.marks.map(m => ({ ...m, id: id(m.id) })),
    operations: c.operations.map(o => ({ ...o, id: id(o.id), order: o.order + orderOffset,
      spanIds: o.spanIds.map(id), ...(o.markId ? { markId: id(o.markId) } : {}),
      ...(o.captureIds ? { captureIds: o.captureIds.map(id) } : {}) })),
    crossings: c.crossings?.map(x => ({ ...x, id: id(x.id), opId: id(x.opId),
      working: x.working.map(w => ({ ...w, spanId: id(w.spanId) })),
      target: { ...x.target, id: id(x.target.id) },
      ...(x.targetChain ? { targetChain: x.targetChain.map(w => ({ ...w, spanId: id(w.spanId) })) } : {}) })),
  };
}

type Bounds = { min: number[]; max: number[] };
const bounds = (points: readonly PointMm[], error: number): Bounds => ({
  min: [0, 1, 2].map(k => Math.min(...points.map(p => p[k])) - error),
  max: [0, 1, 2].map(k => Math.max(...points.map(p => p[k])) + error),
});
const boxDistance = (a: Bounds, b: Bounds) => Math.hypot(...[0, 1, 2].map(k => Math.max(0, a.min[k] - b.max[k], b.min[k] - a.max[k])));

/** All spans, including buried tails; no neighbouring-material exclusion between threads. */
export function interThreadClearance(a: C8ThreadCoupon, b: C8ThreadCoupon, toleranceMm = .001) {
  if (!(toleranceMm > 0) || !Number.isFinite(toleranceMm)) throw new RangeError('Finite positive tolerance required.');
  const radii = a.threadRadiusMm + b.threadRadiusMm;
  let lower = Infinity, upper = Infinity, witness: string[] = [], refinements = 0;
  for (; refinements <= 3; refinements++) {
    const sample = (s: ThreadSpan) => {
      const p = sampleCurve(s.curve, toleranceMm / 4 ** refinements);
      return { id: s.id, ...p, box: bounds(p.points, p.errorBoundMm),
        segments: p.points.slice(1).map((q, i) => ({ a: p.points[i], b: q, box: bounds([p.points[i], q], p.errorBoundMm) })) };
    };
    const A = a.spans.map(sample), B = b.spans.map(sample);
    lower = Infinity; upper = Infinity;
    for (const x of A) for (const y of B) {
      if (boxDistance(x.box, y.box) - radii > upper) continue;
      const error = x.errorBoundMm + y.errorBoundMm;
      for (const s of x.segments) for (const t of y.segments) {
        if (boxDistance(s.box, t.box) - radii > upper) continue;
        const gap = closestSegmentApproach(s.a, s.b, t.a, t.b).distanceMm - radii;
        lower = Math.min(lower, gap - error);
        if (gap + error < upper) { upper = gap + error; witness = [x.id, y.id]; }
      }
    }
    if (lower > 0 || upper < 0) break;
  }
  return { status: upper < 0 ? 'failed' as const : lower > 0 && Number.isFinite(lower) ? 'passed' as const : 'unresolved' as const,
    lowerMm: lower, upperMm: upper, witness, refinements: Math.min(refinements, 3) };
}

/** Cross-thread projection is a diagnostic carrier, not a single-thread coupon. */
export function checkS8AB(a: C8ThreadCoupon, b: C8ThreadCoupon) {
  if (a.threadId === b.threadId || a.bodyRadiusMm !== b.bodyRadiusMm || a.threadRadiusMm !== b.threadRadiusMm)
    throw new RangeError('AB requires distinct threads on the same body with the same section.');
  const spans = [...a.spans, ...b.spans];
  if (new Set(spans.map(s => s.id)).size !== spans.length) throw new RangeError('AB span IDs must be unique.');
  const carrier: C8ThreadCoupon = { ...a, spans, operations: [...a.operations, ...b.operations], supports: [], crossings: [] };
  const byId = new Map(spans.map(s => [s.id, s]));
  const chains = new Map(carrier.operations.map(o => [o.id, o.spanIds.map(spanId => ({ spanId, t0: 0, t1: 1 }))]));
  const pairs = new Map<string, [ThreadSpan, ThreadSpan]>();
  for (const pair of projectedCrossings(carrier, [0, 1, 0], .001, true)) {
    const x = byId.get(pair.a)!, y = byId.get(pair.b)!;
    if (x.threadId === y.threadId) continue;
    const [later, earlier] = x.threadId === b.threadId ? [x, y] : [y, x];
    pairs.set(`${later.opId}/${earlier.opId}`, [later, earlier]);
  }
  const crossings: ThreadCrossing[] = [...pairs].map(([key, [later, earlier]]) => {
    const targetChain = chains.get(earlier.opId)!;
    return { id: `AB:${key}`, opId: later.opId, working: chains.get(later.opId)!,
      target: { id: targetChain[0].spanId, t0: 0, t1: 1 }, targetChain,
      pass: later.zone === 'surface' ? 'over' : 'under' };
  });
  carrier.crossings = crossings;
  const diagnostics = validateThreadCrossings(carrier, .001);
  const clearance = interThreadClearance(a, b);
  const surfaceCrossings = crossings.filter(c => c.pass === 'over').length;
  // Two four-tip sets in this fixed first-round placement have eight transverse surface crossings.
  if (surfaceCrossings !== 8) diagnostics.push({ code: 'ab-crossing-count', severity: 'error', spanIds: [],
    message: `Expected eight A1/B1 surface crossings, found ${surfaceCrossings}.` });
  return { status: clearance.status === 'failed' || diagnostics.some(d => d.severity === 'error') ? 'failed' as const
    : clearance.status === 'unresolved' || diagnostics.length ? 'unresolved' as const : 'passed' as const,
    clearance, crossings, diagnostics, surfaceCrossings };
}

export function checkS8ABLevel(a: S8KikuLevel, b: S8KikuLevel) {
  const A = nameS8Thread(a.coupon, 'A'), B = nameS8Thread(b.coupon, 'B', A.operations.length);
  return { A, B, check: checkS8AB(A, B) };
}

export function judgeS8AB(a: S8KikuResult, b: S8KikuResult, checks: ReturnType<typeof checkS8AB>[]) {
  if (checks.length !== b.levels.length + 1) throw new RangeError('Every B ladder level and the conditioning rebuild require an AB check.');
  return a.status === 'rejected' || b.status === 'rejected' || checks.some(c => c.status === 'failed') ? 'rejected'
    : a.status === 'accepted' && b.status === 'accepted' && checks.every(c => c.status === 'passed') ? 'accepted' : 'unresolved';
}
