import type { PointMm, ThreadCurve } from "./thread-path";

type Vec = PointMm;
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const binomial = (n: number, k: number) => { let c = 1; for (let i = 1; i <= k; i++) c = c * (n - i + 1) / i; return c; };

/**
 * Bernstein coefficients of w = v x a (degree 3) and s = |v|^2 (degree 4) for
 * one cubic Bezier. v and a are the exact first and second derivatives.
 */
function bernsteinData(controls: readonly [Vec, Vec, Vec, Vec]) {
  const [q0, q1, q2, q3] = controls;
  const d = [mul(sub(q1, q0), 3), mul(sub(q2, q1), 3), mul(sub(q3, q2), 3)];
  const e = [mul(add(sub(q2, mul(q1, 2)), q0), 6), mul(add(sub(q3, mul(q2, 2)), q1), 6)];
  const w: Vec[] = Array.from({ length: 4 }, () => [0, 0, 0] as Vec);
  const s: number[] = Array(5).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
    w[i + j] = add(w[i + j]!, mul(cross(d[i]!, e[j]!), binomial(2, i) * binomial(1, j) / binomial(3, i + j)));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    s[i + j]! += dot(d[i]!, d[j]!) * binomial(2, i) * binomial(2, j) / binomial(4, i + j);
  return { w, s };
}

function splitVectors(c: readonly Vec[]): [Vec[], Vec[]] {
  const left: Vec[] = [], right: Vec[] = [];
  let row = [...c];
  while (row.length) {
    left.push(row[0]!); right.unshift(row.at(-1)!);
    row = row.slice(1).map((p, i) => mul(add(row[i]!, p), .5));
  }
  return [left, right];
}
function splitScalars(c: readonly number[]): [number[], number[]] {
  const left: number[] = [], right: number[] = [];
  let row = [...c];
  while (row.length) {
    left.push(row[0]!); right.unshift(row.at(-1)!);
    row = row.slice(1).map((p, i) => (row[i]! + p) / 2);
  }
  return [left, right];
}

function exactAt(controls: readonly [Vec, Vec, Vec, Vec], t: number) {
  const [a, b, c, d] = controls, u = 1 - t;
  const v = add(add(mul(sub(b, a), 3 * u * u), mul(sub(c, b), 6 * u * t)), mul(sub(d, c), 3 * t * t));
  const acc = add(mul(add(sub(c, mul(b, 2)), a), 6 * u), mul(add(sub(d, mul(c, 2)), b), 6 * t));
  const speed = norm(v);
  return { speed, curvature: speed > 0 ? norm(cross(v, acc)) / speed ** 3 : Infinity };
}

export type CurvatureBoundOptions = {
  /** Width of the certified interval [lower, upper] in r*kappa units. */
  precision?: number;
  maxDepth?: number;
  maxLeaves?: number;
  /** Collect evaluated parameters whose r*kappa exceeds this value. */
  witnessAbove?: number;
  maxWitnesses?: number;
};
export type CurvatureBound = {
  status: "certified" | "unresolved";
  /** Largest r*kappa actually evaluated on the curves (a witness value). */
  lower: number;
  /** Rigorous upper bound on r*kappa over every parameter (up to floating-point rounding). */
  upper: number;
  /** Rigorous lower bound on |dx/dt| for the Bezier parameters (arcs report their exact speed). */
  minSpeedBound: number;
  /** Curve index and local parameter of the witness value. */
  argmax: { curve: number; t: number };
  /** Evaluated points above witnessAbove, strongest first. */
  witnesses: { curve: number; t: number; value: number }[];
  leaves: number;
};

/**
 * Branch-and-bound certificate for the tube regularity quantity r*kappa.
 * On a Bezier piece w = v x a and s = |v|^2 are polynomials. Their Bernstein
 * coefficients bound them by convex hulls: |w| <= max|w_k| and s >= min s_k.
 * Hence kappa = |w| / s^(3/2) <= max|w_k| / (min s_k)^(3/2) on that interval.
 * De Casteljau subdivision tightens this bound quadratically. Circular arcs
 * have exact constant curvature. This is not sampling: every parameter is
 * covered, and an interval that cannot be bounded yields "unresolved".
 */
export function boundCurvatureTimesRadius(curves: readonly ThreadCurve[], radiusMm: number,
  options: CurvatureBoundOptions = {}): CurvatureBound {
  if (!(radiusMm > 0) || !Number.isFinite(radiusMm)) throw new RangeError("curvature bound requires a positive radius");
  const precision = options.precision ?? 1e-3, maxDepth = options.maxDepth ?? 24, maxLeaves = options.maxLeaves ?? 200000;
  if (!(precision > 0) || !Number.isInteger(maxDepth) || maxDepth < 0 || !Number.isInteger(maxLeaves) || maxLeaves < 1)
    throw new RangeError("invalid curvature bound options");
  let lower = 0, upper = 0, minSpeedBound = Infinity, leaves = 0, unresolved = false;
  let argmax = { curve: 0, t: 0 };
  const witnessAbove = options.witnessAbove ?? Infinity, witnesses: CurvatureBound["witnesses"] = [];
  const consider = (curve: number, t: number, value: number) => {
    if (value > lower) { lower = value; argmax = { curve, t }; }
    if (value > witnessAbove) witnesses.push({ curve, t, value });
  };
  type Leaf = { curve: number; a: number; b: number; depth: number; w: Vec[]; s: number[] };
  const stack: Leaf[] = [];
  curves.forEach((curve, index) => {
    if (curve.kind === "arc") {
      const r = norm(curve.from), value = radiusMm / r;
      consider(index, .5, value);
      upper = Math.max(upper, value);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(curve.from, curve.to) / (r * norm(curve.to)))));
      minSpeedBound = Math.min(minSpeedBound, r * angle);
      return;
    }
    // A few exact samples give a useful incumbent before any pruning.
    for (let i = 0; i <= 16; i++) {
      consider(index, i / 16, radiusMm * exactAt(curve.controls, i / 16).curvature);
    }
    const data = bernsteinData(curve.controls);
    stack.push({ curve: index, a: 0, b: 1, depth: 0, ...data });
  });
  while (stack.length) {
    const leaf = stack.pop()!;
    leaves++;
    const controls = (curves[leaf.curve] as Extract<ThreadCurve, { kind: "bezier" }>).controls;
    const middle = (leaf.a + leaf.b) / 2, sample = exactAt(controls, middle);
    consider(leaf.curve, middle, radiusMm * sample.curvature);
    const sMin = Math.min(...leaf.s), wMax = Math.max(...leaf.w.map(norm));
    const bound = sMin > 0 ? radiusMm * wMax / sMin ** 1.5 : Infinity;
    if (bound <= lower + precision) {
      upper = Math.max(upper, bound);
      minSpeedBound = Math.min(minSpeedBound, Math.sqrt(Math.max(0, sMin)));
      continue;
    }
    if (leaf.depth >= maxDepth || leaves >= maxLeaves) {
      unresolved = true; upper = Math.max(upper, bound);
      minSpeedBound = Math.min(minSpeedBound, Math.sqrt(Math.max(0, sMin)));
      continue;
    }
    const [wl, wr] = splitVectors(leaf.w), [sl, sr] = splitScalars(leaf.s);
    stack.push({ curve: leaf.curve, a: leaf.a, b: middle, depth: leaf.depth + 1, w: wl, s: sl },
      { curve: leaf.curve, a: middle, b: leaf.b, depth: leaf.depth + 1, w: wr, s: sr });
  }
  // Pruned leaves were compared with an incumbent that could only grow later.
  upper = Math.max(upper, lower);
  // Keep the strongest, well separated witnesses for adaptive probing.
  witnesses.sort((a, b) => b.value - a.value);
  const kept: CurvatureBound["witnesses"] = [];
  for (const w of witnesses) {
    if (kept.length >= (options.maxWitnesses ?? 16)) break;
    if (kept.every(k => k.curve !== w.curve || Math.abs(k.t - w.t) > 1e-3)) kept.push(w);
  }
  return { status: unresolved ? "unresolved" : "certified", lower, upper, minSpeedBound, argmax, witnesses: kept, leaves };
}
