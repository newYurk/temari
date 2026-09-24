import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditUpperBundle, buildUpperBundle } from '../src/components/temari/upper-bundle.ts';
import { runtimeModelSource } from './lib/stitch-diagram-data.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1) throw new Error('Usage: node --import tsx scripts/inspect-upper-bundle.mts [output.json]');
const output = resolve(root, args[0] ?? 'screenshots/upper-bundle/upper-bundle-diagnostic.json');
const source = () => ({
  mode: 'cli' as const,
  model: runtimeModelSource(root, 'src/components/temari/upper-bundle.ts', 'src/components/temari/upper-bundle.worker.ts'),
  renderer: runtimeModelSource(root, 'src/components/temari/UpperBundleControl.tsx'),
  dependencies: createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex'),
});
const before = source();
const bundle = buildUpperBundle();
const audit = auditUpperBundle(bundle);
if (JSON.stringify(before) !== JSON.stringify(source())) throw new Error('Source changed during inspection; refusing misleading provenance.');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ version: 1, kind: 'upper-bundle-diagnostic', source: before, bundle, audit }));
console.log(JSON.stringify({ output, modelDigest: before.model.digest, status: audit.status,
  mechanics: audit.mechanics, topology: audit.topology, geometryState: audit.geometryState,
  diagnostics: audit.diagnostics }, null, 2));
// Successful export is not geometric or craft acceptance: the status remains in the artifact.
