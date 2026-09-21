import { Vector3, Triangle } from "three";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
// node --import tsx scripts/measure-studio-gaps.mjs [root] [rounds] [poles]
// A sampled mesh-distance report, NOT a contact/equilibrium acceptance test.
// Uses the workshop's default pearl #5, 20 vertices per section, C=240 mm.
const root = resolve(process.argv[2] ?? ".");
const parseList = (value, min, max) => {
  const items = value.split(",");
  if (items.some(s => !/^\d+$/.test(s) || +s < min || +s > max)
    || new Set(items.map(Number)).size !== items.length) {
    throw new Error(`Expected distinct integers ${min}..${max}, comma-separated; received ${JSON.stringify(value)}`);
  }
  return items.map(Number);
};
const roundsToCheck = parseList(process.argv[3] ?? "1,3,10", 1, 10);
const polesToCheck = parseList(process.argv[4] ?? "0,1", 0, 1);
if (process.argv.length > 5) throw new Error("Usage: measure-studio-gaps.mjs [root] [rounds] [poles]");
const load = path => import(pathToFileURL(resolve(root, path)));
const { compileKiku, stitchesFromOps } = await load("src/components/temari/patterns.ts");
const { createMotifGeometryParts } = await load("src/components/temari/stitches.ts");
const { unitFromMm } = await load("src/components/temari/measure.ts");
const mm = unitFromMm(1), radius = 1 / mm;
const triangle = new Triangle(), nearest = new Vector3();
for (const pole of polesToCheck) for (const rounds of roundsToCheck) for (const set of [0, 1, "all"]) {
  const parts = createMotifGeometryParts(stitchesFromOps(compileKiku("simple", "out", "even", pole, 0, rounds, set)), 0);
  assert.ok(parts.length > 0, "Expected nonempty workshop geometry");
  const rings = [], grid = new Map();
  const cell = p => [Math.floor(p.x / 2), Math.floor(p.y / 2), Math.floor(p.z / 2)];
  let maxReach = 0;
  for (const [part, geometry] of parts.entries()) {
    const positions = geometry.getAttribute("position");
    const indices = geometry.getIndex();
    assert.ok(positions.count >= 42 && positions.count % 21 === 0,
      "Expected 20-sided open tubes with a repeated seam vertex");
    assert.equal(indices?.count, (positions.count / 21 - 1) * 120);
    for (let i = 0, offset = 0; i < positions.count - 21; i += 21) {
      for (let j = 0; j < 20; j++) {
        const a = i + j, b = a + 21;
        for (const vertex of [a, a + 1, b, b, a + 1, b + 1]) {
          assert.equal(indices.getX(offset++), vertex, "Tube triangulation changed; update the probe");
        }
      }
    }
    let prev;
    for (let i = 0; i < positions.count; i += 21) {
      const vertices = Array.from({ length: 20 }, (_, j) => new Vector3().fromBufferAttribute(positions, i + j).divideScalar(mm));
      const center = vertices[0].clone().add(vertices[10]).multiplyScalar(.5);
      assert.ok(vertices.every(v => [v.x, v.y, v.z].every(Number.isFinite)), "Nonfinite mesh vertex");
      const sectionRadius = Math.max(...vertices.map(v => v.distanceTo(center)));
      const ring = { part, vertices, center, index: i / 21, sectionRadius };
      if (prev) {
        prev.next = ring;
        prev.reach = Math.max(prev.sectionRadius, ...vertices.map(v => v.distanceTo(prev.center)));
        maxReach = Math.max(maxReach, prev.reach);
      }
      prev = ring;
      rings.push(ring);
      const key = cell(center).join(",");
      const bucket = grid.get(key) ?? [];
      bucket.push(ring);
      grid.set(key, bucket);
    }
  }
  let maxBaseGap = 0, maxGap = 0, ringsBeyondReviewThreshold = 0, visible = 0, worst;
  for (const ring of rings) {
    const point = ring.vertices.reduce((a, b) => a.lengthSq() < b.lengthSq() ? a : b);
    let gap = point.length() - radius;
    if (gap < 0) continue;
    visible++;
    maxBaseGap = Math.max(maxBaseGap, gap);
    if (gap < .03) continue;
    const [x, y, z] = cell(ring.center);
    const reach = Math.ceil((gap + ring.sectionRadius + maxReach) / 2);
    for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) for (let dz = -reach; dz <= reach; dz++) {
      for (const other of grid.get([x + dx, y + dy, z + dz].join(",")) ?? []) {
        if (other.part === ring.part || !other.next) continue;
        if (ring.center.distanceTo(other.center) > gap + ring.sectionRadius + other.reach) continue;
        for (let j = 0; j < 20; j++) {
          const k = (j + 1) % 20;
          triangle.set(other.vertices[j], other.vertices[k], other.next.vertices[j]);
          for (const vertex of ring.vertices) {
            triangle.closestPointToPoint(vertex, nearest);
            gap = Math.min(gap, vertex.distanceTo(nearest));
          }
          triangle.set(other.next.vertices[j], other.vertices[k], other.next.vertices[k]);
          for (const vertex of ring.vertices) {
            triangle.closestPointToPoint(vertex, nearest);
            gap = Math.min(gap, vertex.distanceTo(nearest));
          }
        }
      }
    }
    if (gap > .2) ringsBeyondReviewThreshold++;
    if (gap > maxGap) {
      maxGap = gap;
      worst = { part: ring.part, ring: ring.index, point: point.toArray() };
    }
  }
  console.log(JSON.stringify({
    status: "measurement-only", pole, rounds, set, parts: parts.length, rings: rings.length, visible,
    method: "ring-vertices-to-other-part-triangles", excludesSamePart: true,
    maxBaseGapMm: maxBaseGap, maxSampledNearestSurfaceGapMm: maxGap,
    samplingFloorMm: .03, reviewThresholdMm: .2, ringsBeyondReviewThreshold, worst,
  }));
}
