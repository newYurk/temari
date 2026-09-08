import * as THREE from "three";
import { DIV_INDEX, ICOSA_FACE_NORMALS, type Division } from "./division";
import { PALETTES, type PaletteId } from "./palettes";

const vertexShader = /* glsl */ `
varying vec3 vN;
varying vec3 vW;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
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

varying vec3 vN;
varying vec3 vW;

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
  vec3 n = normalize(vN);
  int region = 0;
  if (uDivision == 0) region = regionSimple(n);
  else if (uDivision == 1) region = regionC8(n);
  else region = regionC10(n);

  float fill = uFills[region];
  if (uPeek > 0.5) fill = uTarget[region];

  vec3 col = uCore;
  if (fill >= 0.0 && fill < 0.5) col = uPalette[0];
  else if (fill >= 0.5 && fill < 1.5) col = uPalette[1];
  else if (fill >= 1.5 && fill < 2.5) col = uPalette[2];
  else if (fill >= 2.5) col = uPalette[3];

  float phi = atan(n.x, n.z);
  float wrap = sin(n.y * 148.0) * 0.028;
  float stitch = sin(phi * 86.0 + n.y * 10.0) * 0.018;
  col *= 0.97 + wrap + stitch;

  if (region == uHover && uHover >= 0) {
    col *= 1.09;
  }

  vec3 L = normalize(vec3(0.42, 0.78, 0.48));
  vec3 V = normalize(uCamPos - vW);
  vec3 H = normalize(L + V);
  float ndl = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, H), 0.0), 52.0) * 0.11;
  float lit = 0.20 + 0.80 * ndl;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.7) * 0.16;

  vec3 litCol = col * lit + vec3(spec) + rim * vec3(0.86, 0.82, 0.76);
  gl_FragColor = vec4(litCol, 1.0);
}
`;

function colorList(hexes: string[]) {
  return hexes.map((hex) => new THREE.Color(hex));
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
}
