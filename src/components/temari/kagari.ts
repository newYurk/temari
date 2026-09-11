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
   * Stretch at the lower V is one thread more than the inner step — not this
   * number on top of the pitch, or petals run to the equator in six rounds.
   */
  cornerMm: number;
};

export const KIKU_8_POINT: PatternRecipe = {
  id: "kiku-8-point",
  requires: "simple",
  stitch: "uwagake-chidori",
  centers: "facing-pole",
  sets: 2,
  innerMm: 10,
  outerFromEquator: 1 / 3,
  crossing: "over-all",
  cornerMm: 2,
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
 * Length ≈ recipe.cornerMm. Not a tunnel under the mari.
 */
export function biteAcross(pole: Vec3, mark: Vec3, mm = KIKU_8_POINT.cornerMm): KagariBite {
  const m = normalize(mark);
  const p = normalize(pole);
  const across = normalize(cross(m, p));
  if (hypot3(across) < 1e-6) return { enter: m, exit: m };
  const half = unitFromMm(mm) * 0.5;
  const enter = normalize([
    m[0] - across[0] * half,
    m[1] - across[1] * half,
    m[2] - across[2] * half,
  ]);
  const exit = normalize([
    m[0] + across[0] * half,
    m[1] + across[1] * half,
    m[2] + across[2] * half,
  ]);
  return { enter, exit };
}

/** Which previous inner ops this bite stacks, given the recipe crossing rule. */
export function stackOver(previous: number[], crossing: Crossing): number[] {
  if (crossing === "under" || previous.length === 0) return [];
  if (crossing === "over-1") return previous.slice(-1);
  return [...previous];
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
  const back = Math.min(theta * 0.72, pitch * (stacked - 0.12));
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
