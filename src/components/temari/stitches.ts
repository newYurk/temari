import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Stitch } from "./patterns";

const ARC_SEGS = 10;
const TUBE = 0.0095;
const LOOP_TUBE = 0.011;
const LIFT = 1.018;

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

function vec(p: [number, number, number]) {
  return new THREE.Vector3(p[0], p[1], p[2]).normalize().multiplyScalar(LIFT);
}

function arcTube(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const pts: THREE.Vector3[] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= ARC_SEGS; i++) {
    pts.push(slerp(a, b, i / ARC_SEGS, tmp).clone());
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  return new THREE.TubeGeometry(curve, ARC_SEGS, radius, 5, false);
}

function loopTube(points: THREE.Vector3[], radius: number) {
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(64, points.length), radius, 5, true);
}

export function createMotifGeometry(
  stitches: Stitch[],
  colorIndex: number,
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const stitch of stitches) {
    if (stitch.color !== colorIndex) continue;
    if (stitch.kind === "arc") {
      parts.push(arcTube(vec(stitch.a), vec(stitch.b), TUBE));
    } else {
      parts.push(loopTube(stitch.points.map(vec), LOOP_TUBE));
    }
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const geo of parts) geo.dispose();
  if (!merged) return null;
  merged.computeVertexNormals();
  return merged;
}
