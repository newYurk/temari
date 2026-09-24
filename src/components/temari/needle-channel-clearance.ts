/** Assigned spatial clearance for a round thread, not a needle-motion or capture model. */
export type ChannelPointMm = readonly [number, number, number];
export type NeedleChannelDomain = {
  sphereCenterMm: ChannelPointMm;
  bodyRadiusMm: number;
  entryMm: ChannelPointMm;
  exitMm: ChannelPointMm;
  channelRadiusMm: number;
  threadRadiusMm: number;
};
export const NEEDLE_CHANNEL_GEOMETRY = 'conservative-eroded-union' as const;
export type NeedleChannelPointClearance = {
  geometry: typeof NEEDLE_CHANNEL_GEOMETRY;
  gapMm: number;
  exteriorGapMm: number;
  channelGapMm: number;
  branch: 'exterior' | 'channel' | 'switch';
  gradientStatus: 'smooth' | 'nondifferentiable' | 'unresolved';
  /** Gradient of gap with respect to this point, not a certified contact normal. */
  gradient: ChannelPointMm | null;
  roundoffAllowanceMm: number;
};
type V = [number, number, number];
const validPoint = (p: ChannelPointMm) => p.length === 3 && p.every(Number.isFinite);
const subtract = (a: ChannelPointMm, b: ChannelPointMm): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (p: ChannelPointMm) => Math.hypot(...p);
const positive = (n: number) => Number.isFinite(n) && n > 0;
const magnitude = (p: ChannelPointMm) => Math.max(...p.map(Math.abs));

function prepare(domain: NeedleChannelDomain) {
  if (![domain.sphereCenterMm, domain.entryMm, domain.exitMm].every(validPoint)
    || ![domain.bodyRadiusMm, domain.threadRadiusMm, domain.channelRadiusMm].every(positive)
    || domain.channelRadiusMm <= domain.threadRadiusMm) {
    throw new RangeError('Finite geometry and a channel strictly wider than the thread are required.');
  }
  const direction = subtract(domain.exitMm, domain.entryMm), length = norm(direction);
  const inflated = domain.bodyRadiusMm + domain.threadRadiusMm;
  if (!positive(length) || !positive(inflated)) throw new RangeError('Undefined channel axis or sphere envelope.');
  const axis = direction.map(x => x / length) as V;
  const scale = Math.max(1, inflated, domain.channelRadiusMm,
    magnitude(domain.sphereCenterMm), magnitude(domain.entryMm), magnitude(domain.exitMm));
  const evaluate = (point: ChannelPointMm): NeedleChannelPointClearance => {
    if (!validPoint(point)) throw new RangeError('A finite point is required.');
    const radial = subtract(point, domain.sphereCenterMm), fromAxis = subtract(point, domain.entryMm);
    const axial = fromAxis.reduce((sum, value, i) => sum + value * axis[i]!, 0);
    const perpendicular = fromAxis.map((value, i) => value - axial * axis[i]!) as V;
    const radialDistance = norm(radial), axisDistance = norm(perpendicular);
    const exteriorGapMm = radialDistance - inflated;
    const channelGapMm = domain.channelRadiusMm - domain.threadRadiusMm - axisDistance;
    if (![exteriorGapMm, channelGapMm].every(Number.isFinite)) throw new RangeError('Clearance arithmetic overflow.');
    // Explicit Float64 padding; these are not outward-rounded interval operations.
    const roundoffAllowanceMm = 128 * Number.EPSILON * Math.max(scale, magnitude(point));
    const difference = exteriorGapMm - channelGapMm;
    const branch = Math.abs(difference) <= roundoffAllowanceMm ? 'switch' : difference > 0 ? 'exterior' : 'channel';
    let gradient: V | null = null;
    let gradientStatus: NeedleChannelPointClearance['gradientStatus'] = 'nondifferentiable';
    if (branch === 'switch') {
      if (difference !== 0) gradientStatus = 'unresolved';
    } else {
      const distance = branch === 'exterior' ? radialDistance : axisDistance;
      if (distance > roundoffAllowanceMm) {
        const vector = branch === 'exterior' ? radial : perpendicular;
        const sign = branch === 'exterior' ? 1 : -1;
        gradient = vector.map(value => sign * value / distance) as V;
        gradientStatus = 'smooth';
      } else if (distance !== 0) gradientStatus = 'unresolved';
    }
    return { geometry: NEEDLE_CHANNEL_GEOMETRY, gapMm: Math.max(exteriorGapMm, channelGapMm),
      exteriorGapMm, channelGapMm, branch, gradientStatus, gradient, roundoffAllowanceMm };
  };
  return evaluate;
}

/**
 * g(x) = max(|x-O|-R-r, a-r-dist(x, channel axis)). Nonnegative means the
 * axis is in at least one eroded primitive. Erosion does not distribute over
 * unions: this conservative domain omits some valid placements at the rim.
 */
export function pointNeedleChannelClearance(point: ChannelPointMm, domain: NeedleChannelDomain) {
  return prepare(domain)(point);
}

export type NeedleChannelSegmentClearance = {
  geometry: typeof NEEDLE_CHANNEL_GEOMETRY;
  status: 'resolved' | 'unresolved';
  /** Relative to this conservative domain, not an actual yarn/body collision verdict. */
  clearance: 'clear' | 'outside-domain' | 'unresolved';
  /** Minimum sampled gap, an upper estimate of the full-segment minimum. */
  gapMm: number;
  lowerBoundMm: number;
  upperBoundMm: number;
  accuracyMm: number;
  witness: { t: number; pointMm: ChannelPointMm; evaluation: NeedleChannelPointClearance };
  evaluations: number;
  reason: 'tolerance' | 'budget' | 'floating-point-resolution';
};

/**
 * Both branches and their maximum are 1-Lipschitz in space. On each interval,
 * endpoint cones bound the complete segment, including unsampled points.
 * Float64 roundoff padding is reported separately by each point evaluation;
 * these bounds are numerical, not a formal interval-arithmetic certificate.
 */
export function segmentNeedleChannelClearance(a: ChannelPointMm, b: ChannelPointMm,
  domain: NeedleChannelDomain, options: { toleranceMm?: number; maxEvaluations?: number } = {}): NeedleChannelSegmentClearance {
  const tolerance = options.toleranceMm ?? 1e-5, budget = options.maxEvaluations ?? 2049;
  if (!validPoint(a) || !validPoint(b) || !positive(tolerance) || !Number.isSafeInteger(budget) || budget < 2)
    throw new RangeError('Finite endpoints, positive tolerance and an evaluation budget of at least two are required.');
  const evaluate = prepare(domain), direction = subtract(b, a), length = norm(direction);
  if (!Number.isFinite(length)) throw new RangeError('Segment length overflow.');
  type Sample = NeedleChannelSegmentClearance['witness'];
  const sample = (t: number): Sample => {
    const pointMm = a.map((value, i) => value + t * direction[i]!) as V;
    return { t, pointMm, evaluation: evaluate(pointMm) };
  };
  const left = sample(0), right = length === 0 ? left : sample(1);
  let best = left.evaluation.gapMm <= right.evaluation.gapMm ? left : right;
  let evaluations = length === 0 ? 1 : 2;
  // Linear interpolation cannot exceed the endpoint coordinate magnitudes.
  const padding = Math.max(left.evaluation.roundoffAllowanceMm, right.evaluation.roundoffAllowanceMm);
  const interval = (l: Sample, r: Sample) => ({ l, r,
    lower: Math.min(l.evaluation.gapMm, r.evaluation.gapMm,
      (l.evaluation.gapMm + r.evaluation.gapMm - length * (r.t - l.t)) / 2) - padding });
  const intervals = [interval(left, right)];
  const finish = (lowerBoundMm: number, reason: NeedleChannelSegmentClearance['reason']): NeedleChannelSegmentClearance => {
    const upperBoundMm = best.evaluation.gapMm + padding;
    return { geometry: NEEDLE_CHANNEL_GEOMETRY, status: reason === 'tolerance' ? 'resolved' : 'unresolved',
      clearance: lowerBoundMm >= 0 ? 'clear' : upperBoundMm < 0 ? 'outside-domain' : 'unresolved',
      gapMm: best.evaluation.gapMm, lowerBoundMm, upperBoundMm, accuracyMm: upperBoundMm - lowerBoundMm,
      witness: best, evaluations, reason };
  };
  for (;;) {
    let worst = 0;
    for (let i = 1; i < intervals.length; i++) if (intervals[i]!.lower < intervals[worst]!.lower) worst = i;
    const current = intervals[worst]!, lower = current.lower;
    if (best.evaluation.gapMm + padding - lower <= tolerance) return finish(lower, 'tolerance');
    if (evaluations >= budget) return finish(lower, 'budget');
    const t = (current.l.t + current.r.t) / 2;
    if (t === current.l.t || t === current.r.t) return finish(lower, 'floating-point-resolution');
    const middle = sample(t); evaluations++;
    if (middle.evaluation.gapMm < best.evaluation.gapMm) best = middle;
    intervals[worst] = interval(current.l, middle);
    intervals.push(interval(middle, current.r));
  }
}

export type NeedleChannelMinimum = {
  geometry: typeof NEEDLE_CHANNEL_GEOMETRY;
  /** Resolution of the scalar minimum/bounds, independent of differentiability. */
  status: 'resolved' | 'unresolved';
  gapMm: number;
  lowerBoundMm: number;
  upperBoundMm: number;
  accuracyMm: number;
  witness: NeedleChannelSegmentClearance['witness'];
  /** Derivatives of the whole-segment minimum, not one point's branch normal.
   * They need not have unit length, and must not be normalized by the solver. */
  gradientA: ChannelPointMm | null;
  gradientB: ChannelPointMm | null;
  gradientStatus: 'smooth' | 'unresolved';
  candidates: { t: number; gapMm: number; kind: 'endpoint' | 'exterior-minimum' | 'switch' }[];
  reason: 'unique-minimum' | 'tied-minima' | 'degenerate-segment' | 'degenerate-switch'
    | 'undefined-branch-gradient' | 'root-resolution';
};

/** Solver kernel for min_t max(e(t), c(t)), t in [0,1]. Here e is convex,
 * c is concave, and h=e-c is convex. Thus the channel-active interval has
 * its minima at its ends; only endpoints, the exterior radial minimum and
 * at most two isolated roots of h can minimize g. No dense sampling is used.
 *
 * At an isolated interior switch minimum, envelope differentiation mixes the
 * two normals so its derivative along the segment vanishes. A sampled branch
 * gradient alone is NOT a derivative of this minimum, however small its gap
 * error. Ties and singular switches deliberately have no chosen derivative.
 * Bounds include root brackets and Float64 padding, not formal interval math.
 * Keep segmentNeedleChannelClearance as the independent Lipschitz audit. */
export function minimumNeedleChannelClearance(a: ChannelPointMm, b: ChannelPointMm,
  domain: NeedleChannelDomain): NeedleChannelMinimum {
  if (!validPoint(a) || !validPoint(b)) throw new RangeError('Finite segment endpoints are required.');
  const evaluatePoint = prepare(domain), direction = subtract(b, a), L = norm(direction);
  if (!Number.isFinite(L)) throw new RangeError('Segment length overflow.');
  const dot = (x: ChannelPointMm, y: ChannelPointMm) => x.reduce((sum, v, i) => sum + v * y[i]!, 0);
  const axisDelta = subtract(domain.exitMm, domain.entryMm);
  const axis = axisDelta.map(x => x / norm(axisDelta)) as V;
  const perpendicular = (x: ChannelPointMm) => x.map((v, i) => v - axis[i]! * dot(x, axis)) as V;
  const transverseD = perpendicular(direction);
  const at = (t: number) => a.map((x, i) => x + t * direction[i]!) as V;
  const value = (t: number) => {
    const pointMm = at(t), evaluation = evaluatePoint(pointMm);
    return { t, pointMm, evaluation, h: evaluation.exteriorGapMm - evaluation.channelGapMm };
  };
  const padding = 4 * Math.max(value(0).evaluation.roundoffAllowanceMm, value(1).evaluation.roundoffAllowanceMm);
  // Subgradient interval for the sum of two norms, including points exactly
  // on the sphere centre or cylinder axis. This also handles flat minima of h.
  const slopes = (t: number) => {
    const p = at(t), radial = subtract(p, domain.sphereCenterMm), transverse = perpendicular(subtract(p, domain.entryMm));
    let lower = 0, upper = 0;
    for (const [x, d] of [[radial, direction], [transverse, transverseD]]) {
      const n = norm(x);
      if (n === 0) { lower -= norm(d); upper += norm(d); }
      else { const v = dot(x, d) / n; lower += v; upper += v; }
    }
    return { lower, upper };
  };
  let lo = 0, hi = 1;
  for (let i = 0; i < 80 && L * (hi - lo) > padding; i++) {
    const t = (lo + hi) / 2, s = slopes(t);
    if (s.lower > 0) hi = t;
    else if (s.upper < 0) lo = t;
    else { lo = t; hi = t; break; }
  }
  const minimumH = value((lo + hi) / 2);
  const minimumHError = 2 * L * (hi - lo) + padding;
  const radialT = L > 0 ? Math.max(0, Math.min(1, -dot(subtract(a, domain.sphereCenterMm), direction) / (L * L))) : 0;
  type Candidate = ReturnType<typeof value> & { kind: NeedleChannelMinimum['candidates'][number]['kind']; tError: number };
  const candidates: Candidate[] = [
    { ...value(0), kind: 'endpoint', tError: 0 },
    { ...value(1), kind: 'endpoint', tError: 0 },
    { ...value(radialT), kind: 'exterior-minimum', tError: 0 },
  ];
  if (minimumH.h < -minimumHError) {
    // The negative interior point splits h into its decreasing and increasing
    // root brackets. Updates keep signs outside the numerical padding.
    for (const end of [0, 1]) {
      if (value(end).h <= 0) continue;
      let positiveT = end, negativeT = minimumH.t;
      for (let i = 0; i < 80; i++) {
        const t = (positiveT + negativeT) / 2, h = value(t).h;
        if (h > padding) positiveT = t;
        else if (h < -padding) negativeT = t;
        else {
          const p = (positiveT + t) / 2, n = (negativeT + t) / 2;
          let moved = false;
          if (value(p).h > padding) { positiveT = p; moved = true; }
          if (value(n).h < -padding) { negativeT = n; moved = true; }
          if (!moved) break;
        }
        if (positiveT === negativeT) break;
      }
      candidates.push({ ...value((positiveT + negativeT) / 2), kind: 'switch',
        tError: Math.abs(positiveT - negativeT) / 2 });
    }
  }
  candidates.sort((x, y) => x.evaluation.gapMm - y.evaluation.gapMm);
  const best = candidates[0]!;
  const error = padding + Math.max(minimumHError, ...candidates.map(c => L * c.tError));
  const lowerBoundMm = minimumH.h >= -minimumHError
    // If h merely touches zero, g >= e supplies a bound without pretending
    // that the possibly flat/tangent switch has two isolated roots.
    ? value(radialT).evaluation.exteriorGapMm - padding
    : best.evaluation.gapMm - error;
  const upperBoundMm = best.evaluation.gapMm + padding;
  let reason: NeedleChannelMinimum['reason'] = 'unique-minimum';
  let gradient: V | null = null;
  if (L === 0) reason = 'degenerate-segment';
  else if (candidates.some(c => c !== best && Math.abs(c.t - best.t) * L > error * 2
    && c.evaluation.gapMm - best.evaluation.gapMm <= error * 2)) reason = 'tied-minima';
  else if (upperBoundMm - lowerBoundMm > padding * 256) reason = 'root-resolution';
  else if (best.kind === 'switch' || Math.abs(best.h) <= error) {
    const radial = subtract(best.pointMm, domain.sphereCenterMm), transverse = perpendicular(subtract(best.pointMm, domain.entryMm));
    const rn = norm(radial), cn = norm(transverse);
    if (best.t <= best.tError || best.t >= 1 - best.tError || rn <= padding || cn <= padding) reason = 'degenerate-switch';
    else {
      const ne = radial.map(x => x / rn) as V, nc = transverse.map(x => -x / cn) as V;
      const et = dot(ne, direction), ct = dot(nc, direction), difference = et - ct;
      const alpha = -ct / difference;
      if (Math.abs(difference) <= 128 * Number.EPSILON * L || !(alpha >= 0 && alpha <= 1)) reason = 'degenerate-switch';
      else gradient = ne.map((x, i) => alpha * x + (1 - alpha) * nc[i]!) as V;
    }
  } else if (best.evaluation.gradientStatus === 'smooth' && best.evaluation.gradient) gradient = [...best.evaluation.gradient];
  else reason = 'undefined-branch-gradient';
  const smooth = reason === 'unique-minimum' && gradient !== null;
  return { geometry: NEEDLE_CHANNEL_GEOMETRY, status: upperBoundMm - lowerBoundMm <= padding * 256 ? 'resolved' : 'unresolved',
    gapMm: best.evaluation.gapMm, lowerBoundMm, upperBoundMm, accuracyMm: upperBoundMm - lowerBoundMm,
    witness: { t: best.t, pointMm: best.pointMm, evaluation: best.evaluation },
    gradientA: smooth ? gradient!.map(x => (1 - best.t) * x) as V : null,
    gradientB: smooth ? gradient!.map(x => best.t * x) as V : null,
    gradientStatus: smooth ? 'smooth' : 'unresolved', reason,
    candidates: candidates.map(c => ({ t: c.t, gapMm: c.evaluation.gapMm, kind: c.kind })),
  };
}
