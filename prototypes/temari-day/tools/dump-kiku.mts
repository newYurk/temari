// Real kiku geometry from the workshop model (pile render), both S8 poles, 10 rows each.
// Reads the model, writes prototypes/temari-day/data. Run from the repo root:
//   node --import tsx prototypes/temari-day/tools/dump-kiku.mts
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { motifStitchPlan, kikuWorkingPins, type Stitch } from '../../../src/components/temari/patterns.ts';
import { pileParts } from '../../../src/components/temari/stitches.ts';

const OUT = fileURLToPath(new URL('../data', import.meta.url));
mkdirSync(OUT, { recursive: true });
const R = 38.197186; // mm, 24 cm mari
const ROWS = 10;

/** Rows as the workshop adds them (store.ts kikuExtra); every row its own thread (own colour). */
function flower(pole: number, n: number): Stitch[] {
  const out: Stitch[] = [];
  for (let layer = 1; layer <= n; layer++) {
    for (const set of [0, 1] as const) {
      const plan = motifStitchPlan('simple', 'kiku', 'out', 'even', pole, 0, layer, set);
      const prev = layer === 1 ? [] : motifStitchPlan('simple', 'kiku', 'out', 'even', pole, 0, layer - 1, set);
      out.push(...plan.slice(prev.length).map((s) => ({ ...s, color: pole * 100 + layer - 1 }) as Stitch));
    }
  }
  return out;
}

type P = { x: number; y: number; z: number };
const key = (p: { at: Stitch }) => (p.at as any).operation?.operationId as string;
function maxDiff(a: ReturnType<typeof pileParts>, b: ReturnType<typeof pileParts>) {
  if (a.length > b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (key(a[i]!) !== key(b[i]!) || a[i]!.pts.length !== b[i]!.pts.length) return Infinity;
    for (let j = 0; j < a[i]!.pts.length; j++) d = Math.max(d, a[i]!.pts[j]!.distanceTo(b[i]!.pts[j]!));
  }
  return d;
}

const t0 = performance.now();
const north = flower(0, ROWS);
const south = flower(1, ROWS);
const all = pileParts([...north, ...south], 'pearl5');
const buildMs = Math.round(performance.now() - t0);

// Prefix check: N rows alone equal the first parts of the 10-row output.
const northAll = all.filter((p) => /\/p0\//.test(key(p)));
const southAll = all.filter((p) => /\/p1\//.test(key(p)));
const prefix: Record<number, number> = {};
const poles: Record<number, number> = {};
for (let n = 6; n <= ROWS; n++) {
  const ball = pileParts([...flower(0, n), ...flower(1, n)], 'pearl5');
  prefix[n] = maxDiff(ball.filter((p) => /\/p0\//.test(key(p))), northAll);
  poles[n] = maxDiff(ball.filter((p) => /\/p1\//.test(key(p))), southAll);
}
for (let n = 1; n < 6; n++) prefix[n] = maxDiff(pileParts(flower(0, n), 'pearl5'), northAll);

// Douglas–Peucker in 3D; keep ends and every surface/dive transition.
const tol = 0.03 / R;
function segDist(p: P, a: P, b: P) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const L = abx * abx + aby * aby + abz * abz || 1e-30;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / L));
  const dx = apx - t * abx, dy = apy - t * aby, dz = apz - t * abz;
  return Math.hypot(dx, dy, dz);
}
function simplify(pts: P[]): number[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const below = (p: P) => Math.hypot(p.x, p.y, p.z) < 1 - 1e-6;
  for (let i = 1; i < pts.length; i++) if (below(pts[i]!) !== below(pts[i - 1]!)) keep[i] = keep[i - 1] = 1;
  const stack: [number, number][] = [];
  // split at forced keeps first
  let last = 0;
  for (let i = 1; i < pts.length; i++) if (keep[i]) { stack.push([last, i]); last = i; }
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, bd = tol;
    for (let i = a + 1; i < b; i++) { const d = segDist(pts[i]!, pts[a]!, pts[b]!); if (d > bd) { bd = d; best = i; } }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const idx: number[] = [];
  keep.forEach((k, i) => { if (k) idx.push(i); });
  return idx;
}

const Q = 30000;
const coords: number[] = [];
const parts: { pole: number; set: number; row: number; tip: string; line: number; n: number; lenMm: number; surfMm: number }[] = [];
let maxAbs = 0, rawPts = 0, maxDev = 0;
for (const p of all) {
  const id = key(p);
  const m = id.match(/\/p(\d)\/s(\d)\/r(\d+)\/(inner|outer)-(\d+)/);
  if (!m) throw new Error(`bad op ${id}`);
  let len = 0, surf = 0;
  for (let i = 1; i < p.pts.length; i++) {
    const a = p.pts[i - 1]!, b = p.pts[i]!;
    const d = a.distanceTo(b) * R;
    len += d;
    if (a.length() >= 1 - 1e-6 && b.length() >= 1 - 1e-6) surf += d;
  }
  const idx = simplify(p.pts);
  rawPts += p.pts.length;
  // deviation of dropped points from the simplified polyline
  for (let k = 1; k < idx.length; k++) for (let i = idx[k - 1]! + 1; i < idx[k]!; i++) maxDev = Math.max(maxDev, segDist(p.pts[i]!, p.pts[idx[k - 1]!]!, p.pts[idx[k]!]!) * R);
  for (const i of idx) {
    const q = p.pts[i]!;
    maxAbs = Math.max(maxAbs, Math.abs(q.x), Math.abs(q.y), Math.abs(q.z));
    coords.push(Math.round(q.x * Q), Math.round(q.y * Q), Math.round(q.z * Q));
  }
  parts.push({ pole: +m[1]!, set: +m[2]!, row: +m[3]!, tip: m[4]!, line: +m[5]!, n: idx.length, lenMm: +len.toFixed(2), surfMm: +surf.toFixed(2) });
}
if (maxAbs * Q > 32767) throw new Error(`Int16 overflow: ${maxAbs}`);
const buf = Buffer.from(new Int16Array(coords).buffer);
writeFileSync(`${OUT}/kiku-s8.b64`, buf.toString('base64'));
const pins = kikuWorkingPins('simple', 'all').map((p) => ({ id: p.id, p: p.p.map((v) => +v.toFixed(6)) }));
writeFileSync(`${OUT}/rows.json`, JSON.stringify({ R, Q, rows: ROWS, parts, pins }));
// lengths per pole/row/set
const byRow: Record<string, number> = {};
for (const p of parts) { const k = `p${p.pole} r${p.row + 1} ${p.set ? 'B' : 'A'}`; byRow[k] = +((byRow[k] ?? 0) + p.lenMm).toFixed(1); }
const stats = { buildMs, parts: parts.length, rawPts, keptPts: coords.length / 3, maxDevMm: +maxDev.toFixed(4), maxAbs, bytes: buf.length,
  prefixMaxDiff: prefix, southVsBallMaxDiff: poles, lengthPerRowSetMm: byRow,
  totalMm: +parts.reduce((s, p) => s + p.lenMm, 0).toFixed(0) };
writeFileSync(`${OUT}/stats.json`, JSON.stringify(stats, null, 1));
console.log(JSON.stringify({ ...stats, lengthPerRowSetMm: undefined }));
