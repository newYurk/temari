import { Vector3 } from 'three';
import { createResolvedThreadGeometry } from './stitches';
import type { EquilibriumYarn } from './yarn-equilibrium';

export type EquilibriumFoldWitness = {
  triangleIndex: number;
  /** Indices in the supplied yarn.nodes, not independently resampled points. */
  nodeIndices: number[];
  orientationDot: number;
  visible: boolean;
};
export type EquilibriumCurvatureProxyWitness = {
  nodeIndex: number;
  radiusTimesCurvature: number;
  turnRadians: number;
  adjacentChordLengthsMm: [number, number];
  fixed: boolean;
};
export type EquilibriumThreadGeometryInspection = {
  threadId: string;
  status: 'invalid' | 'not-certified';
  mesh: {
    allFaces: number;
    visibleFaces: number;
    foldedFaces: number;
    foldedVisibleFaces: number;
    degenerateFaces: number;
    folds: EquilibriumFoldWitness[];
  } | null;
  curvatureProxy: {
    method: 'three-point-circumcircle';
    maximumRadiusTimesCurvature: number;
    maximumWitness: EquilibriumCurvatureProxyWitness | null;
    continuousCertificate: false;
  } | null;
  diagnostics: string[];
};
export type EquilibriumGeometryInspection = {
  status: 'invalid' | 'not-certified';
  /** Visibility only: a triangle is visible if at least one vertex is on or
   * outside this origin-centred nominal sphere. Omitted means all faces.
   * Buried folded triangles still invalidate the mesh. */
  bodyRadiusMm: number | null;
  threads: EquilibriumThreadGeometryInspection[];
  diagnostics: string[];
};

/** Inspect the exact round-section mesh used for a resolved equilibrium path:
 * one ring per supplied node and the renderer's parallel-transport frames.
 * No smoothing, clipping, path repair, alternate thickness, or solve occurs.
 *
 * Negative face orientation is an actual defect of THIS polygonal mesh, not a
 * proof that no smooth strand could pass through the same boundary points.
 * The three-point circumcircle is only a sampling proxy. Neither a small proxy
 * nor zero folded faces certifies continuous curvature, nonlocal clearance,
 * mechanics, capture topology, refinement, or craft acceptance. In particular
 * even an upstream solver status of `converged` cannot produce `accepted` here.
 */
export function inspectEquilibriumGeometry(
  threads: readonly EquilibriumYarn[], bodyRadiusMm?: number,
): EquilibriumGeometryInspection {
  const result: EquilibriumGeometryInspection = {
    status: 'not-certified', bodyRadiusMm: bodyRadiusMm ?? null, threads: [], diagnostics: [],
  };
  if ((bodyRadiusMm !== undefined && (!Number.isFinite(bodyRadiusMm) || bodyRadiusMm <= 0)) || !threads.length) {
    result.status = 'invalid';
    result.diagnostics.push(!threads.length ? 'No yarn geometry was supplied.' : 'Visibility sphere needs a positive finite radius.');
    return result;
  }
  for (const thread of threads) {
    const report: EquilibriumThreadGeometryInspection = {
      threadId: thread.id, status: 'not-certified', mesh: null, curvatureProxy: null, diagnostics: [],
    };
    result.threads.push(report);
    const invalidate = (message: string) => { report.status = 'invalid'; result.status = 'invalid'; report.diagnostics.push(message); };
    if (!Number.isFinite(thread.radiusMm) || thread.radiusMm <= 0 || thread.nodes.length < 2
      || thread.nodes.some(n => n.positionMm.length !== 3 || !n.positionMm.every(Number.isFinite))) {
      invalidate('The path needs at least two finite 3D nodes and a positive finite round radius.'); continue;
    }
    const points = thread.nodes.map(n => new Vector3(...n.positionMm));
    if (points.some((p, i) => i > 0 && (!(p.distanceTo(points[i - 1]) > 0) || !Number.isFinite(p.distanceTo(points[i - 1]))))) {
      invalidate('A consecutive segment is coincident or has non-finite length.'); continue;
    }
    let geometry: ReturnType<typeof createResolvedThreadGeometry>;
    try { geometry = createResolvedThreadGeometry(points, thread.radiusMm); }
    catch (error) { invalidate(`The resolved renderer cannot construct this path: ${error instanceof Error ? error.message : String(error)}`); continue; }
    try {
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), indices = geometry.index;
      if (!indices || [...positions.array, ...normals.array].some(x => !Number.isFinite(x))) {
        invalidate('The resolved mesh has missing indices or non-finite vertices/normals.'); continue;
      }
      const mesh: NonNullable<EquilibriumThreadGeometryInspection['mesh']> = {
        allFaces: indices.count / 3, visibleFaces: 0, foldedFaces: 0, foldedVisibleFaces: 0, degenerateFaces: 0, folds: [],
      };
      report.mesh = mesh;
      const ringSize: number = geometry.userData.section.radialSegments + 1;
      for (let i = 0; i < indices.count; i += 3) {
        const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
        const p = ids.map(id => new Vector3().fromBufferAttribute(positions, id));
        const visible = bodyRadiusMm === undefined || p.some(v => v.length() >= bodyRadiusMm);
        if (visible) mesh.visibleFaces++;
        const face = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
        const outward = ids.reduce((sum, id) => sum.add(new Vector3().fromBufferAttribute(normals, id)), new Vector3());
        const scale = face.length() * outward.length(), orientationDot = face.dot(outward);
        if (!(scale > 0) || !Number.isFinite(scale) || !Number.isFinite(orientationDot)) { mesh.degenerateFaces++; continue; }
        // Dimensionless sign tolerance, independent of mm/metre scale. This
        // ignores near-tangent roundoff; it is not a nonintersection tolerance.
        if (orientationDot < -1e-10 * scale) {
          mesh.foldedFaces++; if (visible) mesh.foldedVisibleFaces++;
          mesh.folds.push({ triangleIndex: i / 3, nodeIndices: [...new Set(ids.map(id => Math.floor(id / ringSize)))], orientationDot, visible });
        }
      }
      if (mesh.foldedFaces) invalidate(`${mesh.foldedFaces} mesh faces reverse the supplied outward orientation (${mesh.foldedVisibleFaces} visible).`);
      if (mesh.degenerateFaces) invalidate(`${mesh.degenerateFaces} mesh faces have degenerate or non-finite orientation.`);
      const proxy: NonNullable<EquilibriumThreadGeometryInspection['curvatureProxy']> = {
        method: 'three-point-circumcircle', maximumRadiusTimesCurvature: 0, maximumWitness: null, continuousCertificate: false,
      };
      for (let i = 1; i < points.length - 1; i++) {
        const a = points[i].clone().sub(points[i - 1]), b = points[i + 1].clone().sub(points[i]);
        const L = a.length(), M = b.length(), chord = points[i - 1].distanceTo(points[i + 1]);
        // Unit tangents avoid multiplying three potentially large lengths.
        a.divideScalar(L); b.divideScalar(M);
        const radiusTimesCurvature = thread.radiusMm * 2 * a.clone().cross(b).length() / chord;
        if (!Number.isFinite(radiusTimesCurvature)) { invalidate('The three-point curvature proxy is undefined.'); break; }
        if (!proxy.maximumWitness || radiusTimesCurvature > proxy.maximumRadiusTimesCurvature) {
          proxy.maximumRadiusTimesCurvature = radiusTimesCurvature;
          proxy.maximumWitness = { nodeIndex: i, radiusTimesCurvature,
            turnRadians: Math.acos(Math.max(-1, Math.min(1, a.dot(b)))), adjacentChordLengthsMm: [L, M], fixed: thread.nodes[i].fixed };
        }
      }
      report.curvatureProxy = proxy;
    } finally { geometry.dispose(); }
  }
  return result;
}
