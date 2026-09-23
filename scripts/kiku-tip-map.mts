/**
 * Planar map of one kiku tip in the pile render (spec/pile-render.md): every
 * piece of thread seen from above, a colour per round, dashed where it is
 * inside the wrap, line width by height; round dots are marks, crosses are the
 * recipe ports; --recipe overlays the recipe lay in thin white. Red rings mark sharp turns (hooks). Prints per piece its
 * sharpest turn, highest point and steepest slope.
 *
 *   node --import tsx scripts/kiku-tip-map.mts --rounds=4 --set=0 --tip=inner-2 --out=screenshots/tip-map.html
 */
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { compileKiku, stitchesFromOps } from '../src/components/temari/patterns.ts';
import { arcPath, pileParts } from '../src/components/temari/stitches.ts';
import { MARI_C_CM } from '../src/components/temari/measure.ts';

const arg = (n: string, f: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const rounds = Number(arg('rounds', '4'));
const setArg = arg('set', '0');
const set = setArg === 'all' ? 'all' as const : Number(setArg) as 0;
const tipName = arg('tip', 'inner-2');
const tipSet = Number(arg('tipset', '0'));
const out = arg('out', 'screenshots/tip-map.html');
const span = Number(arg('span', '7')); // mm half-window
const R = (MARI_C_CM * 10) / (2 * Math.PI);

const ops = compileKiku('simple', 'out', 'even', 0, 0, rounds, set);
const stitches = stitchesFromOps(ops);
const parts = pileParts(stitches, 'pearl5');
const tips = stitches.filter((s: any) => s.kind === 'arc' && new RegExp(`/s${tipSet}/r\\d+/${tipName}$`).test(s.operation?.operationId ?? ''));
const T = new THREE.Vector3(...(tips[0] as any).b).normalize();
const pole = new THREE.Vector3(0, 1, 0);
const e1 = pole.clone().sub(T.clone().multiplyScalar(pole.dot(T))).normalize().negate(); // away from pole = down on map
const e2 = new THREE.Vector3().crossVectors(e1, T).normalize();
const map = (p: THREE.Vector3) => { const d = p.dot(T); return [p.dot(e2) / d * R, p.dot(e1) / d * R]; };
const hue = ['#e8b020', '#2f7fe0', '#2fb050', '#d03fb0', '#ff6a00', '#00c0c0', '#8050ff', '#80ff40'];
const S = 60; // px per mm
const W = span * 2 * S;
const px = ([x, y]: number[]) => [W / 2 + x * S, W / 2 + y * S];
const inWin = ([x, y]: number[]) => Math.abs(x) < span && Math.abs(y) < span;
const half = 0.71 / 2 / R;
const base = 1 + half * 0.5;
let svg = '';
const report: string[] = [];
parts.forEach((part, pi) => {
  const id = part.at.operation?.operationId ?? '?';
  const m = id.match(/\/s(\d)\/r(\d+)\//);
  const row = m ? +m[2] : 0;
  const s = m ? +m[1] : 0;
  const col = hue[row % hue.length];
  const P = part.pts.map(map);
  if (!P.some(inWin)) return;
  // polyline segments: solid where visible, dashed where diving
  for (let i = 1; i < P.length; i++) {
    if (!inWin(P[i]) && !inWin(P[i - 1])) continue;
    const a = px(P[i - 1]), b = px(P[i]);
    const dive = part.pts[i].length() < base - 1e-6;
    const h = (part.pts[i].length() - 1) * R;
    const w = dive ? 2 : 3 + h * 14;
    svg += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${col}" stroke-opacity="${s ? 0.55 : 0.9}" stroke-width="${w.toFixed(1)}" ${dive ? 'stroke-dasharray="4 4"' : ''} stroke-linecap="round"/>`;
  }
  // max turn within 1.2 mm on visible part (hook finder)
  let worst = 0, where = -1;
  for (let i = 0; i < P.length; i++) {
    if (!inWin(P[i]) || part.pts[i].length() < base - 1e-6) continue;
    let j = i, k = i;
    const dist = (u: number[], v: number[]) => Math.hypot(u[0] - v[0], u[1] - v[1]);
    while (j > 0 && dist(P[j], P[i]) < 0.6) j--;
    while (k < P.length - 1 && dist(P[k], P[i]) < 0.6) k++;
    if (j === i || k === i) continue;
    const u = [P[i][0] - P[j][0], P[i][1] - P[j][1]], v = [P[k][0] - P[i][0], P[k][1] - P[i][1]];
    const ang = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)))) * 180 / Math.PI;
    if (ang > worst) { worst = ang; where = i; }
  }
  const hmax = Math.max(...part.pts.map((p, i) => inWin(P[i]) ? (p.length() - 1) * R : 0));
  let cliff = 0;
  for (let i = 1; i < P.length; i++) if (inWin(P[i])) {
    const dh = Math.abs(part.pts[i].length() - part.pts[i - 1].length()) * R;
    const ds = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    cliff = Math.max(cliff, dh / Math.max(ds, 1e-3));
  }
  report.push(`${pi}\t${id.replace(/^.*?\/p\d+\//, '')}\tturn ${worst.toFixed(0)}° at (${where >= 0 ? P[where].map(v => v.toFixed(2)).join(',') : '-'})\thmax ${hmax.toFixed(2)} mm\tslope ${cliff.toFixed(1)}`);
  if (worst > 70 && where >= 0) {
    const c = px(P[where]);
    svg += `<circle cx="${c[0]}" cy="${c[1]}" r="10" fill="none" stroke="red" stroke-width="2"/>`;
  }
});
// recipe lay (what patterns.ts asks for, before the renderer rebuilds legs near the tip): thin white
if (process.argv.includes('--recipe')) {
  for (const st of stitches as any[]) {
    if (st.kind !== 'arc') continue;
    const P = arcPath({ ...st, sitA: 0, sitB: 0, sitMid: 0, sitMidT: undefined, sitAts: undefined }, 'pearl5').map(map);
    for (let i = 1; i < P.length; i++) {
      if (!inWin(P[i]) && !inWin(P[i - 1])) continue;
      const a = px(P[i - 1]), b = px(P[i]);
      svg += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#fff" stroke-opacity="0.9" stroke-width="1.2"/>`;
    }
  }
}
// marks and ports
for (const op of ops) {
  const at = map(new THREE.Vector3(...op.mark.at));
  if (!inWin(at)) continue;
  const c = px(at);
  svg += `<circle cx="${c[0]}" cy="${c[1]}" r="4" fill="${hue[op.kai % hue.length]}" stroke="#fff"/>`;
  for (const q of [op.bite.enter, op.bite.exit]) {
    const b = px(map(new THREE.Vector3(...q)));
    svg += `<path d="M${b[0] - 5},${b[1] - 5}L${b[0] + 5},${b[1] + 5}M${b[0] - 5},${b[1] + 5}L${b[0] + 5},${b[1] - 5}" stroke="${hue[op.kai % hue.length]}" stroke-width="2"/>`;
  }
}
// mm grid
let grid = '';
for (let g = -span; g <= span; g++) {
  const [x] = px([g, 0]); const [, y] = px([0, g]);
  grid += `<line x1="${x}" y1="0" x2="${x}" y2="${W}" stroke="#333" stroke-width="${g === 0 ? 1.5 : 0.5}"/><line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#333" stroke-width="${g === 0 ? 1.5 : 0.5}"/>`;
}
writeFileSync(out, `<!doctype html><body style="margin:0;background:#1a0a08"><svg width="${W}" height="${W}" style="background:#2a0e0a">${grid}${svg}</svg></body>`);
console.log(report.join('\n'));
