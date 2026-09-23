/**
 * Who lies on whom in the recipe kiku, before any tube is built.
 *
 *   node --import tsx scripts/kiku-crossing-ledger.mts --rounds=2 --set=all
 *   node --import tsx scripts/kiku-crossing-ledger.mts --rounds=4 --set=0 --json=screenshots/ledger.json
 *
 * Rule: later over earlier; exceptions — the catch (needle under the pile,
 * inside the wrap) and underpassing at the last stitch of a thread's last
 * round. Reads the recipe lay (working end → via → far port), not the tubes.
 */
import { writeFileSync } from 'node:fs';
import { compileKiku } from '../src/components/temari/patterns.ts';
import { buildCrossingLedger } from '../src/components/temari/crossing-ledger.ts';

const arg = (name: string, fallback: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const rounds = Number(arg('rounds', '2'));
const setArg = arg('set', 'all');
const set = setArg === 'all' ? 'all' : (Number(setArg) as 0 | 1);
const json = arg('json', '');

const ops = compileKiku('simple', 'out', 'even', 0, 0, rounds, set);
const ledger = buildCrossingLedger(ops);
const short = (id: string) => id.replace(/^.*?\/p\d+\//, '');
const run = (id: string) => `→${short(id)}`;

console.log(`Кику S8, северный полюс, кругов ${rounds}, группы ${setArg}: `
  + `${ledger.spans.length} пролётов, ${ledger.crossings.length} перехлёстов.`);
console.log('Пролёт «→s0/r1/inner-2» — нить, идущая к подхвату s0/r1/inner-2.\n');

console.log('| где | от метки, мм | от полюса, мм | сверху | снизу | правило |');
console.log('|---|---:|---:|---|---|---|');
for (const c of [...ledger.crossings].sort((a, b) => a.poleMm - b.poleMm)) {
  const rule = c.rule === 'underpass-closure' ? 'последний стежок нити (underpassing)'
    : c.chidori ? 'крестик тидори' : c.sameThread ? 'позже — выше' : 'позже — выше (другая группа)';
  console.log(`| ${short(c.near.operationId)} | ${c.near.mm.toFixed(2)} | ${c.poleMm.toFixed(2)} `
    + `| ${run(c.top)} | ${run(c.under)} | ${rule} |`);
}

console.log('\nВерхние подхваты: под какими прежними нитями проходит игла.\n');
console.log('| подхват | ±мм | игла под | рецепт объявляет | мимо (где их нити на линии подхвата, мм) |');
console.log('|---|---:|---|---|---|');
for (const k of ledger.catches) {
  if (!k.declared.length && !k.under.length) continue;
  const missed = k.missed.map(m => `${short(m.operationId)} [${m.lateralMm.map(x => x.toFixed(2)).join(', ')}]`);
  console.log(`| ${short(k.operationId)} | ${k.halfMm.toFixed(2)} | ${k.under.map(run).join(', ') || '—'} `
    + `| ${k.declared.map(short).join(', ') || '—'} | ${missed.join('; ') || '—'} |`);
}

const missing = ledger.catches.reduce((n, k) => n + k.missed.length, 0);
console.log(`\nОбъявлено охватов: ${ledger.catches.reduce((n, k) => n + k.declared.length, 0)}, `
  + `игла их не охватывает: ${missing}.`);
if (json) {
  writeFileSync(json, JSON.stringify({ fixture: { division: 'simple', pole: 0, rounds, set: setArg }, ...ledger }, null, 1));
  console.log(`JSON: ${json}`);
}
