/**
 * How the workshop's own drawing treats thread over thread.
 *
 * The studio does not run the contact solver: it raises a later cord over an
 * earlier one by an estimate (`stackBump`, called a legacy estimate in the code
 * itself). This script measures what that estimate produces — how many cords
 * actually clear each other and how many pass through — so the divergence is a
 * number, not an impression.
 *
 * Usage: npx tsx scripts/measure-render-crossings.mts [rounds...]   (default 1 3 10)
 */
import * as THREE from 'three';
import { compileKiku, stitchesFromOps, type Stitch } from '../src/components/temari/patterns';
import { arcPath } from '../src/components/temari/stitches';
import { unitFromMm, MARI_C_CM } from '../src/components/temari/measure';

type Arc = Extract<Stitch, { kind: 'arc' }>;

const mmPerUnit = (MARI_C_CM / (2 * Math.PI)) * 10;
const diameter = unitFromMm(0.71);
/** Two cords touch at one diameter between centres; below that they overlap. */
const TOUCH = 0.95;
/** Tangents closer than this lie alongside each other — a row, not a crossing. */
const ALONGSIDE_DEG = 20;

const sameEnd = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) < 1e-6;
const laidAfter = (s: Arc) => (s.kai ?? 0) * 2 + (s.set ?? 0);
const tangent = (pts: THREE.Vector3[], i: number) =>
  pts[Math.min(pts.length - 1, i + 1)]!.clone().sub(pts[Math.max(0, i - 1)]!).normalize();

function measure(rounds: number) {
  const stitches = stitchesFromOps(compileKiku('simple', 'out', 'even', 0, 0, rounds, 'all'));
  const arcs = stitches.filter((s): s is Arc => s.kind === 'arc');
  const paths = arcs.map((s) => ({ s, pts: arcPath(s, 'pearl5') }));
  let crossings = 0, through = 0, wrongWay = 0, alongside = 0, alongsideTight = 0;
  let worstGap = Infinity, worstWhere = '';
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const A = paths[i]!, B = paths[j]!;
      // Threads that share a mark meet there by construction, not by accident.
      if (sameEnd(A.s.a, B.s.a) || sameEnd(A.s.a, B.s.b) ||
          sameEnd(A.s.b, B.s.a) || sameEnd(A.s.b, B.s.b)) continue;
      let best = Infinity, ia = 0, ib = 0;
      for (let x = 0; x < A.pts.length; x++) {
        for (let y = 0; y < B.pts.length; y++) {
          const gap = A.pts[x]!.distanceTo(B.pts[y]!);
          if (gap < best) { best = gap; ia = x; ib = y; }
        }
      }
      if (best > diameter * 1.6) continue;
      const angle = Math.acos(Math.min(1, Math.abs(tangent(A.pts, ia).dot(tangent(B.pts, ib))))) * 180 / Math.PI;
      if (angle < ALONGSIDE_DEG) {
        alongside++;
        if (best < diameter * TOUCH) alongsideTight++;
        continue;
      }
      crossings++;
      if (best < diameter * TOUCH) {
        through++;
        if (best < worstGap) {
          worstGap = best;
          const fromPole = Math.acos(Math.min(1, Math.abs(A.pts[ia]!.clone().normalize().y))) * 180 / Math.PI;
          worstWhere = `${angle.toFixed(0)}° crossing, ${fromPole.toFixed(0)}° from the pole`;
        }
        continue;
      }
      const later = laidAfter(A.s) > laidAfter(B.s) ? A : B;
      const earlier = later === A ? B : A;
      const lateR = (later === A ? A.pts[ia]! : B.pts[ib]!).length();
      const earlyR = (earlier === A ? A.pts[ia]! : B.pts[ib]!).length();
      if (lateR <= earlyR && Math.abs(lateR - earlyR) * mmPerUnit > 1e-6) wrongWay++;
    }
  }
  return { rounds, arcs: arcs.length, crossings, through, wrongWay, alongside, alongsideTight,
    worstGap: worstGap === Infinity ? null : worstGap / diameter, worstWhere };
}

const rounds = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
for (const n of rounds.length ? rounds : [1, 3, 10]) {
  const m = measure(n);
  console.log(`rounds ${m.rounds}: ${m.arcs} stitches, ${m.crossings} crossings`);
  console.log(`  through each other: ${m.through}` +
    (m.worstGap == null ? '' : ` (worst ${m.worstGap.toFixed(2)} of a diameter — ${m.worstWhere})`));
  console.log(`  later cord not on top: ${m.wrongWay}`);
  console.log(`  alongside pairs: ${m.alongside}, of them overlapping: ${m.alongsideTight}`);
}
