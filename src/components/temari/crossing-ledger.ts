import { MARI_C_CM, STITCH_THREAD_MM } from "./measure.ts";
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
  /** Earlier runs whose centreline passes between the ports: the needle goes under them. */
  under: string[];
  /** Declared catches both of whose runs pass between the ports, a thread radius clear. */
  catches: string[];
  /** Catches the compiler declares for this bite (`overOperations`). */
  declared: string[];
  /** Half the bite along the mark's latitude, mm. */
  halfMm: number;
  /** Declared catches not enclosed: where their runs cross the bite's latitude, mm from the mark. */
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

/** Great-circle arcs cut to ≤ ~0.15 mm, so a chord stands in for its arc. */
function densify(path: Vec3[]): Vec3[] {
  const out: Vec3[] = path.slice(0, 1);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.ceil(angle(a, b) / 0.004));
    const w = angle(a, b);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const s = Math.sin(w) || 1;
      const u = w < 1e-9 ? 1 - t : Math.sin((1 - t) * w) / s;
      const v = w < 1e-9 ? t : Math.sin(t * w) / s;
      out.push(normalize([a[0] * u + b[0] * v, a[1] * u + b[1] * v, a[2] * u + b[2] * v]));
    }
  }
  return out;
}

/** Where a run crosses the latitude circle of `mark` about `pole`. */
function latitudeCrossings(run: Vec3[], pole: Vec3, mark: Vec3): Vec3[] {
  const level = dot(mark, pole);
  const path = densify(run);
  const hits: Vec3[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const da = dot(a, pole) - level;
    const db = dot(b, pole) - level;
    if (da * db > 0 || da === db) continue;
    const t = da / (da - db);
    hits.push(normalize([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
  }
  return hits;
}

/** Signed arc length along the mark's latitude, mm; positive toward `toward`. */
function latitudeFrame(pole: Vec3, mark: Vec3, toward: Vec3) {
  const c = dot(mark, pole);
  const e1 = normalize([mark[0] - pole[0] * c, mark[1] - pole[1] * c, mark[2] - pole[2] * c]);
  const e2 = cross(pole, e1);
  const sinT = Math.sqrt(Math.max(0, 1 - c * c));
  const phi = (x: Vec3) => Math.atan2(dot(x, e2), dot(x, e1));
  const sign = phi(toward) < 0 ? -1 : 1;
  return (x: Vec3) => sign * phi(x) * sinT * R_MM;
}

/** Far port: the needle goes in across the line from the arriving flank. */
function ports(op: KagariOp): { far: Vec3; near: Vec3 } {
  const { enter, exit } = op.bite;
  return dist2(op.lay.from, enter) < dist2(op.lay.from, exit)
    ? { far: exit, near: enter }
    : { far: enter, near: exit };
}

/** The operation before `i` on the same working thread (same pole and set). */
function previousOnThread(ops: readonly KagariOp[], i: number): KagariOp | undefined {
  const op = ops[i]!;
  for (let k = i - 1; k >= 0; k--) {
    if (ops[k]!.pole === op.pole && ops[k]!.set === op.set) return ops[k];
  }
  return undefined;
}

/**
 * Visible run arriving at `ops[i]`: from the working end — the parked port on
 * resume, else the near port of the previous catch, else the laid start —
 * along the lay to the far port.
 */
export function arrivingRun(ops: readonly KagariOp[], i: number): Vec3[] {
  const op = ops[i]!;
  const prev = previousOnThread(ops, i);
  const start: Vec3 = op.resume?.at ?? (prev ? ports(prev).near : op.lay.from);
  return [start, ...(op.lay.via ?? []), ports(op).far];
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
      path: arrivingRun(ops, i),
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

  // The bite runs along the mark's latitude (biteAcross turns the mark about
  // the pole), so runs are measured where they cross that circle.
  const radius = STITCH_THREAD_MM.pearl5 / 2;
  const catches: LedgerCatch[] = ops.map((op, i) => {
    const { far, near } = ports(op);
    const pole = poles.get(op.pole) ?? op.mark.at;
    const lateral = latitudeFrame(pole, op.mark.at, far);
    const halfMm = lateral(far);
    const across = (s: LedgerSpan) => latitudeCrossings(s.path, pole, op.mark.at).map(lateral);
    const under: string[] = [];
    for (const span of spans) {
      if (span.order >= op.i || span.pole !== op.pole) continue;
      if (across(span).some((mm) => Math.abs(mm) < halfMm)) under.push(span.operationId);
    }
    const declared = traces[i]!.overOperations;
    // Enclosed: both runs of the earlier catch pass between the ports with a
    // thread radius to spare — a port on a thread pierces it.
    const runsOf = (id: string) => spans.filter((s) => s.operationId === id || s.leaves === id);
    const lateralOf = (id: string) => runsOf(id).flatMap(across);
    const encloses = (id: string) => {
      const runs = runsOf(id);
      return runs.length === 2
        && runs.every((s) => across(s).some((mm) => Math.abs(mm) + radius <= halfMm));
    };
    return {
      operationId: traces[i]!.operationId,
      under,
      catches: declared.filter(encloses),
      declared,
      halfMm,
      missed: declared.filter((id) => !encloses(id))
        .map((id) => ({ operationId: id, lateralMm: lateralOf(id) })),
    };
  });

  return { spans, crossings, catches };
}
