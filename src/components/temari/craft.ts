import * as THREE from "three";
import type { Stitch, Vec3 } from "./patterns";

export type Craft = "wind" | "pin" | "stitch";

export const CRAFT_LIST: Craft[] = ["wind", "pin", "stitch"];

export const CRAFT_META: Record<Craft, { label: string; hint: string }> = {
  wind: {
    label: "Намотка",
    hint: "полный круг — потом чуть повернуть, не в середине витка",
  },
  pin: {
    label: "Дзивари",
    hint: "тонкие нити поверх базы — булавка только метит угол",
  },
  stitch: {
    label: "Кагари",
    hint: "кику на полюсах, или своя фигура по меткам",
  },
};

export function isCraft(value: unknown): value is Craft {
  return value === "wind" || value === "pin" || value === "stitch";
}

export type Pin = { id: string; p: Vec3 };
export type PinArc = { a: Vec3; b: Vec3; color: number };

const W = 1536;
const H = 768;
const PW = 512;
const MIN_DOT = 0.9994;
const MAX_LIVE = 400;
const MAX_STRANDS = 96;
const MAX_JOINS = 16;
const POINTS_PER_STRAND = 6000;
const TWO_PI = Math.PI * 2;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function toVec3(v: THREE.Vector3): Vec3 {
  const len = v.length() || 1;
  return [v.x / len, v.y / len, v.z / len];
}

export function pinHit(local: Vec3, pins: Pin[], minDot = 0.985): number {
  let best = -1;
  let score = minDot;
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i].p;
    const d = p[0] * local[0] + p[1] * local[1] + p[2] * local[2];
    if (d > score) {
      score = d;
      best = i;
    }
  }
  return best;
}

export function arcsToStitches(arcs: PinArc[]): Stitch[] {
  return arcs.map((arc) => ({ kind: "arc" as const, a: arc.a, b: arc.b, color: arc.color }));
}

function toUV(p: THREE.Vector3): [number, number] {
  const u = Math.atan2(p.x, p.z) / (Math.PI * 2) + 0.5;
  const v = 0.5 - Math.asin(clamp(p.y, -1, 1)) / Math.PI;
  return [((u % 1) + 1) % 1, clamp(v, 0, 1)];
}

const FIB_N = 2048;
const FIB_GOLDEN = Math.PI * (3 - Math.sqrt(5));
const FIB_UV: [number, number][] = Array.from({ length: FIB_N }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / FIB_N;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const th = FIB_GOLDEN * i;
  const u = Math.atan2(r * Math.cos(th), r * Math.sin(th)) / (Math.PI * 2) + 0.5;
  const v = 0.5 - Math.asin(clamp(y, -1, 1)) / Math.PI;
  return [((u % 1) + 1) % 1, clamp(v, 0, 1)];
});

const _slerpA = new THREE.Vector3();
const _slerpB = new THREE.Vector3();
const _slerpMid = new THREE.Vector3();
const _segP = new THREE.Vector3();

function slerpOnto(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
) {
  const dot = clamp(a.dot(b), -1, 1);
  const theta = Math.acos(dot);
  if (theta < 1e-4) return out.copy(a);
  if (theta > Math.PI - 1e-4) {
    const axis = Math.abs(a.y) < 0.9 ? _slerpA.set(0, 1, 0) : _slerpA.set(1, 0, 0);
    _slerpMid.crossVectors(a, axis).normalize();
    if (t < 0.5) return slerpOnto(a, _slerpMid, t * 2, out);
    return slerpOnto(_slerpMid, b, t * 2 - 1, out);
  }
  const s = Math.sin(theta);
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - t) * theta) / s)
    .addScaledVector(b, Math.sin(t * theta) / s)
    .normalize();
}

let polarN: CanvasRenderingContext2D | null = null;
let polarS: CanvasRenderingContext2D | null = null;

function stampStereo(
  ctx: CanvasRenderingContext2D,
  p: THREE.Vector3,
  hex: string,
  width: number,
  north: boolean,
) {
  const y = north ? p.y : -p.y;
  if (y < -0.02) return;
  const s = 0.5 / Math.max(1e-4, 1 + y);
  const u = 0.5 + p.x * s;
  const v = 0.5 + p.z * s;
  if (u < -0.08 || u > 1.08 || v < -0.08 || v > 1.08) return;
  const r = Math.max(2.6, width * 0.62 * (PW / H));
  ctx.fillStyle = hex;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(u * PW, v * PW, r, 0, Math.PI * 2);
  ctx.fill();
}

function stampDot(
  ctx: CanvasRenderingContext2D,
  p: THREE.Vector3,
  hex: string,
  width: number,
) {
  const ay = Math.abs(p.y);
  ctx.fillStyle = hex;
  ctx.globalAlpha = 1;
  // Equirect smear at the poles is not a thread. Polar canvases own |y| ≳ 0.75.
  if (ay < 0.76) {
    const [u, v] = toUV(p);
    const sinT = Math.max(0.42, Math.sqrt(Math.max(0, 1 - p.y * p.y)));
    const ry = Math.max(1.6, width * 0.46);
    const rx = Math.min(ry * 2.1, ry / sinT);
    for (const shift of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.ellipse((u + shift) * W, v * H, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (ay > 0.48) {
    if (polarN) stampStereo(polarN, p, hex, width, true);
    if (polarS) stampStereo(polarS, p, hex, width, false);
  }
}

function strokeSeg(
  ctx: CanvasRenderingContext2D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  hex: string,
  width: number,
) {
  // Equirect lines near the geographic poles are not great circles — they
  // fold. Stamp along the 3D geodesic instead of stroking UV chords.
  stampDot(ctx, a, hex, width);
  stampDot(ctx, b, hex, width);
}

function stroke(
  ctx: CanvasRenderingContext2D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  hex: string,
  width: number,
) {
  const theta = Math.acos(clamp(a.dot(b), -1, 1));
  const poleish = Math.max(Math.abs(a.y), Math.abs(b.y));
  const step = poleish > 0.72 ? 0.008 : 0.018;
  const steps = Math.max(1, Math.ceil(theta / step));
  _slerpA.copy(a);
  for (let i = 1; i <= steps; i++) {
    slerpOnto(a, b, i / steps, _slerpB);
    stampDot(ctx, _slerpB, hex, width);
    _slerpA.copy(_slerpB);
  }
}

type Strand = { color: number; hex: string; points: THREE.Vector3[] };

function makeWrapTex(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 1;
  texture.premultiplyAlpha = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class WrapBuffer {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  readonly polarN: THREE.CanvasTexture;
  readonly polarS: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private poleN: HTMLCanvasElement;
  private poleS: HTMLCanvasElement;
  private probe: HTMLCanvasElement;
  private probeCtx: CanvasRenderingContext2D;
  private strands: Strand[] = [];
  private last: THREE.Vector3 | null = null;
  live: THREE.Vector3[] = [];
  liveColor = "#8f3d32";
  strokeWidth = 9;
  joins: THREE.Vector3[] = [];
  covered = 0;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("wrap canvas");
    this.ctx = ctx;
    this.poleN = document.createElement("canvas");
    this.poleN.width = PW;
    this.poleN.height = PW;
    const nctx = this.poleN.getContext("2d", { alpha: true });
    if (!nctx) throw new Error("wrap polar N");
    this.poleS = document.createElement("canvas");
    this.poleS.width = PW;
    this.poleS.height = PW;
    const sctx = this.poleS.getContext("2d", { alpha: true });
    if (!sctx) throw new Error("wrap polar S");
    polarN = nctx;
    polarS = sctx;
    this.probe = document.createElement("canvas");
    this.probe.width = 192;
    this.probe.height = 96;
    const pctx = this.probe.getContext("2d", { alpha: true });
    if (!pctx) throw new Error("wrap probe");
    this.probeCtx = pctx;
    this.texture = makeWrapTex(this.canvas);
    this.polarN = makeWrapTex(this.poleN);
    this.polarS = makeWrapTex(this.poleS);
    this.polarN.wrapS = THREE.ClampToEdgeWrapping;
    this.polarS.wrapS = THREE.ClampToEdgeWrapping;
  }

  get strandCount() {
    return this.strands.length;
  }

  yarn(): Strand[] {
    return this.strands;
  }

  snapshot() {
    const poleN = this.ctx.getImageData(W / 2, 1, 1, 1).data;
    const poleS = this.ctx.getImageData(W / 2, H - 2, 1, 1).data;
    return {
      wraps: this.strands.length,
      joins: this.joins.length,
      live: this.live.length,
      hex: this.liveColor,
      colors: this.strands.map((s) => s.color),
      covered: this.covered,
      poleN: [poleN[0], poleN[1], poleN[2], poleN[3]],
      poleS: [poleS[0], poleS[1], poleS[2], poleS[3]],
    };
  }

  addPoint(local: THREE.Vector3, color: number, hex: string, dense = false) {
    const p = local.clone().normalize();
    const current = this.strands[this.strands.length - 1];
    const colorChange = !current || current.color !== color;
    if (colorChange) {
      if (this.last) {
        if (this.joins.length >= MAX_JOINS) this.joins.shift();
        this.joins.push(this.last.clone());
        if (this.last.dot(p) > 0.2) {
          stroke(this.ctx, this.last, p, hex, this.strokeWidth);
        }
      }
      if (this.strands.length >= MAX_STRANDS) this.strands.shift();
      this.strands.push({
        color,
        hex,
        points: this.last && this.last.dot(p) > 0.2 ? [this.last.clone(), p] : [p],
      });
      stampDot(this.ctx, p, hex, this.strokeWidth);
      this.last = p;
      this.live = [p.clone()];
      this.liveColor = hex;
      this.markDirty();
      return true;
    }
    if (this.last && this.last.dot(p) > MIN_DOT) return false;
    if (this.last) {
      const origin = this.last;
      const theta = Math.acos(clamp(origin.dot(p), -1, 1));
      const steps = dense ? 1 : Math.max(1, Math.ceil(theta / 0.045));
      for (let i = 1; i <= steps; i++) {
        slerpOnto(origin, p, i / steps, _segP);
        const q = _segP.clone();
        stroke(this.ctx, this.last, q, hex, this.strokeWidth);
        current.points.push(q);
        this.live.push(q);
        this.last = q;
      }
      if (current.points.length > POINTS_PER_STRAND) {
        this.strands.push({ color, hex, points: [this.last.clone()] });
      }
      if (this.live.length > MAX_LIVE) this.live.splice(0, this.live.length - MAX_LIVE);
      this.liveColor = hex;
      this.markDirty();
    }
    return true;
  }

  sampleCoverage() {
    const pw = this.probe.width;
    const ph = this.probe.height;
    this.probeCtx.clearRect(0, 0, pw, ph);
    this.probeCtx.drawImage(this.canvas, 0, 0, pw, ph);
    const data = this.probeCtx.getImageData(0, 0, pw, ph).data;
    let hit = 0;
    for (let i = 0; i < FIB_N; i++) {
      const uv = FIB_UV[i];
      if (!uv) continue;
      const x = Math.min(pw - 1, (uv[0] * pw) | 0);
      const y = Math.min(ph - 1, (uv[1] * ph) | 0);
      if (data[(y * pw + x) * 4 + 3] > 48) hit += 1;
    }
    this.covered = hit / FIB_N;
    return this.covered;
  }

  /** Start a new strand at p without drawing a skip across the mari. */
  relocate(local: THREE.Vector3, color: number, hex: string) {
    const p = local.clone().normalize();
    if (this.last) {
      if (this.joins.length >= MAX_JOINS) this.joins.shift();
      this.joins.push(this.last.clone());
    }
    if (this.strands.length >= MAX_STRANDS) this.strands.shift();
    this.strands.push({ color, hex, points: [p] });
    stampDot(this.ctx, p, hex, this.strokeWidth);
    this.last = p;
    this.live = [p.clone()];
    this.liveColor = hex;
    this.markDirty();
  }

  undo() {
    this.strands.pop();
    this.joins.pop();
    this.redraw();
  }

  reset() {
    this.strands = [];
    this.joins = [];
    this.covered = 0;
    this.redraw();
  }

  private markDirty() {
    this.texture.needsUpdate = true;
    this.polarN.needsUpdate = true;
    this.polarS.needsUpdate = true;
  }

  private redraw() {
    this.ctx.clearRect(0, 0, W, H);
    polarN?.clearRect(0, 0, PW, PW);
    polarS?.clearRect(0, 0, PW, PW);
    for (const strand of this.strands) {
      for (let i = 1; i < strand.points.length; i++) {
        const a = strand.points[i - 1];
        const b = strand.points[i];
        if (a && b) stroke(this.ctx, a, b, strand.hex, this.strokeWidth);
      }
      const first = strand.points[0];
      if (first) stampDot(this.ctx, first, strand.hex, this.strokeWidth);
    }
    const last = this.strands[this.strands.length - 1];
    this.last = last?.points[last.points.length - 1] ?? null;
    this.live = last ? last.points.slice(-MAX_LIVE).map((p) => p.clone()) : [];
    this.liveColor = last?.hex ?? this.liveColor;
    this.markDirty();
    this.sampleCoverage();
  }

  dispose() {
    this.texture.dispose();
    this.polarN.dispose();
    this.polarS.dispose();
  }
}

let wrap: WrapBuffer | null = null;

export function getWrapBuffer(): WrapBuffer {
  if (!wrap) wrap = new WrapBuffer();
  return wrap;
}

export function resetWrapBuffer() {
  wrap?.reset();
}

export function strokePx(thickness: number) {
  const t = Math.max(0, Math.min(1, thickness));
  return (H / 512) * (3.4 + t * 5.8);
}

/**
 * Base wrap (maki): always a great circle — the largest circumference.
 * Interactive wrapping follows how the mari is turned (the spin equator).
 * The plane may tilt only a little, as in the hands; the thread never kinks.
 * Auto-fill (title / finish) still walks random great circles to cover.
 */
export class MariWinder {
  s = 0;
  sNeeded = 420;
  wrapCount = 0;
  private axis = new THREE.Vector3(1, 0, 0);
  private pole = new THREE.Vector3(0, 1, 0);
  private dir = new THREE.Vector3(0, 0, 1);
  private tmp = new THREE.Vector3();
  private perp = new THREE.Vector3();
  private east = new THREE.Vector3(1, 0, 0);
  private north = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private qTo = new THREE.Quaternion();
  private arc = 0;
  private lambda = 0;
  private tilt = 0.18;
  private cover = 0;
  private sinceCover = 0;
  private locked = false;
  private lastAimT = 0;
  /** +1 / −1 after the first drag; 0 = not chosen yet. */
  private sense = 0;
  private pendingSteer: THREE.Vector3 | null = null;

  reset(thickness: number) {
    const t = Math.max(0, Math.min(1, thickness));
    this.s = 0;
    this.wrapCount = 0;
    this.arc = 0;
    this.lambda = 0;
    this.cover = 0;
    this.sinceCover = 0;
    this.lastAimT = 0;
    this.sense = 0;
    this.pendingSteer = null;
    const ang = (strokePx(t) * Math.PI) / H;
    this.tilt = Math.max(0.07, ang * 1.6);
    this.sNeeded = TWO_PI * (64 + (1 - t) * 28);
    this.pole.set(0, 1, 0);
    this.axis.set(0.28, 0.94, 0.18).normalize();
    this.dir.crossVectors(this.axis, new THREE.Vector3(1, 0, 0));
    if (this.dir.lengthSq() < 0.05) this.dir.crossVectors(this.axis, new THREE.Vector3(0, 0, 1));
    this.dir.normalize();
    this.lambda = 0;
    this.locked = false;
  }

  get progress() {
    return Math.max(0, Math.min(1, this.cover));
  }

  get hasPlane() {
    return this.locked;
  }

  copyAxis(out: THREE.Vector3) {
    return out.copy(this.axis);
  }

  get windSign() {
    return this.sense === 0 ? 1 : this.sense;
  }

  /**
   * First drag locks winding sense. Reverse never unwinds:
   * vis is always that sense, mag is always laid as yarn.
   */
  commitSpin(ang: number) {
    const mag = Math.abs(ang);
    if (mag < 1e-6) return { mag: 0, vis: 0, against: false };
    if (this.sense === 0 && mag > 0.01) this.sense = ang > 0 ? 1 : -1;
    const sign = this.sense === 0 ? (ang > 0 ? 1 : -1) : this.sense;
    const against = this.sense !== 0 && (ang > 0 ? 1 : -1) !== this.sense;
    return { mag, vis: sign * mag, against };
  }

  /** Test helper: set the spin axis; poles are rebuilt perpendicular. */
  forceAxis(x: number, y: number, z: number) {
    this.tmp.set(x, y, z).normalize();
    if (this.tmp.lengthSq() < 0.2) return;
    this.q.setFromUnitVectors(this.axis, this.tmp);
    this.axis.copy(this.tmp);
    this.pole.applyQuaternion(this.q);
    this.dir.applyQuaternion(this.q);
    this.pole.addScaledVector(this.axis, -this.pole.dot(this.axis)).normalize();
    if (this.pole.lengthSq() < 0.05) {
      this.pole.crossVectors(this.axis, new THREE.Vector3(0, 1, 0));
      if (this.pole.lengthSq() < 0.05) this.pole.crossVectors(this.axis, new THREE.Vector3(1, 0, 0));
      this.pole.normalize();
    }
    this.keepOnEquator();
    this.locked = true;
    this.lastAimT = performance.now();
  }

  reorigin(point: THREE.Vector3, from?: THREE.Vector3 | null) {
    this.tmp.copy(point).normalize();
    this.arc = 0;
    const at = from ? from.clone().normalize() : this.tmp.clone();
    this.dir.copy(at);
    const ref = Math.abs(at.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    this.axis.crossVectors(at, ref).normalize();
    if (this.axis.lengthSq() < 0.05) this.axis.set(1, 0, 0);
  }

  private keepOnEquator() {
    this.dir.addScaledVector(this.axis, -this.dir.dot(this.axis)).normalize();
    if (this.dir.lengthSq() < 0.05) {
      this.dir.crossVectors(this.axis, new THREE.Vector3(0, 1, 0));
      if (this.dir.lengthSq() < 0.05) this.dir.crossVectors(this.axis, new THREE.Vector3(1, 0, 0));
      this.dir.normalize();
    }
  }

  /**
   * Remember how the hands want to turn — applied only when a lap closes.
   * Mid-wrap the plane is frozen: the thread is already on that equator.
   */
  noteSwipe(proposed: THREE.Vector3) {
    this.tmp.copy(proposed).normalize();
    if (this.tmp.lengthSq() < 0.2) return;
    if (!this.pendingSteer) this.pendingSteer = new THREE.Vector3();
    this.pendingSteer.copy(this.tmp);
  }

  /**
   * Hands turn the mari: the swipe axis becomes the next wrap plane.
   * Always the same hemisphere as the current axis, so winding sense stays.
   * Only call at lap boundary — not while a wrap is open.
   */
  steer(proposed: THREE.Vector3, mag: number) {
    this.tmp.copy(proposed).normalize();
    if (this.tmp.lengthSq() < 0.2) return;
    if (this.tmp.dot(this.axis) < 0) this.tmp.negate();
    this.lastAimT = performance.now();
    this.qTo.setFromUnitVectors(this.axis, this.tmp);
    const turn = 2 * Math.acos(clamp(this.qTo.w, -1, 1));
    if (turn < 1e-4) {
      this.locked = true;
      return;
    }
    const cap = Math.min(this.tilt * 2.4 + 0.04, Math.max(0.02, mag) * 0.7);
    const t = Math.min(1, cap / turn);
    this.q.identity().slerp(this.qTo, t);
    this.axis.applyQuaternion(this.q).normalize();
    this.dir.applyQuaternion(this.q);
    this.keepOnEquator();
    this.locked = true;
  }

  aim(spinAxis: THREE.Vector3) {
    const now = performance.now();
    const dt = this.lastAimT ? Math.min(0.048, (now - this.lastAimT) / 1000) : 0.016;
    this.steer(spinAxis, this.locked ? 0.85 * dt : 2.2 * dt);
  }

  /**
   * After a full lap the plane may move — not in the middle of a wrap.
   * A little: about a thread-width, toward the last swipe if there was one.
   */
  private nextWrap() {
    if (this.pendingSteer) {
      this.steer(this.pendingSteer, this.tilt * 3);
      this.pendingSteer = null;
      return;
    }
    this.perp.crossVectors(this.axis, this.dir);
    if (this.perp.lengthSq() < 1e-8) this.perp.set(0, 1, 0);
    this.perp.normalize();
    const heading = 0.4 + 0.9 * (0.5 + 0.5 * Math.sin(this.s * 0.17 + this.wrapCount * 0.7));
    this.q.setFromAxisAngle(this.axis, heading);
    this.perp.applyQuaternion(this.q);
    this.q.setFromAxisAngle(this.perp, this.tilt);
    this.axis.applyQuaternion(this.q).normalize();
    this.keepOnEquator();
  }

  /** Hands tuck the mari under the thread — used when the drag goes against sense. */
  tuck(amount: number) {
    const a = Math.min(0.2, Math.max(0.02, amount));
    this.perp.crossVectors(this.axis, this.dir);
    if (this.perp.lengthSq() < 1e-8) this.perp.set(0, 1, 0);
    this.perp.normalize();
    this.q.setFromAxisAngle(this.axis, 0.35 + a);
    this.perp.applyQuaternion(this.q);
    this.q.setFromAxisAngle(this.perp, this.tilt + a * 0.45);
    this.axis.applyQuaternion(this.q).normalize();
    this.keepOnEquator();
    this.arc = 0;
  }

  /** Yarn along the current equator. After a full lap the plane turns
   *  so the next circle is not beside the last. */
  spin(dAngle: number, buffer: WrapBuffer, color: number, hex: string) {
    if (dAngle <= 1e-6) return;
    let left = dAngle;
    const h0 = 0.032;
    while (left > 1e-6) {
      const h = Math.min(h0, left);
      this.q.setFromAxisAngle(this.axis, h);
      this.dir.applyQuaternion(this.q);
      this.arc += h;
      if (this.arc >= TWO_PI) {
        this.arc -= TWO_PI;
        this.nextWrap();
        buffer.relocate(this.dir, color, hex);
      } else {
        buffer.addPoint(this.dir, color, hex, true);
      }
      this.s += h;
      this.sinceCover += h;
      left -= h;
      this.wrapCount = Math.floor(this.s / TWO_PI);
    }
    if (this.sinceCover > 0.55) {
      this.sinceCover = 0;
      this.cover = buffer.sampleCoverage();
    }
  }

  follow(
    spinAxis: THREE.Vector3,
    dAngle: number,
    buffer: WrapBuffer,
    color: number,
    hex: string,
  ) {
    this.aim(spinAxis);
    this.spin(dAngle, buffer, color, hex);
  }

  fill(buffer: WrapBuffer, color: number, hex: string) {
    let guard = 0;
    while (this.cover < 0.96 && guard < 10) {
      this.advance(buffer, TWO_PI * 24, color, hex, 0.08);
      this.cover = buffer.sampleCoverage();
      guard++;
    }
  }

  advance(buffer: WrapBuffer, ds: number, color: number, hex: string, step = 0.07) {
    if (ds <= 0) return;
    if (this.cover >= 0.985) return;
    let left = ds;
    const h0 = Math.max(0.05, step);
    while (left > 1e-6) {
      if (this.cover >= 0.985) break;
      const h = Math.min(h0, left);
      this.q.setFromAxisAngle(this.axis, h);
      this.dir.applyQuaternion(this.q);
      this.arc += h;
      if (this.arc >= TWO_PI) {
        this.arc -= TWO_PI;
        this.nextWrap();
        this.cover = buffer.sampleCoverage();
        buffer.relocate(this.dir, color, hex);
      } else {
        buffer.addPoint(this.dir, color, hex, true);
      }
      this.s += h;
      left -= h;
      this.wrapCount = Math.floor(this.s / TWO_PI);
    }
  }
}
