import { ICOSA_EDGES, ICOSA_VERTS, type Division } from "./division";
import type { Pin } from "./craft";
import type { Stitch, Vec3 } from "./patterns";

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

/** Great-circle normals for a standard division (TemariKai). */
export function jiwariNormals(division: Division): Vec3[] {
  if (division === "simple") {
    const s = Math.SQRT1_2;
    return uniqueNormals([
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
      [s, 0, s],
      [s, 0, -s],
    ]);
  }
  if (division === "c8") {
    return uniqueNormals([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [1, -1, 0],
      [1, 0, 1],
      [1, 0, -1],
      [0, 1, 1],
      [0, 1, -1],
    ]);
  }
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
    lift: 0.006,
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
