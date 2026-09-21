import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Vector3, type BufferGeometry } from "three";
import { compileKiku, kikuSpec, stitchesFromOps } from "./patterns.ts";
import { createMotifGeometryParts } from "./stitches.ts";
import { closestSegmentApproach } from "./thread-geometry.ts";
import { unitFromMm } from "./measure.ts";

const ringSize = 21;
const diameter = unitFromMm(.71);
function ring(g: BufferGeometry, index: number) {
  const position = g.getAttribute("position");
  const vertices = Array.from({ length: 20 }, (_, j) => new Vector3().fromBufferAttribute(position, index * ringSize + j));
  return { center: vertices[0]!.clone().add(vertices[10]!).multiplyScalar(.5), vertices };
}

describe("finite-volume Kiku pickups", () => {
  it("has no inverted visible tube faces through ten rows, including the closing pickup", () => {
    for (const pole of [0, 1]) {
      for (const rounds of [1, 3, 10]) {
        const arcs = stitchesFromOps(compileKiku("simple", "out", "even", pole, 0, rounds, 0));
        const parts = createMotifGeometryParts(arcs, 0);
        let visible = 0;
        let folded = 0;
        for (const geometry of parts) {
          const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal"), indices = geometry.index!;
          for (let i = 0; i < indices.count; i += 3) {
            const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
            const origin = new Vector3().fromBufferAttribute(p, a);
            if (origin.length() < 1) continue;
            const face = new Vector3().fromBufferAttribute(p, b).sub(origin)
              .cross(new Vector3().fromBufferAttribute(p, c).sub(origin));
            const normal = new Vector3().fromBufferAttribute(n, a)
              .add(new Vector3().fromBufferAttribute(n, b)).add(new Vector3().fromBufferAttribute(n, c));
            if (face.dot(normal) < -1e-14) folded++;
            visible++;
          }
        }
        assert.ok(visible > 10000);
        assert.equal(folded, 0, `pole ${pole}, ${rounds} rounds: folded visible faces`);
      }
    }
  });

  it("separates every rendered section at all eight first-pass pickups on both poles", (t) => {
    for (const pole of [0, 1]) {
      const arcs = stitchesFromOps(compileKiku("simple", "out", "even", pole, 0, 1, 0));
      const parts = createMotifGeometryParts(arcs, 0);
      for (const stitch of arcs) {
        assert.equal(stitch.kind, "arc");
        if (stitch.kind !== "arc") throw new Error("Kiku pickup fixture must contain arcs");
        const mark = new Vector3(...stitch.b);
        const ends: ReturnType<typeof ring>[][] = [];
        for (const geometry of parts) {
          const count = geometry.getAttribute("position").count / ringSize;
          for (const end of [0, count - 1]) {
            const port = ring(geometry, end).center.normalize();
            if (port.distanceTo(mark) > unitFromMm(1.5)) continue;
            if (stitch.tip === "outer") {
              const theta = Math.acos(Math.max(-1, Math.min(1, port.y * (pole === 0 ? 1 : -1))));
              assert.ok(theta > kikuSpec("simple").outer, "both needle ports are below the measured pin, toward the equator");
            }
            const run: ReturnType<typeof ring>[] = [];
            const step = end === 0 ? 1 : -1;
            for (let index = end; index >= 0 && index < count; index += step) {
              const sample = ring(geometry, index);
              if (sample.center.clone().normalize().distanceTo(mark) > unitFromMm(6.5)) break;
              run.push(sample);
            }
            ends.push(run);
          }
        }
        assert.equal(ends.length, 2, `${stitch.tip}: both sides of the buried return`);
        const [incoming, outgoing] = ends;
        let checked = 0, minimum = Infinity;
        for (let i = 1; i < incoming!.length; i++) {
          for (let j = 1; j < outgoing!.length; j++) {
            const a = incoming![i - 1]!, b = incoming![i]!, c = outgoing![j - 1]!, d = outgoing![j]!;
            if ([a, b].every(r => r.center.length() + diameter / 2 < 1)
              || [c, d].every(r => r.center.length() + diameter / 2 < 1)) continue;
            const near = closestSegmentApproach(a.center.toArray(), b.center.toArray(), c.center.toArray(), d.center.toArray());
            if (near.distanceMm > diameter * 1.5) continue;
            const normal = new Vector3(...near.b).sub(new Vector3(...near.a)).normalize();
            const upperA = Math.max(...a.vertices.map(p => p.dot(normal)), ...b.vertices.map(p => p.dot(normal)));
            const lowerB = Math.min(...c.vertices.map(p => p.dot(normal)), ...d.vertices.map(p => p.dot(normal)));
            minimum = Math.min(minimum, lowerB - upperA);
            checked++;
          }
        }
        assert.ok(checked > 100, "checks finite sections around the crossing, not a single radial point");
        assert.ok(minimum >= 0,
          `${stitch.tip}, pole ${pole}: section separation ${minimum / unitFromMm(1)} mm`);
        t.diagnostic(`${stitch.tip}, pole ${pole}: minimum separating-plane gap ${(minimum / unitFromMm(1)).toFixed(4)} mm`);
      }
    }
  });
});
