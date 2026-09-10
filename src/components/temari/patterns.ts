import { polePositions, type Division } from "./division.ts";
import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";

export type KikuSlot = { pole: number; ring: number; sector: number };

export type SewnEntry = { key: string; color: number };

export type MotifId = "none" | "kiku" | "hoshi" | "hishi" | "obi";

export type Vec3 = [number, number, number];

export type Stitch =
  | { kind: "arc"; a: Vec3; b: Vec3; color: number; lift?: number }
  | { kind: "loop"; points: Vec3[]; color: number; lift?: number };

export const MOTIF_META: Record<MotifId, { label: string; hint: string }> = {
  none: { label: "Ряд", hint: "стежок за стежком по сетке" },
  kiku: { label: "Кику", hint: "увагакэ тидори: зигзаг по меридианам, два прохода" },
  hoshi: { label: "Хоси", hint: "звезда {n/k} на малом круге" },
  hishi: { label: "Хиси", hint: "вложенные многоугольники у полюсов" },
  obi: { label: "Оби", hint: "пояса — малые круги параллельно экватору" },
};

export const MOTIF_LIST: MotifId[] = ["none", "kiku", "hoshi", "hishi", "obi"];

export type KagariDir = "out" | "in";

export const KAGARI_DIR_META: Record<KagariDir, { label: string; hint: string }> = {
  out: { label: "Наружу", hint: "от центра к краю — лепесток растёт" },
  in: { label: "Внутрь", hint: "от большого края к центру — фигура густеет" },
};

export type KagariSpacing = "open" | "even" | "tight";

export const KAGARI_SPACING_META: Record<
  KagariSpacing,
  { label: string; density: number }
> = {
  open: { label: "Реже", density: 0.22 },
  even: { label: "Так", density: 0.5 },
  tight: { label: "Плотнее", density: 0.86 },
};

const KIKU_MAX = 36;

/** Angular step of one herringbone row. Packed ≈ 1.7 thread widths. */
export function kikuPitch(threadWidth: number, density: number) {
  const ang = 0.01 + Math.min(1, Math.max(0, threadWidth)) * 0.018;
  const airy = 5.6;
  const packed = 1.65;
  const d = Math.min(1, Math.max(0, density));
  return ang * (airy + (packed - airy) * d);
}

export function kagariPoles(pins: Vec3[]): Vec3[] {
  if (pins.length < 3) return [];
  const sum: Vec3 = [
    pins.reduce((s, p) => s + p[0], 0),
    pins.reduce((s, p) => s + p[1], 0),
    pins.reduce((s, p) => s + p[2], 0),
  ];
  const mag = hypot3(sum) / pins.length;
  if (mag >= 0.18) return [normalize(sum)];
  return [
    [0, 1, 0],
    [0, -1, 0],
  ];
}

function ringAround(pins: Vec3[], pole: Vec3): Vec3[] {
  const n = normalize(pole);
  return pins.filter((p) => {
    const d = dot(normalize(p), n);
    return d > -0.15 && d < 0.92;
  });
}

export function kikuCapacity(
  pins: Vec3[],
  threadWidth: number,
  density: number,
): { max: number; span: number; pitch: number; innerMin: number } {
  const empty = { max: 0, span: 0, pitch: 0, innerMin: 0 };
  const pole = kagariPoles(pins)[0];
  if (!pole) return empty;
  const ring = ringAround(pins, pole);
  if (ring.length < 3) return empty;
  const meanTheta =
    ring.reduce((s, p) => s + polarAround(pole, p).theta, 0) / ring.length;
  const pitch = kikuPitch(threadWidth, density);
  const innerMin = Math.max(0.045, pitch * 0.85);
  const outerMax = Math.max(innerMin + pitch, meanTheta - pitch * 0.25);
  const max = Math.max(1, Math.min(KIKU_MAX, Math.floor((outerMax - innerMin) / pitch)));
  return { max, span: meanTheta, pitch, innerMin };
}

/** Pins form a closed spherical polygon — fill is defined. An open arc is not. */
export function isClosedContour(pins: Vec3[]): boolean {
  if (pins.length < 3) return false;
  const sum: Vec3 = [
    pins.reduce((s, p) => s + p[0], 0),
    pins.reduce((s, p) => s + p[1], 0),
    pins.reduce((s, p) => s + p[2], 0),
  ];
  const mag = hypot3(sum) / pins.length;
  if (mag < 0.18) return true;
  const pole = normalize(sum);
  const phis = pins
    .map((p) => polarAround(pole, p).phi)
    .sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < phis.length; i++) {
    const a = phis[i] ?? 0;
    const b = i + 1 < phis.length ? (phis[i + 1] ?? 0) : (phis[0] ?? 0) + Math.PI * 2;
    maxGap = Math.max(maxGap, b - a);
  }
  return maxGap < Math.PI * 0.94;
}

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
export function around(pole: Vec3, theta: number, phi: number): Vec3 {
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
  const spec = kikuSpec(division);
  if (slot.ring < 0 || slot.ring >= spec.rounds) return [];
  if (slot.sector < 0 || slot.sector >= n) return [];
  return kikuPetal(pole, spec, slot.ring, slot.sector, n, color);
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
  const spec = kikuSpec(division);
  if (theta < spec.inner * 0.45) return null;
  const ring = Math.floor((theta - spec.inner + spec.pitch * 0.35) / spec.pitch);
  if (ring < 0 || ring >= spec.rounds) return null;
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
      const color = kikuColor(ring);
      for (const pass of [0, 1] as const) {
        for (let sector = 0; sector < n; sector++) {
          if (sector % 2 !== pass) continue;
          sewn.push({ key: slotKey({ pole, ring, sector }), color });
        }
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
  if (division === "c10") return 10;
  return 8;
}

function starSkip(division: Division) {
  return division === "c10" ? 3 : 3;
}

/** Simple: outer = ⅓ пути от экватора к полюсу. Шаг — толщина перле №5. */
export function kikuSpec(division: Division) {
  const pitch = unitFromMm(STITCH_THREAD_MM.pearl5);
  const gap = unitFromMm(2);
  const inner = gap;
  const outer =
    division === "simple" ? Math.PI / 3 : division === "c8" ? Math.PI / 4 : 0.52;
  const chord = pitch * 1.3;
  const fit = Math.max(1, Math.floor((outer - inner - chord) / pitch));
  const cap = division === "simple" ? 20 : 8;
  return { inner, chord, pitch, rounds: Math.min(cap, fit) };
}

function kikuColor(ring: number) {
  const cycle = [1, 2, 1, 3, 1, 2, 1];
  return cycle[ring % cycle.length] ?? 1;
}

function kikuPetal(
  pole: Vec3,
  spec: { inner: number; chord: number; pitch: number; rounds: number },
  ring: number,
  sector: number,
  n: number,
  color: number,
): Stitch[] {
  const inner = spec.inner + ring * spec.pitch;
  const outer = inner + spec.chord;
  const a = (2 * Math.PI * sector) / n;
  const b = (2 * Math.PI * (sector + 1)) / n;
  const lift = ring * 0.00045;
  return [
    {
      kind: "arc",
      a: around(pole, outer, a),
      b: around(pole, inner, b),
      color,
      lift,
    },
  ];
}

function kiku(division: Division): Stitch[] {
  const n = petalCount(division);
  const spec = kikuSpec(division);
  const stitches: Stitch[] = [];
  for (const pole of polePositions(division)) {
    for (let r = 0; r < spec.rounds; r++) {
      const color = kikuColor(r);
      for (const pass of [0, 1] as const) {
        for (let i = 0; i < n; i++) {
          if (i % 2 !== pass) continue;
          stitches.push(...kikuPetal(pole, spec, r, i, n, color));
        }
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

/** Classic first temari: Simple 8, kiku on both poles, maki obi. */
export function generateTitleMari(): Stitch[] {
  const stitches = kiku("simple");
  const belts: [number, number][] = [
    [0, 1],
    [0.11, 2],
    [-0.11, 2],
    [0.22, 1],
    [-0.22, 1],
  ];
  for (const [h, c] of belts) {
    stitches.push({ kind: "loop", points: smallCircle([0, 1, 0], h), color: c });
  }
  return stitches;
}

function slerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  const d = Math.min(1, Math.max(-1, dot(a, b)));
  const theta = Math.acos(d);
  if (theta < 1e-4) return normalize(a);
  const s = Math.sin(theta);
  const w0 = Math.sin((1 - t) * theta) / s;
  const w1 = Math.sin(t * theta) / s;
  return normalize([
    a[0] * w0 + b[0] * w1,
    a[1] * w0 + b[1] * w1,
    a[2] * w0 + b[2] * w1,
  ]);
}

/** Nested rows filling the polygon of 3+ pins. `in` = large to small (sakasa). */
export function sakasaArcsFromPins(
  pins: Vec3[],
  layers: number,
  color: number,
  dir: KagariDir = "in",
  threadWidth = 0.42,
  density = 0.5,
): { a: Vec3; b: Vec3; color: number }[] {
  if (pins.length < 3) return [];
  const arcs: { a: Vec3; b: Vec3; color: number }[] = [];
  for (const pole of kagariPoles(pins)) {
    const ringPts = ringAround(pins, pole);
    if (ringPts.length < 3) continue;
    const cap = kikuCapacity(ringPts, threadWidth, density);
    const sorted = ringPts
      .map((p) => ({ p: normalize(p), ...polarAround(pole, p) }))
      .sort((a, b) => a.phi - b.phi);
    const n = sorted.length;
    const L = Math.max(1, Math.min(cap.max, Math.round(layers)));
    for (let r = 0; r < L; r++) {
      const along = L <= 1 ? 0 : r / (L - 1);
      const t = dir === "in" ? along * 0.9 : (1 - along) * 0.9;
      const ring = sorted.map((item) => slerp3(item.p, pole, t));
      const c = r % 2 === 0 ? color : (color + 1) % 4;
      for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        if (a && b) arcs.push({ a, b, color: c });
      }
    }
  }
  return arcs;
}

/** Chrysanthemum herringbone around each closed pole of 3+ pins. */
export function kikuArcsFromPins(
  pins: Vec3[],
  layers: number,
  color: number,
  dir: KagariDir = "out",
  threadWidth = 0.42,
  density = 0.5,
): { a: Vec3; b: Vec3; color: number }[] {
  if (pins.length < 3) return [];
  const arcs: { a: Vec3; b: Vec3; color: number }[] = [];
  for (const pole of kagariPoles(pins)) {
    const ringPts = ringAround(pins, pole);
    if (ringPts.length < 3) continue;
    const cap = kikuCapacity(ringPts, threadWidth, density);
    const sorted = ringPts
      .map((p) => ({ p, ...polarAround(pole, p) }))
      .sort((a, b) => a.phi - b.phi);
    const n = sorted.length;
    const L = Math.max(1, Math.min(cap.max, Math.round(layers)));
    const chord = cap.pitch * 1.15;
    const span = Math.max(cap.pitch, (cap.max - 1) * cap.pitch);
    const order = Array.from({ length: L }, (_, i) => (dir === "in" ? L - 1 - i : i));
    for (const r of order) {
      const t = L <= 1 ? 0.5 : r / (L - 1);
      const inner = cap.innerMin + t * span;
      const outer = inner + chord;
      const c = r % 2 === 0 ? color : (color + 1) % 4;
      for (const pass of [0, 1] as const) {
        for (let i = 0; i < n; i++) {
          if (i % 2 !== pass) continue;
          const a = sorted[i];
          const b = sorted[(i + 1) % n];
          if (!a || !b) continue;
          arcs.push({
            a: around(pole, outer, a.phi),
            b: around(pole, inner, b.phi),
            color: c,
          });
        }
      }
    }
  }
  return arcs;
}

