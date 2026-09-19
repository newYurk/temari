import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildS8KikuLevel, judgeS8Kiku, type S8KikuLevel } from '../src/components/temari/s8-kiku.ts';
import { planS8AB, checkS8ABLevel, judgeS8AB, S8_AB_SOURCE } from '../src/components/temari/s8-kiku-ab.ts';
import { modelSource } from './lib/stitch-diagram-data.ts';

const root = resolve(process.env.TEMARI_ROOT ?? process.cwd());
const smoke = process.argv.includes('--smoke');
const source = modelSource(root, 'src/components/temari/s8-kiku-ab.ts');
// Include composition/validation code as well as the single-thread solver: a changed
// A/B plan must never reuse a same-factor result from the previous composition.
const numerical = source;
const cache = join(root, 'screenshots/s8-ab-compute', numerical.digest);
mkdirSync(cache, { recursive: true });
const plans = planS8AB();
const load = (group: 'A' | 'B', factor: number, probes: number, a?: S8KikuLevel) => {
  const file = join(cache, `${group}-${factor}-${probes}${a ? `-on-A${a.factor}-${a.samplesPerSpan}` : ''}.json`);
  if (existsSync(file)) { console.log(`cache ${group} x${factor}/${probes}`); return JSON.parse(readFileSync(file, 'utf8')) as S8KikuLevel; }
  const other = plans[group === 'A' ? 'B' : 'A'];
  console.log(`start ${group} x${factor}/${probes} ${new Date().toISOString()}`);
  const level = buildS8KikuLevel(plans[group], factor, probes, undefined, {
    marking: other.supports.map(s => ({ ...s, id: `other:${s.id}` })),
    laidThreads: a ? [a.coupon] : [],
  });
  writeFileSync(file, JSON.stringify(level));
  console.log(JSON.stringify({ group, factor, probes, validation: level.validation.status,
    diagnostics: level.diagnostics, undeclared: level.undeclaredCrossings,
    solves: level.solves.map(s => [s.windowId, s.result.status, s.settleMoveMm]) }));
  return level;
};
const factors = smoke ? [1] : plans.A.factors;
// Independent conditioning rebuild; can be computed while B's ladder is running.
if (process.argv.includes('--a-check')) { load('A', 4, 8); process.exit(0); }
const aLevels = factors.map(f => load('A', f, 4));
const aBase = aLevels.at(-1)!;
const bLevels = factors.map(f => load('B', f, 4, aBase));
const pairs = bLevels.map(b => checkS8ABLevel(aBase, b));
if (smoke) {
  writeFileSync(join(root, 'screenshots/s8-ab-smoke.json'), JSON.stringify(pairs[0]));
  console.log(JSON.stringify({ smoke: true, check: pairs[0].check }));
} else {
  const aPerturbed = load('A', 4, 8);
  const bPerturbed = load('B', 4, 8, aBase);
  const a = judgeS8Kiku(plans.A, aLevels, aPerturbed);
  const b = judgeS8Kiku(plans.B, bLevels, bPerturbed);
  pairs.push(checkS8ABLevel(aBase, bPerturbed));
  const status = judgeS8AB(a, b, pairs.map(p => p.check));
  const summary = (r: typeof a) => ({ status: r.status, metrics: r.metrics, diagnostics: r.diagnostics,
    refinements: r.refinements, conditioning: r.conditioning,
    levels: [...r.levels, r.perturbed].map(l => ({ factor: l.factor, probes: l.samplesPerSpan,
      path: l.validation, curvature: l.curvature, undeclared: l.undeclaredCrossings,
      solves: l.solves.map(s => ({ window: s.windowId, status: s.result.status, settleMoveMm: s.settleMoveMm })) })) });
  const artifact = {
    version: 1, kind: 's8-a1-b1-control', status, source: { ...source,
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      sourceModified: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() },
    craftSource: S8_AB_SOURCE, scope: 'One pole, A1 then B1. No A2/B2, no compression or force-equilibrium claim.',
    A: pairs.at(-2)!.A, B: pairs.at(-2)!.B, checks: pairs.map(p => p.check),
    acceptance: { A: summary(a), B: summary(b) },
    marks: { A: plans.A.tips, B: plans.B.tips },
  };
  mkdirSync(join(root, 'public/fixtures'), { recursive: true });
  writeFileSync(join(root, 'public/fixtures/s8-ab.json'), JSON.stringify(artifact));
  console.log(JSON.stringify({ status, A: a.status, B: b.status, checks: pairs.map(p => ({
    status: p.check.status, clearance: p.check.clearance, crossings: p.check.surfaceCrossings,
    diagnostics: p.check.diagnostics.map(d => [d.code, d.message]) })) }));
}
