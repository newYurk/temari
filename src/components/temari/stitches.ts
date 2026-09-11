import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Stitch } from "./patterns";
import { DEFAULT_KIND, ribbonWidth } from "./thread";
import { WRAP_LAYERS } from "./craft";

const ARC_SEGS = 32;
const LIFT = 1.012;

const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const _side = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _mid = new THREE.Vector3();

function slerp(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const theta = Math.acos(dot);
  if (theta < 1e-4) return out.copy(a);
  if (theta > Math.PI - 1e-4) {
    // Antipodes: shortest geodesic is not unique. Pick a stable plane.
    const axis =
      Math.abs(a.y) < 0.9
        ? _t.set(0, 1, 0)
        : _t.set(1, 0, 0);
    _mid.crossVectors(a, axis).normalize();
    if (t < 0.5) return slerp(a, _mid, t * 2, out);
    return slerp(_mid, b, t * 2 - 1, out);
  }
  const s = Math.sin(theta);
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - t) * theta) / s)
    .addScaledVector(b, Math.sin(t * theta) / s);
}

export function slerpOnSphere(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out = new THREE.Vector3(),
) {
  return slerp(a, b, t, out);
}

function vec(p: [number, number, number], lift = 0) {
  return new THREE.Vector3(p[0], p[1], p[2]).normalize().multiplyScalar(LIFT + lift);
}

export function ribbonFromPoints(pts: THREE.Vector3[], width: number, closed: boolean) {
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
    // Keep the ribbon on the sphere so stitches lie on the mari, not as chords.
    const r = p.length();
    _a.copy(p).addScaledVector(_side, half).normalize().multiplyScalar(r);
    pos[o] = _a.x;
    pos[o + 1] = _a.y;
    pos[o + 2] = _a.z;
    _a.copy(p).addScaledVector(_side, -half).normalize().multiplyScalar(r);
    pos[o + 3] = _a.x;
    pos[o + 4] = _a.y;
    pos[o + 5] = _a.z;
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

export function getYarnTexture() {
  if (yarn) return yarn;
  yarn = makeYarnTexture(true);
  return yarn;
}

/** Wrap yarn stays opaque — edge fade punches holes through to the wool. */
export function getWrapYarnTexture() {
  if (wrapYarn) return wrapYarn;
  wrapYarn = makeYarnTexture(false);
  return wrapYarn;
}

let yarn: THREE.CanvasTexture | null = null;
let wrapYarn: THREE.CanvasTexture | null = null;

function makeYarnTexture(fadeEdges: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 24;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  if (!ctx) return tex;
  ctx.fillStyle = "#d9cfc4";
  ctx.fillRect(0, 0, 128, 24);
  for (let s = 0; s < 6; s++) {
    const y = 3 + s * 3.2;
    ctx.strokeStyle = s % 2 === 0 ? "rgba(48,40,34,0.22)" : "rgba(255,252,246,0.4)";
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    for (let x = 0; x <= 128; x += 4) {
      const yy = y + Math.sin((x / 128) * Math.PI * 6 + s) * 1.1;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  if (fadeEdges) {
    const fade = ctx.createLinearGradient(0, 0, 0, 24);
    fade.addColorStop(0, "rgba(255,255,255,0)");
    fade.addColorStop(0.18, "rgba(255,255,255,1)");
    fade.addColorStop(0.82, "rgba(255,255,255,1)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 24);
  }
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
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
      if (stitch.bite) {
        parts.push(
          arcRibbon(
            vec(stitch.bite.enter, lift + 0.0016),
            vec(stitch.bite.exit, lift + 0.0016),
            width * 0.9,
          ),
        );
      }
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

/** Round threads: yarn under, sewing on top. `pass` 1–3 = how many layers. */
export function createWrapGeometry(
  strands: THREE.Vector3[][],
  width: number,
  pass = 3,
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const slider = Math.max(0, Math.min(1, width));
  let cursor = 0;
  const layers = WRAP_LAYERS.slice(0, Math.max(1, Math.min(3, pass)));
  layers.forEach((layer) => {
    const radius = layer.radius * (0.88 + slider * 0.28);
    const end = Math.min(strands.length, cursor + layer.per);
    for (let i = cursor; i < end; i++) {
      const pts = strands[i];
      if (!pts || pts.length < 2) continue;
      const lifted = pts.map((p) => p.clone().normalize().multiplyScalar(layer.shell));
      parts.push(tubeOnSphere(lifted, radius));
    }
    cursor = end;
  });
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const geo of parts) geo.dispose();
  if (!merged) return null;
  merged.computeVertexNormals();
  return merged;
}

/** Hair-thin sewing wraps as world-space line segments on the sphere. */
export function createWrapLineGeometry(strands: THREE.Vector3[][]) {
  const pos: number[] = [];
  const shell = 1.003;
  for (const pts of strands) {
    if (pts.length < 2) continue;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if (!a || !b) continue;
      pos.push(a.x * shell, a.y * shell, a.z * shell, b.x * shell, b.y * shell, b.z * shell);
    }
  }
  if (pos.length < 6) return null;
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pos);
  return geo;
}

class SpherePolyline extends THREE.Curve<THREE.Vector3> {
  constructor(private pts: THREE.Vector3[]) {
    super();
  }
  getPoint(t: number, optionalTarget = new THREE.Vector3()) {
    const pts = this.pts;
    const n = pts.length - 1;
    if (n < 1) return optionalTarget.set(1, 0, 0);
    const f = Math.max(0, Math.min(1, t)) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const u = f - i;
    const a = pts[i];
    const b = pts[i + 1];
    if (!a) return optionalTarget.set(1, 0, 0);
    if (!b) return optionalTarget.copy(a);
    const r = a.length();
    return optionalTarget.lerpVectors(a, b, u).normalize().multiplyScalar(r);
  }
}

function tubeOnSphere(pts: THREE.Vector3[], radius: number) {
  const curve = new SpherePolyline(pts);
  const segs = Math.max(12, pts.length);
  return new THREE.TubeGeometry(curve, segs, radius, 5, false);
}
