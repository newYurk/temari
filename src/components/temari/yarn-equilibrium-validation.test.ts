import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inspectEquilibriumGeometry } from './yarn-equilibrium-validation';
import type { EquilibriumYarn } from './yarn-equilibrium';
import type { PointMm } from './thread-path';

const yarn = (points: PointMm[], radiusMm: number): EquilibriumYarn => ({
  id: 'control', radiusMm, axialStiffnessN: 1, bendingStiffnessNmm2: .01,
  nodes: points.map((positionMm, i) => ({ positionMm, fixed: i === 0 || i === points.length - 1 })),
  restLengthsMm: points.slice(1).map((p, i) => Math.hypot(...p.map((x, d) => x - points[i][d]))),
});
const circle = (R: number, segments: number): PointMm[] => Array.from({ length: segments + 1 }, (_, i) => [
  R * Math.cos(i * Math.PI / segments), R * Math.sin(i * Math.PI / segments), 0,
]);

describe('resolved equilibrium geometry diagnostics are never physical acceptance', () => {
  it('reports an ordinary straight tube without folds while keeping zero curvature uncertified', () => {
    const input = yarn([[-2, 0, 2], [0, 0, 2], [2, 0, 2]], .1), before = JSON.stringify(input);
    const result = inspectEquilibriumGeometry([input], 1), row = result.threads[0];
    assert.equal(result.status, 'not-certified'); assert.equal(row.status, 'not-certified');
    assert.ok(Number.isInteger(row.mesh!.allFaces) && row.mesh!.allFaces > 0, 'nonempty complete triangles');
    assert.equal(row.mesh!.visibleFaces, row.mesh!.allFaces, 'the whole tube is outside the sphere');
    assert.equal(row.mesh!.foldedFaces, 0); assert.equal(row.mesh!.degenerateFaces, 0);
    assert.equal(row.curvatureProxy!.maximumRadiusTimesCurvature, 0);
    assert.equal(row.curvatureProxy!.continuousCertificate, false);
    assert.equal(JSON.stringify(input), before);
  });

  it('matches the analytic circumcircle of a regular arc without using it as a smooth certificate', () => {
    const result = inspectEquilibriumGeometry([yarn(circle(5, 24), .2)]), row = result.threads[0];
    assert.equal(result.status, 'not-certified'); assert.equal(row.mesh!.foldedFaces, 0);
    assert.equal(row.mesh!.visibleFaces, row.mesh!.allFaces);
    assert.ok(Math.abs(row.curvatureProxy!.maximumRadiusTimesCurvature - .2 / 5) < 1e-12);
    assert.equal(row.curvatureProxy!.continuousCertificate, false);
    assert.equal(row.curvatureProxy!.method, 'three-point-circumcircle');
  });

  it('finds reversed inner faces when section radius exceeds circle radius, including buried defects', () => {
    const thread = yarn(circle(1, 16), 1.3);
    const all = inspectEquilibriumGeometry([thread]), buried = inspectEquilibriumGeometry([thread], 100);
    assert.equal(all.status, 'invalid'); assert.equal(buried.status, 'invalid');
    const a = all.threads[0], b = buried.threads[0];
    assert.ok(a.mesh!.foldedFaces > 0); assert.equal(a.mesh!.foldedVisibleFaces, a.mesh!.foldedFaces);
    assert.equal(b.mesh!.foldedFaces, a.mesh!.foldedFaces); assert.equal(b.mesh!.foldedVisibleFaces, 0);
    assert.equal(b.mesh!.visibleFaces, 0); assert.ok(a.curvatureProxy!.maximumRadiusTimesCurvature > 1);
    for (const witness of a.mesh!.folds) {
      assert.ok(witness.orientationDot < 0); assert.equal(witness.nodeIndices.length, 2);
      assert.equal(Math.abs(witness.nodeIndices[0] - witness.nodeIndices[1]), 1);
      assert.ok(witness.nodeIndices.every(i => i >= 0 && i < thread.nodes.length));
    }
  });

  it('fails closed on invalid points, zero segments, reversing cusps and invalid visibility bounds', () => {
    const invalid = [
      yarn([[1, 0, 0], [NaN, 0, 1]], .1),
      yarn([[1, 0, 0], [1, 0, 0]], .1),
      yarn([[0, 0, 2], [1, 0, 2], [0, 0, 2]], .1),
      yarn([[0, 0, 2], [1, 0, 2]], Infinity),
      yarn([[1e40, 1, 0], [1e40, 2, 0]], .1), // Float32 mesh overflow.
    ];
    for (const thread of invalid) {
      const result = inspectEquilibriumGeometry([thread]);
      assert.equal(result.status, 'invalid'); assert.equal(result.threads[0].status, 'invalid');
      assert.ok(result.threads[0].diagnostics.length > 0);
    }
    assert.equal(inspectEquilibriumGeometry([]).status, 'invalid');
    assert.equal(inspectEquilibriumGeometry([yarn([[1, 0, 1], [2, 0, 1]], .1)], NaN).status, 'invalid');
  });
});
