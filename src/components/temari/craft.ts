import * as THREE from "three";
import type { Stitch, Vec3 } from "./patterns";

export type Craft = "wind" | "pin" | "stitch";

export const CRAFT_LIST: Craft[] = ["wind", "pin", "stitch"];

export const CRAFT_META: Record<Craft, { label: string; hint: string }> = {
  wind: {
    label: "Намотка",
    hint: "тык — булавка-начало; крутите — нить от неё",
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

export type WrapStyle = "around" | "spiral";

export const WRAP_STYLES: WrapStyle[] = ["around", "spiral"];

export const WRAP_META: Record<WrapStyle, { label: string; hint: string }> = {
  around: {
    label: "Вокруг",
    hint: "по большому кругу, шар всё время чуть поворачивается",
  },
  spiral: {
    label: "Спираль",
    hint: "спираль от булавки, как удзумаки · тык — переставить",
  },
};

export function isWrapStyle(value: unknown): value is WrapStyle {
  return value === "around" || value === "spiral";
}

/** Ivory marking pin — slightly off-axis so the first wraps read on the facing side. */
export const DEFAULT_START: Vec3 = [0.249, 0.746, 0.617];

export type Pin = { id: string; p: Vec3 };
export type PinArc = { a: Vec3; b: Vec3; color: number };

const W = 1536;
const H = 768;
const MIN_DOT = 0.9994;
const MAX_LIVE = 220;
const MAX_STRANDS = 48;
const MAX_JOINS = 16;
/** Almost a full lap, then change heading so wraps don't share a pole. */
const LAP = Math.PI * 2 * 0.928;
const TURN = 1.85;

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

function stampPole(ctx: CanvasRenderingContext2D, p: THREE.Vector3, hex: string) {
  const cap = Math.abs(p.y) > 0.88 ? Math.ceil((Math.abs(p.y) - 0.88) * 180) : 0;
  if (cap <= 0) return;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = hex;
  const h = Math.min(32, cap);
  if (p.y > 0) ctx.fillRect(0, 0, W, h);
  else ctx.fillRect(0, H - h, W, h);
}

function stampDot(
  ctx: CanvasRenderingContext2D,
  p: THREE.Vector3,
  hex: string,
  width: number,
) {
  const [u, v] = toUV(p);
  ctx.fillStyle = hex;
  ctx.globalAlpha = 0.82;
  const r = Math.max(2.2, width * 0.52);
  for (const shift of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.arc((u + shift) * W, v * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  stampPole(ctx, p, hex);
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
  paint(0.45, width * 1.55);
  paint(0.96, width);
}

function stroke(
  ctx: CanvasRenderingContext2D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  hex: string,
  width: number,
) {
  const theta = Math.acos(clamp(a.dot(b), -1, 1));
  const steps = Math.max(1, Math.ceil(theta / 0.032));
  _slerpA.copy(a);
  for (let i = 1; i <= steps; i++) {
    slerpOnto(a, b, i / steps, _slerpB);
    strokeSeg(ctx, _slerpA, _slerpB, hex, width);
    _slerpA.copy(_slerpB);
  }
  stampDot(ctx, b, hex, width);
}

type Strand = { color: number; hex: string; points: THREE.Vector3[] };

export class WrapBuffer {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private strands: Strand[] = [];
  private last: THREE.Vector3 | null = null;
  live: THREE.Vector3[] = [];
  liveColor = "#8f3d32";
  strokeWidth = 9;
  joins: THREE.Vector3[] = [];

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("wrap canvas");
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
  }

  get strandCount() {
    return this.strands.length;
  }

  snapshot() {
    return {
      wraps: this.strands.length,
      joins: this.joins.length,
      live: this.live.length,
      hex: this.liveColor,
      colors: this.strands.map((s) => s.color),
    };
  }

  addPoint(local: THREE.Vector3, color: number, hex: string, dense = false) {
    const p = local.clone().normalize();
    const current = this.strands[this.strands.length - 1];
    const far = this.last ? this.last.dot(p) < 0.82 : false;
    const colorChange = !current || current.color !== color;
    if (colorChange || far) {
      if (this.last && colorChange) {
        if (this.joins.length >= MAX_JOINS) this.joins.shift();
        this.joins.push(this.last.clone());
        if (!far) {
          stroke(this.ctx, this.last, p, hex, this.strokeWidth);
          this.texture.needsUpdate = true;
        }
      }
      if (this.strands.length >= MAX_STRANDS) this.strands.shift();
      this.strands.push({
        color,
        hex,
        points: !far && this.last ? [this.last.clone(), p] : [p],
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
      if (this.live.length > MAX_LIVE) this.live.splice(0, this.live.length - MAX_LIVE);
      this.liveColor = hex;
      this.texture.needsUpdate = true;
    }
    return true;
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
 * Two real ways to lay the base:
 *  - around (maki): full-circumference wraps, heading changes each lap
 *    so no two successive wraps are parallel and they don't share a pole
 *  - spiral (uzumaki): spherical spiral whose pole is the start pin
 * A new colour may continue from the last point, or begin at a moved start pin.
 */
export class MariWinder {
  s = 0;
  sNeeded = 420;
  wrapCount = 0;
  style: WrapStyle = "around";
  pitch = 0.04;
  private axis = new THREE.Vector3(0.22, 0.96, 0.16);
  private dir = new THREE.Vector3();
  private pole = new THREE.Vector3(0, 1, 0);
  private u = new THREE.Vector3();
  private v = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private spiralT = 0.02;
  private arc = 0;

  reset(thickness: number) {
    const t = Math.max(0, Math.min(1, thickness));
    this.s = 0;
    this.wrapCount = 0;
    this.arc = 0;
    this.sNeeded = Math.PI * 2 * (36 + (1 - t) * 40);
    this.pitch = (strokePx(t) * Math.PI) / 768 * 0.72;
    this.axis.set(0.24, 0.95, 0.18).normalize();
    this.dir.crossVectors(this.axis, new THREE.Vector3(1, 0, 0));
    if (this.dir.lengthSq() < 0.05) this.dir.crossVectors(this.axis, new THREE.Vector3(0, 0, 1));
    this.dir.normalize();
    this.pole.set(0, 1, 0);
    this.spiralT = 0.02;
    this.framePole();
  }

  get progress() {
    return Math.max(0, Math.min(1, this.s / this.sNeeded));
  }

  reorigin(point: THREE.Vector3, style: WrapStyle, from?: THREE.Vector3 | null) {
    this.style = style;
    this.tmp.copy(point).normalize();
    this.arc = 0;
    if (style === "spiral") {
      this.pole.copy(this.tmp);
      this.framePole();
      if (from) {
        const f = from.clone().normalize();
        const theta = Math.acos(clamp(this.pole.dot(f), -1, 1));
        this.spiralT = Math.max(0.015, Math.min(0.98, theta / Math.PI));
      } else {
        this.spiralT = 0.02;
      }
    } else {
      const at = from ? from.clone().normalize() : this.tmp.clone();
      this.dir.copy(at);
      const ref = Math.abs(at.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      this.axis.crossVectors(at, ref).normalize();
      if (this.axis.lengthSq() < 0.05) this.axis.set(1, 0, 0);
    }
  }

  private framePole() {
    const ref = Math.abs(this.pole.y) < 0.88 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    this.u.crossVectors(this.pole, ref).normalize();
    this.v.crossVectors(this.pole, this.u).normalize();
  }

  private spiralPoint(out: THREE.Vector3) {
    const theta = this.spiralT * Math.PI;
    const turns = Math.PI / Math.max(0.02, this.pitch);
    const phi = this.spiralT * turns * 2 * Math.PI;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    out.set(
      this.pole.x * ct + (this.u.x * cp + this.v.x * sp) * st,
      this.pole.y * ct + (this.u.y * cp + this.v.y * sp) * st,
      this.pole.z * ct + (this.u.z * cp + this.v.z * sp) * st,
    ).normalize();
  }

  fill(buffer: WrapBuffer, color: number, hex: string) {
    this.advance(buffer, this.sNeeded, color, hex, 0.12);
  }

  advance(buffer: WrapBuffer, ds: number, color: number, hex: string, step = 0.085) {
    if (ds <= 0 || this.progress >= 1) return;
    let left = Math.min(ds, this.sNeeded - this.s);
    const h0 = Math.max(0.04, step);
    while (left > 1e-6) {
      const h = Math.min(h0, left);
      if (this.style === "spiral") {
        const turns = Math.PI / Math.max(0.02, this.pitch);
        this.spiralT += h / (Math.PI * turns);
        if (this.spiralT >= 1) {
          this.spiralT = 0.02;
          this.q.setFromAxisAngle(this.u, 0.38);
          this.pole.applyQuaternion(this.q).normalize();
          this.framePole();
        }
        this.spiralPoint(this.dir);
        buffer.addPoint(this.dir, color, hex, true);
      } else {
        this.q.setFromAxisAngle(this.axis, h);
        this.dir.applyQuaternion(this.q);
        this.arc += h;
        if (this.arc >= LAP) {
          this.arc -= LAP;
          const kick = TURN + 0.28 * Math.sin(this.s * 0.37);
          this.q.setFromAxisAngle(this.dir, kick);
          this.axis.applyQuaternion(this.q).normalize();
          this.tmp.copy(this.axis).multiplyScalar(this.dir.dot(this.axis));
          this.dir.sub(this.tmp).normalize();
        }
        buffer.addPoint(this.dir, color, hex, true);
      }
      this.s += h;
      left -= h;
      this.wrapCount = Math.floor(this.s / (Math.PI * 2));
    }
  }
}
