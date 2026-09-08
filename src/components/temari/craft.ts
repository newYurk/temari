import * as THREE from "three";
import type { Stitch, Vec3 } from "./patterns";

export type Craft = "wind" | "pin" | "stitch";

export const CRAFT_LIST: Craft[] = ["wind", "pin", "stitch"];

export const CRAFT_META: Record<Craft, { label: string; hint: string }> = {
  wind: {
    label: "Намотка",
    hint: "крутите шар — нить ложится слоем. отпустите — крутится сам",
  },
  pin: {
    label: "Булавки",
    hint: "втыкайте булавки, нить идёт между ними",
  },
  stitch: {
    label: "Стежок",
    hint: "стежок за стежком по сетке деления",
  },
};

export function isCraft(value: unknown): value is Craft {
  return value === "wind" || value === "pin" || value === "stitch";
}

export type Pin = { id: string; p: Vec3 };
export type PinArc = { a: Vec3; b: Vec3; color: number };

const W = 1024;
const H = 512;
const MIN_DOT = 0.9992;
const MAX_LIVE = 360;
const MAX_STRANDS = 48;

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

function stroke(
  ctx: CanvasRenderingContext2D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  hex: string,
) {
  const [u0, v0] = toUV(a);
  const [u1, v1] = toUV(b);
  ctx.strokeStyle = hex;
  ctx.globalAlpha = 0.62;
  ctx.lineWidth = 5.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const du = u1 - u0;
  if (Math.abs(du) > 0.5) {
    if (u0 > u1) {
      line(ctx, u0, v0, 1, (v0 + v1) * 0.5);
      line(ctx, 0, (v0 + v1) * 0.5, u1, v1);
    } else {
      line(ctx, u0, v0, 0, (v0 + v1) * 0.5);
      line(ctx, 1, (v0 + v1) * 0.5, u1, v1);
    }
    return;
  }
  line(ctx, u0, v0, u1, v1);
}

function line(
  ctx: CanvasRenderingContext2D,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
) {
  ctx.beginPath();
  ctx.moveTo(u0 * W, v0 * H);
  ctx.lineTo(u1 * W, v1 * H);
  ctx.stroke();
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

  addPoint(local: THREE.Vector3, color: number, hex: string) {
    const p = local.clone().normalize();
    const current = this.strands[this.strands.length - 1];
    if (!current || current.color !== color) {
      if (this.strands.length >= MAX_STRANDS) this.strands.shift();
      this.strands.push({ color, hex, points: [p] });
      this.last = p;
      this.live = [p.clone()];
      this.liveColor = hex;
      return true;
    }
    if (this.last && this.last.dot(p) > MIN_DOT) return false;
    if (this.last) {
      const origin = this.last;
      const theta = Math.acos(clamp(origin.dot(p), -1, 1));
      const steps = Math.max(1, Math.ceil(theta / 0.045));
      for (let i = 1; i <= steps; i++) {
        const q = origin.clone().lerp(p, i / steps).normalize();
        stroke(this.ctx, this.last, q, hex);
        current.points.push(q);
        this.live.push(q.clone());
        this.last = q;
      }
      if (this.live.length > MAX_LIVE) this.live.splice(0, this.live.length - MAX_LIVE);
      this.liveColor = hex;
      this.texture.needsUpdate = true;
    }
    return true;
  }

  undo() {
    this.strands.pop();
    this.redraw();
  }

  reset() {
    this.strands = [];
    this.redraw();
  }

  private redraw() {
    this.ctx.clearRect(0, 0, W, H);
    for (const strand of this.strands) {
      for (let i = 1; i < strand.points.length; i++) {
        const a = strand.points[i - 1];
        const b = strand.points[i];
        if (a && b) stroke(this.ctx, a, b, strand.hex);
      }
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
