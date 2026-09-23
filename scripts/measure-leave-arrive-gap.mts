/**
 * Tube-centerline gap for the known 3-row witness pair r1/outer-3 ↔ r2/inner-2.
 * Usage: node --import tsx scripts/measure-leave-arrive-gap.mts
 */
import { Vector3 } from "three";
import { compileKiku, stitchesFromOps } from "../src/components/temari/patterns.ts";
import { createMotifGeometryParts, arcPath } from "../src/components/temari/stitches.ts";
import { unitFromMm, STITCH_THREAD_MM } from "../src/components/temari/measure.ts";

const pearl = unitFromMm(STITCH_THREAD_MM.pearl5);
const ringSize = 21;
const arcs = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 3, 0));
const parts = createMotifGeometryParts(arcs, 0, "pearl5");
const paths = arcs.filter(s => s.kind === "arc").map(s => ({
  id: s.operation?.operationId,
  points: arcPath(s, "pearl5"),
}));

function centerline(geometry: { getAttribute: (n: string) => { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } }) {
  const pos = geometry.getAttribute("position");
  const count = pos.count / ringSize;
  const pts: Vector3[] = [];
  for (let ring = 0; ring < count; ring++) {
    const mid = ring * ringSize;
    const c = new Vector3();
    for (let k = 0; k < ringSize - 1; k++) {
      const i = mid + k;
      c.x += pos.getX(i); c.y += pos.getY(i); c.z += pos.getZ(i);
    }
    c.multiplyScalar(1 / (ringSize - 1));
    pts.push(c);
  }
  return pts;
}

const meta = parts.map((geometry, part) => {
  const cl = centerline(geometry as never);
  const mid = cl[Math.floor(cl.length / 2)]!;
  const nearest = paths
    .map(p => ({ id: p.id, d: Math.min(...p.points.map(q => q.distanceTo(mid))) }))
    .sort((a, b) => a.d - b.d)[0];
  return { part, nearest, cl };
});

const A = meta.find(p => p.nearest?.id === "kiku-8-point/p0/s0/r1/outer-3")!;
const B = meta.find(p => p.nearest?.id === "kiku-8-point/p0/s0/r2/inner-2")!;
let best = { d: Infinity, i: 0, j: 0 };
for (let i = 0; i < A.cl.length; i++) {
  for (let j = 0; j < B.cl.length; j++) {
    const d = A.cl[i]!.distanceTo(B.cl[j]!);
    if (d < best.d) best = { d, i, j };
  }
}
const a = A.cl[best.i]!, b = B.cl[best.j]!;
const ops = compileKiku("simple", "out", "even", 0, 0, 3, 0);
const r2 = ops.find(o => o.kai === 2 && o.mark.t === "inner" && o.set === 0 && o.pole === 0)!;
const tip2 = new Vector3(...r2.mark.at).normalize();
const exit2 = new Vector3(...r2.bite.exit).normalize();
const enter2 = new Vector3(...r2.bite.enter).normalize();
const tip1 = new Vector3(
  ...(ops.find(o => o.kai === 1 && o.mark.t === "inner" && o.set === 0 && o.pole === 0)!.mark.at),
).normalize();

console.log(JSON.stringify({
  axisPearl: best.d / pearl,
  dirDot: a.clone().normalize().dot(b.clone().normalize()),
  heightPearl: [(a.length() - 1) / pearl, (b.length() - 1) / pearl],
  leaveToExitPearl: a.clone().normalize().distanceTo(exit2) / pearl,
  leaveToEnterPearl: a.clone().normalize().distanceTo(enter2) / pearl,
  leaveToTip2Pearl: a.clone().normalize().distanceTo(tip2) / pearl,
  tip1ToExitPearl: tip1.distanceTo(exit2) / pearl,
  tip1ToTip2Pearl: tip1.distanceTo(tip2) / pearl,
  portHalfPearl: tip2.distanceTo(exit2) / pearl,
  rings: [best.i, best.j, A.cl.length, B.cl.length],
}, null, 2));
