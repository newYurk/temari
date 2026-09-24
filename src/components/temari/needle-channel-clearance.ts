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
