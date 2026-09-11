import { ICOSA_EDGES, ICOSA_VERTS, type Division } from "./division.ts";
import type { Pin } from "./craft.ts";
import type { Stitch, Vec3 } from "./patterns.ts";

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function circle(normal: Vec3, count = 96): Vec3[] {
  const n = norm(normal);
  const ref: Vec3 = Math.abs(n[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0];
  const x = norm(cross(n, ref));
  const y = norm(cross(n, x));
  const pts: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push([x[0] * c + y[0] * s, x[1] * c + y[1] * s, x[2] * c + y[2] * s]);
  }
  return pts;
}

export function isGreatCircle(points: Vec3[], eps = 2e-3): boolean {
  if (points.length < 8) return false;
  for (const p of points) {
    if (Math.abs(Math.hypot(p[0], p[1], p[2]) - 1) > eps) return false;
  }
  const a = points[0];
  const b = points[Math.floor(points.length / 4)] ?? points[1];
  if (!a || !b) return false;
  const n = norm(cross(a, b));
  if (Math.hypot(n[0], n[1], n[2]) < 0.5) return false;
  for (const p of points) {
    if (Math.abs(p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) > eps) return false;
  }
  return true;
}

function uniqueNormals(raw: Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (const v of raw) {
    let n = norm(v);
    if (n[1] < -1e-6 || (Math.abs(n[1]) < 1e-6 && n[0] < 0)) {
      n = [-n[0], -n[1], -n[2]];
    }
    if (out.some((q) => q[0] * n[0] + q[1] * n[1] + q[2] * n[2] > 0.995)) continue;
    out.push(n);
  }
  return out;
}

export type JiwariPhase =
  | "off"
  | "strip"
  | "poles"
  | "equator"
  | "meridians"
  | "combine"
  | "vruler"
  | "south"
  | "done";

const S = Math.SQRT1_2;

/** Simple 8: four meridians, equator last. TemariKai tanjyun toubun. */
export const SIMPLE_THREADS: Vec3[] = [
  [1, 0, 0],
  [S, 0, S],
  [0, 0, 1],
  [S, 0, -S],
  [0, 1, 0],
];

/** C8 extras: squares around the poles. Do not pass NP/SP. */
export const C8_EXTRA: Vec3[] = [
  [1, 1, 0],
  [1, -1, 0],
  [0, 1, 1],
  [0, 1, -1],
];

export function jiwariPhaseHint(phase: JiwariPhase, laid = 0): string {
  if (phase === "strip") return "Полоска: полный обхват";
  if (phase === "poles") return "Сгиб пополам — север и юг";
  if (phase === "equator") return "Четверть — экватор на восемь";
  if (phase === "meridians") {
    return laid < 4 ? "Нить: полюс — экватор — полюс" : "Нить по экватору";
  }
  if (phase === "combine") return "Квадрат у полюса — ещё большой круг";
  if (phase === "vruler") return "V 72° — пять центров у полюса";
  if (phase === "south") return "Тот же шаг на юге";
  return "";
}

export function simplePins(phase: JiwariPhase): Pin[] {
  const np: Vec3 = [0, 1, 0];
  const sp: Vec3 = [0, -1, 0];
  const eq: Vec3[] = Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 8;
    return [Math.sin(a), 0, Math.cos(a)];
  });
  if (phase === "poles") {
    return [np, sp].map((p, i) => ({ id: `j${i}`, p: norm(p) }));
  }
  if (
    phase === "equator" ||
    phase === "meridians" ||
    phase === "combine" ||
    phase === "done"
  ) {
    return [np, sp, ...eq].map((p, i) => ({ id: `j${i}`, p: norm(p) }));
  }
  return [];
}

/** Six 8-point centers (octahedron) plus eight 6-point (cube verts). */
export function c8Pins(): Pin[] {
  const cube: Vec3[] = [];
  for (const x of [-1, 1] as const) {
    for (const y of [-1, 1] as const) {
      for (const z of [-1, 1] as const) {
        cube.push(norm([x, y, z]));
      }
    }
  }
  return [
    ...simplePins("done"),
    ...cube.map((p, i) => ({ id: `c8t${i}`, p })),
  ];
}

export function simpleStitches(laid: number, color: number): Stitch[] {
  return SIMPLE_THREADS.slice(0, Math.max(0, Math.min(5, laid))).map((n) => ({
    kind: "loop" as const,
    points: circle(n),
    color,
    lift: 0,
  }));
}

export function c8Stitches(extraLaid: number, color: number): Stitch[] {
  const extra = C8_EXTRA.slice(0, Math.max(0, Math.min(4, extraLaid))).map((n) => ({
    kind: "loop" as const,
    points: circle(n),
    color,
    lift: 0,
  }));
  return [...simpleStitches(5, color), ...extra];
}

function icosaNorth(): number {
  let best = 0;
  for (let i = 1; i < ICOSA_VERTS.length; i++) {
    const v = ICOSA_VERTS[i];
    const b = ICOSA_VERTS[best];
    if (v && b && v[1] > b[1]) best = i;
  }
  return best;
}

function icosaOpposite(i: number): number {
  const n = ICOSA_VERTS[i];
  let best = 0;
  let score = 1;
  for (let k = 0; k < ICOSA_VERTS.length; k++) {
    const v = ICOSA_VERTS[k];
    if (!n || !v) continue;
    const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
    if (d < score) {
      score = d;
      best = k;
    }
  }
  return best;
}

function icosaRing(i: number): Vec3[] {
  const pole = ICOSA_VERTS[i];
  if (!pole) return [];
  const ids: number[] = [];
  for (const [a, b] of ICOSA_EDGES) {
    if (a === i) ids.push(b);
    else if (b === i) ids.push(a);
  }
  const ref: Vec3 = Math.abs(pole[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0];
  const x = norm(cross(pole, ref));
  const y = norm(cross(pole, x));
  ids.sort((p, q) => {
    const av = ICOSA_VERTS[p];
    const bv = ICOSA_VERTS[q];
    if (!av || !bv) return 0;
    const ap = Math.atan2(
      av[0] * y[0] + av[1] * y[1] + av[2] * y[2],
      av[0] * x[0] + av[1] * x[1] + av[2] * x[2],
    );
    const bp = Math.atan2(
      bv[0] * y[0] + bv[1] * y[1] + bv[2] * y[2],
      bv[0] * x[0] + bv[1] * x[1] + bv[2] * x[2],
    );
    return ap - bp;
  });
  return ids.map((id) => ICOSA_VERTS[id]).filter((v): v is Vec3 => !!v).map(norm);
}

const C10_NORTH = icosaNorth();
const C10_SOUTH = icosaOpposite(C10_NORTH);

export function c10NorthPole(): Vec3 {
  return norm(ICOSA_VERTS[C10_NORTH] ?? [0, 1, 0]);
}

export function c10SouthPole(): Vec3 {
  return norm(ICOSA_VERTS[C10_SOUTH] ?? [0, -1, 0]);
}

export function c10NorthRing(): Vec3[] {
  return icosaRing(C10_NORTH);
}

export function c10SouthRing(): Vec3[] {
  return icosaRing(C10_SOUTH);
}

export function c10Pins(phase: JiwariPhase, laid: number): Pin[] {
  const np = c10NorthPole();
  const sp = c10SouthPole();
  const nr = c10NorthRing();
  const sr = c10SouthRing();
  const pts: Vec3[] = [];
  if (phase === "vruler") {
    pts.push(np, ...nr.slice(0, Math.max(0, Math.min(5, laid))));
  } else if (phase === "south") {
    pts.push(np, ...nr, sp, ...sr.slice(0, Math.max(0, Math.min(5, laid))));
  } else {
    for (const v of ICOSA_VERTS) pts.push(norm(v));
  }
  return pts.map((p, i) => ({ id: `c10${i}`, p }));
}

export function vRulerLegs(phase: JiwariPhase): { origin: Vec3; a: Vec3; b: Vec3 } | null {
  if (phase === "vruler") {
    const ring = c10NorthRing();
    const a = ring[0];
    const b = ring[1];
    if (!a || !b) return null;
    return { origin: c10NorthPole(), a, b };
  }
  if (phase === "south") {
    const ring = c10SouthRing();
    const a = ring[0];
    const b = ring[1];
    if (!a || !b) return null;
    return { origin: c10SouthPole(), a, b };
  }
  return null;
}

export function jiwariVisibleStitches(
  division: Division,
  color: number,
  phase: JiwariPhase,
  laid: number,
): Stitch[] {
  if (division === "simple") {
    if (phase === "done") return simpleStitches(5, color);
    if (phase === "meridians") return simpleStitches(laid, color);
    return [];
  }
  if (division === "c8") {
    if (phase === "combine") return c8Stitches(laid, color);
    if (phase === "done") return c8Stitches(4, color);
    return simpleStitches(5, color);
  }
  if (division === "c10") {
    const all = jiwariStitches("c10", color);
    if (phase === "done") return all;
    if (phase === "meridians") return all.slice(0, Math.max(0, laid));
    return [];
  }
  return jiwariStitches(division, color);
}

export function jiwariVisiblePins(division: Division, phase: JiwariPhase, laid = 0): Pin[] {
  if (division === "simple") return simplePins(phase);
  if (division === "c8") {
    if (phase === "combine" || phase === "done") return c8Pins();
    return simplePins("done");
  }
  if (division === "c10") return c10Pins(phase, laid);
  return jiwariPins(division);
}

export function jiwariNormals(division: Division): Vec3[] {
  if (division === "simple") return uniqueNormals(SIMPLE_THREADS);
  if (division === "c8") return uniqueNormals([...SIMPLE_THREADS, ...C8_EXTRA]);
  const raw: Vec3[] = [];
  for (const [i, j] of ICOSA_EDGES) {
    const a = ICOSA_VERTS[i];
    const b = ICOSA_VERTS[j];
    if (!a || !b) continue;
    raw.push(cross(a, b));
  }
  return uniqueNormals(raw);
}

export function jiwariStitches(division: Division, color = 1): Stitch[] {
  return jiwariNormals(division).map((n) => ({
    kind: "loop" as const,
    points: circle(n),
    color,
    lift: 0,
  }));
}

export function jiwariPins(division: Division): Pin[] {
  const pts: Vec3[] =
    division === "simple"
      ? [
          [0, 1, 0],
          [0, -1, 0],
          ...Array.from({ length: 8 }, (_, i) => {
            const a = (Math.PI * 2 * i) / 8;
            return [Math.sin(a), 0, Math.cos(a)] as Vec3;
          }),
        ]
      : division === "c8"
        ? [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ]
        : ICOSA_VERTS.map((v) => norm(v));
  return pts.map((p, i) => ({ id: `j${i}`, p: norm(p) }));
}

export function jiwariMarkColor(wrapColor: number) {
  return wrapColor === 1 ? 2 : 1;
}
