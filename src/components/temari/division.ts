export type Division = "simple" | "c8" | "c10";

export const REGION_COUNT: Record<Division, number> = {
  simple: 16,
  c8: 8,
  c10: 20,
};

export const DIV_INDEX: Record<Division, number> = {
  simple: 0,
  c8: 1,
  c10: 2,
};

export const DIVISION_META: Record<
  Division,
  { label: string; hint: string }
> = {
  simple: { label: "Простое", hint: "полюса, экватор, восемь долек" },
  c8: { label: "C8", hint: "Simple 8 плюс квадрат у полюса" },
  c10: { label: "C10", hint: "пятиугольник у полюса, двенадцать центров" },
};

const T = (1 + Math.sqrt(5)) / 2;

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

const RAW_VERTS: [number, number, number][] = [
  [0, 1, T],
  [0, -1, T],
  [0, 1, -T],
  [0, -1, -T],
  [1, T, 0],
  [-1, T, 0],
  [1, -T, 0],
  [-1, -T, 0],
  [T, 0, 1],
  [T, 0, -1],
  [-T, 0, 1],
  [-T, 0, -1],
];

export const ICOSA_VERTS: [number, number, number][] = RAW_VERTS.map(normalize);

/** 20 faces of the regular icosahedron, outward winding. Not a distance hunt. */
export const ICOSA_FACES: [number, number, number][] = [
  [0, 1, 8],
  [0, 10, 1],
  [0, 4, 5],
  [0, 8, 4],
  [0, 5, 10],
  [1, 7, 6],
  [1, 6, 8],
  [1, 10, 7],
  [2, 9, 3],
  [2, 3, 11],
  [2, 5, 4],
  [2, 4, 9],
  [2, 11, 5],
  [3, 6, 7],
  [3, 9, 6],
  [3, 7, 11],
  [4, 8, 9],
  [5, 11, 10],
  [6, 9, 8],
  [7, 10, 11],
];

export const ICOSA_FACE_NORMALS: [number, number, number][] = ICOSA_FACES.map(
  ([i, j, k]) => {
    const a = ICOSA_VERTS[i];
    const b = ICOSA_VERTS[j];
    const c = ICOSA_VERTS[k];
    return normalize([
      a[0] + b[0] + c[0],
      a[1] + b[1] + c[1],
      a[2] + b[2] + c[2],
    ]);
  },
);

export const ICOSA_EDGES: [number, number][] = (() => {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const [a, b, c] of ICOSA_FACES) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as [number, number][]) {
      const i = Math.min(p, q);
      const j = Math.max(p, q);
      const key = `${i}-${j}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  }
  return edges;
})();

export function emptyFills(division: Division): number[] {
  return Array.from({ length: REGION_COUNT[division] }, () => -1);
}

export function padFills(fills: number[] | undefined, division: Division): number[] {
  const n = REGION_COUNT[division];
  const next = emptyFills(division);
  if (!fills) return next;
  for (let i = 0; i < n; i++) {
    const v = fills[i];
    next[i] = typeof v === "number" && v >= -1 && v <= 3 ? v : -1;
  }
  return next;
}

export function regionIndex(
  x: number,
  y: number,
  z: number,
  division: Division,
): number {
  const len = Math.hypot(x, y, z) || 1;
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;

  if (division === "simple") {
    let phi = Math.atan2(nx, nz);
    if (phi < 0) phi += Math.PI * 2;
    let sector = Math.floor((phi / (Math.PI * 2)) * 8);
    if (sector > 7) sector = 7;
    if (sector < 0) sector = 0;
    return sector + (ny >= 0 ? 0 : 8);
  }

  if (division === "c8") {
    const sx = nx >= 0 ? 1 : 0;
    const sy = ny >= 0 ? 1 : 0;
    const sz = nz >= 0 ? 1 : 0;
    return sx + sy * 2 + sz * 4;
  }

  let best = 0;
  let maxDot = -2;
  for (let i = 0; i < ICOSA_FACE_NORMALS.length; i++) {
    const n = ICOSA_FACE_NORMALS[i];
    const dot = nx * n[0] + ny * n[1] + nz * n[2];
    if (dot > maxDot) {
      maxDot = dot;
      best = i;
    }
  }
  return best;
}

export function polePositions(division: Division): [number, number, number][] {
  if (division === "simple") return [
    [0, 1, 0],
    [0, -1, 0],
  ];
  if (division === "c8") {
    return [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
  }
  return ICOSA_VERTS;
}

function pushNode(
  out: [number, number, number][],
  p: [number, number, number],
  minDot = 0.998,
) {
  const n = normalize(p);
  for (const q of out) {
    if (q[0] * n[0] + q[1] * n[1] + q[2] * n[2] > minDot) return;
  }
  out.push(n);
}

const NODE_CACHE: Partial<Record<Division, [number, number, number][]>> = {};

/** Jiwari nodes: poles, equator / tropic crossings, face and edge centres. */
export function gridNodes(division: Division): [number, number, number][] {
  const cached = NODE_CACHE[division];
  if (cached) return cached;
  const out: [number, number, number][] = [];
  if (division === "simple") {
    pushNode(out, [0, 1, 0]);
    pushNode(out, [0, -1, 0]);
    for (const h of [0, 0.5, -0.5, 0.78, -0.78]) {
      const r = Math.sqrt(Math.max(0, 1 - h * h));
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        pushNode(out, [r * Math.sin(a), h, r * Math.cos(a)]);
      }
    }
  } else if (division === "c8") {
    for (const p of polePositions("c8")) pushNode(out, p);
    const axes = polePositions("c8");
    for (let i = 0; i < axes.length; i++) {
      for (let j = i + 1; j < axes.length; j++) {
        const a = axes[i];
        const b = axes[j];
        const sx = a[0] + b[0];
        const sy = a[1] + b[1];
        const sz = a[2] + b[2];
        if (Math.hypot(sx, sy, sz) < 0.5) continue;
        pushNode(out, [sx, sy, sz]);
      }
    }
    for (const sx of [-1, 1] as const) {
      for (const sy of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          pushNode(out, [sx, sy, sz]);
        }
      }
    }
  } else {
    for (const v of ICOSA_VERTS) pushNode(out, v);
    for (const n of ICOSA_FACE_NORMALS) pushNode(out, n);
    for (const [i, j] of ICOSA_EDGES) {
      const a = ICOSA_VERTS[i];
      const b = ICOSA_VERTS[j];
      if (!a || !b) continue;
      pushNode(out, [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
    }
  }
  NODE_CACHE[division] = out;
  return out;
}

export function snapToNode(
  local: [number, number, number],
  division: Division,
): [number, number, number] {
  const nodes = gridNodes(division);
  const len = Math.hypot(local[0], local[1], local[2]) || 1;
  const x = local[0] / len;
  const y = local[1] / len;
  const z = local[2] / len;
  let best = nodes[0] ?? [0, 1, 0];
  let score = -2;
  for (const n of nodes) {
    const d = n[0] * x + n[1] * y + n[2] * z;
    if (d > score) {
      score = d;
      best = n;
    }
  }
  return best;
}


export function showcaseFills(division: Division): number[] {
  const n = REGION_COUNT[division];
  if (division === "simple") {
    return Array.from({ length: n }, (_, i) => {
      const sector = i % 8;
      const south = i >= 8;
      if (south) return sector % 2 === 0 ? 1 : 3;
      return sector % 2 === 0 ? 0 : 2;
    });
  }
  if (division === "c8") {
    return Array.from({ length: n }, (_, i) => {
      const sx = i & 1;
      const sy = (i >> 1) & 1;
      const sz = (i >> 2) & 1;
      return (sx + sy + sz) % 2 === 0 ? 0 : 2;
    });
  }
  return Array.from({ length: n }, (_, i) => {
    const y = ICOSA_FACE_NORMALS[i]?.[1] ?? 0;
    if (y > 0.45) return 0;
    if (y > 0) return 2;
    if (y > -0.45) return 1;
    return 3;
  });
}

export function fillsMatch(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
