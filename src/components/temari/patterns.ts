import { polePositions, type Division } from "./division";

export type KikuSlot = { pole: number; ring: number; sector: number };

export type SewnEntry = { key: string; color: number };

export type MotifId = "none" | "kiku" | "hoshi" | "hishi" | "obi";

export type Vec3 = [number, number, number];

export type Stitch =
  | { kind: "arc"; a: Vec3; b: Vec3; color: number }
  | { kind: "loop"; points: Vec3[]; color: number };

export const MOTIF_META: Record<MotifId, { label: string; hint: string }> = {
  none: { label: "Нет", hint: "стежок за стежком по сетке деления" },
  kiku: { label: "Кику", hint: "хризантема: ёлочка от полюса" },
  hoshi: { label: "Хоси", hint: "звезда {n/k} на малом круге" },
  hishi: { label: "Хиси", hint: "вложенные многоугольники у полюсов" },
  obi: { label: "Оби", hint: "пояса — малые круги параллельно экватору" },
};

export const MOTIF_LIST: MotifId[] = ["none", "kiku", "hoshi", "hishi", "obi"];

export function isMotifId(value: unknown): value is MotifId {
  return (
    value === "none" ||
    value === "kiku" ||
    value === "hoshi" ||
    value === "hishi" ||
    value === "obi"
  );
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function hypot3(a: Vec3) {
  return Math.hypot(a[0], a[1], a[2]);
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(a: Vec3): Vec3 {
  const len = hypot3(a) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

function frame(pole: Vec3): [Vec3, Vec3] {
  const ref: Vec3 = Math.abs(pole[1]) < 0.88 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(pole, ref));
  const v = normalize(cross(pole, u));
  return [u, v];
}

/** Point at colatitude θ, azimuth φ around a unit pole. */
function around(pole: Vec3, theta: number, phi: number): Vec3 {
  const p = normalize(pole);
  const [u, v] = frame(p);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  return [
    p[0] * ct + (u[0] * cp + v[0] * sp) * st,
    p[1] * ct + (u[1] * cp + v[1] * sp) * st,
    p[2] * ct + (u[2] * cp + v[2] * sp) * st,
  ];
}

function polarAround(pole: Vec3, point: Vec3) {
  const n = normalize(pole);
  const p = normalize(point);
  const [u, v] = frame(n);
  const theta = Math.acos(Math.min(1, Math.max(-1, dot(n, p))));
  let phi = Math.atan2(dot(p, v), dot(p, u));
  if (phi < 0) phi += Math.PI * 2;
  return { theta, phi };
}

export function slotKey(slot: KikuSlot) {
  return `${slot.pole}:${slot.ring}:${slot.sector}`;
}

export function stitchesForSlot(
  division: Division,
  slot: KikuSlot,
  color: number,
): Stitch[] {
  const poles = polePositions(division);
  const pole = poles[slot.pole];
  if (!pole) return [];
  const n = petalCount(division);
  const { theta0, delta, rounds } = kikuSpec(division);
  if (slot.ring < 0 || slot.ring >= rounds) return [];
  if (slot.sector < 0 || slot.sector >= n) return [];
  const inner = theta0 + slot.ring * delta;
  const outer = inner + delta * 0.9;
  const a = (2 * Math.PI * slot.sector) / n;
  const b = (2 * Math.PI * (slot.sector + 1)) / n;
  const mid = (a + b) / 2;
  const A = around(pole, inner, a);
  const T = around(pole, outer, mid);
  const C = around(pole, inner, b);
  return [
    { kind: "arc", a: A, b: T, color },
    { kind: "arc", a: T, b: C, color },
  ];
}

export function hitKikuSlot(
  x: number,
  y: number,
  z: number,
  division: Division,
): KikuSlot | null {
  const poles = polePositions(division);
  const p: Vec3 = [x, y, z];
  let pole = 0;
  let best = -2;
  for (let i = 0; i < poles.length; i++) {
    const d = dot(normalize(poles[i]), normalize(p));
    if (d > best) {
      best = d;
      pole = i;
    }
  }
  const { theta, phi } = polarAround(poles[pole], p);
  const n = petalCount(division);
  const { theta0, delta, rounds } = kikuSpec(division);
  if (theta < theta0 * 0.45) return null;
  const ring = Math.floor((theta - theta0) / delta);
  if (ring < 0 || ring >= rounds) return null;
  let sector = Math.floor((phi / (Math.PI * 2)) * n);
  if (sector >= n) sector = n - 1;
  if (sector < 0) sector = 0;
  return { pole, ring, sector };
}

export function fillKikuSewn(division: Division): SewnEntry[] {
  const poles = polePositions(division).length;
  const n = petalCount(division);
  const { rounds } = kikuSpec(division);
  const sewn: SewnEntry[] = [];
  for (let pole = 0; pole < poles; pole++) {
    for (let ring = 0; ring < rounds; ring++) {
      const color = ring % 2 === 0 ? 0 : 2;
      for (let sector = 0; sector < n; sector++) {
        sewn.push({ key: slotKey({ pole, ring, sector }), color });
      }
    }
  }
  return sewn;
}

export function stitchesFromSewn(division: Division, sewn: SewnEntry[]): Stitch[] {
  const out: Stitch[] = [];
  for (const item of sewn) {
    const [pole, ring, sector] = item.key.split(":").map(Number);
    out.push(...stitchesForSlot(division, { pole, ring, sector }, item.color));
  }
  return out;
}

function smallCircle(normal: Vec3, height: number, count = 96): Vec3[] {
  const n = normalize(normal);
  const [u, v] = frame(n);
  const r = Math.sqrt(Math.max(0, 1 - height * height));
  const pts: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    pts.push(
      normalize([
        n[0] * height + r * (u[0] * ca + v[0] * sa),
        n[1] * height + r * (u[1] * ca + v[1] * sa),
        n[2] * height + r * (u[2] * ca + v[2] * sa),
      ]),
    );
  }
  return pts;
}

function petalCount(division: Division) {
  return division === "c10" ? 5 : 8;
}

function starSkip(division: Division) {
  return division === "c10" ? 2 : 3;
}

function kikuSpec(division: Division) {
  if (division === "simple") return { theta0: 0.16, delta: 0.1, rounds: 7 };
  if (division === "c8") return { theta0: 0.12, delta: 0.085, rounds: 6 };
  return { theta0: 0.11, delta: 0.072, rounds: 5 };
}

function kiku(division: Division): Stitch[] {
  const n = petalCount(division);
  const { theta0, delta, rounds } = kikuSpec(division);
  const stitches: Stitch[] = [];
  for (const pole of polePositions(division)) {
    for (let r = 0; r < rounds; r++) {
      const inner = theta0 + r * delta;
      const outer = inner + delta * 0.9;
      const color = r % 2 === 0 ? 0 : 2;
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        const b = (2 * Math.PI * (i + 1)) / n;
        const mid = (a + b) / 2;
        const A = around(pole, inner, a);
        const T = around(pole, outer, mid);
        const C = around(pole, inner, b);
        stitches.push({ kind: "arc", a: A, b: T, color });
        stitches.push({ kind: "arc", a: T, b: C, color });
      }
    }
  }
  return stitches;
}

function hoshi(division: Division): Stitch[] {
  const n = petalCount(division);
  const skip = starSkip(division);
  const rings =
    division === "simple" ? [0.38, 0.58, 0.78] : division === "c8" ? [0.28, 0.44] : [0.26, 0.4];
  const stitches: Stitch[] = [];
  for (const pole of polePositions(division)) {
    rings.forEach((theta, ring) => {
      const color = ring % 2 === 0 ? 0 : 1;
      const pts = Array.from({ length: n }, (_, i) =>
        around(pole, theta, (2 * Math.PI * i) / n),
      );
      for (let i = 0; i < n; i++) {
        stitches.push({
          kind: "arc",
          a: pts[i],
          b: pts[(i + skip) % n],
          color,
        });
      }
    });
  }
  return stitches;
}

function hishi(division: Division): Stitch[] {
  const n = division === "c8" ? 4 : petalCount(division);
  const rings =
    division === "simple"
      ? [0.22, 0.38, 0.54, 0.7]
      : division === "c8"
        ? [0.18, 0.3, 0.42, 0.54]
        : [0.16, 0.28, 0.4];
  const stitches: Stitch[] = [];
  for (const pole of polePositions(division)) {
    rings.forEach((theta, ring) => {
      const color = ring % 2 === 0 ? 0 : 2;
      const pts = Array.from({ length: n }, (_, i) =>
        around(pole, theta, (2 * Math.PI * i) / n),
      );
      for (let i = 0; i < n; i++) {
        stitches.push({
          kind: "arc",
          a: pts[i],
          b: pts[(i + 1) % n],
          color,
        });
      }
    });
  }
  return stitches;
}

function obi(division: Division): Stitch[] {
  const stitches: Stitch[] = [];
  if (division === "simple") {
    const heights = [0, 0.32, -0.32, 0.58, -0.58];
    heights.forEach((h, i) => {
      stitches.push({
        kind: "loop",
        points: smallCircle([0, 1, 0], h),
        color: i % 2 === 0 ? 0 : 2,
      });
    });
    return stitches;
  }
  if (division === "c8") {
    const axes: Vec3[] = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ];
    axes.forEach((axis, ai) => {
      for (const h of [0.2, -0.2]) {
        stitches.push({
          kind: "loop",
          points: smallCircle(axis, h),
          color: ai === 0 ? 0 : 2,
        });
      }
    });
    return stitches;
  }
  const heights = [0, 0.28, -0.28, 0.52, -0.52];
  heights.forEach((h, i) => {
    stitches.push({
      kind: "loop",
      points: smallCircle([0, 1, 0], h),
      color: i % 2 === 0 ? 0 : 1,
    });
  });
  return stitches;
}

export function generateMotif(division: Division, motif: MotifId): Stitch[] {
  if (motif === "kiku") return kiku(division);
  if (motif === "hoshi") return hoshi(division);
  if (motif === "hishi") return hishi(division);
  if (motif === "obi") return obi(division);
  return [];
}

function midPhi(a: number, b: number) {
  let d = b - a;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  let m = a + d / 2;
  if (m < 0) m += Math.PI * 2;
  if (m >= Math.PI * 2) m -= Math.PI * 2;
  return m;
}

/** Chrysanthemum fill around the spherical centroid of 3+ pins. */
export function kikuArcsFromPins(
  pins: Vec3[],
  layers: number,
  color: number,
): { a: Vec3; b: Vec3; color: number }[] {
  if (pins.length < 3) return [];
  const pole = normalize([
    pins.reduce((s, p) => s + p[0], 0),
    pins.reduce((s, p) => s + p[1], 0),
    pins.reduce((s, p) => s + p[2], 0),
  ]);
  const sorted = pins
    .map((p) => ({ p, ...polarAround(pole, p) }))
    .sort((a, b) => a.phi - b.phi);
  const meanTheta =
    sorted.reduce((s, p) => s + p.theta, 0) / Math.max(1, sorted.length);
  const span = Math.max(0.22, meanTheta);
  const n = sorted.length;
  const L = Math.max(1, Math.min(8, Math.round(layers)));
  const arcs: { a: Vec3; b: Vec3; color: number }[] = [];
  for (let r = 0; r < L; r++) {
    const inner = span * (0.22 + r * 0.16);
    const outer = inner + span * 0.14;
    const c = r % 2 === 0 ? color : (color + 2) % 4;
    for (let i = 0; i < n; i++) {
      const a = sorted[i];
      const b = sorted[(i + 1) % n];
      if (!a || !b) continue;
      const A = around(pole, inner, a.phi);
      const C = around(pole, inner, b.phi);
      const T = around(pole, outer, midPhi(a.phi, b.phi));
      arcs.push({ a: A, b: T, color: c });
      arcs.push({ a: T, b: C, color: c });
    }
  }
  return arcs;
}

