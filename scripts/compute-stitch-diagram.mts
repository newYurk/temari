/**
 * Recompute ONE canonical lower backbite, with unchanged model defaults.
 * A rejected/unresolved result must never replace the documentation snapshot.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { computeLowerKagari } from '../src/components/temari/computed-lower-kagari.ts';
import { assertDiagramSnapshot, modelSource, type DiagramSnapshot } from './lib/stitch-diagram-data.ts';

const root = resolve(import.meta.dirname, '..');
const source = modelSource(root);
const started = Date.now();
console.log('Computing canonical C230 lower backbite on the unchanged default ladder...');
const computed = computeLowerKagari();
if (computed.status !== 'accepted') {
  throw new Error(`No illustration update: ${computed.status}: ${computed.diagnostics.join('; ')}`);
}
if (source.digest !== modelSource(root).digest) throw new Error('Model changed while computing.');
const { dimensions, frame, incomingStart, entry, exit, next } = computed.fixture;
const snapshot: DiagramSnapshot = {
  version: 1, kind: 'computed-isolated-lower-kagari',
  source: { ...source, revision: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() },
  status: 'accepted', fixture: { dimensions, frame, incomingStart, entry, exit, next },
  coupon: computed.coupon,
  acceptance: {
    seed: computed.checks.seed.status, candidate: computed.checks.candidate.status,
    resolutions: computed.checks.resolutions.map(r => ({
      controls: r.controlCount, resolved: r.resolved, solve: r.result.status,
      path: r.validation.status, curvature: r.curvature.status, curvatureUpper: r.curvature.upper,
      restarts: r.restarts, settleMoveMm: r.settleMoveMm,
    })),
    refinements: computed.checks.refinements, metrics: computed.metrics,
    outgoingLengthMm: computed.result.lengthMm, diagnostics: computed.diagnostics,
  },
};
assertDiagramSnapshot(snapshot, root);
const folder = join(root, 'docs/fixtures');
await mkdir(folder, { recursive: true });
await writeFile(join(folder, 'lower-kagari-diagram.json'), JSON.stringify(snapshot, null, 2) + '\n');
console.log(JSON.stringify({
  status: computed.status, seconds: (Date.now() - started) / 1000,
  controls: snapshot.acceptance.resolutions.map(r => r.controls),
  lengthMm: snapshot.acceptance.outgoingLengthMm,
  curvatureUpper: snapshot.acceptance.resolutions.at(-1)!.curvatureUpper,
  lengthDifferenceMm: snapshot.acceptance.metrics.lengthDifferenceMm,
  shapeDifferenceMm: snapshot.acceptance.metrics.maxShapeDifferenceMm,
  sourceDigest: snapshot.source.digest,
}, null, 2));
