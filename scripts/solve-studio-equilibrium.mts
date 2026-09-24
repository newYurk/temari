import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildStudioEquilibriumInput } from '../src/components/temari/studio-equilibrium.ts';
import { evaluateYarnEquilibrium, solveYarnEquilibrium, YARN_EQUILIBRIUM_DEFAULTS } from '../src/components/temari/yarn-equilibrium.ts';
import { runtimeModelSource } from './lib/stitch-diagram-data.ts';

const root = resolve(import.meta.dirname, '..');
const portArg = process.argv.find(a => a.startsWith('--ports='));
if (portArg && portArg !== '--ports=render' && portArg !== '--ports=recipe') throw new RangeError('Use --ports=render or --ports=recipe.');
if (process.argv.some(a => a.startsWith('--available=')) && !process.argv.some(a => a.startsWith('--feed=')))
  throw new RangeError('--available requires an explicit --feed tension.');
const arg = (name: string, fallback: number) => Number(process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const readSource = () => runtimeModelSource(root, 'scripts/solve-studio-equilibrium.mts', 'package-lock.json');
const source = readSource();
const fixture = buildStudioEquilibriumInput({ stepMm: arg('step', .45), radiusMm: arg('radius', .355),
  initialStrain: arg('strain', 0), axialStiffnessN: arg('EA', 10), bendingStiffnessNmm2: arg('B', .001),
  portSource: process.argv.includes('--ports=recipe') ? 'recipe' : 'render',
  ...(process.argv.some(a => a.startsWith('--feed=')) ? { feedTensionN: arg('feed', .05), availableLengthMm: arg('available', 40) } : {}),
});
const before = evaluateYarnEquilibrium(fixture.input);
const start = performance.now();
const solverOptions = { ...YARN_EQUILIBRIUM_DEFAULTS, maxIterationsPerOuter: arg('iterations', 250),
  maxOuterIterations: arg('outer', 12), penetrationToleranceMm: 1e-4, gradientToleranceN: 1e-5 };
const result = solveYarnEquilibrium({ ...fixture.input, options: solverOptions });
const rechecked = evaluateYarnEquilibrium({ ...fixture.input, threads: result.threads }, result.contactMultipliersN);
const max = (values: number[]) => Math.max(0, ...values);
const sameSource = readSource().digest === source.digest;
if (!sameSource) throw new Error('Solver sources changed during execution. Repeat on an unchanged snapshot.');
const summary = {
  status: result.status, seconds: (performance.now() - start) / 1000, iterations: result.iterations,
  nodes: fixture.rows.map(row => row.thread.nodes.length), parameters: fixture.parameters,
  portSource: fixture.portSource,
  before: { energy: before.energy, residuals: before.residuals }, after: { energy: result.energy, residuals: rechecked.residuals },
  maxFixedDisplacementMm: max(result.threads.flatMap((t, i) => t.nodes.flatMap((n, j) => n.fixed
    ? [Math.hypot(...n.positionMm.map((v, d) => v - fixture.input.threads[i].nodes[j].positionMm[d]))] : []))),
  restLengthChangeMm: result.threads.map((t, i) => t.restLengthsMm.reduce((sum, l, j) => sum + l - fixture.input.threads[i].restLengthsMm[j], 0)),
  heightsBeforeMm: fixture.input.threads.map(t => max(t.nodes.map(n => Math.hypot(...n.positionMm) - fixture.bodyRadiusMm))),
  heightsAfterMm: result.threads.map(t => max(t.nodes.map(n => Math.hypot(...n.positionMm) - fixture.bodyRadiusMm))),
  diagnostics: result.diagnostics,
  materialLedger: result.materialLedger,
  acceptance: 'Numerical local mechanics only. No capture, sewing history, section deformation, mesh refinement, or craft acceptance is implied.',
};
const out = resolve(root, process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'screenshots/equilibrium/studio-equilibrium.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: { ...source, nodeVersion: process.version,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: root }).trim() }, solverOptions, fixture, result, summary }, null, 2));
console.log(JSON.stringify({ artifact: out, sourceDigest: source.digest, ...summary }, null, 2));
if (process.argv.includes('--assert-converged') && result.status !== 'converged') process.exitCode = 1;
