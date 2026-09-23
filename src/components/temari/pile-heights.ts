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
  /** Samples already diving into the wrap: never lifted. */
  dive?: boolean[];
  /**
   * Radial offset of each sample from the pile base (negative while diving).
   * With it a diving sample still carries a later thread as high as it
   * actually is — near the port it is just under the surface. Without it a
   * diving sample is no support at all.
   */
  offset?: number[];
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
  // A flower is tens of thousands of samples and every new stitch recomputes
  // the pile: numeric cell keys and flat cell lists, no strings or arrays per
  // lookup. Cells are one width across; a support is within one cell.
  const cell = width;
  const K = 2 ** 17;
  const OFF = 2 ** 16;
  const cellOf = (v: number) => Math.floor(v / cell) + OFF;
  const grid = new Map<number, number[]>();
  const swapped = new Set((opts.swaps ?? []).map(([a, b]) => a * 2 ** 20 + b));
  const diving = (line: PileLine, p: Vec3, i: number) =>
    !!line.dive?.[i] || (line.ports ?? []).some((q) => dist(p, q) < portRadius);

  const lifts: number[][] = lines.map((l) => l.points.map(() => 0));
  const alongs: number[][] = lines.map((l) => {
    const out = [0];
    for (let i = 1; i < l.points.length; i++) out.push(out[i - 1]! + dist(l.points[i - 1]!, l.points[i]!));
    return out;
  });
  const inside: boolean[][] = lines.map((l) => l.points.map((p, i) => diving(l, p, i)));
  // Height a sample lends as a support before its own lift; NaN: no support.
  const floor: number[][] = lines.map((l, li) => l.points.map((_, i) => {
    const sunk = l.offset?.[i];
    return sunk == null ? (inside[li]![i] ? NaN : 0) : sunk;
  }));

  lines.forEach((line, li) => {
    const along = alongs[li]!;
    line.points.forEach((p, pi) => {
      let top = -Infinity;
      if (!inside[li]![pi]) {
        const x = cellOf(p[0]), y = cellOf(p[1]), z = cellOf(p[2]);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
          const list = grid.get(((x + i) * K + (y + j)) * K + (z + k));
          if (!list) continue;
          for (let e = 0; e < list.length; e += 2) {
            const sl = list[e]!, si = list[e + 1]!;
            // Its own last stretch is not a support; coming back over an
            // earlier stretch of itself (the chidori X) is.
            if (sl === li && along[pi]! - along[si]! < 2 * width) continue;
            if (swapped.size && swapped.has(sl * 2 ** 20 + li)) continue;
            const base = floor[sl]![si]!;
            if (Number.isNaN(base)) continue;
            const q = lines[sl]!.points[si]!;
            const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= width * width) continue;
            const t = base + lifts[sl]![si]! + height * Math.sqrt(1 - d2 / (width * width));
            if (t > top) top = t;
          }
        }
      }
      // A sample already partly down its port rests on the pile from where it is.
      lifts[li]![pi] = Math.max(0, top - (line.offset?.[pi] ?? 0));
      const key = (cellOf(p[0]) * K + cellOf(p[1])) * K + cellOf(p[2]);
      const list = grid.get(key);
      if (list) list.push(li, pi);
      else grid.set(key, [li, pi]);
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
