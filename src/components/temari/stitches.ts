import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Stitch } from "./patterns.ts";
import { annotateSetCrossings, groupWorkingThreads } from "./patterns.ts";
import { DEFAULT_KIND, ribbonWidth, stitchRadius, type ThreadKind } from "./thread.ts";
import { STITCH_THREAD_MM, unitFromMm } from "./measure.ts";
import { WRAP_LAYERS } from "./craft.ts";
import { stackBump, scoopAway, scoopRadius, KAGARI_SCOOP_MM, clampNotPastPole, clampNotPastEquator } from "./kagari.ts";

const ARC_SEGS = 32;
/**
 * Rise over one thread underneath, in diameters of a round pearl.
 * Real kagari compresses: the working thread nestles into the one below,
 * it does not sit as a second garden hose. A full diameter was the pile
 * at the inner star.
 */
const STACK_LIFT = 0.42;
/** Cross-section height / width. Pearl cotton lies on the mari, not a pipe. */
const STITCH_FLAT = 0.5;

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
export function arcPath(
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
  const sitAts = stitch.sitAts;
  const uniform = stitch.lift ?? 0;
  const via = stitch.via ?? [];
  const anchors: THREE.Vector3[] = [
    new THREE.Vector3(stitch.a[0], stitch.a[1], stitch.a[2]).normalize(),
    ...via.map((p) => new THREE.Vector3(p[0], p[1], p[2]).normalize()),
    new THREE.Vector3(stitch.b[0], stitch.b[1], stitch.b[2]).normalize(),
  ];
  const pts: THREE.Vector3[] = [];
  const lift = (t: number, dir: THREE.Vector3) => {
    // Preserve the path's declared lift at every orientation. This legacy
    // stack estimate is not a contact solver; latitude cannot correct it.
    const extra = uniform + Math.min(3, stackBump(t, sitA, sitB, sitMid, sitMidT, sitAts)) * diameter * STACK_LIFT;
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

/** Same pin, not the next kai one pearl further along the meridian. */
function samePin(a: THREE.Vector3, b: THREE.Vector3) {
  _ua.copy(a).normalize();
  _ub.copy(b).normalize();
  return _ua.distanceToSquared(_ub) < 4e-5;
}

/**
 * Needle at a mark: in on the far side of the jiwari, short run under
 * the wrap, out on the near side. A V on the mari never goes in.
 */
function jiwariPorts(
  mark: THREE.Vector3,
  from: THREE.Vector3,
  enter?: [number, number, number],
  exit?: [number, number, number],
) {
  const m = mark.clone().normalize();
  let a: THREE.Vector3;
  let b: THREE.Vector3;
  if (enter && exit) {
    a = new THREE.Vector3(enter[0], enter[1], enter[2]).normalize();
    b = new THREE.Vector3(exit[0], exit[1], exit[2]).normalize();
  } else {
    const pole = new THREE.Vector3(0, m.y >= 0 ? 1 : -1, 0);
    const across = new THREE.Vector3().crossVectors(m, pole);
    if (across.lengthSq() < 1e-12) across.set(1, 0, 0);
    across.normalize();
    const half = unitFromMm(0.71) * 0.5;
    a = m.clone().addScaledVector(across, -half).normalize();
    b = m.clone().addScaledVector(across, half).normalize();
  }
  const f = from.clone().normalize();
  // In on the far side of the guideline, out on the near side.
  if (f.distanceToSquared(a) < f.distanceToSquared(b)) return { inn: b, out: a };
  return { inn: a, out: b };
}

export function sewKagariBite(
  from: THREE.Vector3,
  mark: THREE.Vector3,
  to: THREE.Vector3,
  kind: ThreadKind,
  enter?: [number, number, number],
  exit?: [number, number, number],
  onStack = false,
): THREE.Vector3[] {
  const { inPts, outPts } = sewKagariLegs(from, mark, to, kind, enter, exit, onStack);
  return [...inPts, ...outPts];
}

function smooth01(t: number) {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/**
 * Visible needle only: down on the far side of the jiwari, up on the near
 * side. The hidden run under the wrap is not drawn — a U there is a hole
 * with a loop, not kagari.
 *
 * Both flanks stay on the mari until they cross (leaving over arriving).
 * Outer then dives; inner uwagake stays on the stack — the same dive
 * swallowed the small crosses at the pole.
 */
function sewKagariLegs(
  from: THREE.Vector3,
  mark: THREE.Vector3,
  to: THREE.Vector3,
  kind: ThreadKind,
  enter?: [number, number, number],
  exit?: [number, number, number],
  onStack = false,
): { inPts: THREE.Vector3[]; outPts: THREE.Vector3[] } {
  const half = unitFromMm(kindMm(kind)) * 0.5;
  const pearl = half * 2;
  const fromR = from.length();
  const toR = to.length();
  let { inn, out } = jiwariPorts(mark, from, enter, exit);
  const m = mark.clone().normalize();
  const pole = new THREE.Vector3(0, m.y >= 0 ? 1 : -1, 0);
  const towardPole = pole.clone().addScaledVector(m, -pole.dot(m));
  if (towardPole.lengthSq() < 1e-12) towardPole.set(1, 0, 0);
  towardPole.normalize();
  const across = inn.clone().sub(out);
  if (across.lengthSq() > 1e-12) {
    across.normalize();
    const mid = inn.clone().add(out).multiplyScalar(0.5);
    // Stitch sits against the pin on the pole side, not a millimetre away.
    if (!onStack) mid.addScaledVector(towardPole, unitFromMm(0.18));
    const span = unitFromMm(onStack ? 0.85 : 1.05);
    inn = mid.clone().addScaledVector(across, span).normalize();
    out = mid.clone().addScaledVector(across, -span).normalize();
  }
  let tIn = 0.67;
  let tOut = 0.33;
  let best = 1e9;
  const samples = 12;
  for (let i = 1; i < samples; i++) {
    slerpUnit(from, inn, i / samples, _a);
    for (let j = 1; j < samples; j++) {
      slerpUnit(out, to, j / samples, _radial);
      const d = _a.distanceToSquared(_radial);
      if (d < best) {
        best = d;
        tIn = i / samples;
        tOut = j / samples;
      }
    }
  }
  const n = 10;
  const buriedIn = scoopRadius(1, fromR, half);
  const buriedOut = scoopRadius(1, toR, half);
  // Stay on the mari through the cross; a dive from tIn ate the tip.
  const diveStart = Math.max(tIn + 0.2, 0.8);
  const inPts: THREE.Vector3[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    slerpUnit(from, inn, t, _a);
    if (onStack) {
      const c = clampNotPastPole([_a.x, _a.y, _a.z], [mark.x, mark.y, mark.z]);
      _a.set(c[0], c[1], c[2]).normalize();
    } else {
      const c = clampNotPastEquator([_a.x, _a.y, _a.z], [mark.x, mark.y, mark.z]);
      _a.set(c[0], c[1], c[2]).normalize();
    }
    const dive = onStack ? 0 : smooth01((t - diveStart) / Math.max(0.08, 1 - diveStart));
    inPts.push(_a.clone().multiplyScalar(fromR + (buriedIn - fromR) * dive));
  }
  const outPts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    slerpUnit(out, to, t, _a);
    if (onStack) {
      const c = clampNotPastPole([_a.x, _a.y, _a.z], [mark.x, mark.y, mark.z]);
      _a.set(c[0], c[1], c[2]).normalize();
    } else {
      const c = clampNotPastEquator([_a.x, _a.y, _a.z], [mark.x, mark.y, mark.z]);
      _a.set(c[0], c[1], c[2]).normalize();
    }
    const u = (t - tOut) / 0.22;
    const lift = Math.exp(-u * u);
    let r: number;
    if (onStack) {
      r = toR + pearl * STACK_LIFT * 1.2 * lift;
    } else {
      const emerge = smooth01(t / Math.max(0.12, tOut * 0.45));
      r = buriedOut + (toR - buriedOut) * emerge + pearl * STACK_LIFT * 1.35 * lift * emerge;
    }
    outPts.push(_a.clone().multiplyScalar(r));
  }
  return { inPts, outPts };
}

/** @deprecated tests; same needle as sewKagariBite. */
export function outerBackbite(
  from: THREE.Vector3,
  mark: THREE.Vector3,
  to: THREE.Vector3,
  kind: ThreadKind,
) {
  return sewKagariBite(from, mark, to, kind);
}

function atKeep(mark: THREE.Vector3, p: THREE.Vector3, keep: number) {
  const d = p.distanceTo(mark);
  if (d <= keep || d < 1e-9) return p.clone();
  slerp(mark, p, keep / d, _a);
  return _a.clone();
}

/**
 * Cut the working thread at the mark: the laid flank dives in, a new
 * tube comes out the other side. Drawing the buried bite as one cord
 * was the hole-and-loop at the tip.
 */
function splitJoinAroundMark(
  pts: THREE.Vector3[],
  piece: THREE.Vector3[],
  mark: THREE.Vector3,
  kind: ThreadKind,
  bite?: { enter: [number, number, number]; exit: [number, number, number] },
  onStack = false,
): { head: THREE.Vector3[]; tail: THREE.Vector3[]; outPts: THREE.Vector3[] } {
  const keep = unitFromMm(KAGARI_SCOOP_MM);
  const keep2 = keep * keep;
  while (pts.length > 2 && pts[pts.length - 1]!.distanceToSquared(mark) < keep2) {
    pts.pop();
  }
  let i = 0;
  while (i < piece.length - 2 && piece[i]!.distanceToSquared(mark) < keep2) i++;
  const fromRaw = pts[pts.length - 1];
  const toRaw = piece[i];
  if (!fromRaw || !toRaw) {
    return { head: pts, tail: piece.slice(i), outPts: [] };
  }
  const from = atKeep(mark, fromRaw, keep);
  const to = atKeep(mark, toRaw, keep);
  pts.pop();
  const { inPts, outPts } = sewKagariLegs(from, mark, to, kind, bite?.enter, bite?.exit, onStack);
  const head = [...pts, from, ...inPts];
  const toDist = to.distanceToSquared(mark);
  let k = i;
  while (k < piece.length && piece[k]!.distanceToSquared(mark) <= toDist + 1e-8) k++;
  const tail = [...outPts, to, ...piece.slice(k)];
  return { head, tail, outPts };
}

/**
 * TemariKai: start comes up from the wrap; end goes back in.
 * Tucks back under the working stitch, dropping under the cover (r=1).
 * Walking past an outer pin toward the equator is a second knot; walking
 * into the cap is a stub. A parked round emerges at the start and sits
 * on the mari at the end — a closed drawing is not the thread joining itself.
 */
function scoopOnPath(
  at: THREE.Vector3,
  from: THREE.Vector3,
  kind: ThreadKind,
): THREE.Vector3[] {
  const half = unitFromMm(kindMm(kind)) * 0.5;
  const surfaceR = at.length();
  const inner = Math.abs(at.y) / (at.length() || 1) > 0.75;
  // Reflect `from` over `at`: scoopAway then walks back under the stitch.
  const guide = _t.copy(at).multiplyScalar(2).sub(from);
  const units = scoopAway(
    [at.x, at.y, at.z],
    [guide.x, guide.y, guide.z],
    8,
    inner ? 1.2 : undefined,
  );
  const n = units.length;
  if (n === 0) return [];
  return units.map((p, i) => {
    const r = scoopRadius((i + 1) / n, surfaceR, half);
    return new THREE.Vector3(p[0] * r, p[1] * r, p[2] * r);
  });
}

/** Start/stop of a working thread. Tests. */
export function workingThreadScoop(
  at: THREE.Vector3,
  from: THREE.Vector3,
  kind: ThreadKind,
) {
  return scoopOnPath(at, from, kind);
}

function buryWorkingEnds(pts: THREE.Vector3[], kind: ThreadKind): THREE.Vector3[] {
  return buryEnds(pts, kind, true, true);
}

function buryEnds(
  pts: THREE.Vector3[],
  kind: ThreadKind,
  start: boolean,
  stop: boolean,
): THREE.Vector3[] {
  if (pts.length < 2) return pts;
  let out = pts;
  if (start) {
    const head = scoopOnPath(out[0]!, out[1]!, kind);
    if (head.length) out = [...head.reverse(), ...out];
  }
  if (stop && out.length >= 2) {
    const tail = scoopOnPath(out[out.length - 1]!, out[out.length - 2]!, kind);
    if (tail.length) out = [...out, ...tail];
  }
  return out;
}

/**
 * A round that already lies does not change while the next one is sewn, and
 * rebuilding every tube for every stitch cost one long frame per stitch,
 * growing with the flower (0.07 s at eight stitches, 0.47 s at a hundred and
 * fifty). Tubes are therefore kept by the path they were built from: the same
 * points, radius and twist give back the same geometry.
 */
const TUBE_CACHE_MAX = 600;
const tubeCache = new Map<string, THREE.BufferGeometry>();

function tubeKey(
  pts: THREE.Vector3[],
  radius: number,
  taperEnds: boolean,
  closed: boolean,
  uPerUnit: number,
  heightScale: number,
) {
  const parts: string[] = [
    radius.toFixed(5), taperEnds ? "t" : "-", closed ? "c" : "-",
    uPerUnit.toFixed(4), heightScale.toFixed(2),
  ];
  for (const p of pts) parts.push(`${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`);
  return parts.join("|");
}

function cachedTube(
  pts: THREE.Vector3[],
  radius: number,
  taperEnds = false,
  closed = false,
  uPerUnit = 0,
  heightScale = STITCH_FLAT,
) {
  const key = tubeKey(pts, radius, taperEnds, closed, uPerUnit, heightScale);
  const hit = tubeCache.get(key);
  if (hit) {
    // Touch: the oldest entry is the first to go when the cache is full.
    tubeCache.delete(key);
    tubeCache.set(key, hit);
    return hit;
  }
  const geo = tubeOnSphere(pts, radius, taperEnds, closed, uPerUnit, heightScale);
  geo.userData.cached = true;
  tubeCache.set(key, geo);
  while (tubeCache.size > TUBE_CACHE_MAX) {
    const oldest = tubeCache.keys().next().value;
    if (oldest === undefined) break;
    tubeCache.get(oldest)?.dispose();
    tubeCache.delete(oldest);
  }
  return geo;
}

function stackedArcCord(
  stitch: Extract<Stitch, { kind: "arc" }>,
  kind: ThreadKind,
) {
  const pts = arcPath(stitch, kind);
  if (pts.length < 2) return new THREE.BufferGeometry();
  // Open working length: emerge from the wrap, bury at the last stitch.
  // Full pearl — the cover hides the ends, so no taper and no coin.
  return cachedTube(buryWorkingEnds(pts, kind), stitchRadius(kind), false, false,
    twistPerUnit(kind));
}

function stackedArcChain(
  chain: Extract<Stitch, { kind: "arc" }>[],
  kind: ThreadKind,
) {
  const ok = stackedArcChainParts(chain, kind);
  if (ok.length === 0) return new THREE.BufferGeometry();
  if (ok.length === 1) return ok[0]!;
  return mergeGeometries(ok, false) ?? ok[0]!;
}

/** The kept tubes a working thread is made of, one per kai it lies in. */
function stackedArcChainParts(
  chain: Extract<Stitch, { kind: "arc" }>[],
  kind: ThreadKind,
): THREE.BufferGeometry[] {
  if (chain.length === 1) {
    const one = stackedArcCord(chain[0]!, kind);
    return (one.getAttribute("position")?.count ?? 0) > 0 ? [one] : [];
  }
  const parts: THREE.BufferGeometry[] = [];
  const tube = (pts: THREE.Vector3[], buryStart: boolean, buryStop: boolean) => {
    if (pts.length < 2) return;
    parts.push(cachedTube(
      buryEnds(pts, kind, buryStart, buryStop),
      stitchRadius(kind),
      false,
      false,
      twistPerUnit(kind),
    ));
  };
  const keep2 = unitFromMm(KAGARI_SCOOP_MM) * unitFromMm(KAGARI_SCOOP_MM);
  let pts: THREE.Vector3[] = [];
  let kai0 = chain[0]?.kai;
  let prevBite: { enter: [number, number, number]; exit: [number, number, number] } | undefined;
  let prevTip: "inner" | "outer" | undefined;
  let emerge = true;
  let pending: THREE.Vector3[] | null = null;
  let kaiFirst: Extract<Stitch, { kind: "arc" }> | undefined;
  const joinAt = (piece: THREE.Vector3[]) => {
    const mark = pts[pts.length - 1]!;
    const onStack = prevTip === "inner"
      || (prevTip !== "outer" && Math.abs(mark.y) / (mark.length() || 1) > 0.75);
    return splitJoinAroundMark(pts, piece, mark, kind, prevBite, onStack);
  };
  const closeKai = () => {
    if (pending && kaiFirst && pts.length > 1 && prevTip === "inner") {
      const firstPiece = arcPath(kaiFirst, kind);
      const mark = pts[pts.length - 1]!;
      const next0 = firstPiece[0];
      if (next0 && firstPiece.length > 1 && samePin(mark, next0)) {
        const { head, outPts } = joinAt(firstPiece);
        tube(head, false, false);
        const start = pending.slice();
        while (start.length > 2 && start[0]!.distanceToSquared(mark) < keep2) start.shift();
        tube([...outPts, ...start], false, false);
        pending = null;
        pts = [];
        return;
      }
    }
    if (pending) {
      tube(pending, emerge, false);
      pending = null;
      if (pts.length >= 2) tube(pts, false, true);
    } else if (pts.length >= 2) {
      tube(pts, emerge, true);
    }
    pts = [];
  };
  const joinPiece = (piece: THREE.Vector3[]) => {
    if (pts.length === 0) {
      pts.push(...piece);
      return;
    }
    const mark = pts[pts.length - 1]!;
    const next0 = piece[0]!;
    if (samePin(mark, next0) && pts.length > 1 && piece.length > 1) {
      const { head, tail } = joinAt(piece);
      if (pending === null) pending = head;
      else tube(head, false, false);
      pts = tail;
      emerge = false;
      return;
    }
    const start = nearVec(mark, next0) ? 1 : 0;
    for (let k = start; k < piece.length; k++) pts.push(piece[k]!);
  };
  for (let i = 0; i < chain.length; i++) {
    const s = chain[i]!;
    const piece = arcPath(s, kind);
    if (s.kai !== kai0 && pts.length) {
      const next0 = piece[0];
      const resume = !!(next0 && piece.length > 1 && pts.length > 1
        && samePin(pts[pts.length - 1]!, next0));
      if (resume) {
        if (pending) {
          tube(pending, emerge, false);
          pending = null;
        }
        emerge = false;
        kaiFirst = s;
      } else {
        closeKai();
        emerge = true;
        prevBite = undefined;
        prevTip = undefined;
        kaiFirst = undefined;
      }
      kai0 = s.kai;
    }
    if (piece.length < 2) continue;
    if (!kaiFirst) kaiFirst = s;
    joinPiece(piece);
    prevBite = s.bite;
    prevTip = s.tip;
  }
  closeKai();
  return parts.filter((g) => (g.getAttribute("position")?.count ?? 0) > 0);
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
  const sitAts = stitch.sitAts;
  const uniform = stitch.lift ?? 0;
  const via = stitch.via ?? [];
  const pts: THREE.Vector3[] = [];
  if (via.length === 0) {
    for (let i = 0; i <= ARC_SEGS; i++) {
      const t = i / ARC_SEGS;
      const stacked = Math.min(3, stackBump(t, sitA, sitB, sitMid, sitMidT, sitAts));
      const extra = uniform + stacked * diameter * STACK_LIFT;
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
        const stacked = Math.min(3, stackBump(t, sitA, sitB, sitMid, sitMidT, sitAts));
        const extra = uniform + stacked * diameter * STACK_LIFT;
        slerpUnit(a, b, i, _a);
        pts.push(_a.clone().multiplyScalar(1 + half + extra));
      }
    }
  }
  return ribbonFromPoints(pts, width, false);
}

/**
 * Pearl cotton is 2-ply with a visible helix; one full turn takes this many of
 * the cord's own diameters. Two estimates, neither of them a manufacturer's
 * figure — nobody publishes the twist of coton perlé:
 *
 * - measured off macro photographs of DMC perle #5 (Needle 'n Thread): the
 *   slope of the plies at the centre of the silhouette is 43°, which is a pitch
 *   of 3.4 diameters, and counting the bands along the cord gives 3.7–3.9;
 * - calculated from sourced yarn data (5/2 = Ne 5 singles, twist-multiplier
 *   rules, 7–15 turns per inch for comparable mercerised plied cottons):
 *   230–350 turns per metre, a pitch of 4–6 diameters, angle 28–38°.
 *
 * 3.6 is the photographic reading, which is the one about appearance. The first
 * value here was 1.8 — an angle of 60°, a hard rope — and the owner said so.
 */
export const PERLE_TWIST_PITCH = 3.6;

function twistPerUnit(kind: ThreadKind) {
  const pitch = unitFromMm(kindMm(kind)) * PERLE_TWIST_PITCH;
  return pitch > 0 ? 1 / pitch : 0;
}

/**
 * One tile = one twist along the cord × once around it, so the bands meet
 * themselves at every edge: band(v - u) with two plies is seamless in both.
 */
function makePerleTexture(relief: boolean) {
  const w = 128;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const ctx = canvas.getContext("2d");
  if (!ctx) return tex;
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      // Two plies: the phase runs twice around while the helix advances once.
      //
      // Handedness, which is easy to get backwards: the ring angle turns from
      // the outward axis towards tangent x outward, a right-handed screw along
      // the thread, so on the geometry's own v this would be a Z twist — but a
      // texture is sampled with flipY on (three.js default, checked), so the
      // drawn v is 1 - v and the helix comes out left-handed. That is S, which
      // is what pearl cotton is: «mercerized, 100% cotton, S-twisted, 2-ply
      // thread» (needlery.org, Pearl Cotton & Floss). Flipping this sign draws
      // a Z twist — the wrong thread.
      const phase = 2 * (v - u);
      const across = Math.abs(((phase % 1) + 1.5) % 1 - 0.5) * 2; // 0 at the crown, 1 in the groove
      const round = Math.cos(across * Math.PI * 0.5); // a ply is round, not flat
      const level = relief ? round : 0.82 + 0.18 * round;
      const value = Math.max(0, Math.min(255, Math.round(level * 255)));
      const i = (y * w + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  tex.needsUpdate = true;
  return tex;
}

let perle: THREE.CanvasTexture | null = null;
let perleBump: THREE.CanvasTexture | null = null;

/** Colour map of a pearl cord: the plies keep the thread's own colour. */
export function getPerleTexture() {
  if (!perle) perle = makePerleTexture(false);
  return perle;
}

/** Height of the same plies, for the relief of the twist. */
export function getPerleBump() {
  if (!perleBump) perleBump = makePerleTexture(true);
  return perleBump;
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

/**
 * The motif as the pieces it is made of. Merging them costs a copy of the whole
 * flower, and the workshop rebuilds after every stitch: at a hundred and sixty
 * stitches that copy alone was 0.2 s, one long frame per stitch. Drawing the
 * pieces as they are keeps the kept tubes untouched.
 */
export function createMotifGeometryParts(
  stitches: Stitch[],
  colorIndex: number,
  kind = DEFAULT_KIND.stitch,
): THREE.BufferGeometry[] {
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
      parts.push(...stackedArcChainParts(chain, kind));
    }
  } else {
    for (const stitch of arcs) {
      parts.push(stackedArcRibbon(stitch, width, kind));
    }
  }
  return parts;
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
  // A kept tube outlives the merge that copied it; only fresh parts go.
  for (const geo of parts) if (!geo.userData.cached) geo.dispose();
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
  /**
   * Texture repeats per unit of length. 0 keeps the old 0..1 across the piece;
   * a positive value makes one repeat a fixed length, so a long stitch and a
   * short one carry the same twist.
   */
  uPerUnit = 0,
  /** 1 = round cord (wrap). <1 flattens onto the mari (kagari). */
  heightScale = 1,
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
    const h = Math.max(0.2, heightScale);
    for (let j = 0; j <= radialSegs; j++) {
      const ang = (j / radialSegs) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      // `_side` is off the mari; `_mid` is across the stitch. Flatten height.
      const nx = (_side.x * c * h + _mid.x * s) * r;
      const ny = (_side.y * c * h + _mid.y * s) * r;
      const nz = (_side.z * c * h + _mid.z * s) * r;
      pos.push(p.x + nx, p.y + ny, p.z + nz);
      const gx = _side.x * c / h + _mid.x * s;
      const gy = _side.y * c / h + _mid.y * s;
      const gz = _side.z * c / h + _mid.z * s;
      const nl = Math.hypot(gx, gy, gz) || 1;
      nrm.push(gx / nl, gy / nl, gz / nl);
      uv.push(uPerUnit > 0 ? (along[i] ?? 0) * uPerUnit : i / Math.max(1, nPath - 1),
        j / radialSegs);
    }
  }
  const wallSegs = closed ? nPath : nPath - 1;
  for (let i = 0; i < wallSegs; i++) {
    const i0 = i;
    const i1 = (i + 1) % nPath;
    for (let j = 0; j < radialSegs; j++) {
      const a = i0 * ring + j;
      const b = i1 * ring + j;
      // side × (tangent × side) points along the path. Wind the wall
      // outward so FrontSide draws the near surface, not the inside wall.
      idx.push(a, a + 1, b, b, a + 1, b + 1);
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
