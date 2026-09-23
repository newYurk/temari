import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertS8ABFirstPassSnapshot, firstS8ABPass, type S8ABSnapshot } from './lib/s8-ab-diagram.ts';
import { validateThreadCoupon } from '../src/components/temari/thread-geometry.ts';
import { validateModel } from '../src/components/temari/craft-passport.ts';
const root = resolve(import.meta.dirname, '..');
const write = process.argv.includes('--write'), check = process.argv.includes('--check');
if (write === check) throw new Error('Choose --write or --check.');
const raw = readFileSync(join(root, 'public/fixtures/s8-ab.json'), 'utf8');
const snapshot: S8ABSnapshot = JSON.parse(raw);
assertS8ABFirstPassSnapshot(snapshot, root);
const pass = firstS8ABPass(snapshot);
if (pass.status !== 'accepted') throw new Error('A passport estimate requires an accepted A1/B1 model snapshot.');
const a = validateThreadCoupon(pass.A, .001), b = validateThreadCoupon(pass.B, .001);
if (a.status !== 'passed' || b.status !== 'passed') throw new Error('Invalid source path.');
if (pass.A.bodyRadiusMm !== pass.B.bodyRadiusMm || pass.A.threadRadiusMm !== pass.B.threadRadiusMm)
  throw new Error('A/B dimensions disagree.');
const model = validateModel({ schemaVersion: 1, id: 's8-a1-b1-control',
  sourceDigest: snapshot.source.digest, snapshotDigest: createHash('sha256').update(raw).digest('hex'),
  status: 'accepted', calibrated: false, circumferenceMm: 2 * Math.PI * pass.A.bodyRadiusMm, threadDiameterMm: 2 * pass.A.threadRadiusMm,
  lengthsMm: { A: a.lengthMm, B: b.lengthMm } });
const content = JSON.stringify(model, null, 2) + '\n', path = join(root, 'public/fixtures/passport-model.json');
if (write) writeFileSync(path, content);
else if (readFileSync(path, 'utf8') !== content) throw new Error('Passport model summary is stale.');
console.log(JSON.stringify({ model: model.id, snapshotDigest: model.snapshotDigest, mode: write ? 'written' : 'matches' }));
