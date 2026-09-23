/**
 * Every transverse tube intersection in the ordinary workshop kiku — not the
 * first witness in the polar cap (that is `locate-studio-overlap.mts`).
 *
 *   node --import tsx scripts/count-studio-overlaps.mts --rounds=2 --set=0
 *   node --import tsx scripts/count-studio-overlaps.mts --rounds=4 --set=all --json=screenshots/overlaps.json
 *   ... --pile   heights by sewing order (spec/pile-render.md) instead of count lifts;
 *                also checks the axes: sample pairs of two pieces above the mari
 *                that sit closer than their flattened sections allow
 *
 * Same predicate as locate: an edge of one tube triangle passes through the
 * interior of another tube's triangle, endpoints on opposite sides of its
 * plane. Counts above and below the mari, split into the polar cap (y > 0.97,
 * the window locate searches) and the rest of the ball, and lists the tube
 * pairs. The acceptance tool of the review (reviews/2026-09-23-kiku-loop-review.md).
 */
import { writeFileSync } from 'node:fs';
import { Box3, Ray, Triangle, Vector3 } from 'three';
import { compileKiku, stitchesFromOps } from '../src/components/temari/patterns.ts';
import { arcPath, createMotifGeometryParts, pileParts } from '../src/components/temari/stitches.ts';
import { MARI_C_CM } from '../src/components/temari/measure.ts';

const arg = (name: string, fallback: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const rounds = Number(arg('rounds', '2'));
const set = arg('set', '0') === 'all' ? 'all' as const : 0;
const json = arg('json', '');
const pile = process.argv.includes('--pile');
const R_MM = (MARI_C_CM * 10) / (2 * Math.PI);
const CAP = 0.97;

const arcs = stitchesFromOps(compileKiku('simple', 'out', 'even', 0, 0, rounds, set));
const parts = createMotifGeometryParts(arcs, 0, 'pearl5', { pile });
const paths = arcs.filter(s => s.kind === 'arc').map(s => ({ operation: s.operation, points: arcPath(s, 'pearl5') }));
const ringSize = 21;

// A tube is rings of 21 vertices; 20 quads (40 triangles) between rings.
const names: string[] = [];
const bands = parts.map((geometry, part) => {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  const count = position.count / ringSize;
  const mid = Math.floor(count / 2) * ringSize;
  const centre = new Vector3().fromBufferAttribute(position, mid)
    .add(new Vector3().fromBufferAttribute(position, mid + 10)).multiplyScalar(0.5);
  const nearest = paths
    .map(p => ({ op: p.operation?.operationId ?? '?', d: Math.min(...p.points.map(q => q.distanceTo(centre))) }))
    .sort((a, b) => a.d - b.d)[0];
  names[part] = String(nearest?.op ?? '?').replace(/^.*?\/p\d+\//, '');
  const rings: { triangles: Triangle[]; box: Box3 }[] = [];
  for (let ring = 0; ring < count - 1; ring++) {
    const first = ring * 20 * 6;
    if (first + 120 > index.count) break;
    const triangles: Triangle[] = [];
    const box = new Box3();
    for (let offset = first; offset < first + 120; offset += 3) {
      const t = new Triangle(...[0, 1, 2].map(k =>
        new Vector3().fromBufferAttribute(position, index.getX(offset + k))) as [Vector3, Vector3, Vector3]);
      triangles.push(t);
      box.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
    }
    rings.push({ triangles, box });
  }
  return rings;
});

const ray = new Ray();
const hit = new Vector3();
function edgeHit(a: Triangle, b: Triangle): Vector3 | null {
  const nA = a.getNormal(new Vector3());
  const nB = b.getNormal(new Vector3());
  if (Math.abs(nA.dot(nB)) > 1 - 1e-8) return null;
  for (const [p, q] of [[a.a, a.b], [a.b, a.c], [a.c, a.a]] as const) {
    const len = p.distanceTo(q);
    if (len < 1e-12) continue;
    ray.set(p, q.clone().sub(p).divideScalar(len));
    if (!ray.intersectTriangle(b.a, b.b, b.c, false, hit)) continue;
    const t = p.distanceTo(hit) / len;
    const bc = b.getBarycoord(hit, new Vector3());
    const sP = nB.dot(p.clone().sub(b.a));
    const sQ = nB.dot(q.clone().sub(b.a));
    if (t > 1e-6 && t < 1 - 1e-6 && bc && Math.min(bc.x, bc.y, bc.z) > 1e-6 && sP * sQ < 0) return hit.clone();
  }
  return null;
}

type Tally = { above: number; below: number; polarMin: number; polarMax: number };
const total = { cap: { above: 0, below: 0 }, rest: { above: 0, below: 0 } };
const pairs = new Map<string, Tally>();
for (let i = 0; i < bands.length; i++) {
  for (let j = i + 1; j < bands.length; j++) {
    for (const a of bands[i]!) for (const b of bands[j]!) {
      if (!a.box.intersectsBox(b.box)) continue;
      for (const ta of a.triangles) for (const tb of b.triangles) {
        const x = edgeHit(ta, tb) ?? edgeHit(tb, ta);
        if (!x) continue;
        const r = x.length();
        const where = x.y / r > CAP ? total.cap : total.rest;
        const up = r > 1 + 1e-6;
        if (up) where.above++; else where.below++;
        const polar = Math.acos(Math.min(1, x.y / r)) * R_MM;
        const key = `${names[i]} × ${names[j]}`;
        const e = pairs.get(key) ?? { above: 0, below: 0, polarMin: Infinity, polarMax: 0 };
        if (up) e.above++; else e.below++;
        e.polarMin = Math.min(e.polarMin, polar);
        e.polarMax = Math.max(e.polarMax, polar);
        pairs.set(key, e);
      }
    }
  }
}

const above = [...pairs.values()].filter(v => v.above > 0).length;
console.log(`Кику S8, северный полюс, кругов ${rounds}, группы ${set}${pile ? ', стопка' : ''}: ${parts.length} трубок.`);
console.log(`Шапка у полюса (окно locate): над мари ${total.cap.above}, под мари ${total.cap.below}.`);
console.log(`Остальной шар: над мари ${total.rest.above}, под мари ${total.rest.below}.`);
console.log(`Пар трубок с пересечением над мари: ${above} (всего пар ${pairs.size}).`);
const top = [...pairs.entries()].sort((a, b) => b[1].above - a[1].above).slice(0, 12);
for (const [k, v] of top) {
  console.log(`  ${k}: над ${v.above}, под ${v.below}, ${v.polarMin.toFixed(1)}–${v.polarMax.toFixed(1)} мм от полюса`);
}
if (pile) {
  // Axes, not tubes: a pair of samples of two pieces, both above the mari,
  // laterally within one thread width and radially closer than the section
  // profile allows (5% slack). Zero means the pile kept later over earlier.
  const pieces = pileParts(arcs, 'pearl5');
  const W = 0.71 / R_MM;
  const H = W * 0.5;
  const grid = new Map<string, { piece: number; p: Vector3 }[]>();
  const cell = (p: Vector3) => [p.x, p.y, p.z].map(v => Math.floor(v / W));
  pieces.forEach((piece, i) => piece.pts.forEach(p => {
    if (p.length() <= 1) return;
    const k = cell(p.clone().normalize()).join(',');
    (grid.get(k) ?? grid.set(k, []).get(k)!).push({ piece: i, p });
  }));
  let axes = 0;
  pieces.forEach((piece, i) => piece.pts.forEach(p => {
    if (p.length() <= 1) return;
    const u = p.clone().normalize();
    const [x, y, z] = cell(u);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const q of grid.get(`${x + a},${y + b},${z + c}`) ?? []) {
        if (q.piece <= i) continue;
        const d = u.distanceTo(q.p.clone().normalize());
        if (d >= W) continue;
        if (H * Math.sqrt(1 - (d / W) ** 2) - Math.abs(p.length() - q.p.length()) > 0.05 * H) axes++;
      }
    }
  }));
  console.log(`Оси (стопка): пар точек ближе сечения ${axes}.`);
}
if (json) {
  writeFileSync(json, JSON.stringify({ rounds, set, parts: parts.length, total, pairs: Object.fromEntries(pairs) }, null, 1));
  console.log(`JSON: ${json}`);
}
