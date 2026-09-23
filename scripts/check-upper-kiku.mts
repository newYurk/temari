import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeUpperKiku } from '../src/components/temari/upper-kiku.ts';
import { auditUpperMeshes, type UpperSnapshot } from '../src/components/temari/upper-kiku-display.ts';
import { runtimeModelSource } from './lib/stitch-diagram-data.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1) throw new Error('Usage: node --import tsx scripts/check-upper-kiku.mts [output.json]');
const output = resolve(root, args[0] ?? 'screenshots/upper-kiku-control.json');
const source = () => ({
  mode: 'cli' as const,
  model: runtimeModelSource(root, 'src/components/temari/upper-kiku.ts'),
  renderer: runtimeModelSource(root, 'src/components/temari/thread-path-mesh.ts'),
  dependencies: createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex'),
});
const before = source();
const result = computeUpperKiku(message => console.error(message));
const mesh = auditUpperMeshes(result);
if (JSON.stringify(before) !== JSON.stringify(source())) throw new Error('Source changed during calculation; refusing misleading provenance.');
const snapshot: UpperSnapshot = { version: 1, source: before, result, mesh };
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(snapshot));
console.log(JSON.stringify({ output, status: result.status, geometry: result.geometryStatus, mesh: mesh.status,
  modelDigest: before.model.digest, diagnostics: [...result.diagnostics, ...mesh.diagnostics] }, null, 2));
// A zero exit verifies only this bounded numerical/mesh control, never craft acceptance.
if (result.geometryStatus !== 'passed' || mesh.status !== 'passed') process.exitCode = 1;
