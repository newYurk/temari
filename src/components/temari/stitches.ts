import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Stitch } from "./patterns";
import { annotateSetCrossings, groupWorkingThreads } from "./patterns";
import { DEFAULT_KIND, ribbonWidth, stitchRadius, type ThreadKind } from "./thread";
import { STITCH_THREAD_MM, unitFromMm } from "./measure";
import { WRAP_LAYERS } from "./craft";
import { stackBump, scoopAway, scoopRadius, markTurnPast as markTurnPastVec, sphereBezier as sphereBezierVec } from "./kagari";

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
 * Pearl on the mari: a round cord. Path follows `via` when the stitch is a
 * parallel offset (later kiku kai). Local extra height only where the
 * stitch sits on thread — pole bundle and set-B crossing.
 *
 * Consecutive legs that share a mark are one cord: the master does not
 * cut the pearl at the outer point or the inner stitch. A complete
 * chidori round *returns* to the start mark — that is a park, not a weld.
 */
function arcPath(
  stitch: Extract<Stitch, { kind: "arc" }>,
  kind: ThreadKind,
): THREE.Vector3[] {
  const mm = kindMm(kind);
  const half = unitFromMm(mm) * 0.5;
  const diameter = unitFromMm(mm);
  const sitA = stitch.sitA ?? 0;
  const sitB = stitch.sitB ?? 0;
  const sitMid = stitch.sitMid ?? 0;
  const sitMidT = stitch.sitMidT;
  const uniform = stitch.lift ?? 0;
  const via = stitch.via ?? [];
  const anchors: THREE.Vector3[] = [
    new THREE.Vector3(stitch.a[0], stitch.a[1], stitch.a[2]).normalize(),
    ...via.map((p) => new THREE.Vector3(p[0], p[1], p[2]).normalize()),
    new THREE.Vector3(stitch.b[0], stitch.b[1], stitch.b[2]).normalize(),
  ];
  const pts: THREE.Vector3[] = [];
  const lift = (t: number, dir: THREE.Vector3) => {
    const extra = uniform + Math.min(3, stackBump(t, sitA, sitB, sitMid, sitMidT)) * diameter * 0.55;
    return dir.clone().multiplyScalar(1 + half + extra);
  };
  if (via.length === 0) {
    const a = anchors[0]!;
    const b = anchors[1]!;
    for (let i = 0; i <= ARC_SEGS; i++) {
      const t = i / ARC_SEGS;
      slerpUnit(a, b, t, _a);
      pts.push(lift(t, _a));
    }
  } else {
    const steps = anchors.length - 1;
    const sub = 4;
    for (let s = 0; s < steps; s++) {
      const a = anchors[s];
      const b = anchors[s + 1];
      if (!a || !b) continue;
      const start = s === 0 ? 0 : 1;
      for (let i = start; i <= sub; i++) {
        const t = (s + i / sub) / steps;
        slerpUnit(a, b, i / sub, _a);
        pts.push(lift(t, _a));
      }
    }
  }
  return pts;
}

function sameMark(a: [number, number, number], b: [number, number, number]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz < 1.6e-4;
}

function nearVec(a: THREE.Vector3, b: THREE.Vector3) {
  return a.distanceToSquared(b) < 1.6e-4;
}

/**
 * Tip of the V, past the mark, on the mari. The open side of the V is
 * `from`+`to`; the turn sits on the opposite side so the pearl goes *around*
 * the jiwari instead of reversing through the vertex.
 */
function markTurnPast(
  from: THREE.Vector3,
  mark: THREE.Vector3,
  to: THREE.Vector3,
  dist: number,
): THREE.Vector3 {
  const p = markTurnPastVec(
    [from.x, from.y, from.z],
    [mark.x, mark.y, mark.z],
    [to.x, to.y, to.z],
    dist,
  );
  return new THREE.Vector3(p[0], p[1], p[2]);
}

/** Quadratic Bézier on the sphere. Does not cusp at the control point. */
function sphereBezier(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  n: number,
): THREE.Vector3[] {
  return sphereBezierVec(
    [a.x, a.y, a.z],
    [b.x, b.y, b.z],
    [c.x, c.y, c.z],
    n,
  ).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
}

/**
 * Replace the cusp at `mark` with a pearl U around it.
 * Visiting the mark as a vertex makes a diamond bead: tube rings pile up
 * and the tangent at the tip is across the jiwari (the old enter→exit bar).
 */
function joinAroundMark(
  pts: THREE.Vector3[],
  piece: THREE.Vector3[],
  mark: THREE.Vector3,
  pearl: number,
) {
  // Tight pearl U around the jiwari. Sample spacing on a long flank is
  // ~one pearl, so popping "points inside keep" left a 2-pearl canyon
  // (the packed-V close-ups). Land exactly `keep` from the mark, then
  // a short past — not a cusp through the vertex (old diamond bead).
  const keep = pearl * 0.78;
  const keep2 = keep * keep;
  while (pts.length > 2 && pts[pts.length - 1]!.distanceToSquared(mark) < keep2) {
    pts.pop();
  }
  let i = 0;
  while (i < piece.length - 2 && piece[i]!.distanceToSquared(mark) < keep2) i++;
  const fromRaw = pts[pts.length - 1];
  const toRaw = piece[i];
  if (!fromRaw || !toRaw) {
    for (let k = i; k < piece.length; k++) pts.push(piece[k]!);
    return;
  }
  if (fromRaw.distanceToSquared(toRaw) < pearl * pearl * 0.05) {
    for (let k = i; k < piece.length; k++) {
      if (k === 0 && nearVec(fromRaw, piece[k]!)) continue;
      pts.push(piece[k]!);
    }
    return;
  }
  const atKeep = (p: THREE.Vector3) => {
    const d = p.distanceTo(mark);
    if (d <= keep || d < 1e-9) return p.clone();
    slerp(mark, p, keep / d, _a);
    return _a.clone();
  };
  pts.pop();
  const from = atKeep(fromRaw);
  const to = atKeep(toRaw);
  pts.push(from);
  const past = markTurnPast(from, mark, to, pearl * 0.38);
  for (const p of sphereBezier(from, past, to, 20)) pts.push(p);
  for (let k = i + 1; k < piece.length; k++) pts.push(piece[k]!);
}

/**
 * TemariKai: start comes up from the wrap; end goes back in.
 * Walks away from the laid stitch, dropping under the cover (r=1).
 * A parked round emerges at the start and sits on the mari at the end —
 * a closed drawing is not the thread joining itself.
 */
function scoopOnPath(
  at: THREE.Vector3,
  from: THREE.Vector3,
  kind: ThreadKind,
): THREE.Vector3[] {
  const half = unitFromMm(kindMm(kind)) * 0.5;
  const surfaceR = at.length();
  const units = scoopAway([at.x, at.y, at.z], [from.x, from.y, from.z]);
  const n = units.length;
  if (n === 0) return [];
  return units.map((p, i) => {
    const r = scoopRadius((i + 1) / n, surfaceR, half);
    return new THREE.Vector3(p[0] * r, p[1] * r, p[2] * r);
  });
}

function buryWorkingEnds(pts: THREE.Vector3[], kind: ThreadKind): THREE.Vector3[] {
  if (pts.length < 2) return pts;
  const head = scoopOnPath(pts[0]!, pts[1]!, kind);
  const tail = scoopOnPath(pts[pts.length - 1]!, pts[pts.length - 2]!, kind);
  if (head.length === 0 && tail.length === 0) return pts;
  return [...head.reverse(), ...pts, ...tail];
}

function buryWorkingStart(pts: THREE.Vector3[], kind: ThreadKind): THREE.Vector3[] {
  if (pts.length < 2) return pts;
  const head = scoopOnPath(pts[0]!, pts[1]!, kind);
  if (head.length === 0) return pts;
  return [...head.reverse(), ...pts];
}

function stackedArcCord(
  stitch: Extract<Stitch, { kind: "arc" }>,
  kind: ThreadKind,
) {
  const pts = arcPath(stitch, kind);
  if (pts.length < 2) return new THREE.BufferGeometry();
  // Open working length: emerge from the wrap, bury at the last stitch.
  // Full pearl — the cover hides the ends, so no taper and no coin.
  return tubeOnSphere(buryWorkingEnds(pts, kind), stitchRadius(kind), false, false);
}

function stackedArcChain(
  chain: Extract<Stitch, { kind: "arc" }>[],
  kind: ThreadKind,
) {
  if (chain.length === 1) return stackedArcCord(chain[0]!, kind);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < chain.length; i++) {
    const piece = arcPath(chain[i]!, kind);
    if (piece.length < 2) continue;
    if (pts.length === 0) {
      pts.push(...piece);
      continue;
    }
    const mark = pts[pts.length - 1]!;
    const next0 = piece[0]!;
    if (nearVec(mark, next0) && pts.length > 1 && piece.length > 1) {
      // Pearl U around the mark. A cusp through the vertex, or enter→exit
      // as a cord, is a diamond bead on the ray (the user's packed-V shots).
      pts.pop();
      joinAroundMark(pts, piece, mark, unitFromMm(kindMm(kind)));
    } else {
      const start = nearVec(mark, next0) ? 1 : 0;
      for (let k = start; k < piece.length; k++) pts.push(piece[k]!);
    }
  }
  if (pts.length < 2) return new THREE.BufferGeometry();
  // Closed drawing ≠ the thread joined itself. Park on the mari; don't weld.
  const parks = chain.length > 2 && sameMark(chain[0]!.a, chain[chain.length - 1]!.b);
  const path = parks ? buryWorkingStart(pts, kind) : buryWorkingEnds(pts, kind);
  return tubeOnSphere(path, stitchRadius(kind), false, false);
}

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
  const sitMidT = stitch.sitMidT;
  const uniform = stitch.lift ?? 0;
  const via = stitch.via ?? [];
  const pts: THREE.Vector3[] = [];
  if (via.length === 0) {
    for (let i = 0; i <= ARC_SEGS; i++) {
      const t = i / ARC_SEGS;
      const stacked = Math.min(3, stackBump(t, sitA, sitB, sitMid, sitMidT));
      const extra = uniform + stacked * diameter * 0.55;
      slerpUnit(_pa, _pb, t, _a);
      pts.push(_a.clone().multiplyScalar(1 + half + extra));
    }
  } else {
    const anchors = [
      _pa.clone(),
      ...via.map((p) => new THREE.Vector3(p[0], p[1], p[2]).normalize()),
      _pb.clone(),
    ];
    const steps = anchors.length - 1;
    for (let s = 0; s < steps; s++) {
      const a = anchors[s];
      const b = anchors[s + 1];
      if (!a || !b) continue;
      const start = s === 0 ? 0 : 1;
      for (let i = start; i <= 1; i++) {
        const t = (s + i) / steps;
        const stacked = Math.min(3, stackBump(t, sitA, sitB, sitMid, sitMidT));
        const extra = uniform + stacked * diameter * 0.55;
        slerpUnit(a, b, i, _a);
        pts.push(_a.clone().multiplyScalar(1 + half + extra));
      }
    }
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
  ctx.strokeStyle = "rgba(40,34,28,0.06)";
  ctx.lineWidth = 1;
  for (const y of [2, 4, 6, 8, 10, 12, 14]) {
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
  const cord = kind !== "metallic";
  const parts: THREE.BufferGeometry[] = [];
  const annotated = annotateSetCrossings(stitches);
  const arcs: Extract<Stitch, { kind: "arc" }>[] = [];
  for (const stitch of annotated) {
    if (stitch.color !== colorIndex) continue;
    if (stitch.kind === "arc") {
      arcs.push(stitch);
    } else {
      parts.push(ribbonFromPoints(stitch.points.map((p) => vec(p, stitch.lift ?? 0, kind)), width * 1.08, true));
    }
  }
  if (cord) {
    for (const chain of groupWorkingThreads(arcs)) {
      parts.push(stackedArcChain(chain, kind));
    }
  } else {
    for (const stitch of arcs) {
      parts.push(stackedArcRibbon(stitch, width, kind));
    }
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const geo of parts) geo.dispose();
  if (!merged) return null;
  return merged;
}

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

/**
 * Pearl on the mari. Sphere-radial frames, not Frenet.
 *
 * Working thread: emerge from the wrap at the true start, bury at the true
 * stop. A round that returns to the start parks on the mari — never a
 * welded loop. Wrap tubes stay untapered (closed circles, open seam).
 */
function tubeOnSphere(
  pts: THREE.Vector3[],
  radius: number,
  taperEnds = false,
  closed = false,
) {
  if (pts.length < 2) return new THREE.BufferGeometry();
  const path: THREE.Vector3[] = [];
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      slerp(a, b, t, _a);
      path.push(_a.clone());
    }
  }
  if (!closed) path.push(pts[pts.length - 1]!.clone());
  const nPath = path.length;
  if (nPath < 2) return new THREE.BufferGeometry();
  const along = [0];
  for (let i = 1; i < nPath; i++) {
    along.push(along[i - 1]! + path[i]!.distanceTo(path[i - 1]!));
  }
  const total = along[along.length - 1] || 1;
  const taperLen = Math.max(radius * 3, total * 0.03);
  const scaleAt = (s: number) => {
    if (!taperEnds || closed) return 1;
    const hermite = (u: number) => {
      if (u >= 1) return 1;
      if (u <= 0) return 0.55;
      return 0.55 + 0.45 * u * u * (3 - 2 * u);
    };
    return Math.min(hermite(s / taperLen), hermite((total - s) / taperLen));
  };
  const radialSegs = 20;
  const ring = radialSegs + 1;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < nPath; i++) {
    const p = path[i]!;
    const prev = path[closed ? (i - 1 + nPath) % nPath : Math.max(0, i - 1)]!;
    const next = path[closed ? (i + 1) % nPath : Math.min(nPath - 1, i + 1)]!;
    _t.subVectors(next, prev);
    if (_t.lengthSq() < 1e-12) {
      _t.crossVectors(p, Math.abs(p.y) < 0.9 ? _mid.set(0, 1, 0) : _mid.set(1, 0, 0));
    }
    _t.normalize();
    tangents.push(_t.clone());
    _radial.copy(p).normalize();
    _side.copy(_radial).addScaledVector(_t, -_radial.dot(_t));
    if (_side.lengthSq() < 1e-12) {
      _side.crossVectors(_t, Math.abs(_t.y) < 0.9 ? _mid.set(0, 1, 0) : _mid.set(1, 0, 0));
    }
    _side.normalize();
    _mid.crossVectors(_t, _side).normalize();
    const r = radius * scaleAt(along[i] ?? 0);
    // Pearl on the mari is slightly oval: pressed into the wrap, a bit
    // wider on the surface. A round hose stands off the ball at close-up.
    const rOut = r * 0.7;
    const rAlong = r * 1.1;
    for (let j = 0; j <= radialSegs; j++) {
      const ang = (j / radialSegs) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const nx = _side.x * c * rOut + _mid.x * s * rAlong;
      const ny = _side.y * c * rOut + _mid.y * s * rAlong;
      const nz = _side.z * c * rOut + _mid.z * s * rAlong;
      pos.push(p.x + nx, p.y + ny, p.z + nz);
      const nl = Math.hypot(nx, ny, nz) || 1;
      nrm.push(nx / nl, ny / nl, nz / nl);
      uv.push(i / Math.max(1, nPath - 1), j / radialSegs);
    }
  }
  const wallSegs = closed ? nPath : nPath - 1;
  for (let i = 0; i < wallSegs; i++) {
    const i0 = i;
    const i1 = (i + 1) % nPath;
    for (let j = 0; j < radialSegs; j++) {
      const a = i0 * ring + j;
      const b = i1 * ring + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (!taperEnds && !closed) {
    const first = path[0]!;
    const last = path[nPath - 1]!;
    // Working enter/exit sit under the wrap cover. A disk there reads as a
    // coin on a shallow scoop; skip caps once the ends have dived in.
    if (first.length() >= 1.0 && last.length() >= 1.0) {
      const c0 = nPath * ring;
      const c1 = c0 + 1;
      const t0 = tangents[0]!;
      const t1 = tangents[tangents.length - 1]!;
      pos.push(first.x, first.y, first.z);
      nrm.push(-t0.x, -t0.y, -t0.z);
      uv.push(0, 0.5);
      pos.push(last.x, last.y, last.z);
      nrm.push(t1.x, t1.y, t1.z);
      uv.push(1, 0.5);
      for (let j = 0; j < radialSegs; j++) {
        idx.push(c0, j + 1, j);
        idx.push(c1, (nPath - 1) * ring + j, (nPath - 1) * ring + j + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}
