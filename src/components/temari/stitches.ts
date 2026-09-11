import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Stitch } from "./patterns";
import { DEFAULT_KIND, ribbonWidth, type ThreadKind } from "./thread";
import { STITCH_THREAD_MM, unitFromMm } from "./measure";
import { WRAP_LAYERS } from "./craft";
import { stackBump } from "./kagari";

const ARC_SEGS = 32;

const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const _side = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _ua = new THREE.Vector3();
const _ub = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();

function kindMm(kind: ThreadKind) {
  if (kind === "pearl8") return STITCH_THREAD_MM.pearl8;
  if (kind === "metallic") return STITCH_THREAD_MM.mark;
  return STITCH_THREAD_MM.pearl5;
}

/** Unit-sphere geodesic. a and b may have any radius; result is unit. */
function slerpUnit(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
) {
  _ua.copy(a).normalize();
  _ub.copy(b).normalize();
  const dot = THREE.MathUtils.clamp(_ua.dot(_ub), -1, 1);
  const theta = Math.acos(dot);
  if (theta < 1e-4) return out.copy(_ua);
  if (theta > Math.PI - 1e-4) {
    const axis =
      Math.abs(_ua.y) < 0.9 ? _t.set(0, 1, 0) : _t.set(1, 0, 0);
    _mid.crossVectors(_ua, axis).normalize();
    if (t < 0.5) {
      const u = t * 2;
      const h = (u * Math.PI) / 2;
      return out.copy(_ua).multiplyScalar(Math.cos(h)).addScaledVector(_mid, Math.sin(h));
    }
    const u = t * 2 - 1;
    const h = (u * Math.PI) / 2;
    return out.copy(_mid).multiplyScalar(Math.cos(h)).addScaledVector(_ub, Math.sin(h));
  }
  const s = Math.sin(theta);
  return out
    .copy(_ua)
    .multiplyScalar(Math.sin((1 - t) * theta) / s)
    .addScaledVector(_ub, Math.sin(t * theta) / s);
}

function slerp(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
) {
  const ra = a.length();
  const rb = b.length();
  slerpUnit(a, b, t, out);
  return out.multiplyScalar(ra + (rb - ra) * t);
}

export function slerpOnSphere(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out = new THREE.Vector3(),
) {
  return slerp(a, b, t, out);
}

function vec(p: [number, number, number], lift = 0, kind: ThreadKind = DEFAULT_KIND.stitch) {
  const mm = kindMm(kind);
  const r = 1 + unitFromMm(mm) * 0.5 + lift;
  return new THREE.Vector3(p[0], p[1], p[2]).normalize().multiplyScalar(r);
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
    uv[i * 4] = v * 1.4;
    uv[i * 4 + 1] = 0;
    uv[i * 4 + 2] = v * 1.4;
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

/**
 * Geodesic on the mari with local extra height where the stitch sits on thread.
 * Legs stay at wrap + one radius. Only the pole bundle and the set-B
 * crossing rise — and only by a few thread diameters, pressed down the
 * way a master strokes the uwagake wedge. Stretch at the outer point is
 * along the mark, not a radial lift.
 */
function stackedArcRibbon(
  stitch: Extract<Stitch, { kind: "arc" }>,
  width: number,
  kind: ThreadKind,
) {
  const mm = kindMm(kind);
  const half = unitFromMm(mm) * 0.5;
  const diameter = unitFromMm(mm);
  _pa.set(stitch.a[0], stitch.a[1], stitch.a[2]).normalize();
  _pb.set(stitch.b[0], stitch.b[1], stitch.b[2]).normalize();
  const sitA = stitch.sitA ?? 0;
  const sitB = stitch.sitB ?? 0;
  const sitMid = stitch.sitMid ?? 0;
  const uniform = stitch.lift ?? 0;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= ARC_SEGS; i++) {
    const t = i / ARC_SEGS;
    const stacked = Math.min(3, stackBump(t, sitA, sitB, sitMid));
    const extra = uniform + stacked * diameter * 0.7;
    slerpUnit(_pa, _pb, t, _a);
    pts.push(_a.clone().multiplyScalar(1 + half + extra));
  }
  return ribbonFromPoints(pts, width, false);
}

export function getYarnTexture() {
  if (yarn) return yarn;
  yarn = makeYarnTexture(false);
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
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  if (!ctx) return tex;
  ctx.fillStyle = "#e8e0d6";
  ctx.fillRect(0, 0, 64, 16);
  ctx.strokeStyle = "rgba(40,34,28,0.12)";
  ctx.lineWidth = 1;
  for (const y of [5, 11]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(64, y);
    ctx.stroke();
  }
  if (fadeEdges) {
    const fade = ctx.createLinearGradient(0, 0, 0, 16);
    fade.addColorStop(0, "rgba(255,255,255,0.35)");
    fade.addColorStop(0.22, "rgba(255,255,255,1)");
    fade.addColorStop(0.78, "rgba(255,255,255,1)");
    fade.addColorStop(1, "rgba(255,255,255,0.35)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 64, 16);
  }
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function geodesicRibbon(points: THREE.Vector3[], width: number) {
  if (points.length < 2) return new THREE.BufferGeometry();
  if (points.length === 2) {
    const a = points[0];
    const b = points[1];
    if (!a || !b) return new THREE.BufferGeometry();
    return arcRibbon(a, b, width);
  }
  const pts: THREE.Vector3[] = [];
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s];
    const b = points[s + 1];
    if (!a || !b) continue;
    const start = s === 0 ? 0 : 1;
    for (let i = start; i <= ARC_SEGS; i++) {
      pts.push(slerp(a, b, i / ARC_SEGS, _a).clone());
    }
  }
  return ribbonFromPoints(pts, width, false);
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
    if (stitch.kind === "arc") {
      const via = stitch.via ?? [];
      if (via.length === 0) {
        parts.push(stackedArcRibbon(stitch, width, kind));
      } else {
        const lift = stitch.lift ?? 0;
        const path = [
          vec(stitch.a, lift, kind),
          ...via.map((p) => vec(p, lift, kind)),
          vec(stitch.b, lift, kind),
        ];
        parts.push(geodesicRibbon(path, width));
      }
    } else {
      parts.push(ribbonFromPoints(stitch.points.map((p) => vec(p, stitch.lift ?? 0, kind)), width * 1.08, true));
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
  pts: THREE.Vector3[];
  constructor(pts: THREE.Vector3[]) {
    super();
    this.pts = pts;
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
