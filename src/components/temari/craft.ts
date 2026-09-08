import * as THREE from "three";
import type { Stitch, Vec3 } from "./patterns";

export type Craft = "wind" | "pin" | "stitch";

export const CRAFT_LIST: Craft[] = ["wind", "pin", "stitch"];

export const CRAFT_META: Record<Craft, { label: string; hint: string }> = {
  wind: {
    label: "Намотка",
    hint: "меридианы: один палец мотает, два — поворот",
  },
  pin: {
    label: "Метки",
    hint: "тык на узел сетки — угол фигуры",
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

const _slerpA = new THREE.Vector3();
const _slerpB = new THREE.Vector3();
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
  const s = Math.sin(theta);
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - t) * theta) / s)
    .addScaledVector(b, Math.sin(t * theta) / s)
    .normalize();
}

function stampDot(
  ctx: CanvasRenderingContext2D,
  p: THREE.Vector3,
  hex: string,
  width: number,
) {
  const [u, v] = toUV(p);
  ctx.fillStyle = hex;
  ctx.globalAlpha = 1;
  const polar = Math.abs(p.y) > 0.82;
  const r = polar ? Math.max(1.6, width * 0.22) : Math.max(2.0, width * 0.48);
  for (const shift of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.arc((u + shift) * W, v * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function strokeSeg(
  ctx: CanvasRenderingContext2D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  hex: string,
  width: number,
) {
  let [u0, v0] = toUV(a);
  let [u1, v1] = toUV(b);
  if (u1 - u0 > 0.5) u1 -= 1;
  else if (u0 - u1 > 0.5) u1 += 1;
  const longUv = Math.abs(u1 - u0) > 0.04 || Math.abs(v1 - v0) > 0.05;
  const nearPole = Math.abs(a.y) > 0.72 || Math.abs(b.y) > 0.72;
  if (longUv || nearPole) {
    stampDot(ctx, a, hex, width);
    stampDot(ctx, b, hex, width);
    return;
  }
  ctx.strokeStyle = hex;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const line = (alpha: number, w: number, x0: number, y0: number, x1: number, y1: number) => {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0 * W, y0 * H);
    ctx.lineTo(x1 * W, y1 * H);
    ctx.stroke();
  };
  const paint = (alpha: number, w: number) => {
    for (const shift of [-1, 0, 1]) {
      line(alpha, w, u0 + shift, v0, u1 + shift, v1);
    }
  };
  paint(1, width * 1.18);
  paint(1, width);
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
  const step = poleish > 0.65 ? 0.01 : 0.028;
  const steps = Math.max(1, Math.ceil(theta / step));
  _slerpA.copy(a);
  for (let i = 1; i <= steps; i++) {
    slerpOnto(a, b, i / steps, _slerpB);
    strokeSeg(ctx, _slerpA, _slerpB, hex, width);
    _slerpA.copy(_slerpB);
  }
}

type Strand = { color: number; hex: string; points: THREE.Vector3[] };

export class WrapBuffer {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
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
    this.probe = document.createElement("canvas");
    this.probe.width = 192;
    this.probe.height = 96;
    const pctx = this.probe.getContext("2d", { alpha: true });
    if (!pctx) throw new Error("wrap probe");
    this.probeCtx = pctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 1;
    this.texture.premultiplyAlpha = true;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
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
      stampDot(this.ctx, p, hex, this.strokeWidth * 1.35);
      this.last = p;
      this.live = [p.clone()];
      this.liveColor = hex;
      this.texture.needsUpdate = true;
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
      this.texture.needsUpdate = true;
    }
    return true;
  }

  sampleCoverage() {
    const pw = this.probe.width;
    const ph = this.probe.height;
    this.probeCtx.clearRect(0, 0, pw, ph);
    this.probeCtx.drawImage(this.canvas, 0, 0, pw, ph);
    const data = this.probeCtx.getImageData(0, 0, pw, ph).data;
    let body = 0;
    let bodyW = 0;
    let poles = 0;
    let poleN = 0;
    for (let y = 0; y < ph; y++) {
      const w = 0.25 + 0.75 * Math.sin(((y + 0.5) / ph) * Math.PI);
      const polar = y < 4 || y >= ph - 4;
      for (let x = 0; x < pw; x++) {
        const a = data[(y * pw + x) * 4 + 3];
        const hit = a > 48 ? 1 : 0;
        body += hit * w;
        bodyW += w;
        if (polar) {
          poles += hit;
          poleN += 1;
        }
      }
    }
    const mid = bodyW > 0 ? body / bodyW : 0;
    const cap = poleN > 0 ? poles / poleN : 1;
    this.covered = Math.min(1, mid * 0.82 + cap * 0.18);
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
    stampDot(this.ctx, p, hex, this.strokeWidth * 1.35);
    this.last = p;
    this.live = [p.clone()];
    this.liveColor = hex;
    this.texture.needsUpdate = true;
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

  private redraw() {
    this.ctx.clearRect(0, 0, W, H);
    for (const strand of this.strands) {
      for (let i = 1; i < strand.points.length; i++) {
        const a = strand.points[i - 1];
        const b = strand.points[i];
        if (a && b) stroke(this.ctx, a, b, strand.hex, this.strokeWidth);
      }
      const first = strand.points[0];
      if (first) stampDot(this.ctx, first, strand.hex, this.strokeWidth * 1.35);
    }
    const last = this.strands[this.strands.length - 1];
    this.last = last?.points[last.points.length - 1] ?? null;
    this.live = last ? last.points.slice(-MAX_LIVE).map((p) => p.clone()) : [];
    this.liveColor = last?.hex ?? this.liveColor;
    this.texture.needsUpdate = true;
    this.sampleCoverage();
  }

  dispose() {
    this.texture.dispose();
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
  return (H / 512) * (12.2 + t * 14);
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

  reset(thickness: number) {
    const t = Math.max(0, Math.min(1, thickness));
    this.s = 0;
    this.wrapCount = 0;
    this.arc = 0;
    this.lambda = 0;
    this.cover = 0;
    this.sinceCover = 0;
    this.lastAimT = 0;
    this.sNeeded = TWO_PI * (52 + (1 - t) * 36);
    const ang = (strokePx(t) * Math.PI) / H;
    this.tilt = ang * 2.2 + 0.1;
    const offset = Math.max(0.028, ang * 0.8);
    const perFamily = Math.max(24, Math.ceil(TWO_PI / offset));
    this.sNeeded = perFamily * TWO_PI * 3;
    this.pole.set(0, 1, 0);
    this.lambda = 0;
    this.locked = true;
    this.rebuildAxis(Math.max(0.032, ang * 0.5));
    this.dir.set(0, 0, 1);
    this.keepOnEquator();
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
   * Turn the meridian family. Pole, spin axis and yarn rotate together.
   */
  aim(spinAxis: THREE.Vector3) {
    this.tmp.copy(spinAxis).normalize();
    if (this.tmp.lengthSq() < 0.2) return;
    if (this.tmp.dot(this.pole) < 0) this.tmp.negate();
    const now = performance.now();
    const dt = this.lastAimT ? Math.min(0.048, (now - this.lastAimT) / 1000) : 0.016;
    this.lastAimT = now;
    this.qTo.setFromUnitVectors(this.pole, this.tmp);
    const turn = 2 * Math.acos(clamp(this.qTo.w, -1, 1));
    if (turn < 1e-4) {
      this.locked = true;
      return;
    }
    const maxTurn = this.locked ? 0.85 * dt : 2.2 * dt;
    const t = Math.min(1, maxTurn / turn);
    this.q.identity().slerp(this.qTo, t);
    this.pole.applyQuaternion(this.q).normalize();
    this.locked = true;
    this.rebuildAxis(0.02);
  }

  private rebuildAxis(miss: number) {
    this.east.crossVectors(this.pole, new THREE.Vector3(1, 0, 0));
    if (this.east.lengthSq() < 0.05) this.east.crossVectors(this.pole, new THREE.Vector3(0, 0, 1));
    this.east.normalize();
    this.north.crossVectors(this.east, this.pole).normalize();
    const ca = Math.cos(miss);
    const sa = Math.sin(miss);
    const cl = Math.cos(this.lambda);
    const sl = Math.sin(this.lambda);
    this.axis
      .copy(this.east)
      .multiplyScalar(ca * cl)
      .addScaledVector(this.north, ca * sl)
      .addScaledVector(this.pole, sa)
      .normalize();
    this.keepOnEquator();
  }

  /** Next meridian: one thread-width at the equator. Planes miss
   *  the pole by half a thread, so they never stack there.
   *  After a full set, the pole turns 90° and the cap is covered. */
  private nextMeridian(offset: number) {
    this.lambda += offset;
    if (this.lambda >= TWO_PI) {
      this.lambda -= TWO_PI;
      this.east.crossVectors(this.pole, new THREE.Vector3(1, 0, 0));
      if (this.east.lengthSq() < 0.05) this.east.crossVectors(this.pole, new THREE.Vector3(0, 0, 1));
      this.east.normalize();
      this.q.setFromAxisAngle(this.east, Math.PI * 0.5);
      this.pole.applyQuaternion(this.q).normalize();
    }
    this.rebuildAxis(offset * 0.5);
  }

  /** Yarn along the current meridian. After a full lap, offset by
   *  thread width — solid wrap, poles do not stack. */
  spin(dAngle: number, buffer: WrapBuffer, color: number, hex: string) {
    if (dAngle <= 1e-6) return;
    let left = dAngle;
    const h0 = 0.032;
    const band = (buffer.strokeWidth * Math.PI) / H;
    const offset = Math.max(0.028, band * 0.8);
    while (left > 1e-6) {
      const h = Math.min(h0, left);
      this.q.setFromAxisAngle(this.axis, h);
      this.dir.applyQuaternion(this.q);
      this.arc += h;
      if (this.arc >= TWO_PI) {
        this.arc -= TWO_PI;
        this.nextMeridian(offset);
      }
      buffer.addPoint(this.dir, color, hex, true);
      this.s += h;
      this.sinceCover += h;
      left -= h;
      this.wrapCount = Math.floor(this.s / TWO_PI);
    }
    this.cover = Math.min(1, this.s / Math.max(this.sNeeded, 1));
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
    this.advance(buffer, this.sNeeded, color, hex, 0.07);
    this.cover = Math.min(1, this.s / Math.max(this.sNeeded, 1));
  }

  advance(buffer: WrapBuffer, ds: number, color: number, hex: string, step = 0.07) {
    if (ds <= 0) return;
    if (this.s >= this.sNeeded) {
      this.cover = 1;
      return;
    }
    let left = Math.min(ds, this.sNeeded - this.s);
    const h0 = Math.max(0.05, step);
    const band = (buffer.strokeWidth * Math.PI) / H;
    const offset = Math.max(0.028, band * 0.8);
    while (left > 1e-6) {
      if (this.s >= this.sNeeded) break;
      const h = Math.min(h0, left);
      this.q.setFromAxisAngle(this.axis, h);
      this.dir.applyQuaternion(this.q);
      this.arc += h;
      if (this.arc >= TWO_PI) {
        this.arc -= TWO_PI;
        this.nextMeridian(offset);
      }
      buffer.addPoint(this.dir, color, hex, true);
      this.s += h;
      left -= h;
      this.wrapCount = Math.floor(this.s / TWO_PI);
    }
    this.cover = Math.min(1, this.s / Math.max(this.sNeeded, 1));
  }
}
