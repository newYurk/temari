import { curveDerivative, evaluateCurve, sampleCurve } from './thread-geometry';
import { spatialSplineBasis, spatialSplineKnots } from './spatial-contact';
import type { PointMm, ThreadCurve } from './thread-path';

/** A numerical initial guess, never the accepted/rendered result by itself. */
export function fitSpatialSeed(curves: readonly ThreadCurve[], controlCount: number): PointMm[] {
  if (!curves.length || !Number.isInteger(controlCount) || controlCount < 6) throw new RangeError('A seed requires curves and at least six controls.');
  const points: PointMm[] = [], distances: number[] = [];
  let length = 0;
  for (const curve of curves) {
    const sample = sampleCurve(curve, .0002).points;
    for (const p of sample) {
      if (points.length) {
        const prev = points.at(-1)!;
        const d = Math.hypot(...p.map((v, j) => v - prev[j]));
        if (d < 1e-12) continue;
        length += d;
      }
      points.push(p); distances.push(length);
    }
  }
  if (!(length > 0)) throw new RangeError('The seed has no length.');
  const at = (u: number): PointMm => {
    const distance = length * u;
    let j = 1;
    while (j < distances.length - 1 && distances[j] < distance) j++;
    const t = (distance - distances[j - 1]) / (distances[j] - distances[j - 1]);
    return points[j - 1].map((v, k) => v + t * (points[j][k] - v)) as unknown as PointMm;
  };
  const endpoint = (curve: ThreadCurve, t: number, direction: number): PointMm => {
    const p = evaluateCurve(curve, t), v = curveDerivative(curve, t);
    const factor = direction * length / (3 * (controlCount - 3) * Math.hypot(...v));
    return p.map((x, j) => x + v[j] * factor) as unknown as PointMm;
  };
  const fixed = new Map<number, PointMm>([
    [0, evaluateCurve(curves[0], 0)], [1, endpoint(curves[0], 0, 1)],
    [controlCount - 2, endpoint(curves.at(-1)!, 1, -1)], [controlCount - 1, evaluateCurve(curves.at(-1)!, 1)],
  ]);
  const knots = spatialSplineKnots(controlCount), matrix: number[][] = [];
  for (let i = 2; i < controlCount - 2; i++) {
    const u = (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3;
    const b = spatialSplineBasis(controlCount, u).values, point = [...at(u)];
    for (const [k, p] of fixed) for (let j = 0; j < 3; j++) point[j] -= b[k] * p[j];
    matrix.push([...b.slice(2, controlCount - 2), ...point]);
  }
  const n = matrix.length;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let j = k + 1; j < n; j++) if (Math.abs(matrix[j][k]) > Math.abs(matrix[pivot][k])) pivot = j;
    [matrix[k], matrix[pivot]] = [matrix[pivot], matrix[k]];
    if (Math.abs(matrix[k][k]) < 1e-12) throw new Error('Seed interpolation matrix is singular.');
    const d = matrix[k][k];
    for (let j = k; j < n + 3; j++) matrix[k][j] /= d;
    for (let i = 0; i < n; i++) if (i !== k) {
      const f = matrix[i][k];
      for (let j = k; j < n + 3; j++) matrix[i][j] -= f * matrix[k][j];
    }
  }
  return Array.from({ length: controlCount }, (_, i) => fixed.get(i) ?? matrix[i - 2].slice(n) as unknown as PointMm);
}
