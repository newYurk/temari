import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ICOSA_EDGES, ICOSA_VERTS, type Division } from "./division";

const TUBE = 0.0044;
const ARC_TUBE = 0.004;

function slerp(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const theta = Math.acos(dot);
  if (theta < 1e-4) return out.copy(a);
  const s = Math.sin(theta);
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - t) * theta) / s)
    .addScaledVector(b, Math.sin(t * theta) / s);
}

function greatCircle(normal: THREE.Vector3, count = 96): THREE.Vector3[] {
  const n = normal.clone().normalize();
  const tmp = Math.abs(n.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const x = new THREE.Vector3().crossVectors(n, tmp).normalize();
  const y = new THREE.Vector3().crossVectors(n, x).normalize();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push(x.clone().multiplyScalar(Math.cos(a)).add(y.clone().multiplyScalar(Math.sin(a))));
  }
  return pts;
}

function closedTube(pts: THREE.Vector3[], radius: number) {
  const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(64, pts.length), radius, 6, true);
}

function arcTube(a: THREE.Vector3, b: THREE.Vector3, radius: number, segs = 18) {
  const pts: THREE.Vector3[] = [];
  const va = a.clone().normalize();
  const vb = b.clone().normalize();
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    pts.push(slerp(va, vb, i / segs, tmp).clone());
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  return new THREE.TubeGeometry(curve, segs, radius, 5, false);
}

function simpleGuides() {
  const s = Math.SQRT1_2;
  const normals = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(s, 0, s),
    new THREE.Vector3(s, 0, -s),
  ];
  return normals.map((n) => closedTube(greatCircle(n), TUBE));
}

function c8Guides() {
  const normals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  return normals.map((n) => closedTube(greatCircle(n), TUBE));
}

function c10Guides() {
  return ICOSA_EDGES.map(([i, j]) => {
    const a = new THREE.Vector3(...ICOSA_VERTS[i]);
    const b = new THREE.Vector3(...ICOSA_VERTS[j]);
    return arcTube(a, b, ARC_TUBE);
  });
}

export function createGuideGeometry(division: Division): THREE.BufferGeometry {
  const parts =
    division === "simple" ? simpleGuides() : division === "c8" ? c8Guides() : c10Guides();
  const merged = mergeGeometries(parts, false);
  for (const geo of parts) geo.dispose();
  if (!merged) {
    return new THREE.BufferGeometry();
  }
  merged.computeVertexNormals();
  return merged;
}
