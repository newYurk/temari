import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSingleNeedleCatch } from '../src/components/temari/single-needle-catch.ts';
import { runtimeModelSource } from './lib/stitch-diagram-data.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1) throw new Error('Usage: node --import tsx scripts/inspect-needle-channel.mts [output.json]');
const output = resolve(root, args[0] ?? 'screenshots/needle-channel/needle-channel-diagnostic.json');
const source = () => ({
  mode: 'cli' as const,
  model: runtimeModelSource(root, 'src/components/temari/single-needle-catch.ts'),
  renderer: runtimeModelSource(root, 'src/components/temari/NeedleChannelControl.tsx'),
  dependencies: createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex'),
});
const before = source();
const cases = [buildSingleNeedleCatch('clearance-control'), buildSingleNeedleCatch('narrow'), buildSingleNeedleCatch('clearance-control', 40)];
if (JSON.stringify(before) !== JSON.stringify(source())) throw new Error('Source changed during inspection; refusing misleading provenance.');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ version: 1, kind: 'single-needle-catch-controls', source: before, cases }));
console.log(JSON.stringify({ output, source: before, cases: cases.map(m => ({
  caseId: m.caseId, feedMm: m.parameters.suppliedLengthMm, status: m.status, geometry: m.geometryStatus,
  material: m.material.status, mechanics: m.mechanics, depthMm: m.channel.chordDepthMm,
  baseLengthMm: m.baseLengthMm, freeLengthMm: m.freeLengthMm, channel: m.channel.supportChecks,
  curvature: m.checks.curvature,
})) }, null, 2));
// Export success is not model or craft acceptance. Each separate status stays in the artifact.
