/**
 * Bounded diagnostic on the ACTUAL ordinary-workshop triangles.
 * Finds a transverse surface intersection, not a gap between round proxy axes.
 * No hit is inconclusive: the search only covers the upper cap of the fixture.
 *
 * Default: two A rows (regression for the stacked leave tip-gate).
 * Optional: --rounds=3|4, --set=all (A+B) for the next same-set / A·B witnesses.
 */
import assert from 'node:assert/strict';
import { Box3, Ray, Triangle, Vector3 } from 'three';
import { compileKiku, stitchesFromOps } from '../src/components/temari/patterns.ts';
import { arcPath, createMotifGeometryParts } from '../src/components/temari/stitches.ts';
import { unitFromMm } from '../src/components/temari/measure.ts';

const args = process.argv.slice(2);
const roundArg = args.find(a => a.startsWith('--rounds='));
const setArg = args.find(a => a.startsWith('--set='));
const allowed = new Set(['--assert-clear', '--rounds=1', '--rounds=2', '--rounds=3', '--rounds=4', '--set=0', '--set=all']);
if (args.some(a => !allowed.has(a)) || args.filter(a => a.startsWith('--rounds=')).length > 1
  || args.filter(a => a.startsWith('--set=')).length > 1)
  throw new Error('Usage: locate-studio-overlap.mts [--rounds=1|2|3|4] [--set=0|all] [--assert-clear]');
const rounds = roundArg ? Number(roundArg.slice('--rounds='.length)) : 2;
const onlySet = setArg?.endsWith('all') ? 'all' as const : 0;
const arcs = stitchesFromOps(compileKiku('simple', 'out', 'even', 0, 0, rounds, onlySet));
const parts = createMotifGeometryParts(arcs, 0, 'pearl5');
const ringSize = 21;
const paths = arcs.filter(s => s.kind === 'arc').map(s => ({ operation: s.operation, points: arcPath(s, 'pearl5') }));
const bands = parts.map((geometry, part) => {
  const position = geometry.getAttribute('position'), index = geometry.getIndex()!;
  assert.equal(position.count % ringSize, 0);
  const count = position.count / ringSize;
  assert.equal(index.count, (count - 1) * 20 * 6, 'Expected the ordinary renderer tube topology.');
  // The middle of the rendered leg identifies a candidate recipe operation.
  // This is geometric attribution, not renderer-provided provenance.
  const mid = Math.floor(count / 2) * ringSize;
  const centre = new Vector3().fromBufferAttribute(position, mid)
    .add(new Vector3().fromBufferAttribute(position, mid + 10)).multiplyScalar(.5);
  const nearest = paths.map(p => ({ operation: p.operation,
    distanceMm: Math.min(...p.points.map(q => q.distanceTo(centre))) / unitFromMm(1) }))
    .sort((a, b) => a.distanceMm - b.distanceMm)[0];
  const result = [];
  for (let ring = 0; ring < count - 1; ring++) {
    const triangles: Triangle[] = [], box = new Box3();
    const first = ring * 20 * 6;
    for (let offset = first; offset < first + 20 * 6; offset += 3) {
      const triangle = new Triangle(...[0, 1, 2].map(k =>
        new Vector3().fromBufferAttribute(position, index.getX(offset + k))) as [Vector3, Vector3, Vector3]);
      triangles.push(triangle);
      box.expandByPoint(triangle.a); box.expandByPoint(triangle.b); box.expandByPoint(triangle.c);
    }
    if (box.max.y > .97) result.push({ part, ring, triangles, box, nearest });
  }
  return result;
});

const ray = new Ray(), hit = new Vector3();
function edgeHit(a: Triangle, b: Triangle) {
  const normalA = a.getNormal(new Vector3()), normalB = b.getNormal(new Vector3());
  if (Math.abs(normalA.dot(normalB)) > 1 - 1e-8) return null;
  for (const [p, q] of [[a.a, a.b], [a.b, a.c], [a.c, a.a]]) {
    const length = p.distanceTo(q);
    if (length < 1e-12) continue;
    ray.set(p, q.clone().sub(p).divideScalar(length));
    if (!ray.intersectTriangle(b.a, b.b, b.c, false, hit)) continue;
    const t = p.distanceTo(hit) / length;
    const barycentric = b.getBarycoord(hit, new Vector3());
    const sideP = normalB.dot(p.clone().sub(b.a)), sideQ = normalB.dot(q.clone().sub(b.a));
    if (t > 1e-6 && t < 1 - 1e-6 && hit.length() > 1 + 1e-6 && hit.y > .97
      && barycentric && Math.min(barycentric.x, barycentric.y, barycentric.z) > 1e-6
      && sideP * sideQ < 0)
      return { point: hit.toArray(), edgeFraction: t, barycentric: barycentric.toArray(),
        signedEdgeDistances: [sideP, sideQ], normalCosine: normalA.dot(normalB) };
  }
  return null;
}

let witness = null;
search: for (let i = 0; i < bands.length; i++) for (let j = i + 1; j < bands.length; j++) {
  for (const a of bands[i]) for (const b of bands[j]) {
    if (!a.box.intersectsBox(b.box)) continue;
    for (let ia = 0; ia < a.triangles.length; ia++) for (let ib = 0; ib < b.triangles.length; ib++) {
      const forward = edgeHit(a.triangles[ia], b.triangles[ib]);
      const crossing = forward ?? edgeHit(b.triangles[ib], a.triangles[ia]);
      if (!crossing) continue;
      const physical = crossing.point.map(v => v / unitFromMm(1));
      witness = { a: { part: i, ring: a.ring, triangleInBand: ia, candidate: a.nearest },
        b: { part: j, ring: b.ring, triangleInBand: ib, candidate: b.nearest },
        ...crossing, edgeOwner: forward ? 'a' : 'b', pointMm: physical, radiusMm: Math.hypot(...physical),
        triangles: [a.triangles[ia], b.triangles[ib]].map(t => [t.a.toArray(), t.b.toArray(), t.c.toArray()]) };
      break search;
    }
  }
}
console.log(JSON.stringify({
  status: witness ? 'reproduced-surface-intersection' : 'inconclusive',
  fixture: { division: 'simple', pole: 0, rounds, set: onlySet, thread: 'pearl5', circumferenceMm: 240 },
  parts: parts.length, witness,
  limits: 'Recipe IDs are nearest-midpoint candidates. Exact triangle witness is authoritative. Not a reconstruction of the user screenshot; not a complete collision validator.',
}, null, 2));
if (args.includes('--assert-clear')) {
  if (witness) {
    console.error('FAIL: actual ordinary-renderer triangles cross above the mari.');
    process.exitCode = 1;
  } else {
    console.error('INCONCLUSIVE: no witness in this bounded search; this is not a full clearance certificate.');
    process.exitCode = 2;
  }
}
