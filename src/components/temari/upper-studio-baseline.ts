import { compileKiku, stitchesFromOps } from "./patterns.ts";
import { pileParts } from "./stitches.ts";
import { MARI_C_CM, STITCH_THREAD_MM } from "./measure.ts";
import { closestSegmentApproach } from "./thread-geometry.ts";
import type { KagariTrace } from "./kagari-topology.ts";

export type StudioPointMm = [number, number, number];
export type AxisSphereCrossing = {
  segment: number;
  t: number;
  alongMm: number;
  pointMm: StudioPointMm;
  direction: "enter" | "exit" | "tangent" | "endpoint";
};
export type StudioBaselinePart = {
  partId: string;
  operationId: string;
  threadId: string;
  order: number;
  row: number;
  mark: string;
  color: number;
  pointsMm: StudioPointMm[];
  liftMm: number[];
};
export type StudioBaselineOperation = {
  trace: KagariTrace;
  row: number;
  mark: string;
  markMm: StudioPointMm;
  biteEnterMm: StudioPointMm;
  biteExitMm: StudioPointMm;
};
type Segment = { partId: string; operationId: string; order: number; row: number;
  segment: number; t0: number; t1: number; a: StudioPointMm; b: StudioPointMm };
export type PriorPathProbe = {
  label: string;
  pointMm: StudioPointMm;
  minAxisDistanceMm: number | null;
  /** Point to the prior circular envelope, not a needle-clearance assertion. */
  pointToRoundEnvelopeGapMm: number | null;
  witness: { partId: string; operationId: string; order: number; segment: number; t: number; pointMm: StudioPointMm } | null;
};
export type UpperStudioVisit = {
  row: number;
  operationId: string;
  order: number;
  threadId: string;
  recipe: StudioBaselineOperation;
  partIds: string[];
  frame: { radial: StudioPointMm; outward: StudioPointMm; across: StudioPointMm };
  windowHalfWidthMm: number;
  axisSphereCrossings: (AxisSphereCrossing & { partId: string; operationId: string; order: number })[];
  recipeToAxis: { port: "enter" | "exit"; nearestAxisCrossingIndex: number | null; distanceMm: number | null }[];
  maxAxisHeightMm: number | null;
  maxHeightWitness: { partId: string; segment: number; t: number; pointMm: StudioPointMm } | null;
  priorPathProbes: PriorPathProbe[];
  exteriorPriorDistance: {
    minAxisDistanceMm: number | null;
    twoRoundEnvelopesGapMm: number | null;
    testedSegmentPairs: number;
    witness: { current: { partId: string; segment: number; t: number; pointMm: StudioPointMm };
      prior: { partId: string; operationId: string; order: number; segment: number; t: number; pointMm: StudioPointMm } } | null;
  };
};
export type UpperStudioBaseline = {
  schemaVersion: 1;
  kind: "upper-studio-baseline";
  status: "diagnostic-only";
  config: { division: "simple"; pole: 0; set: "A"; rows: 3; renderer: "pileParts";
    thread: "pearl5"; circumferenceMm: number; bodyRadiusMm: number; roundEnvelopeRadiusMm: number;
    selectedMarks: readonly ["outer-1", "inner-2", "outer-3"] };
  operations: StudioBaselineOperation[];
  parts: StudioBaselinePart[];
  /** Full finite paths for any distance witness outside the selected marks. */
  referenceParts: StudioBaselinePart[];
  visits: UpperStudioVisit[];
  limitations: string[];
};

const dot = (a: StudioPointMm, b: StudioPointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: StudioPointMm) => Math.hypot(...a);
const scale = (a: readonly number[], k: number): StudioPointMm => [a[0]! * k, a[1]! * k, a[2]! * k];
const sub = (a: StudioPointMm, b: StudioPointMm): StudioPointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mix = (a: StudioPointMm, b: StudioPointMm, t: number): StudioPointMm => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
const distance = (a: StudioPointMm, b: StudioPointMm) => norm(sub(a, b));
const unit = (a: StudioPointMm): StudioPointMm => scale(a, 1 / norm(a));
const cross = (a: StudioPointMm, b: StudioPointMm): StudioPointMm => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Exact line-segment/sphere roots up to floating-point arithmetic. */
function sphereRoots(a: StudioPointMm, b: StudioPointMm, radius: number): number[] {
  const d = sub(b, a), aa = dot(d, d);
  if (aa === 0) return [];
  const bb = 2 * dot(a, d), cc = dot(a, a) - radius * radius;
  const disc = bb * bb - 4 * aa * cc;
  const tolerance = Number.EPSILON * 32 * Math.max(bb * bb, Math.abs(4 * aa * cc), 1);
  if (disc < -tolerance) return [];
  const sqrt = Math.sqrt(Math.max(0, disc));
  const q = -.5 * (bb + (bb < 0 ? -sqrt : sqrt));
  const roots = q === 0 ? [-bb / (2 * aa)] : [q / aa, cc / q];
  return roots.filter(t => t >= -1e-12 && t <= 1 + 1e-12).map(t => Math.max(0, Math.min(1, t)))
    .sort((x, y) => x - y).filter((t, i, all) => i === 0 || t - all[i - 1]! > 1e-11);
}

/** An axis crossing is not a physical needle port or a tube/body intersection. */
export function intersectPolylineSphere(pointsMm: readonly StudioPointMm[], radiusMm: number): AxisSphereCrossing[] {
  if (!(radiusMm > 0) || !Number.isFinite(radiusMm)
    || pointsMm.some(p => p.length !== 3 || p.some(v => !Number.isFinite(v)))) throw new RangeError("Finite points and a positive sphere radius are required.");
  const out: AxisSphereCrossing[] = [];
  let along = 0;
  for (let i = 0; i + 1 < pointsMm.length; i++) {
    const a = pointsMm[i]!, b = pointsMm[i + 1]!, length = distance(a, b);
    for (const t of sphereRoots(a, b, radiusMm)) {
      const position = along + t * length;
      if (out.length && Math.abs(position - out.at(-1)!.alongMm) < 1e-10) continue;
      const pointMm = mix(a, b, t);
      const neighbour = (step: -1 | 1): StudioPointMm | null => {
        if (step < 0 && t > 1e-10) return mix(a, b, Math.max(0, t - 1e-5));
        if (step > 0 && t < 1 - 1e-10) return mix(a, b, Math.min(1, t + 1e-5));
        // Duplicate samples do not turn an ordinary crossing into a tangency.
        for (let j = i + step; j >= 0 && j + 1 < pointsMm.length; j += step) {
          const p = pointsMm[j]!, q = pointsMm[j + 1]!;
          if (distance(p, q) > 0) return mix(p, q, step < 0 ? 1 - 1e-5 : 1e-5);
        }
        return null;
      };
      const before = neighbour(-1), after = neighbour(1);
      const direction = !before || !after ? "endpoint"
        : norm(before) > radiusMm && norm(after) < radiusMm ? "enter"
        : norm(before) < radiusMm && norm(after) > radiusMm ? "exit" : "tangent";
      out.push({ segment: i, t, alongMm: position, pointMm, direction });
    }
    along += length;
  }
  return out;
}

function segments(part: StudioBaselinePart): Segment[] {
  return part.pointsMm.slice(1).map((b, segment) => ({ partId: part.partId, operationId: part.operationId,
    order: part.order, row: part.row, segment, t0: 0, t1: 1, a: part.pointsMm[segment]!, b }));
}
function cut(s: Segment, a: number, b: number): Segment {
  return { ...s, a: mix(s.a, s.b, a), b: mix(s.a, s.b, b),
    t0: s.t0 + (s.t1 - s.t0) * a, t1: s.t0 + (s.t1 - s.t0) * b };
}
function exterior(s: Segment, radius: number): Segment[] {
  const ts = [0, ...sphereRoots(s.a, s.b, radius).filter(t => t > 0 && t < 1), 1];
  return ts.slice(1).flatMap((t, i) => norm(mix(s.a, s.b, (ts[i]! + t) / 2)) >= radius
    ? [cut(s, ts[i]!, t)] : []);
}
function windowPlanes(frame: UpperStudioVisit["frame"], halfWidth: number, radius: number): StudioPointMm[] {
  return [frame.radial, ...[frame.outward, frame.across].flatMap(e => [1, -1].map(sign =>
    sub(scale(frame.radial, halfWidth / radius), scale(e, sign))))];
}
function clipWindow(s: Segment, planes: StudioPointMm[]): Segment[] {
  let a = 0, b = 1;
  for (const plane of planes) {
    const from = dot(s.a, plane), to = dot(s.b, plane);
    if (from < 0 && to < 0) return [];
    if (from < 0) a = Math.max(a, from / (from - to));
    if (to < 0) b = Math.min(b, from / (from - to));
  }
  return a <= b ? [cut(s, a, b)] : [];
}

function pointProbe(label: string, p: StudioPointMm, prior: Segment[], radius: number): PriorPathProbe {
  let best = Infinity;
  let witness: PriorPathProbe["witness"] = null;
  for (const s of prior) {
    const d = sub(s.b, s.a), length2 = dot(d, d);
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, s.a), d) / length2));
    const pointMm = mix(s.a, s.b, t), candidate = distance(p, pointMm);
    if (candidate < best) {
      best = candidate; witness = { partId: s.partId, operationId: s.operationId, order: s.order,
        segment: s.segment, t: s.t0 + (s.t1 - s.t0) * t, pointMm };
    }
  }
  return { label, pointMm: p, minAxisDistanceMm: witness ? best : null,
    pointToRoundEnvelopeGapMm: witness ? best - radius : null, witness };
}

/** Finite segments, not their supporting infinite lines. Intended for diagnostics. */
export function probePointAgainstPriorPath(pointMm: StudioPointMm, parts: readonly StudioBaselinePart[],
  beforeOrder: number, envelopeRadiusMm = STITCH_THREAD_MM.pearl5 / 2): PriorPathProbe {
  if (!Number.isFinite(beforeOrder) || !(envelopeRadiusMm >= 0) || !Number.isFinite(envelopeRadiusMm)
    || pointMm.some(v => !Number.isFinite(v))) throw new RangeError("Invalid prior-path probe.");
  return pointProbe("point", pointMm, parts.filter(p => p.order < beforeOrder).flatMap(segments), envelopeRadiusMm);
}

function priorDistance(current: Segment[], prior: Segment[], radius: number): UpperStudioVisit["exteriorPriorDistance"] {
  let best = Infinity, witness: UpperStudioVisit["exteriorPriorDistance"]["witness"] = null;
  for (const a of current) for (const b of prior) {
    // Cheap bounding-box lower bound only prunes pairs that cannot improve the minimum.
    let lower2 = 0;
    for (let k = 0; k < 3; k++) {
      const gap = Math.max(0, Math.min(a.a[k]!, a.b[k]!) - Math.max(b.a[k]!, b.b[k]!),
        Math.min(b.a[k]!, b.b[k]!) - Math.max(a.a[k]!, a.b[k]!));
      lower2 += gap * gap;
    }
    if (lower2 >= best * best) continue;
    const nearest = closestSegmentApproach(a.a, a.b, b.a, b.b);
    if (nearest.distanceMm < best) {
      best = nearest.distanceMm;
      witness = { current: { partId: a.partId, segment: a.segment, t: a.t0 + (a.t1 - a.t0) * nearest.s, pointMm: [...nearest.a] },
        prior: { partId: b.partId, operationId: b.operationId, order: b.order, segment: b.segment,
          t: b.t0 + (b.t1 - b.t0) * nearest.t, pointMm: [...nearest.b] } };
    }
  }
  return { minAxisDistanceMm: witness ? best : null, twoRoundEnvelopesGapMm: witness ? best - 2 * radius : null,
    testedSegmentPairs: current.length * prior.length, witness };
}

/** Freeze the current three-row studio rendering as measurements, not accepted physics. */
export function buildUpperStudioBaseline(): UpperStudioBaseline {
  const radius = MARI_C_CM * 10 / (2 * Math.PI), roundRadius = STITCH_THREAD_MM.pearl5 / 2;
  const selectedMarks = ["outer-1", "inner-2", "outer-3"] as const;
  const ops = compileKiku("simple", "out", "even", 0, 0, 3, 0), stitches = stitchesFromOps(ops);
  const operations: StudioBaselineOperation[] = ops.map((op, i) => {
    const stitch = stitches[i]!;
    if (stitch.kind !== "arc" || !stitch.operation) throw new Error("Missing compiled operation identity.");
    return { trace: structuredClone(stitch.operation), row: op.kai + 1, mark: `${op.mark.t}-${op.mark.line}`,
      markMm: scale(op.mark.at, radius), biteEnterMm: scale(op.bite.enter, radius), biteExitMm: scale(op.bite.exit, radius) };
  });
  const allParts: StudioBaselinePart[] = pileParts(stitches, "pearl5").map((part, i) => {
    const trace = part.at.operation;
    if (!trace || part.at.kai == null) throw new Error("Missing studio part chronology.");
    return { partId: `studio-part-${i}`, operationId: trace.operationId, threadId: trace.threadId,
      order: trace.order, row: part.at.kai + 1, mark: trace.operationId.split("/").at(-1)!, color: part.color,
      pointsMm: part.pts.map(p => scale(p.toArray(), radius)), liftMm: part.lift.map(h => h * radius) };
  });
  const selected = (mark: string) => (selectedMarks as readonly string[]).includes(mark);
  const parts = allParts.filter(p => selected(p.mark));
  const visits: UpperStudioVisit[] = operations.filter(op => op.mark === "inner-2").map(recipe => {
    const radial = unit(recipe.markMm), pole: StudioPointMm = [0, 1, 0];
    const outward = unit(sub(scale(radial, dot(radial, pole)), pole));
    const frame = { radial, outward, across: unit(cross(radial, outward)) }, windowHalfWidthMm = 3;
    const planes = windowPlanes(frame, windowHalfWidthMm, radius);
    const own = parts.filter(p => p.row === recipe.row);
    const local = own.flatMap(segments).flatMap(s => clipWindow(s, planes));
    // Earlier rows in this final render. Later gather operations may already have moved them.
    const prior = allParts.filter(p => p.row < recipe.row).flatMap(segments).flatMap(s => exterior(s, radius));
    const axisSphereCrossings = own.flatMap(p => intersectPolylineSphere(p.pointsMm, radius)
      .filter(c => planes.every(plane => dot(c.pointMm, plane) >= -1e-10))
      .map(c => ({ ...c, partId: p.partId, operationId: p.operationId, order: p.order })));
    const recipeToAxis = (["enter", "exit"] as const).map(port => {
      const p = port === "enter" ? recipe.biteEnterMm : recipe.biteExitMm;
      const near = axisSphereCrossings.map((c, i) => ({ i, distance: distance(p, c.pointMm) })).sort((a, b) => a.distance - b.distance)[0];
      return { port, nearestAxisCrossingIndex: near?.i ?? null, distanceMm: near?.distance ?? null };
    });
    let maxAxisHeightMm: number | null = null, maxHeightWitness: UpperStudioVisit["maxHeightWitness"] = null;
    // Norm is convex on each finite segment: its maximum is at one of the clipped endpoints.
    for (const s of local) for (const [pointMm, t] of [[s.a, s.t0], [s.b, s.t1]] as const) {
      const h = norm(pointMm) - radius;
      if (maxAxisHeightMm === null || h > maxAxisHeightMm) {
        maxAxisHeightMm = h; maxHeightWitness = { partId: s.partId, segment: s.segment, t, pointMm };
      }
    }
    return { row: recipe.row, operationId: recipe.trace.operationId, order: recipe.trace.order,
      threadId: recipe.trace.threadId, recipe, partIds: own.map(p => p.partId), frame, windowHalfWidthMm,
      axisSphereCrossings, recipeToAxis, maxAxisHeightMm, maxHeightWitness,
      priorPathProbes: [pointProbe("recipe-enter", recipe.biteEnterMm, prior, roundRadius),
        pointProbe("recipe-exit", recipe.biteExitMm, prior, roundRadius),
        ...axisSphereCrossings.map((c, i) => pointProbe(`axis-crossing-${i}`, c.pointMm, prior, roundRadius))],
      exteriorPriorDistance: priorDistance(local.flatMap(s => exterior(s, radius)), prior, roundRadius) };
  });
  const selectedIds = new Set(parts.map(p => p.partId));
  const referenceIds = new Set(visits.flatMap(v => [
    ...v.priorPathProbes.flatMap(p => p.witness ? [p.witness.partId] : []),
    ...(v.exteriorPriorDistance.witness ? [v.exteriorPriorDistance.witness.prior.partId] : []),
  ]));
  return { schemaVersion: 1, kind: "upper-studio-baseline", status: "diagnostic-only",
    config: { division: "simple", pole: 0, set: "A", rows: 3, renderer: "pileParts", thread: "pearl5",
      circumferenceMm: MARI_C_CM * 10, bodyRadiusMm: radius, roundEnvelopeRadiusMm: roundRadius, selectedMarks },
    operations: operations.filter(op => selected(op.mark)), parts,
    referenceParts: allParts.filter(p => referenceIds.has(p.partId) && !selectedIds.has(p.partId)), visits,
    limitations: [
      "Measurements of the current final three-row studio polylines; no equilibrium or craft acceptance is asserted.",
      "Recipe bite.enter/exit and axis/sphere crossings are distinct data. A centreline crossing is not a proven needle port or a finite-tube/body crossing.",
      "Previous means earlier rows in the final three-row geometry, including later compiler gather changes; it is not an immutable reconstruction of earlier visits.",
      "The prior-distance probes use only finite prior segments outside the mari. Hidden runs, material deformation, needle size and full tube mesh intersections are not checked.",
      "The r=0.355 mm circular envelope is a conservative diagnostic proxy for the 0.71 mm width, not the actual flattened/twisted cross-section. Negative proxy gaps do not prove physical penetration.",
      "The height window is the square |R dot(p,across)/dot(p,radial)| and |R dot(p,outward)/dot(p,radial)| <= 3 mm about each recipe mark. Heights are exact for these clipped polylines, not an unsampled smooth curve.",
    ] };
}
