/** Inspect a SAVED control without solving again. Discrete convergence is not physical acceptance. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectEquilibriumGeometry } from '../src/components/temari/yarn-equilibrium-validation.ts';
import { runtimeModelSource } from './lib/stitch-diagram-data.ts';

const path = process.argv[2];
if (!path || path.startsWith('--')) throw new Error('Usage: node --import tsx scripts/audit-studio-equilibrium.mts <saved-control.json> [--assert-geometry]');
const data = JSON.parse(readFileSync(path, 'utf8'));
const { fixture, result } = data;
if (!fixture?.input?.threads || !result?.threads || !Number.isFinite(fixture.bodyRadiusMm))
  throw new Error('Expected a saved studio-equilibrium fixture and result.');
const root = resolve(import.meta.dirname, '..');
const inspectedWith = runtimeModelSource(root, 'scripts/audit-studio-equilibrium.mts', 'package-lock.json');
const geometry = inspectEquilibriumGeometry(result.threads, fixture.bodyRadiusMm);
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((x, i) => x - b[i]));
// This is a comparison of two assigned rules, not an inferred hole shape.
const indexedMouthWitnesses = fixture.rows.flatMap((row: any, ti: number) => row.thread.nodes.flatMap((node: any, i: number) => {
  const assigned = node.minimumSphereRadiusMm - fixture.bodyRadiusMm;
  if (node.fixed || !(assigned > 1e-8 && assigned < row.thread.radiusMm - 1e-8)) return [];
  const point = result.threads[ti].nodes[i].positionMm;
  const currentPortDistance = Math.min(...row.portsMm.map((p: number[]) => distance(point, p)));
  return [{ threadId: row.thread.id, nodeIndex: i, assignedAxisHeightMm: assigned,
    currentDistanceToPortMm: currentPortDistance,
    originalPointDisplacementMm: distance(point, node.positionMm),
    warning: 'Bound remains attached to the sample index. It is not a spatial needle-channel boundary.' }];
}));
console.log(JSON.stringify({
  sourceArtifact: resolve(path), source: data.source, inspectedWith,
  numericalStatus: result.status,
  discretizations: result.threads.map((t: any) => t.feed?.discretization ?? 'free-vertices'),
  residuals: result.residuals,
  geometry,
  indexedMouthWitnesses,
  materialScope: 'Independent local windows; a complete single working-thread ledger and sewing history are absent.',
  acceptance: geometry.status === 'invalid' ? 'rejected-geometry' : 'not-certified',
  reasons: ['Numerical stationarity alone is not physical or craft acceptance.',
    'Mesh reactions, when present, are numerical constraints, not cotton forces.',
    'Zero folded faces does not certify continuous curvature, global contacts or executable needle history.'],
}, null, 2));
if (process.argv.includes('--assert-geometry') && geometry.status === 'invalid') process.exitCode = 1;
