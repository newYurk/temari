import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";

type Vec3 = [number, number, number];

/**
 * Kagari engine types. The renderer does not know "kiku".
 * A motif is a recipe; the engine executes KagariOp[].
 */

export type Crossing = "over-all" | "over-1" | "under";
export type RecipeStitch = "uwagake-chidori" | "chidori" | "sakasa";

/** Geometry for one pattern implementation. Names live in library.ts, not here. */
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
   * Ozaki / TemariKai Stretch Points: ~2 mm *below the previous outer stitch*
   * for pearl #5, so the point lays flat and there is room for the turn.
   * Flanks pack parallel to the previous thread (one pearl wide);
   * this value is the mark along the jiwari, not a fanning of the V.
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
 *
 * These points live on the unit sphere. The renderer still has to *sew* them —
 * a stored bite is not a dive.
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

/**
 * TemariKai kagari / Enter the Thread / Exit the Thread.
 * Visible scoop is ~2 mm — same size as a regular stitch. The 3–4 cm
 * friction run under the wrap is not drawn (no bleed-through).
 */
export const KAGARI_SCOOP_MM = 2;

function rotateAxis(v: Vec3, axis: Vec3, ang: number): Vec3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const d = dot(axis, v);
  const axv = cross(axis, v);
  const k = 1 - c;
  return [
    v[0] * c + axv[0] * s + axis[0] * d * k,
    v[1] * c + axv[1] * s + axis[1] * d * k,
    v[2] * c + axv[2] * s + axis[2] * d * k,
  ];
}

/**
 * Unit-sphere walk from `at` continuing away from `from`.
 * Does not include `at`. Last point is ~KAGARI_SCOOP_MM along the mari.
 */
export function scoopAway(at: Vec3, from: Vec3, n = 8, mm = KAGARI_SCOOP_MM): Vec3[] {
  const a = normalize(at);
  const b = normalize(from);
  let axis = cross(b, a);
  if (hypot3(axis) < 1e-8) {
    axis = cross(a, Math.abs(a[1]) < 0.9 ? ([0, 1, 0] as Vec3) : ([1, 0, 0] as Vec3));
  }
  if (hypot3(axis) < 1e-8) return [];
  axis = normalize(axis);
  const along = unitFromMm(mm);
  const out: Vec3[] = [];
  for (let i = 1; i <= n; i++) {
    out.push(normalize(rotateAxis(a, axis, along * (i / n))));
  }
  return out;
}

/**
 * Centerline radius of the scoop. t=0 sits on the mari; t=1 is buried in
 * the upper wrap layers so the whole pearl is under the cover (r=1).
 */
export function scoopRadius(t: number, surfaceR: number, half: number): number {
  const u = Math.min(1, Math.max(0, t));
  const h = u * u * (3 - 2 * u);
  const buried = Math.min(0.988, 1 - half - unitFromMm(0.3));
  const floor = 0.975;
  return surfaceR + (Math.max(floor, buried) - surfaceR) * h;
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
 * Closest approach of two unit-sphere polylines, as parameters in [0, 1].
 * Used for the A/B kousa: the crossing is near the inner marks, not mid-flank.
 */
export function closestApproachT(
  a: readonly Vec3[],
  b: readonly Vec3[],
): { tA: number; tB: number; dist: number } {
  let bestD = Infinity;
  let tA = 0.5;
  let tB = 0.5;
  const nA = Math.max(1, a.length - 1);
  const nB = Math.max(1, b.length - 1);
  for (let i = 0; i < a.length; i++) {
    const pa = a[i];
    if (!pa) continue;
    for (let j = 0; j < b.length; j++) {
      const pb = b[j];
      if (!pb) continue;
      const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
      if (d < bestD) {
        bestD = d;
        tA = i / nA;
        tB = j / nB;
      }
    }
  }
  return { tA, tB, dist: bestD };
}

/**
 * Local stack along a laid stitch, in counts of threads underneath.
 * Peak 1 at the named site, zero elsewhere — the V is not lifted as a whole.
 * `midT` is the actual A/B kousa along this leg. Without it, sitMid is ignored:
 * a bump at t=0.5 was the every-other-petal hill.
 */
export function stackBump(t: number, sitA: number, sitB: number, sitMid: number, midT?: number, mids?: readonly { t: number; n: number }[]) {
  const bump = (x: number, center: number, width: number) => {
    const w = Math.max(1e-6, width);
    const d = Math.abs(x - center) / w;
    if (d >= 1) return 0;
    const u = 1 - d;
    return u * u * (3 - 2 * u);
  };
  const endW = 0.14 + 0.05 * Math.max(sitA, sitB);
  let h = sitA * bump(t, 0, endW) + sitB * bump(t, 1, endW);
  // ~1.6 mm on a 35 mm flank: local at the kousa, not a hill down the petal.
  const midW = 0.045;
  if (mids && mids.length) {
    for (const m of mids) h += m.n * bump(t, m.t, midW);
  } else if (sitMid > 0 && midT != null) {
    h += sitMid * bump(t, midT, midW);
  }
  return h;
}

function slerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  const na = normalize(a);
  const nb = normalize(b);
  const d = Math.min(1, Math.max(-1, dot(na, nb)));
  const theta = Math.acos(d);
  const ra = hypot3(a);
  const rb = hypot3(b);
  const r = ra + (rb - ra) * t;
  if (theta < 1e-5) return [na[0] * r, na[1] * r, na[2] * r];
  const s = Math.sin(theta);
  const w0 = Math.sin((1 - t) * theta) / s;
  const w1 = Math.sin(t * theta) / s;
  return [
    (na[0] * w0 + nb[0] * w1) * r,
    (na[1] * w0 + nb[1] * w1) * r,
    (na[2] * w0 + nb[2] * w1) * r,
  ];
}

/**
 * Tip of the V, past the mark. The open side is from+to; the turn sits on
 * the opposite side so the pearl goes around the jiwari, not through it.
 */
export function markTurnPast(from: Vec3, mark: Vec3, to: Vec3, dist: number): Vec3 {
  const fu = normalize(from);
  const mu = normalize(mark);
  const tu = normalize(to);
  let open: Vec3 = [
    fu[0] + tu[0] - 2 * mu[0],
    fu[1] + tu[1] - 2 * mu[1],
    fu[2] + tu[2] - 2 * mu[2],
  ];
  if (hypot3(open) < 1e-6) open = cross(mu, [tu[0] - fu[0], tu[1] - fu[1], tu[2] - fu[2]]);
  if (hypot3(open) < 1e-6) return [mark[0], mark[1], mark[2]];
  open = normalize(open);
  const r = hypot3(mark) || 1;
  const n = normalize([
    mu[0] - open[0] * dist,
    mu[1] - open[1] * dist,
    mu[2] - open[2] * dist,
  ]);
  return [n[0] * r, n[1] * r, n[2] * r];
}

/**
 * The cap inside the first inner stitch is empty. An inner U may not
 * dive toward the pole — that's the macaroni on the silhouette.
 */
export function clampNotPastPole(p: Vec3, mark: Vec3): Vec3 {
  const pole: Vec3 = mark[1] >= 0 ? [0, 1, 0] : [0, -1, 0];
  const pu = normalize(p);
  const mu = normalize(mark);
  if (dot(pu, pole) <= dot(mu, pole) + 1e-6) return p;
  const along = dot(pu, pole);
  let radial: Vec3 = [
    pu[0] - pole[0] * along,
    pu[1] - pole[1] * along,
    pu[2] - pole[2] * along,
  ];
  if (hypot3(radial) < 1e-8) {
    const mAlong = dot(mu, pole);
    radial = [
      mu[0] - pole[0] * mAlong,
      mu[1] - pole[1] * mAlong,
      mu[2] - pole[2] * mAlong,
    ];
  }
  if (hypot3(radial) < 1e-8) return mark;
  radial = normalize(radial);
  const ct = dot(mu, pole);
  const st = Math.sqrt(Math.max(0, 1 - ct * ct));
  const r = hypot3(p) || 1;
  return [
    (pole[0] * ct + radial[0] * st) * r,
    (pole[1] * ct + radial[1] * st) * r,
    (pole[2] * ct + radial[2] * st) * r,
  ];
}

/** Quadratic Bézier on the sphere. Does not cusp at the control point. */
export function sphereBezier(a: Vec3, b: Vec3, c: Vec3, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const p01 = slerp3(a, b, u);
    const p12 = slerp3(b, c, u);
    out.push(slerp3(p01, p12, u));
  }
  return out;
}

/** Inner uwagake: stay on the mark's parallel. A great-circle U dives into the cap. */
export function smallCircleJoin(from: Vec3, to: Vec3, pole: Vec3, n: number): Vec3[] {
  const p = normalize(pole);
  const fu = normalize(from);
  const tu = normalize(to);
  const clamp = (x: number) => Math.min(1, Math.max(-1, x));
  const theta = 0.5 * (Math.acos(clamp(dot(fu, p))) + Math.acos(clamp(dot(tu, p))));
  const ref: Vec3 = Math.abs(p[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = normalize(cross(p, ref));
  const e2 = normalize(cross(p, e1));
  const az = (q: Vec3) => {
    const along = dot(q, p);
    const radial: Vec3 = [q[0] - p[0] * along, q[1] - p[1] * along, q[2] - p[2] * along];
    return Math.atan2(dot(radial, e2), dot(radial, e1));
  };
  let d = az(tu) - az(fu);
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const r = 0.5 * ((hypot3(from) || 1) + (hypot3(to) || 1));
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const a0 = az(fu);
  const out: Vec3[] = [];
  for (let i = 1; i <= n; i++) {
    const phi = a0 + d * (i / n);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    out.push([
      (p[0] * ct + (e1[0] * c + e2[0] * s) * st) * r,
      (p[1] * ct + (e1[1] * c + e2[1] * s) * st) * r,
      (p[2] * ct + (e1[2] * c + e2[2] * s) * st) * r,
    ]);
  }
  return out;
}

/**
 * Inner uwagake: a pearl bite *across* the jiwari.
 * A small-circle around the pole is a 90° noodle on the cap — macaroni from above.
 * The visible bead is one pearl, not a loop.
 */
export function innerBiteJoin(from: Vec3, mark: Vec3, to: Vec3, pearl: number, n = 4): Vec3[] {
  const m = normalize(mark);
  const pole: Vec3 = m[1] >= 0 ? [0, 1, 0] : [0, -1, 0];
  let across = cross(m, pole);
  if (hypot3(across) < 1e-8) across = [1, 0, 0];
  across = normalize(across);
  const r = 0.5 * ((hypot3(from) || 1) + (hypot3(to) || 1));
  const half = pearl * 0.45;
  const mk = (s: number): Vec3 => {
    const q = normalize([m[0] + across[0] * s, m[1] + across[1] * s, m[2] + across[2] * s]);
    return [q[0] * r, q[1] * r, q[2] * r];
  };
  let enter = mk(-half);
  let exit = mk(half);
  const d = (a: Vec3, b: Vec3) => {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
  };
  if (d(from, exit) + d(to, enter) < d(from, enter) + d(to, exit)) {
    const tmp = enter;
    enter = exit;
    exit = tmp;
  }
  const out: Vec3[] = [];
  const cap = Math.abs(m[1]);
  const push = (a: Vec3, b: Vec3, steps: number) => {
    for (let i = 1; i <= steps; i++) {
      const p = slerp3(a, b, i / steps);
      const L = hypot3(p) || 1;
      if (Math.abs(p[1]) / L > cap) {
        const rho = Math.sqrt(Math.max(0, 1 - cap * cap));
        const pr = Math.hypot(p[0], p[2]) || 1e-9;
        out.push([(p[0] / pr) * rho * L, Math.sign(p[1]) * cap * L, (p[2] / pr) * rho * L]);
      } else {
        out.push(p);
      }
    }
  };
  push(from, enter, n);
  push(enter, exit, Math.max(2, n));
  push(exit, to, n);
  return out;
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
