import * as THREE from "three";
import { DIV_INDEX, ICOSA_FACE_NORMALS, type Division } from "./division";
import { PALETTES, type PaletteId } from "./palettes";

const vertexShader = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vL = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uCore;
uniform vec3 uPalette[4];
uniform float uFills[20];
uniform float uTarget[20];
uniform vec3 uFaceNormals[20];
uniform int uDivision;
uniform int uHover;
uniform float uPeek;
uniform sampler2D uWrap;
uniform float uWrapOn;
uniform float uFelt;
uniform vec3 uFeltColor;
uniform sampler2D uThread;
uniform sampler2D uWool;
uniform float uWidth;

varying vec3 vN;
varying vec3 vW;
varying vec3 vL;

int regionSimple(vec3 n) {
  float phi = atan(n.x, n.z);
  float a = phi < 0.0 ? phi + 6.28318530718 : phi;
  int sector = int(floor(a * 1.27323954474));
  if (sector > 7) sector = 7;
  if (sector < 0) sector = 0;
  int hemi = n.y >= 0.0 ? 0 : 1;
  return sector + hemi * 8;
}

int regionC8(vec3 n) {
  int sx = n.x >= 0.0 ? 1 : 0;
  int sy = n.y >= 0.0 ? 1 : 0;
  int sz = n.z >= 0.0 ? 1 : 0;
  return sx + sy * 2 + sz * 4;
}

int regionC10(vec3 n) {
  int best = 0;
  float md = -2.0;
  for (int i = 0; i < 20; i++) {
    float d = dot(n, uFaceNormals[i]);
    if (d > md) {
      md = d;
      best = i;
    }
  }
  return best;
}

void main() {
  vec3 nL = normalize(vL);
  int region = 0;
  if (uDivision == 0) region = regionSimple(nL);
  else if (uDivision == 1) region = regionC8(nL);
  else region = regionC10(nL);

  float fill = uFills[region];
  if (uPeek > 0.5) fill = uTarget[region];

  vec3 col = uCore;

  float ay = abs(nL.y);
  float wu = atan(nL.x, nL.z) / 6.28318530718 + 0.5;
  float wv = clamp(0.5 - asin(clamp(nL.y, -1.0, 1.0)) / 3.14159265359, 0.0015, 0.9985);
  vec4 wool = texture2D(uWool, vec2(wu, wv));
  col = mix(col, wool.rgb, clamp(wool.a, 0.0, 1.0) * 0.9);
  if (fill >= 0.0 && fill < 0.5) col = uPalette[0];
  else if (fill >= 0.5 && fill < 1.5) col = uPalette[1];
  else if (fill >= 1.5 && fill < 2.5) col = uPalette[2];
  else if (fill >= 2.5) col = uPalette[3];

  vec4 wcol = vec4(0.0);
  if (uWrapOn > 0.5) {
    if (ay > 0.972) {
      float pv = nL.y > 0.0 ? 0.002 : 0.998;
      wcol = texture2DLodEXT(uWrap, vec2(0.00, pv), 0.0) * 0.25
           + texture2DLodEXT(uWrap, vec2(0.25, pv), 0.0) * 0.25
           + texture2DLodEXT(uWrap, vec2(0.50, pv), 0.0) * 0.25
           + texture2DLodEXT(uWrap, vec2(0.75, pv), 0.0) * 0.25;
    } else {
      wcol = texture2DLodEXT(uWrap, vec2(wu, wv), 0.0);
    }
    col = mix(col, wcol.rgb / max(wcol.a, 0.001), clamp(wcol.a, 0.0, 1.0));
  }

  if (uFelt > 0.01) {
    float hole = 1.0 - clamp(wcol.a, 0.0, 1.0);
    col = mix(col, uFeltColor, clamp(uFelt * hole, 0.0, 1.0));
  }

  vec3 an = abs(nL);
  vec3 tw = an / max(an.x + an.y + an.z, 0.001);
  float thick = clamp(uWidth, 0.0, 1.0);
  float hair = texture2D(uThread, nL.xz * mix(2.6, 1.7, thick) + 0.5).r * tw.y
             + texture2D(uThread, nL.xy * mix(2.4, 1.6, thick) + 0.5).r * tw.z
             + texture2D(uThread, nL.yz * mix(2.5, 1.65, thick) + 0.5).r * tw.x;
  float nap = max(max(clamp(wcol.a, 0.0, 1.0), uFelt), clamp(wool.a, 0.0, 1.0) * 0.7);
  float fiber = hair;
  col *= mix(1.0, 0.94 + 0.08 * fiber, nap * 0.85);

  if (region == uHover && uHover >= 0) {
    col *= 1.09;
  }

  vec3 n = normalize(vN);
  n = normalize(n + nL * ((fiber - 0.5) * 0.28 * nap));
  vec3 L = normalize(vec3(0.46, 0.82, 0.52));
  vec3 L2 = normalize(vec3(-0.55, 0.22, -0.28));
  vec3 V = normalize(uCamPos - vW);
  vec3 H = normalize(L + V);
  float ndl = max(dot(n, L), 0.0);
  float ndl2 = max(dot(n, L2), 0.0);
  float spec = pow(max(dot(n, H), 0.0), 48.0) * 0.035;
  float lit = 0.38 + 0.52 * ndl + 0.18 * ndl2;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.4) * 0.07;

  vec3 litCol = col * lit + vec3(spec) + rim * vec3(0.62, 0.58, 0.5);
  gl_FragColor = vec4(litCol, 1.0);
}
`;

function colorList(hexes: string[]) {
  return hexes.map((hex) => new THREE.Color(hex));
}

const emptyWrap = new THREE.Texture();

function makeThreadTex() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return emptyWrap;
  const img = ctx.createImageData(128, 128);
  const pitch = 18;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const along = x + Math.sin(y * 0.11) * 4;
      const t = ((y + Math.sin(along * 0.07) * 2.2) % pitch) / pitch;
      const r = Math.abs(t - 0.5) * 2;
      const crown = Math.max(0, 1 - r * r * r);
      const nap = 0.08 * Math.sin(x * 0.9 + y * 1.7) + 0.05 * Math.sin(x * 2.3 - y * 0.6);
      const shade = 0.22 + 0.78 * crown + nap * crown;
      const v = Math.max(0, Math.min(255, Math.round(shade * 255)));
      const i = (y * 128 + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

let threadTex: THREE.Texture | null = null;
function getThreadTex() {
  if (threadTex) return threadTex;
  threadTex = typeof document === "undefined" ? emptyWrap : makeThreadTex();
  return threadTex;
}

let woolTex: THREE.Texture | null = null;
function getWoolTex() {
  if (woolTex) return woolTex;
  woolTex = typeof document === "undefined" ? emptyWrap : makeWoolTex();
  return woolTex;
}

function makeWoolTex() {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return emptyWrap;
  const img = ctx.createImageData(W, H);
  const rnd = (s: number) => {
    const x = Math.sin(s * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n1 = rnd(x * 0.037 + y * 0.061);
      const n2 = rnd(x * 0.11 - y * 0.083 + 3.2);
      const n3 = rnd(x * 0.21 + y * 0.17);
      const shade = 0.78 + n1 * 0.1 + n2 * 0.07 + n3 * 0.05;
      const i = (y * W + x) * 4;
      img.data[i] = Math.floor(198 * shade);
      img.data[i + 1] = Math.floor(186 * shade);
      img.data[i + 2] = Math.floor(168 * shade);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = "round";
  for (let k = 0; k < 90; k++) {
    const x0 = rnd(k + 0.4) * W;
    const y0 = rnd(k + 2.7) * H;
    const ang = rnd(k + 5.1) * Math.PI * 2;
    const len = 28 + rnd(k + 8.8) * 70;
    const shade = 0.7 + rnd(k + 11) * 0.22;
    ctx.strokeStyle = `rgba(${Math.floor(170 * shade)},${Math.floor(158 * shade)},${Math.floor(140 * shade)},0.55)`;
    ctx.lineWidth = 3 + rnd(k + 14) * 7;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len * 0.55);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createTemariMaterial() {
  const palette = PALETTES.beni;
  return new THREE.ShaderMaterial({
    uniforms: {
      uCamPos: { value: new THREE.Vector3(0, 0.35, 3.35) },
      uCore: { value: new THREE.Color(palette.core) },
      uPalette: { value: colorList(palette.colors) },
      uFills: { value: Array.from({ length: 20 }, () => -1) },
      uTarget: { value: Array.from({ length: 20 }, () => -1) },
      uFaceNormals: {
        value: ICOSA_FACE_NORMALS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      },
      uDivision: { value: DIV_INDEX.c8 },
      uHover: { value: -1 },
      uPeek: { value: 0 },
      uWrap: { value: emptyWrap },
      uWrapOn: { value: 0 },
      uFelt: { value: 0 },
      uFeltColor: { value: new THREE.Color("#8f3d32") },
      uThread: { value: getThreadTex() },
      uWool: { value: getWoolTex() },
      uWidth: { value: 0.55 },
    },
    vertexShader,
    fragmentShader,
    toneMapped: true,
  });
}

export function syncTemariMaterial(
  material: THREE.ShaderMaterial,
  opts: {
    division: Division;
    paletteId: PaletteId;
    fills: number[];
    target: number[];
    hover: number;
    peeking: boolean;
    camera: THREE.Vector3;
    wrap?: THREE.Texture | null;
    wrapOn?: boolean;
    felt?: number;
    feltColor?: string;
    threadWidth?: number;
  },
) {
  const palette = PALETTES[opts.paletteId];
  material.uniforms.uDivision.value = DIV_INDEX[opts.division];
  material.uniforms.uHover.value = opts.hover;
  material.uniforms.uPeek.value = opts.peeking ? 1 : 0;
  (material.uniforms.uCore.value as THREE.Color).set(palette.core);
  const colors = material.uniforms.uPalette.value as THREE.Color[];
  for (let i = 0; i < 4; i++) colors[i].set(palette.colors[i]);
  const fills = material.uniforms.uFills.value as number[];
  const target = material.uniforms.uTarget.value as number[];
  for (let i = 0; i < 20; i++) {
    fills[i] = opts.fills[i] ?? -1;
    target[i] = opts.target[i] ?? -1;
  }
  (material.uniforms.uCamPos.value as THREE.Vector3).copy(opts.camera);
  material.uniforms.uWrap.value = opts.wrap ?? emptyWrap;
  material.uniforms.uWrapOn.value = opts.wrapOn ? 1 : 0;
  material.uniforms.uFelt.value = opts.felt ?? 0;
  (material.uniforms.uFeltColor.value as THREE.Color).set(opts.feltColor ?? palette.colors[0]);
  material.uniforms.uWidth.value = opts.threadWidth ?? 0.55;
}
