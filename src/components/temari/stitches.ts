import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Stitch } from "./patterns";
import { DEFAULT_KIND, ribbonWidth } from "./thread";

const ARC_SEGS = 14;
const LIFT = 1.02;

const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const _side = new THREE.Vector3();
const _radial = new THREE.Vector3();

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

function vec(p: [number, number, number], lift = 0) {
  return new THREE.Vector3(p[0], p[1], p[2]).normalize().multiplyScalar(LIFT + lift);
}

function ribbonFromPoints(pts: THREE.Vector3[], width: number, closed: boolean) {
  const n = pts.length;
  if (n < 2) return new THREE.BufferGeometry();
  const half = width / 2;
  const pos = new Float32Array(n * 2 * 3);
  const nrm = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx: number[] = [];

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[i === 0 ? (closed ? n - 1 : 0) : i - 1];
    const next = pts[i === n - 1 ? (closed ? 0 : n - 1) : i + 1];
    if (!p || !prev || !next) continue;
    if (i === 0 && !closed) _t.copy(next).sub(p);
    else if (i === n - 1 && !closed) _t.copy(p).sub(prev);
    else _t.copy(next).sub(prev);
    _radial.copy(p).normalize();
    _side.crossVectors(_radial, _t);
    if (_side.lengthSq() < 1e-10) {
      _side.set(1, 0, 0).cross(_radial);
    }
    _side.normalize();
    const o = i * 6;
    pos[o] = p.x + _side.x * half;
    pos[o + 1] = p.y + _side.y * half;
    pos[o + 2] = p.z + _side.z * half;
    pos[o + 3] = p.x - _side.x * half;
    pos[o + 4] = p.y - _side.y * half;
    pos[o + 5] = p.z - _side.z * half;
    nrm[o] = _radial.x;
    nrm[o + 1] = _radial.y;
    nrm[o + 2] = _radial.z;
    nrm[o + 3] = _radial.x;
    nrm[o + 4] = _radial.y;
    nrm[o + 5] = _radial.z;
    const v = i / Math.max(1, n - 1);
    uv[i * 4] = v * 4;
    uv[i * 4 + 1] = 0;
    uv[i * 4 + 2] = v * 4;
    uv[i * 4 + 3] = 1;
  }

  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function arcRibbon(a: THREE.Vector3, b: THREE.Vector3, width: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= ARC_SEGS; i++) {
    pts.push(slerp(a, b, i / ARC_SEGS, _a).clone());
  }
  return ribbonFromPoints(pts, width, false);
}

let yarn: THREE.CanvasTexture | null = null;

export function getYarnTexture() {
  if (yarn) return yarn;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 24;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    yarn = new THREE.CanvasTexture(canvas);
    return yarn;
  }
  ctx.fillStyle = "#f3ebe0";
  ctx.fillRect(0, 0, 128, 24);
  for (let i = 0; i < 18; i++) {
    const y = 1 + i * 1.25;
    ctx.strokeStyle = i % 3 === 0 ? "rgba(42,36,32,0.28)" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = i % 3 === 0 ? 1.1 : 0.7;
    ctx.beginPath();
    ctx.moveTo(0, y + 2);
    ctx.lineTo(128, y - 2);
    ctx.stroke();
  }
  const fade = ctx.createLinearGradient(0, 0, 0, 24);
  fade.addColorStop(0, "rgba(255,255,255,0)");
  fade.addColorStop(0.18, "rgba(255,255,255,1)");
  fade.addColorStop(0.82, "rgba(255,255,255,1)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 128, 24);
  yarn = new THREE.CanvasTexture(canvas);
  yarn.wrapS = THREE.RepeatWrapping;
  yarn.wrapT = THREE.ClampToEdgeWrapping;
  yarn.colorSpace = THREE.SRGBColorSpace;
  yarn.needsUpdate = true;
  return yarn;
}

export function createMotifGeometry(
  stitches: Stitch[],
  colorIndex: number,
  kind = DEFAULT_KIND.stitch,
): THREE.BufferGeometry | null {
  const width = ribbonWidth(kind);
  const parts: THREE.BufferGeometry[] = [];
  for (const stitch of stitches) {
    if (stitch.color !== colorIndex) continue;
    const lift = stitch.lift ?? 0;
    if (stitch.kind === "arc") {
      parts.push(arcRibbon(vec(stitch.a, lift), vec(stitch.b, lift), width));
    } else {
      parts.push(ribbonFromPoints(stitch.points.map((p) => vec(p, lift)), width * 1.08, true));
    }
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const geo of parts) geo.dispose();
  if (!merged) return null;
  merged.computeVertexNormals();
  return merged;
}
