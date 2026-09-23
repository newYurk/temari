// Staircase tracer: from the highest point near one upper tip (set A, inner-2, pole 0,
// 10 rows, both sets, pile render) follow the support that sets each height down to the
// mari. Prints each step and a JSON summary. Copy into scripts/ and run:
//   node --import tsx scripts/pile-stair.mts
// Support rule used for tracing: the earlier sample within one thread width in plan whose
// top (its height + section height x ellipse profile) is highest. If your model changes the
// contact rule, the trace is still a fair picture of what holds a point up.
import * as THREE from 'three';
import { compileKiku, stitchesFromOps } from '../src/components/temari/patterns.ts';
import { pileParts } from '../src/components/temari/stitches.ts';
const R = 38.197186, W = 0.71 / R, H = W / 2;
const ops = compileKiku('simple', 'out', 'even', 0, 0, 10, 'all');
const parts = pileParts(stitchesFromOps(ops), 'pearl5');
const name = (p: any) => (p.at.operation?.operationId ?? '').replace(/^.*?\/p\d+\//, '');
const alongs = parts.map(P => { const a = [0]; for (let k = 1; k < P.pts.length; k++) a.push(a[k - 1]! + P.pts[k]!.clone().normalize().distanceTo(P.pts[k - 1]!.clone().normalize())); return a; });
const M = new THREE.Vector3(...ops.find(o => o.set === 0 && o.kai === 0 && o.mark.t === 'inner' && o.mark.line === 2)!.mark.at).normalize();
let cur: { i: number; j: number } | null = null, top = -1;
parts.forEach((p, i) => p.pts.forEach((q, j) => { if (q.clone().normalize().distanceTo(M) * R > 12) return; const h = (q.length() - 1) * R; if (h > top) { top = h; cur = { i, j }; } }));
const steps: string[] = [];
for (let step = 0; cur && step < 60; step++) {
  const { i: ci, j: cj } = cur as { i: number; j: number };
  const P = parts[ci]!, q = P.pts[cj]!, u = q.clone().normalize(), h = (q.length() - 1) * R;
  steps.push(`${name(P)}[${cj}] h ${h.toFixed(2)}`);
  if (h < 0.3) break;
  let best: any = null;
  parts.forEach((p, i) => { if (i > ci) return; p.pts.forEach((s, k) => {
    if (i === ci && (k >= cj || alongs[i]![cj]! - alongs[i]![k]! < 2 * W)) return;
    const d = s.clone().normalize().distanceTo(u); if (d >= W) return;
    const t = (s.length() - 1) * R + H * R * Math.sqrt(1 - (d / W) ** 2);
    if (!best || t > best.t) best = { t, i, k, d };
  }); });
  cur = best ? { i: best.i, j: best.k } : null;
  if (best) steps[steps.length - 1] += ` <- offset ${(best.d * R).toFixed(2)} mm`;
}
console.log(steps.join('\n'));
console.log(JSON.stringify({ topMm: +top.toFixed(2), stairSteps: steps.length - 1 }));
