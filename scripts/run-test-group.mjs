import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Measured long-running solves and workshop integrations (24 September 2026).
// This is a local feedback split, not a weaker publication gate: npm test still
// discovers every test. New files enter fast automatically; renamed slow files
// fail here until the classification is updated.
const slow = new Set([
  'actions.test.ts', 'c8-thread-coupon.test.ts', 'c8-uwagake-coupon.test.ts',
  'computed-lower-kagari.test.ts', 'crossing-ledger.test.ts',
  'kiku-initial-flank.test.ts', 'pickup-volume.test.ts', 's8-ab-snapshot.test.ts',
  's8-kiku-rows.test.ts', 's8-kiku-turn.test.ts', 'spatial-contact.test.ts',
  'spatial-contact-exactness.test.ts', 'stitches.test.ts', 'studio-rebuild.test.ts',
]);
const [group, ...args] = process.argv.slice(2);
if (!['fast', 'slow'].includes(group) || args.some(a => a !== '--list')) {
  throw new Error('Usage: node scripts/run-test-group.mjs fast|slow [--list]');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = 'src/components/temari/';
const all = readdirSync(new URL(`../${directory}`, import.meta.url))
  .filter(name => name.endsWith('.test.ts')).sort();
for (const name of slow) if (!all.includes(name)) throw new Error(`Stale slow-test entry: ${name}`);
const selected = all.filter(name => slow.has(name) === (group === 'slow'));
if (!selected.length) throw new Error(`Empty test group: ${group}`);
if (args.includes('--list')) {
  console.log(selected.map(name => directory + name).join('\n'));
} else {
  console.log(`${group}: ${selected.length}/${all.length} test files; npm test remains the complete suite.`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test',
    ...selected.map(name => directory + name)], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
