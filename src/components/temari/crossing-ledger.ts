import { MARI_C_CM } from "./measure.ts";
import { KIKU_8_POINT, type KagariMark, type KagariOp } from "./kagari.ts";
import { traceKagariOperations } from "./kagari-topology.ts";

type Vec3 = [number, number, number];

/**
 * Who lies on whom, read from the recipe alone — before any tube is built.
 *
 * Craft rule (GT14; TemariKai "kousa style"): a later thread lies over every
 * earlier thread it meets on the surface. The woven look of two sets comes
 * only from the order of rounds; the needle does no over/under weaving.
 * Two sourced exceptions:
 * - a catch: the needle passes under the pile inside the wrap;
 * - underpassing: the run into the last stitch of a round goes under the
 *   starting run of that round (TemariKai names uwagake chidori explicitly).
 *
 * Geometry here is the recipe's lay on the unit sphere: working end → via →
 * far port of the catch. Heights, tubes and contact are not modelled.
 */

export type LedgerSpan = {
  order: number;
  operationId: string;
  threadId: string;
  pole: number;
  set: 0 | 1;
  kai: number;
  /** The catch this run arrives at. */
  mark: KagariMark;
  /** Catch this run leaves from; null where the thread starts or resumes. */
  leaves: string | null;
  firstOfRound: boolean;
  lastOfRound: boolean;
  path: Vec3[];
};

export type LedgerRule = "later-over" | "underpass-closure";

export type LedgerCrossing = {
  top: string;
  under: string;
  rule: LedgerRule;
  /** Both runs meet a catch as its arriving and leaving flank: the chidori X. */
  chidori: boolean;
  sameThread: boolean;
  at: Vec3;
  poleMm: number;
  near: { operationId: string; mm: number };
};

export type LedgerCatch = {
  operationId: string;
  /** Earlier runs lying across the bite: the needle goes under them. */
  under: string[];
  /** Earlier catches at this mark whose arriving or leaving run is under the needle. */
  catches: string[];
  /** Catches the compiler declares for this bite (`overOperations`). */
  declared: string[];
  /** Half the bite across the line, mm. */
  halfMm: number;
  /** Declared catches the needle misses: where their runs cross the bite line, mm from the mark. */
  missed: { operationId: string; lateralMm: number[] }[];
};

export type CrossingLedger = {
  spans: LedgerSpan[];
  crossings: LedgerCrossing[];
  catches: LedgerCatch[];
};

const R_MM = (MARI_C_CM * 10) / (2 * Math.PI);

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

function angle(a: Vec3, b: Vec3) {
  return Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));
}

function dist2(a: Vec3, b: Vec3) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/** Where two short great-circle arcs cross, or null. Shared ends do not count. */
function arcCrossing(p1: Vec3, p2: Vec3, q1: Vec3, q2: Vec3): Vec3 | null {
  const n1 = cross(p1, p2);
  const n2 = cross(q1, q2);
  if (Math.hypot(...n1) < 1e-14 || Math.hypot(...n2) < 1e-14) return null;
  const line = cross(n1, n2);
  if (Math.hypot(...line) < 1e-14) return null;
  let x = normalize(line);
  if (dot(x, [p1[0] + p2[0], p1[1] + p2[1], p1[2] + p2[2]]) < 0) x = [-x[0], -x[1], -x[2]];
  const inside = (a: Vec3, b: Vec3, n: Vec3) =>
    dot(cross(a, x), n) > 1e-15 && dot(cross(x, b), n) > 1e-15;
  return inside(p1, p2, n1) && inside(q1, q2, n2) ? x : null;
}

function pathCrossings(a: Vec3[], b: Vec3[]): Vec3[] {
  const hits: Vec3[] = [];
  for (let i = 1; i < a.length; i++) {
    for (let k = 1; k < b.length; k++) {
      const x = arcCrossing(a[i - 1]!, a[i]!, b[k - 1]!, b[k]!);
      if (x && !hits.some((h) => dist2(h, x) < 1e-12)) hits.push(x);
    }
  }
  return hits;
}

/** Where a run crosses the great circle `normal` near `mark` (same hemisphere, within ~25°). */
function lineCrossings(path: Vec3[], normal: Vec3, mark: Vec3): Vec3[] {
  const hits: Vec3[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const da = dot(a, normal);
    const db = dot(b, normal);
    if (da * db > 0 || da === db) continue;
    const t = da / (da - db);
    const x = normalize([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    if (dot(x, mark) > 0.9) hits.push(x);
  }
  return hits;
}

/** Far port: the needle goes in across the line from the arriving flank. */
function ports(op: KagariOp): { far: Vec3; near: Vec3 } {
  const { enter, exit } = op.bite;
  return dist2(op.lay.from, enter) < dist2(op.lay.from, exit)
    ? { far: exit, near: enter }
    : { far: enter, near: exit };
}

export function buildCrossingLedger(
  ops: readonly KagariOp[],
  recipeId = KIKU_8_POINT.id,
): CrossingLedger {
  const traces = traceKagariOperations(ops, recipeId);
  const idOf = new Map(ops.map((op, i) => [op.i, traces[i]!.operationId]));
  const round = (op: KagariOp) => `${traces[ops.indexOf(op)]!.threadId}/r${op.kai}`;
  const firstInRound = new Map<string, number>();
  const lastInRound = new Map<string, number>();
  for (const op of ops) {
    const key = round(op);
    if (!firstInRound.has(key)) firstInRound.set(key, op.i);
    lastInRound.set(key, op.i);
  }

  const spans: LedgerSpan[] = ops.map((op, i) => {
    const trace = traces[i]!;
    const prevId = trace.previousInThread;
    const prev = prevId ? ops[traces.findIndex((t) => t.operationId === prevId)] : undefined;
    // The working end: a resumed thread continues from its parked port, any
    // other from the near port of its previous catch; only the start is laid.
    const start: Vec3 = op.resume?.at ?? (prev ? ports(prev).near : op.lay.from);
    return {
      order: op.i,
      operationId: trace.operationId,
      threadId: trace.threadId,
      pole: op.pole,
      set: op.set,
      kai: op.kai,
      mark: op.mark,
      leaves: prevId,
      firstOfRound: firstInRound.get(round(op)) === op.i,
      lastOfRound: lastInRound.get(round(op)) === op.i,
      path: [start, ...(op.lay.via ?? []), ports(op).far],
    };
  });

  const poles = new Map<number, Vec3>();
  for (const op of ops) {
    if (op.mark.t !== "inner") continue;
    const sum = poles.get(op.pole) ?? [0, 0, 0];
    poles.set(op.pole, [sum[0] + op.mark.at[0], sum[1] + op.mark.at[1], sum[2] + op.mark.at[2]]);
  }
  for (const [k, v] of poles) poles.set(k, normalize(v));

  const nearestCatch = (x: Vec3) => {
    let best = { operationId: "", mm: Infinity };
    for (const op of ops) {
      const mm = angle(x, op.mark.at) * R_MM;
      if (mm < best.mm) best = { operationId: idOf.get(op.i)!, mm };
    }
    return best;
  };

  const crossings: LedgerCrossing[] = [];
  for (let i = 0; i < spans.length; i++) {
    for (let k = i + 1; k < spans.length; k++) {
      const early = spans[i]!;
      const late = spans[k]!;
      if (early.pole !== late.pole) continue;
      for (const at of pathCrossings(early.path, late.path)) {
        const sameThread = early.threadId === late.threadId;
        const closure = sameThread && early.kai === late.kai
          && early.firstOfRound && late.lastOfRound;
        crossings.push({
          top: closure ? early.operationId : late.operationId,
          under: closure ? late.operationId : early.operationId,
          rule: closure ? "underpass-closure" : "later-over",
          chidori: late.leaves === early.operationId,
          sameThread,
          at,
          poleMm: angle(at, poles.get(early.pole) ?? at) * R_MM,
          near: nearestCatch(at),
        });
      }
    }
  }

  const catches: LedgerCatch[] = ops.map((op, i) => {
    const { far, near } = ports(op);
    const chord: Vec3[] = [far, near];
    const under: string[] = [];
    const caught = new Set<string>();
    for (const span of spans) {
      if (span.order >= op.i || span.pole !== op.pole) continue;
      if (pathCrossings(span.path, chord).length === 0) continue;
      under.push(span.operationId);
      const sameMark = (m: KagariMark) => m.line === op.mark.line && m.t === op.mark.t;
      if (sameMark(span.mark)) caught.add(span.operationId);
      const left = span.leaves ? spans.find((s) => s.operationId === span.leaves) : undefined;
      if (left && sameMark(left.mark)) caught.add(left.operationId);
    }
    const declared = traces[i]!.overOperations;
    const line = normalize(cross(far, near));
    const along = normalize(cross(line, op.mark.at));
    const missed = declared.filter((id) => !caught.has(id)).map((id) => {
      const runs = spans.filter((s) => s.operationId === id || s.leaves === id);
      const lateralMm = runs.flatMap((s) => lineCrossings(s.path, line, op.mark.at))
        .map((x) => Math.sign(dot(x, along)) * angle(x, op.mark.at) * R_MM);
      return { operationId: id, lateralMm };
    });
    return {
      operationId: traces[i]!.operationId,
      under,
      catches: [...caught],
      declared,
      halfMm: (angle(far, near) * R_MM) / 2,
      missed,
    };
  });

  return { spans, crossings, catches };
}
