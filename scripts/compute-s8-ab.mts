import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildS8KikuLevel, judgeS8Kiku, type S8KikuLevel } from '../src/components/temari/s8-kiku.ts';
import { planS8AB, checkS8ABLevel, judgeS8AB, S8_AB_SOURCE } from '../src/components/temari/s8-kiku-ab.ts';
import {
  planS8AB2,
  nameS8Thread2,
  checkS8AB2Level,
  judgeS8AB2,
} from '../src/components/temari/s8-kiku-ab2.ts';
import { nameS8Thread } from '../src/components/temari/s8-kiku-ab.ts';
import { modelSource } from './lib/stitch-diagram-data.ts';

const root = resolve(process.env.TEMARI_ROOT ?? process.cwd());
const smoke = process.argv.includes('--smoke');

// Source digest covers both passes so a changed A2/B2 plan invalidates the cache.
const source = modelSource(root, 'src/components/temari/s8-kiku-ab.ts',
                                 'src/components/temari/s8-kiku-ab2.ts');
const numerical = source;
const cache = join(root, 'screenshots/s8-ab-compute', numerical.digest);
mkdirSync(cache, { recursive: true });

// ── First pass (A1 / B1) ────────────────────────────────────────────────────
const plans  = planS8AB();
const plans2 = planS8AB2();

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
if (process.argv.includes('--a-check')) { load('A', 4, 8); process.exit(0); }

const aLevels = factors.map(f => load('A', f, 4));
const aBase   = aLevels.at(-1)!;
const bLevels = factors.map(f => load('B', f, 4, aBase));
const bBase   = bLevels.at(-1)!;

// ── Second pass (A2 / B2) ───────────────────────────────────────────────────
// A2 is solved with A1 and B1 as rigid obstacles.
// B2 is solved with A1, B1, and A2 as rigid obstacles.

const loadA2 = (factor: number, probes: number) => {
  const tag  = `A2-${factor}-${probes}-on-A1x${aBase.factor}-B1x${bBase.factor}`;
  const file = join(cache, `${tag}.json`);
  if (existsSync(file)) { console.log(`cache A2 x${factor}/${probes}`); return JSON.parse(readFileSync(file, 'utf8')) as S8KikuLevel; }
  console.log(`start A2 x${factor}/${probes} ${new Date().toISOString()}`);
  const level = buildS8KikuLevel(plans2.A2, factor, probes, undefined, {
    marking: [],
    laidThreads: [aBase.coupon, bBase.coupon],
  });
  writeFileSync(file, JSON.stringify(level));
  console.log(JSON.stringify({ group: 'A2', factor, probes, validation: level.validation.status,
    diagnostics: level.diagnostics, undeclared: level.undeclaredCrossings,
    solves: level.solves.map(s => [s.windowId, s.result.status, s.settleMoveMm]) }));
  return level;
};

const loadB2 = (factor: number, probes: number, a2: S8KikuLevel) => {
  const tag  = `B2-${factor}-${probes}-on-A1x${aBase.factor}-B1x${bBase.factor}-A2x${a2.factor}`;
  const file = join(cache, `${tag}.json`);
  if (existsSync(file)) { console.log(`cache B2 x${factor}/${probes}`); return JSON.parse(readFileSync(file, 'utf8')) as S8KikuLevel; }
  console.log(`start B2 x${factor}/${probes} ${new Date().toISOString()}`);
  const level = buildS8KikuLevel(plans2.B2, factor, probes, undefined, {
    marking: [],
    laidThreads: [aBase.coupon, bBase.coupon, a2.coupon],
  });
  writeFileSync(file, JSON.stringify(level));
  console.log(JSON.stringify({ group: 'B2', factor, probes, validation: level.validation.status,
    diagnostics: level.diagnostics, undeclared: level.undeclaredCrossings,
    solves: level.solves.map(s => [s.windowId, s.result.status, s.settleMoveMm]) }));
  return level;
};

const a2Levels = factors.map(f => loadA2(f, 4));
const a2Base   = a2Levels.at(-1)!;
const b2Levels = factors.map(f => loadB2(f, 4, a2Base));
const b2Base   = b2Levels.at(-1)!;

// AB2 inter-thread checks at every B2 ladder level + conditioning rebuild.
const ab2Pairs = b2Levels.map(b2 => checkS8AB2Level(
  { ...aBase,  coupon: nameS8Thread(aBase.coupon,  'A') },
  { ...bBase,  coupon: nameS8Thread(bBase.coupon,  'B',  aBase.coupon.operations.length) },
  { ...a2Base, coupon: nameS8Thread2(a2Base.coupon, 'A2', aBase.coupon.operations.length + bBase.coupon.operations.length) },
  { ...b2,     coupon: nameS8Thread2(b2.coupon,     'B2', aBase.coupon.operations.length + bBase.coupon.operations.length + a2Base.coupon.operations.length) },
  aBase.coupon.operations.length,
  bBase.coupon.operations.length,
  a2Base.coupon.operations.length,
));

const pairs = bLevels.map(b => checkS8ABLevel(aBase, b));

if (smoke) {
  writeFileSync(join(root, 'screenshots/s8-ab-smoke.json'), JSON.stringify({ ab1: pairs[0], ab2: ab2Pairs[0] }));
  console.log(JSON.stringify({ smoke: true, ab1: pairs[0].check, ab2: ab2Pairs[0].check }));
} else {
  const aPerturbed  = load('A', 4, 8);
  const bPerturbed  = load('B', 4, 8, aBase);
  const a2Perturbed = loadA2(4, 8);
  const b2Perturbed = loadB2(4, 8, a2Perturbed);

  const a  = judgeS8Kiku(plans.A,  aLevels,  aPerturbed);
  const b  = judgeS8Kiku(plans.B,  bLevels,  bPerturbed);
  const a2 = judgeS8Kiku(plans2.A2, a2Levels, a2Perturbed);
  const b2 = judgeS8Kiku(plans2.B2, b2Levels, b2Perturbed);

  pairs.push(checkS8ABLevel(aBase, bPerturbed));

  const ab2PerturbedCheck = checkS8AB2Level(
    { ...aBase,       coupon: nameS8Thread(aPerturbed.coupon,  'A') },
    { ...bBase,       coupon: nameS8Thread(bPerturbed.coupon,  'B',  aPerturbed.coupon.operations.length) },
    { ...a2Perturbed, coupon: nameS8Thread2(a2Perturbed.coupon, 'A2', aPerturbed.coupon.operations.length + bPerturbed.coupon.operations.length) },
    { ...b2Perturbed, coupon: nameS8Thread2(b2Perturbed.coupon, 'B2', aPerturbed.coupon.operations.length + bPerturbed.coupon.operations.length + a2Perturbed.coupon.operations.length) },
    aPerturbed.coupon.operations.length,
    bPerturbed.coupon.operations.length,
    a2Perturbed.coupon.operations.length,
  );
  ab2Pairs.push(ab2PerturbedCheck);

  const ab1Verdict = judgeS8AB(a, b, pairs.map(p => p.check));
  const ab2Verdict = judgeS8AB2(a, b, a2, b2, ab1Verdict, ab2Pairs.map(p => p.check));

  const summary = (r: typeof a) => ({
    status: r.status, metrics: r.metrics, diagnostics: r.diagnostics,
    refinements: r.refinements, conditioning: r.conditioning,
    levels: [...r.levels, r.perturbed].map(l => ({
      factor: l.factor, probes: l.samplesPerSpan,
      path: l.validation, curvature: l.curvature, undeclared: l.undeclaredCrossings,
      solves: l.solves.map(s => ({ window: s.windowId, status: s.result.status, settleMoveMm: s.settleMoveMm })),
    })),
  });

  const artifact = {
    version: 2,
    kind: 's8-a1-b1-a2-b2-control',
    status: ab2Verdict,
    source: {
      ...source,
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      sourceModified: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
    },
    craftSource: S8_AB_SOURCE,
    scope: 'One pole, A1 then B1 then A2 then B2. No second pole, no C8.',
    // First pass
    A1: pairs.at(-2)!.A, B1: pairs.at(-2)!.B,
    ab1Checks: pairs.map(p => p.check),
    ab1Verdict,
    // Second pass
    A2: ab2Pairs.at(-2)!.A2, B2: ab2Pairs.at(-2)!.B2,
    ab2Checks: ab2Pairs.map(p => p.check),
    ab2Verdict,
    acceptance: { A: summary(a), B: summary(b), A2: summary(a2), B2: summary(b2) },
    marks: { A: plans.A.tips, B: plans.B.tips, A2: plans2.A2.tips, B2: plans2.B2.tips },
  };

  if (modelSource(root, 'src/components/temari/s8-kiku-ab.ts',
    'src/components/temari/s8-kiku-ab2.ts').digest !== source.digest) {
    throw new Error('S8 AB model changed while computing: refusing to publish mixed-source evidence.');
  }
  mkdirSync(join(root, 'public/fixtures'), { recursive: true });
  writeFileSync(join(root, 'public/fixtures/s8-ab.json'), JSON.stringify(artifact));
  console.log(JSON.stringify({
    ab1Verdict, ab2Verdict,
    A: a.status, B: b.status, A2: a2.status, B2: b2.status,
    ab1Checks: pairs.map(p => ({ status: p.check.status, crossings: p.check.surfaceCrossings })),
    ab2Checks: ab2Pairs.map(p => ({ status: p.check.status, crossings: p.check.surfaceCrossings })),
  }));
}
