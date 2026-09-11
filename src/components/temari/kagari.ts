import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";

type Vec3 = [number, number, number];

/**
 * Kagari engine types. The renderer does not know "kiku".
 * A motif is a recipe; the engine executes KagariOp[].
 */

export type Crossing = "over-all" | "over-1" | "under";
export type RecipeStitch = "uwagake-chidori" | "chidori" | "sakasa";

/** Library entry: what the player picks. Names live here, not in the renderer. */
export type PatternRecipe = {
  id: string;
  requires: "simple" | "c8" | "c10";
  stitch: RecipeStitch;
  /** facing-pole: sew the pole in frame; both is a finished teaching ball. */
  centers: "facing-pole" | "both-poles";
  sets: 2 | 1;
  innerMm: number;
  /** Fraction of pole–equator measured up from the equator. */
  outerFromEquator: number;
  crossing: Crossing;
  /**
   * Bite width across the mark, millimetres on the mari.
   * Inner uwagake widens from this by the stacked count.
   */
  cornerMm: number;
  /**
   * Ozaki / TemariKai Stretch Points: ~2 mm of *turn* at an acute corner
   * for pearl #5, so the point lays flat. The flanks of later kai pack
   * parallel at one thread — not this amount as a growing-V outer step.
   */
  stretchMm: number;
};

export const KIKU_8_POINT: PatternRecipe = {
  id: "kiku-8-point",
  requires: "simple",
  stitch: "uwagake-chidori",
  centers: "facing-pole",
  sets: 2,
  innerMm: 5,
  outerFromEquator: 1 / 3,
  crossing: "over-all",
  cornerMm: 0.71,
  stretchMm: 2,
};

export type KagariMark = {
  /** Meridian index around the working pole. */
  line: number;
  t: "inner" | "outer";
  at: Vec3;
};

export type KagariBite = {
  enter: Vec3;
  exit: Vec3;
};

/** One hand step: lay on the mari, then a tiny scoop at the mark. */
export type KagariOp = {
  i: number;
  kai: number;
  set: 0 | 1;
  pole: number;
  color: number;
  mark: KagariMark;
  lay: { from: Vec3; to: Vec3; via?: Vec3[] };
  bite: KagariBite;
  /** Previous ops this bite goes over (uwagake at the pole). */
  over: number[];
};

function hypot3(a: Vec3) {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: Vec3): Vec3 {
  const len = hypot3(a) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Tiny bite across the jiwari: enter one side, scoop wrap+mark, exit the other.
 * Inner uwagake: wider with the stack, sitting slightly toward the pole so the
 * needle goes around previous rounds. Both flanks still meet at `mark`.
 */
export function biteAcross(
  pole: Vec3,
  mark: Vec3,
  mm = KIKU_8_POINT.cornerMm,
  stacked = 0,
): KagariBite {
  const m = normalize(mark);
  const p = normalize(pole);
  const across = normalize(cross(m, p));
  if (hypot3(across) < 1e-6) return { enter: m, exit: m };
  const center = stacked > 0 ? shiftTowardPole(p, m, unitFromMm(STITCH_THREAD_MM.pearl5) * 0.45) : m;
  const half = unitFromMm(mm) * 0.5;
  const enter = normalize([
    center[0] - across[0] * half,
    center[1] - across[1] * half,
    center[2] - across[2] * half,
  ]);
  const exit = normalize([
    center[0] + across[0] * half,
    center[1] + across[1] * half,
    center[2] + across[2] * half,
  ]);
  return { enter, exit };
}

function shiftTowardPole(pole: Vec3, mark: Vec3, along: number): Vec3 {
  const theta = Math.acos(Math.min(1, Math.max(-1, dot(pole, mark))));
  const t = Math.max(0, theta - along);
  if (t >= theta - 1e-5) return mark;
  const radial = normalize([
    mark[0] - pole[0] * dot(pole, mark),
    mark[1] - pole[1] * dot(pole, mark),
    mark[2] - pole[2] * dot(pole, mark),
  ]);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  return normalize([
    pole[0] * ct + radial[0] * st,
    pole[1] * ct + radial[1] * st,
    pole[2] * ct + radial[2] * st,
  ]);
}

/** Which previous inner ops this bite stacks, given the recipe crossing rule. */
export function stackOver(previous: number[], crossing: Crossing): number[] {
  if (crossing === "under" || previous.length === 0) return [];
  if (crossing === "over-1") return previous.slice(-1);
  return [...previous];
}

/**
 * Local stack along a laid stitch, in counts of threads underneath.
 * Peak 1 at the named site, zero elsewhere — the V is not lifted as a whole.
 */
export function stackBump(t: number, sitA: number, sitB: number, sitMid: number) {
  const bump = (x: number, center: number, width: number) => {
    const w = Math.max(1e-6, width);
    const d = Math.abs(x - center) / w;
    if (d >= 1) return 0;
    const u = 1 - d;
    return u * u * (3 - 2 * u);
  };
  const endW = 0.14 + 0.05 * Math.max(sitA, sitB);
  return sitA * bump(t, 0, endW) + sitB * bump(t, 1, endW) + sitMid * bump(t, 0.5, 0.16);
}

/**
 * Uwagake at the pole: the working thread goes *over* the already-sewn bundle
 * on this meridian, closer to the pole than the new inner bite, then scoops.
 * That is the V opening — the needle's eye clearing the stack — not a new ray.
 */
export function uwagakeVia(
  pole: Vec3,
  inner: Vec3,
  stacked: number,
  pitch: number,
): Vec3 | null {
  if (stacked <= 0) return null;
  const p = normalize(pole);
  const m = normalize(inner);
  const theta = Math.acos(Math.min(1, Math.max(-1, dot(p, m))));
  const back = Math.min(theta * 0.28, pitch * 1.05);
  const t = Math.max(unitFromMm(STITCH_THREAD_MM.pearl5), theta - back);
  if (t >= theta - 1e-4) return null;
  const radial = normalize([m[0] - p[0] * dot(p, m), m[1] - p[1] * dot(p, m), m[2] - p[2] * dot(p, m)]);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  return normalize([
    p[0] * ct + radial[0] * st,
    p[1] * ct + radial[1] * st,
    p[2] * ct + radial[2] * st,
  ]);
}
