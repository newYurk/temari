import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fitSpatialSeed } from './spatial-spline-seed';
import { sampleSpatialSpline, spatialSplineBasis } from './spatial-contact';
import { createLowerKagariFixture } from './lower-kagari';
import type { ThreadCurve } from './thread-path';

it('preserves a straight path and its parametrization at several resolutions', () => {
  const line: ThreadCurve = { kind: 'bezier', controls: [[1, 2, 3], [2, 4, 2], [3, 6, 1], [4, 8, 0]] };
  for (const n of [6, 10, 16]) {
    const controls = fitSpatialSeed([line], n);
    for (let i = 0; i <= 50; i++) {
      const u = i / 50, p = sampleSpatialSpline(controls, u);
      assert.ok(Math.hypot(p[0] - 1 - 3 * u, p[1] - 2 - 6 * u, p[2] - 3 + 3 * u) < 1e-10);
    }
  }
});

it('retains the actual boundary positions and oriented tangents of the lower catch', () => {
  const f = createLowerKagariFixture();
  for (const n of [6, 10, 12]) {
    const controls = fitSpatialSeed(f.looseOutgoing, n);
    for (const [u, port] of [[0, f.exit], [1, f.next]] as const) {
      const p = sampleSpatialSpline(controls, u), b = spatialSplineBasis(n, u).derivatives;
      const v = [0, 1, 2].map(j => controls.reduce((sum, c, i) => sum + b[i] * c[j], 0));
      assert.ok(Math.hypot(...p.map((x, j) => x - port.positionMm[j])) < 1e-10);
      assert.ok(Math.hypot(...v.map((x, j) => x / Math.hypot(...v) - port.tangent[j])) < 1e-10);
    }
  }
});
