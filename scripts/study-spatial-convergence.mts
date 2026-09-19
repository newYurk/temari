/**
 * Refinement study of the isolated lower kagari (thick-rope formulation).
 * Not an acceptance test: it shows every resolution, including under-resolved
 * ones, so a passing ladder cannot hide a failing mesh.
 *
 *   npx tsx scripts/study-spatial-convergence.mts [counts] [circumferenceMm] [handedness]
 *   npx tsx scripts/study-spatial-convergence.mts 8,12,16,24,32,40,48,64,80,96,128 230 1
 */
import { computeLowerKagari } from '../src/components/temari/computed-lower-kagari.ts';
import { sampleCurve } from '../src/components/temari/thread-geometry.ts';
import type { PointMm, ThreadCurve } from '../src/components/temari/thread-path.ts';

const counts = (process.argv[2] ?? '8,12,16,24,32,40,48,64,80').split(',').map(Number);
const circumferenceMm = Number(process.argv[3] ?? 230), handedness = Number(process.argv[4] ?? 1) as 1 | -1;

function sampler(curves: ThreadCurve[]) {
  const points: PointMm[] = [], cumulative: number[] = [];
  let total = 0;
  for (const curve of curves) for (const p of sampleCurve(curve, 1e-4).points) {
    if (points.length) {
      const q = points.at(-1)!, d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d < 1e-12) continue;
      total += d;
    }
    points.push(p); cumulative.push(total);
  }
  return (fraction: number) => {
    const length = fraction * total;
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < length) i++;
    const t = (length - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]);
    return points[i - 1].map((v, k) => v + t * (points[i][k] - v));
  };
}

let previous: { n: number; length: number; curves: ThreadCurve[] } | undefined;
for (const n of counts) {
  const started = performance.now();
  // A 6-control companion satisfies the two-resolution API; only n is reported.
  const run = computeLowerKagari({ circumferenceMm, handedness }, { controlCounts: [6, n] });
  const check = run.checks.resolutions[1], m = check.result.metrics;
  const curves = run.coupon.spans.filter(s => s.opId === 'lower-outgoing').map(s => s.curve);
  let shape = NaN;
  if (previous) {
    const a = sampler(previous.curves), b = sampler(curves);
    shape = 0;
    for (let j = 0; j <= 400; j++) { const p = a(j / 400), q = b(j / 400); shape = Math.max(shape, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])); }
  }
  console.log(JSON.stringify({
    controls: n, resolved: n - 3 >= run.metrics.minimumSpans, solver: check.result.status, path: check.validation.status,
    lengthMm: +check.result.lengthMm.toFixed(6), lengthStepMm: previous ? +(check.result.lengthMm - previous.length).toExponential(3) : null,
    shapeStepMm: previous ? +shape.toExponential(3) : null,
    certifiedRKappa: +check.curvature.upper.toFixed(4), minRelativeSpeed: +m.minRelativeSpeedBound.toFixed(3),
    parametrizationDefect: +m.parametrizationDefect.toExponential(2), kkt: +m.kktStationarity.toExponential(2),
    iterations: m.iterations, activeCurvature: check.result.reactions.some(r => r.kind === 'curvature'),
    ms: Math.round(performance.now() - started),
  }));
  previous = { n, length: check.result.lengthMm, curves };
}
