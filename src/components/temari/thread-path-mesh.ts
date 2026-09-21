import * as THREE from 'three';
import { curveDerivative, sampleCurve } from './thread-geometry';
import type { ThreadSpan } from './thread-path';

export const PATH_MESH_TOLERANCE_MM = .00001;
export const PATH_MESH_SIDES = 24;

/** Exact curve samples and a round section; no fitted display spline or radial lifts. */
export function createThreadSpanMesh(span: ThreadSpan, radiusMm: number, bodyRadiusMm: number) {
  if (![radiusMm, bodyRadiusMm].every(n => Number.isFinite(n) && n > 0))
    throw new RangeError('Thread mesh radii must be finite positive millimetres.');
  const sample = sampleCurve(span.curve, PATH_MESH_TOLERANCE_MM);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let i = 0; i < sample.points.length; i++) {
    const p = new THREE.Vector3(...sample.points[i]);
    const tangent = new THREE.Vector3(...curveDerivative(span.curve, sample.parameters[i]));
    if (tangent.lengthSq() < 1e-24) throw new RangeError(`${span.id}: undefined mesh tangent.`);
    tangent.normalize();
    const normal = p.clone().addScaledVector(tangent, -p.dot(tangent));
    if (normal.lengthSq() < 1e-20) {
      normal.set(Math.abs(tangent.x) < .8 ? 1 : 0, Math.abs(tangent.x) < .8 ? 0 : 1, 0);
      normal.addScaledVector(tangent, -normal.dot(tangent));
    }
    normal.normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal);
    for (let j = 0; j <= PATH_MESH_SIDES; j++) {
      const angle = j * 2 * Math.PI / PATH_MESH_SIDES;
      const n = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
      const vertex = p.clone().addScaledVector(n, radiusMm).divideScalar(bodyRadiusMm);
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(n.x, n.y, n.z);
      if (i && j < PATH_MESH_SIDES) {
        const c = i * (PATH_MESH_SIDES + 1) + j, a = c - PATH_MESH_SIDES - 1;
        indices.push(a, a + 1, c, a + 1, c + 1, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  const floats = new Float32Array(positions);
  let roundingErrorMm = 0;
  for (let i = 0; i < positions.length; i += 3)
    roundingErrorMm = Math.max(roundingErrorMm, bodyRadiusMm * Math.hypot(
      floats[i] - positions[i], floats[i + 1] - positions[i + 1], floats[i + 2] - positions[i + 2]));
  geometry.setAttribute('position', new THREE.BufferAttribute(floats, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return { geometry, sample, radiusMm, bodyRadiusMm, spanId: span.id,
    envelopeErrorMm: sample.errorBoundMm + roundingErrorMm };
}

/** Actual planar triangle clearance, not just mesh vertices or centreline samples. */
export function meshBodyGapMm(geometry: THREE.BufferGeometry, bodyRadiusMm: number) {
  const positions = geometry.getAttribute('position'), indices = geometry.getIndex();
  if (!indices) throw new Error('Thread mesh requires indexed triangles.');
  const triangle = new THREE.Triangle(), origin = new THREE.Vector3(), closest = new THREE.Vector3();
  let minimum = Infinity;
  for (let i = 0; i < indices.count; i += 3) {
    triangle.a.fromBufferAttribute(positions, indices.getX(i));
    triangle.b.fromBufferAttribute(positions, indices.getX(i + 1));
    triangle.c.fromBufferAttribute(positions, indices.getX(i + 2));
    triangle.closestPointToPoint(origin, closest);
    minimum = Math.min(minimum, (closest.length() - 1) * bodyRadiusMm);
  }
  return minimum;
}
