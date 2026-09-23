import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { boundCurvatureTimesRadius } from "./curvature-bound";
import type { PointMm, ThreadCurve } from "./thread-path";

type Bezier = Extract<ThreadCurve, { kind: "bezier" }>;
const bezier = (...controls: PointMm[]): Bezier => ({ kind: "bezier", controls: controls as unknown as Bezier["controls"] });
// Independent evaluation by finite differences of the de Casteljau point, not the
// Bernstein derivative formulas used by the certificate.
const point = (c: Bezier["controls"], t: number): number[] => {
  const u = 1 - t;
  return [0, 1, 2].map(k => u * u * u * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t * t * t * c[3][k]);
};
function sampledMax(curve: Bezier, radius: number, samples = 20000) {
  let maximum = 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, h = 1e-4;
    // Three-point Lagrange stencil, shifted inside [0, 1] at the ends.
    const x = t < h ? [t, t + h, t + 2 * h] : t > 1 - h ? [t - 2 * h, t - h, t] : [t - h, t, t + h];
    const f = x.map(s => point(curve.controls, s));
    const d = [(x[0] - x[1]) * (x[0] - x[2]), (x[1] - x[0]) * (x[1] - x[2]), (x[2] - x[0]) * (x[2] - x[1])];
    const v = [0, 1, 2].map(k => f[0][k] * (2 * t - x[1] - x[2]) / d[0] + f[1][k] * (2 * t - x[0] - x[2]) / d[1] + f[2][k] * (2 * t - x[0] - x[1]) / d[2]);
    const acc = [0, 1, 2].map(k => 2 * (f[0][k] / d[0] + f[1][k] / d[1] + f[2][k] / d[2]));
    const w = [v[1] * acc[2] - v[2] * acc[1], v[2] * acc[0] - v[0] * acc[2], v[0] * acc[1] - v[1] * acc[0]];
    maximum = Math.max(maximum, radius * Math.hypot(...w) / Math.hypot(...v) ** 3);
  }
  return maximum;
}
const quarter = (R: number) => { const k = 4 / 3 * (Math.SQRT2 - 1) * R; return bezier([R, 0, 0], [R, k, 0], [k, R, 0], [0, R, 0]); };
const twisted = bezier([0, 0, 0], [1, 2, -.5], [2.5, -1, 1.5], [3, 1, .2]);

describe("certified tube curvature bound", () => {
  it("returns exactly zero for a straight segment and the exact value for arcs", () => {
    const line = boundCurvatureTimesRadius([bezier([0, 0, 0], [1, 1, 1], [2, 2, 2], [4, 4, 4])], .2);
    assert.equal(line.status, "certified"); assert.equal(line.upper, 0);
    const arc = boundCurvatureTimesRadius([{ kind: "arc", from: [2, 0, 0], to: [0, 2, 0] }], .5);
    assert.equal(arc.status, "certified"); assert.ok(Math.abs(arc.upper - .25) < 1e-15);
    assert.ok(Math.abs(arc.minSpeedBound - Math.PI) < 1e-12); // |d/dt| = R * angle
  });

  it("encloses independently sampled maxima within the requested precision", () => {
    for (const [curve, radius] of [[quarter(1), .2], [quarter(.3), .2], [twisted, .05]] as const) {
      const bound = boundCurvatureTimesRadius([curve], radius, { precision: 1e-4 });
      const sampled = sampledMax(curve, radius);
      assert.equal(bound.status, "certified");
      assert.ok(bound.upper >= sampled - 1e-6, `${bound.upper} < ${sampled}`);
      assert.ok(bound.upper - bound.lower <= 1e-4 + 1e-12);
      assert.ok(Math.abs(bound.lower - sampled) < 2e-4, `${bound.lower} vs ${sampled}`);
    }
    // The cubic quarter-circle approximation is not a circle: its curvature varies.
    const q = boundCurvatureTimesRadius([quarter(1)], 1, { precision: 1e-6 });
    assert.ok(q.upper > 1 && q.upper < 1.01);
  });

  it("covers every parameter of several pieces and reports the strongest witness", () => {
    const pieces = [quarter(2), twisted, quarter(.5)];
    const bound = boundCurvatureTimesRadius(pieces, .1, { precision: 1e-4, witnessAbove: .1 });
    const perPiece = pieces.map(p => sampledMax(p, .1));
    assert.ok(Math.abs(bound.upper - Math.max(...perPiece)) < 2e-4);
    assert.equal(bound.argmax.curve, perPiece.indexOf(Math.max(...perPiece)));
    assert.ok(bound.witnesses.length > 0 && bound.witnesses.every(w => w.value > .1));
    assert.ok(bound.witnesses.every((w, i) => i === 0 || w.value <= bound.witnesses[i - 1].value));
  });

  it("does not certify a finite bound through a zero-speed parameter", () => {
    const cusp = boundCurvatureTimesRadius([bezier([0, 0, 0], [0, 0, 0], [1, 1, 0], [2, 0, 0])], .2);
    assert.equal(cusp.upper, Infinity);
    assert.equal(cusp.minSpeedBound, 0);
    const capped = boundCurvatureTimesRadius([twisted], .05, { precision: 1e-12, maxDepth: 2 });
    assert.equal(capped.status, "unresolved");
    assert.ok(capped.upper >= capped.lower);
  });

  it("is invariant under rigid motion and consistent scaling of geometry and radius", () => {
    const scale = 2.5, map = ([x, y, z]: PointMm): PointMm => [4 + scale * z, -1 + scale * x, 7 + scale * y];
    const moved = bezier(...twisted.controls.map(map));
    const a = boundCurvatureTimesRadius([twisted], .05, { precision: 1e-6 });
    const b = boundCurvatureTimesRadius([moved], .05 * scale, { precision: 1e-6 });
    assert.ok(Math.abs(a.upper - b.upper) < 2e-6 && Math.abs(a.lower - b.lower) < 2e-6);
  });

  it("rejects invalid radii and options", () => {
    assert.throws(() => boundCurvatureTimesRadius([twisted], 0), RangeError);
    assert.throws(() => boundCurvatureTimesRadius([twisted], .1, { precision: 0 }), RangeError);
  });
});
