import { polePositions, type Division } from "./division.ts";
import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";
import { COLOR_COUNT } from "./palettes.ts";
import { biteAcross, closestApproachT, refineApproach, stackOver, KIKU_8_POINT, type KagariOp, type PatternRecipe } from "./kagari.ts";
import { traceKagariOperations, type KagariTrace } from "./kagari-topology";

export type KikuSlot = { pole: number; ring: number; sector: number };

export type SewnEntry = { key: string; color: number };

export type MotifId = "none" | "kiku" | "hoshi" | "hishi" | "obi";

export type UnsupportedMotif = {
  supported: false;
  code: "recipe-unavailable";
  division: Division;
  motif: MotifId;
  reason: string;
};

export type MotifSupport =
  | { supported: true; kind: "free"; recipe: null }
  | { supported: true; kind: "recipe"; recipe: PatternRecipe }
  | UnsupportedMotif;

/** Compiler availability, not a claim of complete craft or physical verification. */
export function motifSupport(division: Division, motif: MotifId): MotifSupport {
  if (motif === "none") return { supported: true, kind: "free", recipe: null };
  const recipe = motif === "kiku" ? kikuRecipe(division) : null;
  if (recipe) return { supported: true, kind: "recipe", recipe };
  return {
    supported: false,
    code: "recipe-unavailable",
    division,
    motif,
    reason:
      motif === "kiku"
        ? `Рецепт кику для ${division.toUpperCase()} ещё не реализован. Доступна кику на Simple 8.`
        : `Рецепт «${MOTIF_META[motif].label}» ещё не реализован.`,
  };
}

export class UnsupportedPatternError extends Error {
  readonly support: UnsupportedMotif;

  constructor(support: UnsupportedMotif) {
    super(support.reason);
    this.name = "UnsupportedPatternError";
    this.support = support;
  }
}

function requireMotifSupport(division: Division, motif: MotifId): void {
  const support = motifSupport(division, motif);
  if (!support.supported) throw new UnsupportedPatternError(support);
}

export type Vec3 = [number, number, number];

export type Stitch =
  | {
      kind: "arc";
      a: Vec3;
      b: Vec3;
      color: number;
      lift?: number;
      /** Threads already under this end — extra height is local, not the whole V. */
      sitA?: number;
      sitB?: number;
      /** Set B sitting on A at the kousa, not a mid-flank hill. */
      sitMid?: number;
      /** Parameter along this leg of the A/B closest approach. */
      sitMidT?: number;
      /** Later kai sitting on earlier opposite-set threads at real crossings. */
      sitAts?: { t: number; n: number }[];
      bite?: { enter: Vec3; exit: Vec3 };
      /** Inner uwagake sits on the stack; outer is a reverse pickup. */
      tip?: "inner" | "outer";
      via?: Vec3[];
      /** Working thread: one cord per pole+set, parked between kai. */
      set?: 0 | 1;
      pole?: number;
      kai?: number;
      /** Preserved recipe chronology; legacy/free arcs may have no operation trace. */
      operation?: KagariTrace;
    }
  | { kind: "loop"; points: Vec3[]; color: number; lift?: number };

export const MOTIF_META: Record<MotifId, { label: string; hint: string }> = {
  none: { label: "Ряд", hint: "стежок за стежком по сетке" },
  kiku: { label: "Кику", hint: "увагакэ тидори: зигзаг по меридианам, два прохода" },
  hoshi: { label: "Хоси", hint: "звезда {n/k} на малом круге" },
  hishi: { label: "Хиси", hint: "вложенные многоугольники у полюсов" },
  obi: { label: "Оби", hint: "пояса — малые круги параллельно экватору" },
};

/** Selectable families; check motifSupport for the current division as well. */
export const MOTIF_LIST: MotifId[] = ["none", "kiku"];

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
  if (!kikuRecipe(division)) return [];
  const poles = polePositions(division);
  const pole = poles[slot.pole];
  if (!pole) return [];
  const n = petalCount(division);
  const spec = kikuSpec(division);
  if (slot.sector < 0 || slot.sector >= n) return [];
  return kikuPetal(pole, spec, slot.ring, slot.sector, n, color, slot.pole);
}

export function hitKikuSlot(
  x: number,
  y: number,
  z: number,
  division: Division,
): KikuSlot | null {
  if (!kikuRecipe(division)) return null;
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
  const last = kikuThetas(spec, spec.rounds - 1);
  if (theta < spec.inner * 0.4 || theta > last.tOuter + spec.pitch * 0.8) return null;
  let ring = 0;
  let nearest = Infinity;
  for (let r = 0; r < spec.rounds; r++) {
    const { tInner, tOuter } = kikuThetas(spec, r);
    const d = Math.abs(theta - 0.5 * (tInner + tOuter));
    if (d < nearest) {
      nearest = d;
      ring = r;
    }
  }
  let sector = Math.floor((phi / (Math.PI * 2)) * n);
  if (sector >= n) sector = n - 1;
  if (sector < 0) sector = 0;
  return { pole, ring, sector };
}

export function fillKikuSewn(
  division: Division,
  _dir: KagariDir = "out",
  spacing: KagariSpacing = "even",
  which: number | "all" = "all",
  wanted: number | "fit" = 3,
): SewnEntry[] {
  if (!kikuRecipe(division)) return [];
  const n = petalCount(division);
  const spec = kikuSpec(division, spacing, wanted);
  const skip = spec.sets;
  const rings = Array.from({ length: spec.rounds }, (_, i) => i);
  const sewn: SewnEntry[] = [];
  // One pole, then the player turns the mari. "all" is the finished recipe (title / Пример).
  // GT14: Color A round 1, park, Color B round 1, then A2, B2 — alternate, not all kai of A first.
  for (const { index: pole } of kagariPolesToSew(division, which)) {
    for (const ring of rings) {
      for (let pass = 0; pass < skip; pass++) {
        const color = kikuColor(ring);
        for (let sector = 0; sector < n; sector++) {
          if (sector % skip !== pass) continue;
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
  return annotateSetCrossings(out);
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

/** Which poles to sew. `"all"` is a finished recipe, not a requirement. */
export function kagariPolesToSew(
  division: Division,
  which: number | "all" = "all",
): { index: number; pole: Vec3 }[] {
  const all = polePositions(division);
  if (which === "all") return all.map((pole, index) => ({ index, pole }));
  const index = Math.max(0, Math.min(all.length - 1, Math.round(which)));
  const pole = all[index];
  return pole ? [{ index, pole }] : [];
}

/**
 * After a Simple-8 kiku flower is finished, sew the other pole.
 * Not C8's six centers — that's a different recipe.
 */
export function nextKagariPole(
  division: Division,
  motif: MotifId,
  plan: Stitch[],
  kept: Stitch[],
): number | null {
  if (motif !== "kiku" || division !== "simple") return null;
  const poles = polePositions(division);
  if (poles.length < 2) return null;
  const sewn = new Set<number>();
  for (const stitch of [...kept, ...plan]) {
    const i = stitchPoleIndex(stitch, division, motif);
    if (i >= 0) sewn.add(i);
  }
  for (let i = 0; i < poles.length; i++) {
    if (!sewn.has(i)) return i;
  }
  return null;
}

export function stitchPoleIndex(
  stitch: Stitch,
  division: Division,
  motif: MotifId,
): number {
  const focus = stitchFocus(stitch, division, motif);
  if (!focus) return -1;
  const all = polePositions(division);
  let best = -1;
  let bestD = 0.15;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (!p) continue;
    const d = p[0] * focus[0] + p[1] * focus[1] + p[2] * focus[2];
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Legacy free-pin geometry: two sets of every-other petal for 8+ pins.
 * Each petal is a V on adjacent meridians (chidori both ways).
 * skip=2 is the set, not the stitch: even petals, then odd.
 * Adjacent-only (skip=1 as the stitch) hugs the ray and never crosses.
 */
function kikuSkip(n: number) {
  return n >= 8 ? 2 : 1;
}

/**
 * GT14 / TemariKai beginner: enter ~5 mm from the pole; first outer stitch
 * sits just below the pin ⅓ up from the equator. Later rounds: lay the thread
 * *parallel* to the first (GT14), inner one pearl #5 below (snug lay, no
 * engineered gap), outer Ozaki ~2 mm below the previous point so the turn
 * lays flat — later outer pierces are where the packed flank meets the
 * guideline, not an equal outer pitch. Work toward the equator. `outer` is
 * the first pin, not a short-V ceiling.
 * Default wanted is 3 kai (tests); studio starts at 1; title uses "fit".
 * Legacy display adapter: unsupported divisions retain the numeric shape with
 * zero capacity and recipe:null. These zeros are not usable recipe geometry.
 * Compilers reject unsupported combinations through motifSupport instead.
 */
export function kikuSpec(
  division: Division,
  spacing: KagariSpacing = "even",
  wanted: number | "fit" = 3,
) {
  const recipe = kikuRecipe(division);
  if (!recipe) {
    return {
      inner: 0,
      outer: 0,
      obi: 0,
      ceiling: 0,
      pitch: 0,
      stretch: 0,
      vDepth: 0,
      rounds: 0,
      fit: 0,
      capacity: 0,
      sets: 0,
      recipe: null,
    };
  }
  // Шаг ряда — одна толщина нити: укладываем вплотную без зазора (TemariKai
  // ≈thread width; craft 22.09), затем протыкаем на естественном пересечении
  // с разметкой. Прежний 1½× был инженерным зазором под порты и отклонён —
  // проверки, требовавшие его, не авторитетнее укладки.
  const thread = unitFromMm(STITCH_THREAD_MM[recipe.thread]);
  const pitch = thread;
  const stretch = unitFromMm(recipe.stretchMm);
  const inner = unitFromMm(recipe.innerMm);
  const outer = (Math.PI / 2) * (1 - recipe.outerFromEquator);
  // GT14 says "just below pin", not a distance. One thread width is our
  // explicit engineering clearance; `outer` remains the measured pin mark.
  const firstOuter = outer + pitch;
  const equator = Math.PI / 2;
  const obi = Math.min(equator - unitFromMm(8), Math.PI * 0.49);
  // This pole's kiku may walk to the equator. Crossing it is the other flower.
  const ceiling = equator - pitch * 0.35;
  const vDepth = Math.max(pitch, firstOuter - inner);
  const toObi = 1 + Math.floor(Math.max(0, obi - firstOuter) / Math.max(stretch, 1e-9));
  const toRim = 1 + Math.floor(Math.max(0, ceiling - firstOuter) / Math.max(stretch, 1e-9));
  const fit = Math.max(1, toObi);
  const capacity = Math.max(fit, toRim);
  const rounds =
    wanted === "fit" ? fit : Math.max(1, Math.min(capacity, Math.round(wanted)));
  return {
    inner,
    outer,
    obi,
    ceiling,
    pitch,
    stretch,
    vDepth,
    rounds,
    fit,
    capacity,
    sets: recipe.sets,
    recipe,
  };
}

export function kikuRecipe(division: Division): PatternRecipe | null {
  return division === "simple" ? KIKU_8_POINT : null;
}

function kikuColor(_ring: number, base = 0) {
  return ((base % COLOR_COUNT) + COLOR_COUNT) % COLOR_COUNT;
}

export function kikuThetas(
  spec: {
    inner: number;
    outer: number;
    pitch: number;
    stretch: number;
    vDepth?: number;
    ceiling?: number;
  },
  ring: number,
) {
  const ceiling = spec.ceiling ?? Math.PI / 2 - spec.pitch * 0.35;
  const tInner = spec.inner + ring * spec.pitch;
  const tOuter = Math.min(ceiling, spec.outer + spec.pitch + ring * spec.stretch);
  return { tInner, tOuter };
}

function offsetBy(p: Vec3, n: Vec3, delta: number): Vec3 {
  const c = Math.cos(delta);
  const s = Math.sin(delta);
  return normalize([
    p[0] * c + n[0] * s,
    p[1] * c + n[1] * s,
    p[2] * c + n[2] * s,
  ]);
}

function pathSamples(a: Vec3, b: Vec3, via: Vec3[], count: number): Vec3[] {
  const anchors = [a, ...via, b];
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0 : i / (count - 1);
    out.push(sampleAnchors(anchors, t));
  }
  return out;
}

function sampleAnchors(anchors: Vec3[], t: number): Vec3 {
  if (anchors.length === 0) return [0, 1, 0];
  if (anchors.length === 1) return anchors[0]!;
  const x = Math.min(1, Math.max(0, t)) * (anchors.length - 1);
  const s = Math.min(anchors.length - 2, Math.floor(x));
  const a = anchors[s];
  const b = anchors[s + 1];
  if (!a) return anchors[0]!;
  if (!b) return a;
  return slerp3(a, b, x - s);
}

function angleBetween(a: Vec3, b: Vec3) {
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
}

/** Even arc-length samples so the Ozaki turn isn't one fat hop. */
function resampleArc(pts: Vec3[], count: number): Vec3[] {
  if (pts.length === 0) return [];
  if (pts.length === 1 || count <= 1) return [pts[0]!];
  const dist = [0];
  for (let i = 1; i < pts.length; i++) {
    dist.push(dist[i - 1]! + angleBetween(pts[i - 1]!, pts[i]!));
  }
  const total = dist[dist.length - 1] || 1;
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const target = (i / (count - 1)) * total;
    let s = 0;
    while (s + 1 < dist.length - 1 && (dist[s + 1] ?? 0) < target) s++;
    const d0 = dist[s] ?? 0;
    const d1 = dist[s + 1] ?? d0;
    const span = d1 - d0;
    const f = span < 1e-9 ? 0 : (target - d0) / span;
    out.push(slerp3(pts[s]!, pts[s + 1] ?? pts[s]!, f));
  }
  out[0] = pts[0]!;
  out[count - 1] = pts[pts.length - 1]!;
  return out;
}

/** Move each sample one pearl perpendicular to the previous lay, away from the pole. */
function parallelOffset(samples: Vec3[], pole: Vec3, delta: number): Vec3[] {
  const p0 = normalize(pole);
  return samples.map((p, i) => {
    const prev = samples[i > 0 ? i - 1 : i]!;
    const next = samples[i + 1 < samples.length ? i + 1 : i]!;
    const raw: Vec3 = [next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]];
    const along = dot(raw, p);
    let tangent = normalize([
      raw[0] - p[0] * along,
      raw[1] - p[1] * along,
      raw[2] - p[2] * along,
    ]);
    if (hypot3(tangent) < 1e-6) {
      tangent = normalize(cross(p0, p));
    }
    let n = normalize(cross(p, tangent));
    const plus = offsetBy(p, n, 0.02);
    const th = (q: Vec3) =>
      Math.acos(Math.min(1, Math.max(-1, dot(p0, q))));
    if (th(plus) < th(p)) n = [-n[0], -n[1], -n[2]];
    return offsetBy(p, n, delta);
  });
}

/**
 * Where a packed flank meets this guideline (meridian). Craft: lay snug, then
 * pierce at that crossing — not at a pre-set equal outer pitch.
 */
function pierceOnMeridian(samples: Vec3[], pole: Vec3, phi: number): Vec3 | null {
  if (samples.length < 2) return null;
  const target = ((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const long = (p: Vec3) => polarAround(pole, p).phi;
  const wrap = (a: number, b: number) => {
    let d = b - a;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!, b = samples[i]!;
    const la = long(a), lb = long(b);
    const da = wrap(la, target), db = wrap(lb, target);
    if (da === 0) return a;
    if (db === 0) return b;
    if (da * db > 0) continue;
    const t = Math.abs(da) / (Math.abs(da) + Math.abs(db));
    return slerp3(a, b, t);
  }
  // No crossing: nearest sample in longitude (short packed tip).
  let best = samples[0]!, bestD = Math.abs(wrap(long(best), target));
  for (const p of samples) {
    const d = Math.abs(wrap(long(p), target));
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * GT14 outer pins: on each meridian, ⅓ up from the equator.
 * The first bottom stitch is just below this pin. Later rounds stretch past
 * it toward the equator — the pin is a mark, not a stop.
 */
export function kikuMarkPins(
  division: Division,
  which: number | "all" = "all",
): { id: string; p: Vec3 }[] {
  if (!kikuRecipe(division)) return [];
  const n = petalCount(division);
  const spec = kikuSpec(division);
  const pins: { id: string; p: Vec3 }[] = [];
  for (const { index, pole } of kagariPolesToSew(division, which)) {
    for (let i = 0; i < n; i++) {
      const phi = (2 * Math.PI * i) / n;
      pins.push({ id: `kiku-${index}-${i}`, p: around(pole, spec.outer, phi) });
    }
  }
  return pins;
}

/**
 * Pins that stand while this pole is sewn: the pole mark (measure 5 mm)
 * plus the eight first-outer GT14 marks. Not the far pole, not the equator —
 * those belong to jiwari, and they are not holding this flower.
 */
export function kikuWorkingPins(
  division: Division,
  which: number | "all" = 0,
): { id: string; p: Vec3 }[] {
  if (!kikuRecipe(division)) return [];
  const sewn = kagariPolesToSew(division, which);
  return [
    ...sewn.map(({ index, pole }) => ({ id: `pole-${index}`, p: pole })),
    ...kikuMarkPins(division, which),
  ];
}

/** Nearest GT14 working mark. Null if the tap is off the meridians / pole. */
export function snapToKikuMark(
  local: Vec3,
  division: Division,
  which: number | "all" = 0,
  minDot = 0.88,
): { id: string; p: Vec3 } | null {
  const marks = kikuWorkingPins(division, which);
  const len = hypot3(local) || 1;
  const x = local[0] / len;
  const y = local[1] / len;
  const z = local[2] / len;
  let best: { id: string; p: Vec3 } | null = null;
  let score = minDot;
  for (const m of marks) {
    const d = m.p[0] * x + m.p[1] * y + m.p[2] * z;
    if (d > score) {
      score = d;
      best = m;
    }
  }
  return best;
}

export function kikuMarksReady(
  pins: readonly { p: Vec3 }[],
  division: Division,
  which: number | "all" = 0,
): boolean {
  const marks = kikuWorkingPins(division, which);
  if (marks.length === 0) return false;
  return marks.every((m) => pins.some((p) => dot(p.p, m.p) > 0.995));
}

export function kikuPinHint(placed: number, need: number): string {
  if (need <= 0) return "";
  if (placed <= 0) return "Нажмите на метку: полюс или треть пути от экватора к полюсу";
  if (placed >= need) return "Метки стоят. Можно шить.";
  const left = need - placed;
  const n10 = left % 10;
  const n100 = left % 100;
  const word =
    n10 === 1 && n100 !== 11
      ? "булавка"
      : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)
        ? "булавки"
        : "булавок";
  return `Ещё ${left} ${word}: нажимайте на подсвеченные места`;
}

export const KIKU_PIN_MISS = "Нажмите на подсвеченную метку: полюс или треть пути от экватора к полюсу";

function hermiteSphere(p0: Vec3, m0: Vec3, p1: Vec3, m1: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return normalize([
    h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
    h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
    h00 * p0[2] + h10 * m0[2] + h01 * p1[2] + h11 * m1[2],
  ]);
}

function tangentAt(pts: Vec3[], i: number): Vec3 {
  const a = pts[Math.max(0, i - 1)]!;
  const b = pts[Math.min(pts.length - 1, i + 1)]!;
  const t: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const p = pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  const along = dot(t, p);
  const side: Vec3 = [t[0] - p[0] * along, t[1] - p[1] * along, t[2] - p[2] * along];
  return hypot3(side) < 1e-9 ? normalize(t) : normalize(side);
}

function scale3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function dirOnSphere(from: Vec3, to: Vec3): Vec3 {
  const d = dot(from, to);
  return normalize([
    to[0] - from[0] * d,
    to[1] - from[1] * d,
    to[2] - from[2] * d,
  ]);
}

/** Mark → body join. Taut: geodesic-ish into the offset, matching the lay at the body. */
function hermiteJoin(from: Vec3, to: Vec3, mFrom: Vec3, mTo: Vec3, count: number): Vec3[] {
  const chord = Math.max(angleBetween(from, to), 1e-6);
  // Full-chord tangents S-wave the packed kai (close-up garden hose).
  const scale = chord * 0.4;
  const a = scale3(normalize(mFrom), scale);
  const b = scale3(normalize(mTo), scale);
  const out: Vec3[] = [];
  for (let i = 0; i <= count; i++) {
    out.push(hermiteSphere(from, a, to, b, i / count));
  }
  out[0] = from;
  out[count] = to;
  return out;
}

/**
 * One kiku flank. Marks sit on meridians (inner + 1 thread, outer + Ozaki
 * 2 mm). The body is a parallel offset of the *previous* round — the master
 * lays the new thread next to the one just sewn, then takes the stitch where
 * that lay crosses the jiwari, plus a short stretch at the point so the turn
 * lays flat. Offsetting the first V for every kai leaves a 2 mm×ring hook.
 */
export function kikuFlank(
  pole: Vec3,
  spec: {
    inner: number;
    outer: number;
    pitch: number;
    stretch: number;
    ceiling?: number;
  },
  ring: number,
  phiInner: number,
  phiOuter: number,
): { a: Vec3; b: Vec3; via: Vec3[] } {
  const { tInner, tOuter } = kikuThetas(spec, ring);
  const a0 = around(pole, tInner, phiInner);
  // Round 0: first outer is just below the pin (engineering clearance = pitch).
  // Later rounds: pierce where the snug-packed flank meets this guideline.
  const bPin = around(pole, tOuter, phiOuter);
  if (ring <= 0) return { a: a0, b: bPin, via: [] };
  const prev = kikuFlank(pole, spec, ring - 1, phiInner, phiOuter);
  const samples = pathSamples(prev.a, prev.b, prev.via, 36);
  const off = parallelOffset(samples, pole, spec.pitch);
  const n = off.length;
  if (n < 6) return { a: a0, b: bPin, via: off };
  const pierced = pierceOnMeridian(off, pole, phiOuter);
  // Pierce where the snug lay meets the guideline, but never less than the
  // stretch below the previous point: TemariKai (stretch points, GT14) puts
  // the #5 bottom stitch about 2 mm below the previous one so the point stays
  // smooth; the old 0.85-thread floor stacked the rows onto each other.
  // Ceiling: this pole's rim.
  const prevOuter = polarAround(pole, prev.b).theta;
  const naturalTheta = pierced ? polarAround(pole, pierced).theta : tOuter;
  const ceiling = spec.ceiling ?? Math.PI / 2 - spec.pitch * 0.35;
  const bTheta = Math.min(ceiling, Math.max(prevOuter + spec.stretch, naturalTheta));
  const b = around(pole, bTheta, phiOuter);
  // Inner tip is not the outer law. GT14: "place needle about 1 thread width
  // wider and below previous stitch" — the top stitch steps one thread down
  // the guideline (tInner), snapped to this meridian so neighbouring petals
  // meet. The packed body ends lower (~0.96 mm at 1× pitch); the thread is
  // carried over the earlier rounds up to the stitch (uwagake), so the head
  // from the body to the mark is the craft, not a stub. Piercing at the lay ∩
  // meridian instead (17dc431) put every later port on an earlier thread.
  const span = Math.max(bTheta - tInner, spec.pitch);
  const outerJoin = Math.max(3, Math.round((unitFromMm(2.6) / span) * n));
  const i1 = Math.max(4, n - 1 - Math.min(Math.floor(n / 4), outerJoin));
  const i0 = Math.min(2, i1 - 2);
  const p0 = off[i0]!;
  const p1 = off[i1]!;
  const a = a0;
  const head = hermiteJoin(a, p0, dirOnSphere(a, p0), tangentAt(off, i0), 8);
  const tail = hermiteJoin(p1, b, tangentAt(off, i1), dirOnSphere(p1, b), 8);
  const pts: Vec3[] = [
    a,
    ...head.slice(1, -1),
    ...off.slice(i0, i1 + 1),
    ...tail.slice(1, -1),
    b,
  ];
  const even = resampleArc(pts, 40);
  return { a: even[0]!, b: even[even.length - 1]!, via: even.slice(1, -1) };
}

function kikuPetal(
  pole: Vec3,
  spec: {
    inner: number;
    outer: number;
    pitch: number;
    stretch: number;
    vDepth: number;
    rounds: number;
    ceiling?: number;
  },
  ring: number,
  sector: number,
  n: number,
  color: number,
  poleIndex = 0,
): Stitch[] {
  if (ring < 0) return [];
  const { tInner, tOuter } = kikuThetas(spec, ring);
  if (tInner >= tOuter - spec.pitch * 0.4) return [];
  const step = (2 * Math.PI) / n;
  const phi0 = step * sector;
  const phi1 = step * (sector + 1);
  const phi2 = step * (sector + 2);
  const left = kikuFlank(pole, spec, ring, phi0, phi1);
  const right = kikuFlank(pole, spec, ring, phi2, phi1);
  const cornerMm = KIKU_8_POINT.cornerMm;
  const sitInner = ring > 0 ? 1 : 0;
  const set = (sector % 2 === 0 ? 0 : 1) as 0 | 1;
  return [
    {
      kind: "arc",
      a: left.a,
      b: left.b,
      color,
      sitA: sitInner,
      sitB: 0,
      sitMid: 0,
      bite: biteAcross(pole, left.b, cornerMm),
      via: left.via,
      set,
      pole: poleIndex,
      kai: ring,
      tip: "outer",
    },
    {
      kind: "arc",
      a: right.b,
      b: right.a,
      color,
      sitA: 0,
      sitB: sitInner,
      sitMid: 0,
      bite: biteAcross(pole, right.a, cornerMm),
      via: [...right.via].reverse(),
      set,
      pole: poleIndex,
      kai: ring,
      tip: "inner",
    },
  ];
}

/**
 * Engineering lateral constraint for the intended uwagake wedge (F7).
 * Craft requires the later catch to encompass the earlier rounds. This moves
 * recipe via points toward that intent; the radius margin is NOT proof that
 * finite threads fit inside the catch. The renderer can replace these points
 * in a join, and an oblique thread section is wider than this axis-only cap.
 * Only executed catches contribute, but actual mesh contact, fixed punctures
 * and curvature still need a joint check (check:upper-section, issue #105).
 */
function gatherUnderBite(
  ops: KagariOp[],
  catches: number[],
  pole: Vec3,
  mark: Vec3,
  half: number,
  thread: number,
) {
  const radius = thread / 2;
  const margin = thread * 0.1;
  const blend = thread * 2;
  const top = polarAround(pole, mark);
  const wrap = (d: number) => (d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d);
  for (const k of catches) {
    const earlier = ops[k];
    if (!earlier) continue;
    const next = ops.find((op, j) => j > k && op.pole === earlier.pole && op.set === earlier.set);
    const from = polarAround(pole, earlier.mark.at).theta;
    const fromHalf = angleBetween(earlier.bite.enter, earlier.bite.exit) / 2;
    const span = Math.max(top.theta - from, 1e-9);
    const limitAt = (theta: number) =>
      fromHalf - radius + (half - radius - margin - (fromHalf - radius)) * ((theta - from) / span);
    for (const op of [earlier, next]) {
      if (!op) continue;
      // A first-round flank is one arc with no via; lay its points out first.
      const via = op.lay.via?.length ? op.lay.via
        : Array.from({ length: 23 }, (_, i) => slerp3(op.lay.from, op.lay.to, (i + 1) / 24));
      const dense = densifyNear(via, (p) => polarAround(pole, p).theta < top.theta + blend, thread / 3);
      op.lay.via = dense.map((p) => {
        const { theta, phi } = polarAround(pole, p);
        if (theta < from || theta > top.theta + blend) return p;
        const s = Math.sin(theta);
        const d = wrap(phi - top.phi);
        const lateral = Math.abs(d) * s;
        const cap = theta <= top.theta
          ? limitAt(theta)
          : limitAt(top.theta) + (lateral - limitAt(top.theta)) * smoothStep((theta - top.theta) / blend);
        if (lateral <= cap || cap <= 0 && lateral <= 0) return p;
        return around(pole, theta, top.phi + Math.sign(d) * Math.max(0, cap) / s);
      });
    }
  }
}

function smoothStep(t: number) {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** Extra samples where `near` holds, so a bend there is not one long chord. */
function densifyNear(pts: Vec3[], near: (p: Vec3) => boolean, step: number): Vec3[] {
  const out: Vec3[] = pts.length ? [pts[0]!] : [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const n = near(a) || near(b) ? Math.max(1, Math.ceil(angleBetween(a, b) / step)) : 1;
    for (let k = 1; k <= n; k++) out.push(k === n ? b : slerp3(a, b, k / n));
  }
  return out;
}

function pushKikuLeg(
  ops: KagariOp[],
  pole: Vec3,
  poleIndex: number,
  kai: number,
  set: 0 | 1,
  color: number,
  from: Vec3,
  to: { line: number; t: "inner" | "outer"; at: Vec3 },
  over: number[],
  biteMm: number,
  via?: Vec3[],
): Vec3 {
  const bite = biteAcross(pole, to.at, biteMm, to.t === "inner" ? over.length : 0);
  ops.push({
    i: ops.length,
    kai,
    set,
    pole: poleIndex,
    color,
    mark: { line: to.line, t: to.t, at: to.at },
    lay: { from, to: to.at, via: via && via.length ? via : undefined },
    bite,
    over,
  });
  return to.at;
}

/**
 * Compile the 8-point kiku recipe to KagariOp[].
 * One op = one chidori leg: lay on the mari, bite across the destination mark.
 * `color` is the player's thread for every kai until they pick another.
 * Throws UnsupportedPatternError if no recipe exists for this division.
 */
export function compileKiku(
  division: Division,
  _dir: KagariDir = "out",
  spacing: KagariSpacing = "even",
  which: number | "all" = "all",
  color = 0,
  wanted: number | "fit" = 3,
  onlySet: 0 | 1 | "all" = "all",
  /** Execute only this chronological prefix; later catches must not reshape it. */
  maxOperations?: number,
): KagariOp[] {
  requireMotifSupport(division, "kiku");
  if (maxOperations !== undefined && (!Number.isSafeInteger(maxOperations) || maxOperations < 0)) {
    throw new RangeError("The completed operation count must be a non-negative safe integer.");
  }
  const operationLimit = maxOperations ?? Infinity;
  const n = petalCount(division);
  const spec = kikuSpec(division, spacing, wanted);
  const skip = spec.sets;
  const recipe = spec.recipe!;
  const cornerMm = recipe.cornerMm;
  const crossing = recipe.crossing;
  // Beginner kiku is uwagake-chidori from the pole. Sakasa is a different
  // stitch (fill a shape from the outside in), not a toggle on this flower.
  const rings = Array.from({ length: spec.rounds }, (_, i) => i);
  const ops: KagariOp[] = [];
  const step = (2 * Math.PI) / n;
  for (const { index: poleIndex, pole } of kagariPolesToSew(division, which)) {
    const innerOver: number[][] = Array.from({ length: n }, () => []);
    const parked: [Vec3 | null, Vec3 | null] = [null, null];
    for (const ring of rings) {
      const { tInner, tOuter } = kikuThetas(spec, ring);
      if (tInner >= tOuter - spec.pitch * 0.4) continue;
      for (let pass = 0; pass < skip; pass++) {
        if (onlySet !== "all" && pass !== onlySet) continue;
        const set = (pass === 0 ? 0 : 1) as 0 | 1;
        const thread = kikuColor(ring, color);
        // `lay.from` remains the nominal top mark used to construct the next
        // parallel flank. `resume.at` below preserves the real working end at
        // the previous bite's exit. A complete renderer must replace this
        // nominal start with the outgoing leg from that port.
        let cursor: Vec3 | null = null;
        let first = true;
        for (let sector = 0; sector < n; sector++) {
          if (sector % skip !== pass) continue;
          if (ops.length >= operationLimit) return ops;
          const phi0 = step * sector;
          const phi1 = step * (sector + 1);
          const phi2 = step * (sector + 2);
          const line1 = (sector + 1) % n;
          const line2 = (sector + 2) % n;
          const left = kikuFlank(pole, spec, ring, phi0, phi1);
          const right = kikuFlank(pole, spec, ring, phi2, phi1);
          cursor = pushKikuLeg(
            ops,
            pole,
            poleIndex,
            ring,
            set,
            thread,
            cursor ?? left.a,
            { line: line1, t: "outer", at: left.b },
            [],
            cornerMm,
            left.via,
          );
          if (first && parked[set]) {
            ops[ops.length - 1]!.resume = { at: parked[set] };
          }
          first = false;
          if (ops.length >= operationLimit) return ops;
          const over = stackOver(innerOver[line2] ?? [], crossing);
          // GT14: needle "about 1 thread width wider and below previous
          // stitch" — one thread wider in total, half a thread each side. The
          // finished GT14 wedges widen ~1 mm per mm down the line (half-angle
          // ~26°); a thread each side made a 45° wedge whose pierces landed on
          // the neighbouring points from the 4th round (craft sweep 23.09). The
          // first is an ordinary small kagari, 1–2 mm (TemariKai): two threads.
          cursor = pushKikuLeg(
            ops,
            pole,
            poleIndex,
            ring,
            set,
            thread,
            cursor,
            { line: line2, t: "inner", at: right.a },
            over,
            cornerMm * (2 + over.length),
            [...right.via].reverse(),
          );
          if (over.length) {
            gatherUnderBite(ops, over, pole, right.a,
              unitFromMm(cornerMm * (2 + over.length)) / 2, unitFromMm(STITCH_THREAD_MM[recipe.thread]));
          }
          innerOver[line2]?.push(ops.length - 1);
        }
        const last = ops[ops.length - 1];
        parked[set] = last ? outgoingBitePort(last) : cursor;
      }
    }
  }
  return ops;
}

export function stitchesFromOps(ops: KagariOp[]): Stitch[] {
  const traces = traceKagariOperations(ops, KIKU_8_POINT.id);
  const stitches: Stitch[] = ops.map((op, i) => {
    const prev = i > 0 ? ops[i - 1] : undefined;
    const sitTo = op.mark.t === "inner" && op.over.length > 0 ? 1 : 0;
    const sitFrom = op.resume
      ? 1
      : prev && prev.pole === op.pole && prev.set === op.set
        && prev.mark.t === "inner" && prev.over.length > 0
        ? 1
        : 0;
    return {
      kind: "arc" as const,
      a: op.lay.from,
      b: op.lay.to,
      color: op.color,
      sitA: sitFrom,
      sitB: sitTo,
      sitMid: 0,
      bite: op.bite,
      via: op.lay.via,
      set: op.set,
      pole: op.pole,
      kai: op.kai,
      tip: op.mark.t,
      operation: traces[i],
    };
  });
  return annotateSetCrossings(stitches);
}

const SAME_MARK2 = 1.6e-4;

function dist2(a: Vec3, b: Vec3) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** The working end after a bite: the port on the incoming flank's near side. */
function outgoingBitePort(op: KagariOp): Vec3 {
  return dist2(op.lay.from, op.bite.enter) < dist2(op.lay.from, op.bite.exit)
    ? op.bite.enter
    : op.bite.exit;
}

function sequentialChains(arcs: Extract<Stitch, { kind: "arc" }>[]) {
  const chains: Extract<Stitch, { kind: "arc" }>[][] = [];
  let cur: Extract<Stitch, { kind: "arc" }>[] = [];
  for (const s of arcs) {
    if (cur.length > 0 && dist2(cur[cur.length - 1]!.b, s.a) < SAME_MARK2) {
      cur.push(s);
      continue;
    }
    if (cur.length) chains.push(cur);
    cur = [s];
  }
  if (cur.length) chains.push(cur);
  return chains;
}

/**
 * One working thread per pole+set. GT14 parks Color A after a round, sews B,
 * resumes A — same pearl, not a new cord. Join across kai if the gap is
 * ≤ 2.2 pearls. Never weld a round closed: returning to the start mark is
 * a park on the mari, not the thread joining itself. The renderer still
 * takes the inner uwagake bite at that mark (`appendParkBite`) so every kai
 * does not leave a cusp on the same ray.
 */
export function groupWorkingThreads(arcs: Extract<Stitch, { kind: "arc" }>[]) {
  const tagged: Extract<Stitch, { kind: "arc" }>[] = [];
  const untagged: Extract<Stitch, { kind: "arc" }>[] = [];
  for (const s of arcs) {
    if (s.set != null && s.pole != null) tagged.push(s);
    else untagged.push(s);
  }
  if (tagged.length === 0) return sequentialChains(arcs);

  const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
  const parkJoin = (2.2 * pearl) ** 2;
  const buckets = new Map<string, Extract<Stitch, { kind: "arc" }>[]>();
  for (const s of tagged) {
    const k = `${s.pole}:${s.set}`;
    const list = buckets.get(k);
    if (list) list.push(s);
    else buckets.set(k, [s]);
  }
  const chains: Extract<Stitch, { kind: "arc" }>[][] = [];
  for (const list of buckets.values()) {
    let cur: Extract<Stitch, { kind: "arc" }>[] = [];
    for (const s of list) {
      if (cur.length === 0) {
        cur = [s];
        continue;
      }
      const d = dist2(cur[cur.length - 1]!.b, s.a);
      if (d < SAME_MARK2 || d < parkJoin) {
        cur.push(s);
      } else {
        chains.push(cur);
        cur = [s];
      }
    }
    if (cur.length) chains.push(cur);
  }
  if (untagged.length) chains.push(...sequentialChains(untagged));
  return chains;
}

function stitchSamples(s: Extract<Stitch, { kind: "arc" }>, n = 20): Vec3[] {
  return pathSamples(s.a, s.b, s.via ?? [], n);
}

/**
 * Opposite-set threads sit on each other at the real kousa.
 * Same kai: B on A. Later kai: the new thread on every earlier opposite
 * set it actually meets. Parallel same-set flanks stay on the mari —
 * same-set cross-kai tip pack is handled by row pitch / bite spacing,
 * not by this annotator (lifting those ends folded tubes).
 */
const arcSamples = new WeakMap<Extract<Stitch, { kind: "arc" }>, Vec3[]>();
/** Sharpened crossings, kept per pair: neither stitch changes between rebuilds. */
const arcPairs = new WeakMap<
  Extract<Stitch, { kind: "arc" }>,
  WeakMap<Extract<Stitch, { kind: "arc" }>, { tA: number; tB: number; dist: number }>
>();
const arcCaps = new WeakMap<Extract<Stitch, { kind: "arc" }>, { c: Vec3; ang: number }>();

/** Longest step between a stitch's samples: how far a crossing can hide. */
function stepOf(s: Extract<Stitch, { kind: "arc" }>) {
  const pts = stitchSamples(s);
  let step = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    step = Math.max(step, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  return step;
}

function pointOn(s: Extract<Stitch, { kind: "arc" }>) {
  const anchors = [s.a, ...(s.via ?? []), s.b];
  return (t: number) => sampleAnchors(anchors, t);
}

function crossingOf(
  a: Extract<Stitch, { kind: "arc" }>,
  b: Extract<Stitch, { kind: "arc" }>,
  coarse: { tA: number; tB: number; dist: number },
) {
  let byA = arcPairs.get(a);
  if (!byA) {
    byA = new WeakMap();
    arcPairs.set(a, byA);
  }
  const hit = byA.get(b);
  if (hit) return hit;
  const n = stitchSamples(a).length;
  const m = stitchSamples(b).length;
  const made = refineApproach(pointOn(a), pointOn(b), coarse.tA, coarse.tB,
    1 / Math.max(1, n - 1), 1 / Math.max(1, m - 1));
  byA.set(b, made);
  return made;
}

export function annotateSetCrossings(stitches: Stitch[]): Stitch[] {
  const arcs = stitches.filter((s): s is Extract<Stitch, { kind: "arc" }> => s.kind === "arc");
  const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
  const reach = pearl * 1.35;
  // Every arc is sampled once, and the samples outlive the call: a stitch is
  // immutable, the workshop runs this after each stitch, and the flower it
  // runs over is the same objects plus one.
  const samplesOf = (s: Extract<Stitch, { kind: "arc" }>) => {
    const hit = arcSamples.get(s);
    if (hit) return hit;
    const made = stitchSamples(s);
    arcSamples.set(s, made);
    return made;
  };
  /**
   * A stitch covers a small cap of the ball. Two caps further apart than their
   * radii plus the reach cannot meet, and the pair loop is quadratic: on a full
   * flower this rejects almost every pair with one dot product.
   */
  const capOf = (s: Extract<Stitch, { kind: "arc" }>) => {
    const hit = arcCaps.get(s);
    if (hit) return hit;
    const pts = samplesOf(s);
    let x = 0, y = 0, z = 0;
    for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; }
    const len = Math.hypot(x, y, z) || 1;
    const c: Vec3 = [x / len, y / len, z / len];
    let ang = 0;
    for (const p of pts) {
      const dot = Math.max(-1, Math.min(1, c[0] * p[0] + c[1] * p[1] + c[2] * p[2]));
      ang = Math.max(ang, Math.acos(dot));
    }
    const made = { c, ang };
    arcCaps.set(s, made);
    return made;
  };
  return stitches.map((s) => {
    if (s.kind !== "arc" || s.pole == null || s.kai == null || s.set == null) return s;
    const self = samplesOf(s);
    const ats: { t: number; n: number }[] = [];
    for (const other of arcs) {
      if (other === s) continue;
      if (other.pole !== s.pole || other.set == null || other.kai == null) continue;
      if (other.set === s.set) continue;
      const earlier = other.kai < s.kai || (other.kai === s.kai && other.set < s.set);
      if (!earlier) continue;
      // Chord <= angle, so the reach used as an angle only ever keeps more pairs.
      const capA = capOf(s);
      const capB = capOf(other);
      const between = Math.acos(Math.max(-1, Math.min(1,
        capA.c[0] * capB.c[0] + capA.c[1] * capB.c[1] + capA.c[2] * capB.c[2])));
      if (between > capA.ang + capB.ang + reach) continue;
      // Samples only bracket the crossing: between them the curves can come a
      // whole segment closer, so the bracket is kept wide and then walked in.
      const coarse = closestApproachT(self, samplesOf(other));
      if (coarse.dist > reach + stepOf(s) + stepOf(other)) continue;
      const c = crossingOf(s, other, coarse);
      if (c.dist > reach) continue;
      const sameKai = other.kai === s.kai;
      // Cross-kai tips already have sitA / sitB. Same-kai kousa is near
      // the inner marks and must stay.
      if (!sameKai && (c.tA < 0.08 || c.tA > 0.92)) continue;
      ats.push({ t: c.tA, n: 1 });
    }
    if (ats.length === 0) return s;
    ats.sort((a, b) => a.t - b.t);
    const merged: { t: number; n: number }[] = [];
    for (const a of ats) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(a.t - last.t) < 0.03) {
        last.n = Math.min(2, last.n + a.n);
        last.t = (last.t + a.t) / 2;
      } else {
        merged.push({ t: a.t, n: a.n });
      }
    }
    const main = merged.reduce((best, a) => (a.n > best.n ? a : best), merged[0]!);
    return { ...s, sitMid: main.n, sitMidT: main.t, sitAts: merged };
  });
}

function kiku(
  division: Division,
  dir: KagariDir = "out",
  spacing: KagariSpacing = "even",
  which: number | "all" = "all",
  color = 0,
  wanted: number | "fit" = 3,
  onlySet: 0 | 1 | "all" = "all",
): Stitch[] {
  return stitchesFromOps(compileKiku(division, dir, spacing, which, color, wanted, onlySet));
}

export function generateMotif(
  division: Division,
  motif: MotifId,
  dir: KagariDir = "out",
  spacing: KagariSpacing = "even",
  which: number | "all" = "all",
  color = 0,
  wanted: number | "fit" = 3,
  onlySet: 0 | 1 | "all" = "all",
): Stitch[] {
  requireMotifSupport(division, motif);
  if (motif === "kiku") return kiku(division, dir, spacing, which, color, wanted, onlySet);
  return [];
}

/** Ordered stitches as a master sews them. Same sequence the player sees, one by one. */
export function motifStitchPlan(
  division: Division,
  motif: MotifId,
  dir: KagariDir = "out",
  spacing: KagariSpacing = "even",
  which: number | "all" = "all",
  color = 0,
  wanted: number | "fit" = 3,
  onlySet: 0 | 1 | "all" = "all",
): Stitch[] {
  return generateMotif(division, motif, dir, spacing, which, color, wanted, onlySet);
}

/** Pole the mari should face while this stitch is laid. Obi stays equator-on. */
export function stitchFocus(
  stitch: Stitch | undefined,
  division: Division,
  motif: MotifId,
): Vec3 | null {
  if (!stitch || motif === "obi" || motif === "none") return null;
  let p: Vec3;
  if (stitch.kind === "arc") {
    p = normalize([
      stitch.a[0] + stitch.b[0],
      stitch.a[1] + stitch.b[1],
      stitch.a[2] + stitch.b[2],
    ]);
  } else if (stitch.points[0]) {
    p = stitch.points[0];
  } else {
    return null;
  }
  const poles = polePositions(division);
  let best: Vec3 | null = null;
  let bestD = -2;
  for (const pole of poles) {
    const d = pole[0] * p[0] + pole[1] * p[1] + pole[2] * p[2];
    if (d > bestD) {
      bestD = d;
      best = pole;
    }
  }
  return best;
}

export function sameFocus(a: Vec3 | null, b: Vec3 | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0.995;
}

/** Live line under the buttons — same job as jiwariPhaseHint. */
export function kagariPhaseHint(
  motif: MotifId,
  division: Division,
  _dir: KagariDir,
  laid: number,
  total: number,
  playing: boolean,
  poleIndex = 0,
  kagariSet: 0 | 1 = 0,
  canGrow = true,
  /** Rows lying at this pole and how many the thread leaves room for. */
  rows = 0,
  rowsFit = 0,
  /** The real operation being sewn; batches may alternate groups and start after row one. */
  activeStitch?: Stitch,
): string {
  const support = motifSupport(division, motif);
  if (!support.supported) return support.reason;
  if (motif === "none" || total === 0) return "";
  if (!playing && laid >= total) {
    if (motif === "kiku" && kagariSet === 0) {
      return "Нажмите «Вторая группа» — следующие четыре лепестка.";
    }
    if (motif === "kiku") {
      // Say how far the flower has grown: a beginner cannot count rows on a ball.
      const count = rows > 0 && rowsFit > 0 ? `Ряд ${rows} из ${rowsFit}. ` : "";
      return canGrow
        ? `${count}Нажмите «Следующий ряд» — продолжить обе группы.`
        : `${count}Кагари: ряд лежит. Другой полюс — переверните шар.`;
    }
    return "Кагари: ряд лежит. Другой полюс — переверните шар.";
  }
  if (motif !== "kiku") return "";
  const n = petalCount(division);
  const spec = kikuSpec(division);
  const perRound = (n / spec.sets) * 2;
  const at = Math.max(0, laid - 1);
  const active = activeStitch?.kind === "arc" ? activeStitch : undefined;
  const kai = active?.kai !== undefined ? active.kai + 1 : Math.floor(at / perRound) + 1;
  const where = poleIndex === 0 ? "север" : poleIndex === 1 ? "юг" : `полюс ${poleIndex + 1}`;
  const petals = (active?.set ?? kagariSet) === 0 ? "первые 4" : "вторые 4";
  return `Кику · ${where} · ${petals} · круг ${kai} · от полюса`;
}

/** Title illustration: Simple 8 kiku plus decorative belts, not an obi recipe.
 * Wrap beni, kiku kin, obi linen — navy-on-beni was two darks.
 */
export function generateTitleMari(): Stitch[] {
  const stitches = kiku("simple", "out", "even", "all", 1, "fit");
  const belts: [number, number][] = [
    [0, 2],
    [0.11, 2],
    [-0.11, 2],
    [0.22, 2],
    [-0.22, 2],
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
  _dir: KagariDir = "out",
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
    const skip = kikuSkip(n);
    const L = Math.max(1, Math.min(cap.max, Math.round(layers)));
    const inner0 = Math.max(cap.innerMin, unitFromMm(5));
    const outer0 = Math.min(cap.span * (2 / 3), cap.span - cap.pitch);
    const order = Array.from({ length: L }, (_, i) => i);
    for (const r of order) {
      const inner = inner0 + r * cap.pitch;
      const outer = Math.min(cap.span - cap.pitch * 0.2, outer0 + r * cap.pitch * 2);
      if (outer <= inner + cap.pitch * 0.6) continue;
      const c = r % 2 === 0 ? color : (color + 1) % 4;
      for (const pass of [0, 1] as const) {
        for (let i = 0; i < n; i++) {
          if (i % skip !== pass) continue;
          const a = sorted[i];
          const b = sorted[(i + 1) % n];
          const d = sorted[(i + 2) % n];
          if (!a || !b || !d) continue;
          arcs.push({
            a: around(pole, inner, a.phi),
            b: around(pole, outer, b.phi),
            color: c,
          });
          arcs.push({
            a: around(pole, outer, b.phi),
            b: around(pole, inner, d.phi),
            color: c,
          });
        }
      }
    }
  }
  return arcs;
}
