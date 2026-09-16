import type { C8ThreadCoupon, PathDiagnostic, PointMm, ThreadCrossing, ThreadCurve, ThreadTarget, ThreadWindow } from "./thread-path";
import { closestSegmentApproach, curveDerivative, evaluateCurve, sampleCurve } from "./thread-geometry";

const add = (a: PointMm, b: PointMm): PointMm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: PointMm, n: number): PointMm => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: PointMm) => Math.hypot(...a);
const cross = (a: PointMm, b: PointMm): PointMm => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix = (a: PointMm, b: PointMm, t: number) => add(mul(a, 1 - t), mul(b, t));
const validInterval = ({ t0, t1 }: { t0: number; t1: number }) => Number.isFinite(t0) && Number.isFinite(t1) && t0 >= 0 && t1 <= 1 && t0 < t1;
const sameTarget = (a: ThreadTarget, b: ThreadTarget) => a.id === b.id && a.t0 === b.t0 && a.t1 === b.t1;

function split(c: Extract<ThreadCurve, { kind: "bezier" }>["controls"], t: number) {
  const [a, b, d, e] = c, ab = mix(a, b, t), bd = mix(b, d, t), de = mix(d, e, t);
  const left = mix(ab, bd, t), right = mix(bd, de, t), p = mix(left, right, t);
  return [[a, ab, left, p], [p, right, de, e]] as const;
}
function portion(curve: ThreadCurve, t0: number, t1: number): ThreadCurve {
  if (curve.kind === "arc") return { kind: "arc", from: evaluateCurve(curve, t0), to: evaluateCurve(curve, t1) };
  const left = t1 === 1 ? curve.controls : split(curve.controls, t1)[0];
  return { kind: "bezier", controls: t0 === 0 ? left : split(left, t0 / t1)[1] };
}
type ProjectedSegment = { a: PointMm; b: PointMm; t0: number; t1: number; error: number };
function projectedSegments(curve: ThreadCurve, t0: number, t1: number, axis: PointMm, tolerance: number): ProjectedSegment[] {
  const sampled = sampleCurve(portion(curve, t0, t1), tolerance), result: ProjectedSegment[] = [];
  for (let i = 1; i < sampled.points.length; i++) {
    const a = sampled.points[i - 1]!, b = sampled.points[i]!, da = dot(axis, a), db = dot(axis, b);
    const d = Math.min(da, db), e = sampled.errorBoundMm;
    if (d <= e || d <= 0) throw new Error("The crossing window does not fit a positive radial projection chart.");
    // F(x)=x/(axis·x). Curve/chord distance e gives this Lipschitz bound;
    // projection of a spatial chord is the same finite projected line segment.
    const error = e / (d - e) + Math.max(norm(a), norm(b)) * e / (d * (d - e));
    result.push({ a: mul(a, 1 / da), b: mul(b, 1 / db), t0: t0 + (t1 - t0) * sampled.parameters[i - 1]!, t1: t0 + (t1 - t0) * sampled.parameters[i]!, error });
  }
  return result;
}
function boxesMeet(a: ProjectedSegment, b: ProjectedSegment) {
  const error = a.error + b.error + 1e-13;
  return [0, 1, 2].every((i) => Math.max(a.a[i]!, a.b[i]!) + error >= Math.min(b.a[i]!, b.b[i]!) && Math.max(b.a[i]!, b.b[i]!) + error >= Math.min(a.a[i]!, a.b[i]!));
}
function projection(curve: ThreadCurve, t: number, axis: PointMm) {
  const p = evaluateCurve(curve, t), v = curveDerivative(curve, t), d = dot(axis, p);
  if (!(d > 0)) throw new Error("Crossing iteration left its radial chart.");
  return { p: mul(p, 1 / d), v: sub(mul(v, 1 / d), mul(p, dot(axis, v) / (d * d))) };
}
function solve(a: ThreadCurve, wa: ThreadWindow, b: ThreadCurve, wb: ThreadTarget, axis: PointMm, ta: number, tb: number) {
  for (let iteration = 0; iteration < 30; iteration++) {
    const x = projection(a, ta, axis), y = projection(b, tb, axis), f = sub(x.p, y.p);
    const det = dot(axis, cross(x.v, y.v));
    if (Math.abs(det) <= 1e-8 * norm(x.v) * norm(y.v) || !Number.isFinite(det) || norm(x.v) * norm(y.v) === 0) return null;
    const da = -dot(axis, cross(f, y.v)) / det, db = -dot(axis, cross(f, x.v)) / det;
    if (norm(f) < 1e-12 && Math.max(Math.abs(da), Math.abs(db)) < 1e-9) return { ta, tb };
    // A transverse root may be exactly at a smooth join. Newton can overshoot
    // that endpoint before convergence; clamp the step, never the residual.
    const nextA = Math.max(wa.t0, Math.min(wa.t1, ta + da)), nextB = Math.max(wb.t0, Math.min(wb.t1, tb + db));
    if (nextA === ta && nextB === tb) return null;
    ta = nextA; tb = nextB;
  }
  return null;
}
// Bernstein control hull of the numerator of the projected derivative.
// The positive denominator (axis·p)^2 does not change its direction.
function tangentCone(curve: ThreadCurve, t0: number, t1: number, axis: PointMm): PointMm[] {
  const clipped = portion(curve, t0, t1);
  if (clipped.kind === "arc") return [projection(curve, (t0 + t1) / 2, axis).v];
  const p = clipped.controls, d = p.map((v) => dot(axis, v));
  if (d.some((x) => x <= 0)) throw new Error("Projected derivative hull crosses the chart horizon.");
  const v = p.slice(1).map((x, i) => mul(sub(x, p[i]!), 3)), dd = d.slice(1).map((x, i) => 3 * (x - d[i]!));
  const c2 = [1, 2, 1], c3 = [1, 3, 3, 1], c5 = [1, 5, 10, 10, 5, 1];
  const hull: PointMm[] = Array.from({ length: 6 }, () => [0, 0, 0]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    const weight = c2[i]! * c3[j]! / c5[i + j]!;
    hull[i + j] = add(hull[i + j]!, mul(sub(mul(v[i]!, d[j]!), mul(p[j]!, dd[i]!)), weight));
  }
  return hull;
}
function locallyUnique(a: ThreadCurve, sa: ProjectedSegment, b: ThreadCurve, sb: ProjectedSegment, axis: PointMm, ta: number, tb: number) {
  const va = projection(a, ta, axis).v, vb = projection(b, tb, axis).v, determinant = dot(axis, cross(va, vb));
  if (!Number.isFinite(determinant) || determinant === 0) return false;
  // If two intersections existed, the mean tangent vectors between them
  // would be collinear. Each mean lies in its derivative hull's positive cone.
  // Strictly same-sign determinants for every hull pair exclude that case.
  const sign = Math.sign(determinant), x = tangentCone(a, sa.t0, sa.t1, axis), y = tangentCone(b, sb.t0, sb.t1, axis);
  return x.every((u) => y.every((v) => {
    const scale = norm(u) * norm(v);
    return scale > 0 && sign * dot(axis, cross(u, v)) > 1e-8 * scale;
  }));
}
type CrossingResult = { position: number; gap: number };

/** Checks declared finite crossings numerically; this is not a knot/holding solver. */
export function validateThreadCrossings(coupon: C8ThreadCoupon, toleranceMm = .005): PathDiagnostic[] {
  const diagnostics: PathDiagnostic[] = [], crossings = coupon.crossings ?? [], captures = coupon.captures ?? [];
  if (!crossings.length && !captures.length) return diagnostics;
  const report = (code: string, severity: PathDiagnostic["severity"], ids: string[], message: string) => diagnostics.push({ code, severity, spanIds: ids, message });
  const spans = new Map(coupon.spans.map((s, i) => [s.id, { ...s, index: i }]));
  const supports = new Map(coupon.supports.map((s) => [s.id, s]));
  const operations = new Map(coupon.operations.map((op) => [op.id, op]));
  const declared = new Map<string, ThreadCrossing>(), results = new Map<string, CrossingResult>();
  const seen = new Set<string>();
  for (const crossing of crossings) {
    const chain: ThreadWindow[] = crossing.targetChain ?? [{ spanId: crossing.target.id, t0: crossing.target.t0, t1: crossing.target.t1 }];
    const ids = [...crossing.working.map((w) => w.spanId), ...new Set([crossing.target.id, ...chain.map((w) => w.spanId)])];
    if (!crossing.id || seen.has(crossing.id)) { report("crossing-contract", "error", ids, "Crossing IDs must be nonempty and unique."); continue; }
    seen.add(crossing.id); declared.set(crossing.id, crossing);
    const op = operations.get(crossing.opId), target = spans.get(crossing.target.id) ?? supports.get(crossing.target.id);
    let valid = !!op && !!target && validInterval(crossing.target) && crossing.working.length > 0 && chain.length > 0 && (crossing.pass === "over" || crossing.pass === "under");
    for (let i = 0; i < crossing.working.length; i++) {
      const w = crossing.working[i]!, s = spans.get(w.spanId), previous = crossing.working[i - 1];
      if (!s || s.opId !== crossing.opId || !validInterval(w)) valid = false;
      if (previous && (spans.get(previous.spanId)?.index !== (s?.index ?? 0) - 1 || previous.t1 !== 1 || w.t0 !== 0)) valid = false;
    }
    if (crossing.targetChain) {
      // A chain names consecutive spans of one working thread; supports stay single.
      const first = chain[0]!;
      if (!spans.has(crossing.target.id) || first.spanId !== crossing.target.id || first.t0 !== crossing.target.t0 || first.t1 !== crossing.target.t1) valid = false;
      for (let i = 0; i < chain.length; i++) {
        const w = chain[i]!, s = spans.get(w.spanId), previous = chain[i - 1];
        if (!s || !validInterval(w) || s.threadId !== spans.get(first.spanId)?.threadId) valid = false;
        if (previous && (spans.get(previous.spanId)?.index !== (s?.index ?? 0) - 1 || previous.t1 !== 1 || w.t0 !== 0)) valid = false;
      }
    }
    if (!valid || !op || !target) { report("crossing-contract", "error", ids, "Crossings require finite consecutive windows owned by their declared operation and a valid target."); continue; }
    if (chain.some((w) => { const old = spans.get(w.spanId); return old && (operations.get(old.opId)?.order ?? Infinity) >= op.order; })) {
      report("crossing-future-target", "error", ids, "A crossing can reference only a previously laid working span."); continue;
    }
    const targetCurve = (w: ThreadWindow) => (spans.get(w.spanId) ?? supports.get(w.spanId))!.curve;
    const targetIndex = (w: ThreadWindow) => spans.get(w.spanId)?.index ?? 0;
    try {
      // A chart derived from the target itself preserves rotational covariance.
      const mid = chain[Math.floor((chain.length - 1) / 2)]!;
      const middle = evaluateCurve(targetCurve(mid), (mid.t0 + mid.t1) / 2), axis = mul(middle, 1 / norm(middle));
      let roots: { window: number; targetWindow: number; ta: number; tb: number }[] = [], ambiguous = true, possible = false;
      let previousPositions: { position: number; targetT: number }[] = [], stable = false;
      const locate = (r: { window: number; targetWindow: number; ta: number; tb: number }) => ({
        position: spans.get(crossing.working[r.window]!.spanId)!.index + r.ta, targetT: targetIndex(chain[r.targetWindow]!) + r.tb });
      for (let refinement = 0; refinement <= 3; refinement++) {
        roots = []; ambiguous = false; possible = false;
        const targets = chain.map((tw) => projectedSegments(targetCurve(tw), tw.t0, tw.t1, axis, toleranceMm / 4 ** refinement));
        for (let wi = 0; wi < crossing.working.length; wi++) {
          const w = crossing.working[wi]!, actor = spans.get(w.spanId)!;
          const segments = projectedSegments(actor.curve, w.t0, w.t1, axis, toleranceMm / 4 ** refinement);
          for (let ti = 0; ti < chain.length; ti++) {
            const tw = chain[ti]!, curve = targetCurve(tw), window = { id: tw.spanId, t0: tw.t0, t1: tw.t1 };
            for (const a of segments) for (const b of targets[ti]!) {
              if (!boxesMeet(a, b) || closestSegmentApproach(a.a, a.b, b.a, b.b).distanceMm > a.error + b.error + 1e-13) continue;
              possible = true;
              const root = solve(actor.curve, w, curve, window, axis, (a.t0 + a.t1) / 2, (b.t0 + b.t1) / 2);
              if (!root) { ambiguous = true; continue; }
              // A bounded curve/chord error can leave a false candidate next to a
              // true crossing. Newton may find that root outside this mesh cell.
              // Prove uniqueness on the rectangle containing BOTH the original
              // candidate and found root: then the cell cannot hide another root.
              const expandedA = { ...a, t0: Math.min(a.t0, root.ta), t1: Math.max(a.t1, root.ta) };
              const expandedB = { ...b, t0: Math.min(b.t0, root.tb), t1: Math.max(b.t1, root.tb) };
              if (!locallyUnique(actor.curve, expandedA, curve, expandedB, axis, root.ta, root.tb)) { ambiguous = true; continue; }
              const found = locate({ window: wi, targetWindow: ti, ...root });
              // Roots at a smooth join are found from both neighbouring pieces.
              if (!roots.some((r) => { const p = locate(r); return Math.abs(p.position - found.position) < 1e-8 && Math.abs(p.targetT - found.targetT) < 1e-8; }))
                roots.push({ window: wi, targetWindow: ti, ...root });
            }
          }
        }
        const positions = roots.map(locate).sort((a, b) => a.position - b.position);
        stable = !ambiguous && positions.length === 1 && previousPositions.length === 1 && positions.every((p, i) => Math.abs(p.position - previousPositions[i]!.position) < 1e-7 && Math.abs(p.targetT - previousPositions[i]!.targetT) < 1e-7);
        previousPositions = ambiguous ? [] : positions;
        if (!possible || stable) break;
      }
      if (!possible) { report("crossing-missing", "error", ids, "The finite radial projections do not intersect within the declared windows."); continue; }
      if (ambiguous || !stable || roots.length !== 1) { report("crossing-unresolved", "unresolved", ids, "The projected crossing is tangent, multiple or not isolated after refinement."); continue; }
      const root = roots[0]!, w = crossing.working[root.window]!, actor = spans.get(w.spanId)!;
      const { position, targetT } = locate(root);
      const first = crossing.working[0]!, last = crossing.working.at(-1)!;
      const targetFirst = chain[0]!, targetLast = chain.at(-1)!;
      if (position <= spans.get(first.spanId)!.index + first.t0 + 1e-9 || position >= spans.get(last.spanId)!.index + last.t1 - 1e-9
        || targetT <= targetIndex(targetFirst) + targetFirst.t0 + 1e-9 || targetT >= targetIndex(targetLast) + targetLast.t1 - 1e-9) {
        report("crossing-unresolved", "unresolved", ids, "An endpoint alone does not establish a two-sided transverse crossing."); continue;
      }
      // Global validation checks G1, but keep the join check here too: standalone
      // crossing validation must not turn an elbow or a gap into a pass.
      let smooth = true;
      for (const windows of [crossing.working, chain]) for (let i = 1; i < windows.length; i++) {
        const before = targetCurve(windows[i - 1]!), after = targetCurve(windows[i]!);
        const v = curveDerivative(before, 1), z = curveDerivative(after, 0);
        if (norm(sub(evaluateCurve(before, 1), evaluateCurve(after, 0))) > coupon.bodyRadiusMm * 1e-10 || norm(sub(mul(v, 1 / norm(v)), mul(z, 1 / norm(z)))) > 1e-8) smooth = false;
      }
      if (!smooth) { report("crossing-contract", "error", ids, "Consecutive crossing windows require a continuous oriented tangent."); continue; }
      const hit = chain[root.targetWindow]!;
      const delta = norm(evaluateCurve(actor.curve, root.ta)) - norm(evaluateCurve(targetCurve(hit), root.tb));
      const signed = crossing.pass === "over" ? delta : -delta;
      const radii = coupon.threadRadiusMm + (supports.get(crossing.target.id)?.radiusMm ?? coupon.threadRadiusMm);
      if (signed < -toleranceMm) { report("crossing-wrong-side", "error", ids, "Radial over/under order is opposite to the declared crossing."); continue; }
      if (signed - radii < -toleranceMm) { report("crossing-penetration", "error", ids, "The declared radial crossing intersects the two yarn volumes."); continue; }
      if (signed - radii <= toleranceMm) { report("crossing-unresolved", "unresolved", ids, "Radial crossing clearance is within the numerical tolerance."); continue; }
      results.set(crossing.id, { position, gap: signed - radii });
    } catch (error) { report("crossing-unresolved", "unresolved", ids, String(error)); }
  }
  for (const capture of captures) {
    const op = operations.get(capture.opId), ids = capture.targets.map((t) => t.id);
    if (!capture.id || seen.has(capture.id) || !op || op.kind !== "catch" || !capture.targets.length || new Set(ids).size !== ids.length || capture.targets.some((t) => !validInterval(t))) {
      report("capture-contract", "error", ids, "A capture requires a unique ID, a catch owner and a nonempty distinct finite target bundle."); continue;
    }
    seen.add(capture.id);
    const over = capture.overCrossingIds.map((id) => declared.get(id)), under = capture.underCrossingIds.map((id) => declared.get(id));
    if (new Set([...capture.overCrossingIds, ...capture.underCrossingIds]).size !== over.length + under.length || [...over, ...under].some((c) => !c || !capture.targets.some((t) => sameTarget(t, c.target))) || over.some((c) => c?.pass !== "over") || under.some((c) => c?.pass !== "under" || c.opId !== capture.opId)) {
      report("capture-contract", "error", ids, "Capture crossing references must be distinct, match the finite bundle and have the required owner/side."); continue;
    }
    if (op.captureIds && (op.captureIds.length !== ids.length || ids.some((id) => !op.captureIds!.includes(id)))) report("capture-contract", "error", ids, "Legacy capture IDs disagree with the explicit captured bundle.");
    const overPositions = over.map((c) => results.get(c!.id)?.position), underPositions = under.map((c) => results.get(c!.id)?.position);
    if (overPositions.length && underPositions.length && overPositions.every((p) => p !== undefined) && underPositions.every((p) => p !== undefined) && Math.max(...overPositions) >= Math.min(...underPositions) - 1e-9) {
      report("capture-order", "error", ids, "The working thread must pass over the entire bundle before the first under passage.");
    }
    for (const target of capture.targets) {
      const overs = over.filter((c) => c && sameTarget(c.target, target)), unders = under.filter((c) => c && sameTarget(c.target, target));
      const isWorking = spans.has(target.id), isSupport = supports.has(target.id);
      if ((!isWorking && !isSupport) || unders.length !== 1 || overs.length !== (isWorking ? 1 : 0)) { report("capture-incomplete", "error", [target.id], "Each previous working target needs one over then one under; fixed supports need one under."); continue; }
      if (isWorking) {
        const above = overs[0]!, below = unders[0]!;
        const aOp = operations.get(above.opId), bOp = operations.get(below.opId);
        if (!aOp || !bOp || aOp.order > bOp.order || (aOp.kind !== "lay" && above.opId !== capture.opId)) { report("capture-order", "error", [target.id], "The over passage must belong to an earlier lay or to the same catch before its under passage."); continue; }
        const a = results.get(above.id), b = results.get(below.id);
        if (a && b && a.position >= b.position - 1e-9) report("capture-order", "error", [target.id], "The under passage occurs before the approach over the captured bundle.");
      }
    }
  }
  return diagnostics;
}
