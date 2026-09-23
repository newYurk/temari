type Vec3 = [number, number, number];

/**
 * Heights by sewing order (spec/pile-render.md): a later thread lies on what
 * is already under it. Lines arrive in sewing order as samples on the unit
 * sphere; each sample gets the lift above its base radius at which it rests
 * on the threads laid before it. "Under" happens only where the craft says so:
 * near a line's own port the needle takes it under the pile (no lift), and an
 * underpassing pair swaps seniority.
 */
export type PileLine = {
  /** Unit directions along the thread, in the order it is laid. */
  points: Vec3[];
  /** Port centres of this line; within `portRadius` it dives, not lifts. */
  ports?: Vec3[];
  /** Samples already diving into the wrap: neither lifted nor a support. */
  dive?: boolean[];
};

export type PileOptions = {
  /** Cross-section width (unit sphere arc): threads closer than this overlap. */
  width: number;
  /** Cross-section height: a full crossing lifts by this much. */
  height: number;
  /** Radius around a port where the line dives into the wrap. */
  portRadius: number;
  /** [earlier, later] line pairs where the later goes under (underpassing). */
  swaps?: [number, number][];
};

function dist(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Share of the cross-section height at lateral distance d: an ellipse. */
function profile(d: number, width: number) {
  const x = d / width;
  return x >= 1 ? 0 : Math.sqrt(1 - x * x);
}

export function pileHeights(lines: PileLine[], opts: PileOptions): number[][] {
  const { width, height, portRadius } = opts;
  const cell = width;
  const grid = new Map<string, { line: number; index: number; along: number }[]>();
  const key = (p: Vec3) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
  const near = (p: Vec3) => {
    const [x, y, z] = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)];
    const out: { line: number; index: number; along: number }[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const hit = grid.get(`${x + i},${y + j},${z + k}`);
      if (hit) out.push(...hit);
    }
    return out;
  };
  const swapped = new Set((opts.swaps ?? []).map(([a, b]) => `${a}:${b}`));
  const diving = (line: PileLine, p: Vec3, i: number) =>
    !!line.dive?.[i] || (line.ports ?? []).some((q) => dist(p, q) < portRadius);

  const lifts: number[][] = lines.map((l) => l.points.map(() => 0));
  const alongs: number[][] = lines.map((l) => {
    const out = [0];
    for (let i = 1; i < l.points.length; i++) out.push(out[i - 1]! + dist(l.points[i - 1]!, l.points[i]!));
    return out;
  });

  lines.forEach((line, li) => {
    line.points.forEach((p, pi) => {
      let lift = 0;
      if (!diving(line, p, pi)) {
        for (const s of near(p)) {
          // Its own last stretch is not a support; coming back over an
          // earlier stretch of itself (the chidori X) is.
          if (s.line === li && alongs[li]![pi]! - s.along < 2 * width) continue;
          if (swapped.has(`${s.line}:${li}`)) continue;
          const q = lines[s.line]!.points[s.index]!;
          if (diving(lines[s.line]!, q, s.index)) continue;
          const f = profile(dist(p, q), width);
          if (f > 0) lift = Math.max(lift, lifts[s.line]![s.index]! + height * f);
        }
      }
      lifts[li]![pi] = lift;
      const k = key(p);
      const list = grid.get(k) ?? [];
      list.push({ line: li, index: pi, along: alongs[li]![pi]! });
      grid.set(k, list);
    });
  });

  // Underpassing: the earlier line of a swapped pair rests on the later one.
  for (const [early, late] of opts.swaps ?? []) {
    lines[early]?.points.forEach((p, pi) => {
      if (diving(lines[early]!, p, pi)) return;
      lines[late]!.points.forEach((q, qi) => {
        if (diving(lines[late]!, q, qi)) return;
        const f = profile(dist(p, q), width);
        if (f > 0) lifts[early]![pi] = Math.max(lifts[early]![pi]!, lifts[late]![qi]! + height * f);
      });
    });
  }
  return lifts;
}
