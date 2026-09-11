import { polePositions, type Division } from "./division.ts";
import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";
import { COLOR_COUNT } from "./palettes.ts";
import { biteAcross, stackOver, KIKU_8_POINT, type KagariOp, type PatternRecipe } from "./kagari.ts";

export type KikuSlot = { pole: number; ring: number; sector: number };

export type SewnEntry = { key: string; color: number };

export type MotifId = "none" | "kiku" | "hoshi" | "hishi" | "obi";

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
      /** Set B crossing set A, at the mid of the leg. */
      sitMid?: number;
      bite?: { enter: Vec3; exit: Vec3 };
      via?: Vec3[];
    }
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
 * Simple 8 / C10: two sets of every-other petal.
 * Each petal is a V on adjacent meridians (chidori both ways).
 * skip=2 is the set, not the stitch: even petals, then odd.
 * Adjacent-only (skip=1 as the stitch) hugs the ray and never crosses.
 */
function kikuSkip(n: number) {
  return n >= 8 ? 2 : 1;
}

function starSkip(division: Division) {
  return division === "c10" ? 3 : 3;
}

/**
 * GT14 / TemariKai beginner: enter ~5 mm from the pole; first outer stitch
 * sits just below the pin ⅓ up from the equator. Later rounds pack *parallel*
 * to that V (GT14: "laying thread parallel to first round"). Both ends of
 * the flank step one pearl #5. Ozaki's ~2 mm is the volume of the turn at
 * the point — not a wider V, which made the side lines sit at changing
 * angles. `outer` is the first pin, not a short-V ceiling.
 * Default wanted is 3 kai (tests); studio starts at 1; title uses "fit".
 */
export function kikuSpec(
  division: Division,
  spacing: KagariSpacing = "even",
  wanted: number | "fit" = 3,
) {
  const recipe = kikuRecipe(division);
  const pitch = unitFromMm(STITCH_THREAD_MM.pearl5);
  const stretch = unitFromMm(recipe?.stretchMm ?? STITCH_THREAD_MM.pearl5);
  const inner = unitFromMm(recipe?.innerMm ?? 5);
  const outer = recipe
    ? (Math.PI / 2) * (1 - recipe.outerFromEquator)
    : division === "c8"
      ? Math.PI / 4
      : 0.52;
  // Room for a thin maki obi. GT14 works toward the equator, not past it.
  const ceiling = Math.min(Math.PI / 2 - unitFromMm(8), Math.PI * 0.49);
  const vDepth = Math.max(pitch, outer - inner);
  const packed = 1 + Math.floor(Math.max(0, ceiling - outer) / Math.max(pitch, 1e-9));
  const fit = Math.max(1, packed);
  const rounds =
    wanted === "fit" ? fit : Math.max(1, Math.min(fit, Math.round(wanted)));
  return {
    inner,
    outer,
    ceiling,
    pitch,
    stretch,
    vDepth,
    rounds,
    fit,
    sets: recipe?.sets ?? kikuSkip(petalCount(division)),
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
    vDepth: number;
    ceiling?: number;
  },
  ring: number,
) {
  const ceiling = spec.ceiling ?? Math.min(Math.PI / 2 - unitFromMm(8), Math.PI * 0.49);
  const tInner = spec.inner + ring * spec.pitch;
  const tOuter = Math.min(ceiling, spec.outer + ring * spec.pitch);
  return { tInner, tOuter };
}

function kikuPetal(
  pole: Vec3,
  spec: { inner: number; outer: number; pitch: number; stretch: number; vDepth: number; rounds: number },
  ring: number,
  sector: number,
  n: number,
  color: number,
): Stitch[] {
  if (ring < 0) return [];
  const { tInner, tOuter } = kikuThetas(spec, ring);
  if (tInner >= tOuter - spec.pitch * 0.4) return [];
  const step = (2 * Math.PI) / n;
  const phi0 = step * sector;
  const phi1 = step * (sector + 1);
  const phi2 = step * (sector + 2);
  const a = around(pole, tInner, phi0);
  const b = around(pole, tOuter, phi1);
  const c = around(pole, tInner, phi2);
  const cornerMm = KIKU_8_POINT.cornerMm;
  const sitInner = ring;
  const sitMid = sector % 2 === 1 ? 1 : 0;
  // Downward V: uppers on meridians sector and sector+2, point on sector+1.
  return [
    {
      kind: "arc",
      a,
      b,
      color,
      sitA: sitInner,
      sitB: 0,
      sitMid,
      bite: biteAcross(pole, b, cornerMm),
    },
    {
      kind: "arc",
      a: b,
      b: c,
      color,
      sitA: 0,
      sitB: sitInner,
      sitMid,
      bite: biteAcross(pole, c, cornerMm),
    },
  ];
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
  cornerMm: number,
): Vec3 {
  const biteMm =
    to.t === "inner" ? cornerMm * (1 + over.length) : cornerMm;
  const bite = biteAcross(pole, to.at, biteMm, to.t === "inner" ? over.length : 0);
  ops.push({
    i: ops.length,
    kai,
    set,
    pole: poleIndex,
    color,
    mark: { line: to.line, t: to.t, at: to.at },
    lay: { from, to: to.at },
    bite,
    over,
  });
  return to.at;
}

/**
 * Compile the 8-point kiku recipe to KagariOp[].
 * One op = one chidori leg: lay on the mari, bite across the destination mark.
 * `color` is the player's thread for every kai until they pick another.
 */
export function compileKiku(
  division: Division,
  _dir: KagariDir = "out",
  spacing: KagariSpacing = "even",
  which: number | "all" = "all",
  color = 0,
  wanted: number | "fit" = 3,
  onlySet: 0 | 1 | "all" = "all",
): KagariOp[] {
  const n = petalCount(division);
  const spec = kikuSpec(division, spacing, wanted);
  const skip = spec.sets;
  const recipe = spec.recipe;
  const cornerMm = recipe?.cornerMm ?? 2;
  const crossing = recipe?.crossing ?? "over-all";
  // Beginner kiku is uwagake-chidori from the pole. Sakasa is a different
  // stitch (fill a shape from the outside in), not a toggle on this flower.
  const rings = Array.from({ length: spec.rounds }, (_, i) => i);
  const ops: KagariOp[] = [];
  const step = (2 * Math.PI) / n;
  for (const { index: poleIndex, pole } of kagariPolesToSew(division, which)) {
    const innerOver: number[][] = Array.from({ length: n }, () => []);
    for (const ring of rings) {
      const { tInner, tOuter } = kikuThetas(spec, ring);
      if (tInner >= tOuter - spec.pitch * 0.4) continue;
      for (let pass = 0; pass < skip; pass++) {
        if (onlySet !== "all" && pass !== onlySet) continue;
        const set = (pass === 0 ? 0 : 1) as 0 | 1;
        const thread = kikuColor(ring, color);
        let cursor: Vec3 | null = null;
        for (let sector = 0; sector < n; sector++) {
          if (sector % skip !== pass) continue;
          const phi0 = step * sector;
          const phi1 = step * (sector + 1);
          const phi2 = step * (sector + 2);
          const line1 = (sector + 1) % n;
          const line2 = (sector + 2) % n;
          const inner0 = around(pole, tInner, phi0);
          const outer1 = around(pole, tOuter, phi1);
          const inner2 = around(pole, tInner, phi2);
          cursor = pushKikuLeg(
            ops,
            pole,
            poleIndex,
            ring,
            set,
            thread,
            cursor ?? inner0,
            { line: line1, t: "outer", at: outer1 },
            [],
            cornerMm,
          );
          const over = stackOver(innerOver[line2] ?? [], crossing);
          cursor = pushKikuLeg(
            ops,
            pole,
            poleIndex,
            ring,
            set,
            thread,
            cursor,
            { line: line2, t: "inner", at: inner2 },
            over,
            cornerMm,
          );
          innerOver[line2]?.push(ops.length - 1);
        }
      }
    }
  }
  return ops;
}

export function stitchesFromOps(ops: KagariOp[]): Stitch[] {
  return ops.map((op, i) => {
    const prev = i > 0 ? ops[i - 1] : undefined;
    const sitTo = op.mark.t === "inner" ? op.over.length : 0;
    const sitFrom =
      prev && prev.pole === op.pole && prev.set === op.set
        ? prev.mark.t === "inner"
          ? prev.over.length
          : 0
        : 0;
    return {
      kind: "arc" as const,
      a: op.lay.from,
      b: op.lay.to,
      color: op.color,
      sitA: sitFrom,
      sitB: sitTo,
      sitMid: op.set === 1 ? 1 : 0,
      bite: op.bite,
      via: op.lay.via,
    };
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

function hoshi(division: Division, dir: KagariDir = "out", which: number | "all" = "all"): Stitch[] {
  const n = petalCount(division);
  const skip = starSkip(division);
  const rings =
    division === "simple" ? [0.38, 0.58, 0.78] : division === "c8" ? [0.28, 0.44] : [0.26, 0.4];
  const ordered = dir === "in" ? [...rings].reverse() : rings;
  const stitches: Stitch[] = [];
  for (const { pole } of kagariPolesToSew(division, which)) {
    for (const theta of ordered) {
      const ring = rings.indexOf(theta);
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
    }
  }
  return stitches;
}

function hishi(division: Division, dir: KagariDir = "out", which: number | "all" = "all"): Stitch[] {
  const n = division === "c8" ? 4 : petalCount(division);
  const rings =
    division === "simple"
      ? [0.22, 0.38, 0.54, 0.7]
      : division === "c8"
        ? [0.18, 0.3, 0.42, 0.54]
        : [0.16, 0.28, 0.4];
  const ordered = dir === "in" ? [...rings].reverse() : rings;
  const stitches: Stitch[] = [];
  for (const { pole } of kagariPolesToSew(division, which)) {
    for (const theta of ordered) {
      const ring = rings.indexOf(theta);
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
    }
  }
  return stitches;
}

function obi(division: Division, dir: KagariDir = "out"): Stitch[] {
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
  } else if (division === "c8") {
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
  } else {
    const heights = [0, 0.28, -0.28, 0.52, -0.52];
    heights.forEach((h, i) => {
      stitches.push({
        kind: "loop",
        points: smallCircle([0, 1, 0], h),
        color: i % 2 === 0 ? 0 : 1,
      });
    });
  }
  if (dir === "in") stitches.reverse();
  return stitches;
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
  if (motif === "kiku") return kiku(division, dir, spacing, which, color, wanted, onlySet);
  if (motif === "hoshi") return hoshi(division, dir, which);
  if (motif === "hishi") return hishi(division, dir, which);
  if (motif === "obi") return obi(division, dir);
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
): string {
  if (motif === "none" || total === 0) return "";
  if (!playing && laid >= total) {
    if (motif === "kiku" && kagariSet === 0) {
      return "Снова «Кику» — следующие 4.";
    }
    if (motif === "kiku") {
      return canGrow
        ? "Залить — следующий ряд обеих четвёрок."
        : "Кагари: ряд лежит. Другой полюс — переверните шар.";
    }
    return "Кагари: ряд лежит. Другой полюс — переверните шар.";
  }
  if (motif === "hoshi") return "Хоси: звезда по кругу, ряд за рядом";
  if (motif === "hishi") return "Хиси: многоугольник у полюса, ряд за рядом";
  if (motif === "obi") return "Оби: пояс за поясом";
  if (motif !== "kiku") return "";
  const n = petalCount(division);
  const spec = kikuSpec(division);
  const perRound = (n / spec.sets) * 2;
  const at = Math.max(0, laid - 1);
  const kai = Math.floor(at / perRound) + 1;
  const where = poleIndex === 0 ? "север" : poleIndex === 1 ? "юг" : `полюс ${poleIndex + 1}`;
  const petals = kagariSet === 0 ? "первые 4" : "вторые 4";
  return `Кику · ${where} · ${petals} · круг ${kai} · от полюса`;
}

/** Classic first temari: Simple 8, kiku on both poles, maki obi. */
export function generateTitleMari(): Stitch[] {
  const stitches = kiku("simple", "out", "even", "all", 0, "fit");
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

