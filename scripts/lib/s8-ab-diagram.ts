import { sampleCurve } from '../../src/components/temari/thread-geometry.ts';
import type { C8ThreadCoupon, PointMm } from '../../src/components/temari/thread-path.ts';
import type { S8Tip } from '../../src/components/temari/s8-kiku.ts';
import type { checkS8AB } from '../../src/components/temari/s8-kiku-ab.ts';
import { modelSource } from './stitch-diagram-data.ts';

export type S8ABSnapshot = {
  version: 1; kind: 's8-a1-b1-control'; status: 'accepted' | 'rejected' | 'unresolved';
  A: C8ThreadCoupon; B: C8ThreadCoupon; marks: { A: S8Tip[]; B: S8Tip[] };
  source: { digest: string; files: { path: string; sha256: string }[]; revision: string; sourceModified?: boolean };
  checks: ReturnType<typeof checkS8AB>[];
  acceptance: Record<'A' | 'B', { status: string; diagnostics: string[]; levels: {
    factor: number; probes: number; path: { status: string }; curvature: { status: string; upper: number };
    undeclared: string[]; solves: { status: string; settleMoveMm: number }[];
  }[] }>;
} | {
  version: 2; kind: 's8-a1-b1-a2-b2-control'; status: 'accepted' | 'rejected' | 'unresolved';
  A1: C8ThreadCoupon; B1: C8ThreadCoupon; A2: C8ThreadCoupon; B2: C8ThreadCoupon;
  marks: { A: S8Tip[]; B: S8Tip[]; A2: S8Tip[]; B2: S8Tip[] };
  source: { digest: string; files: { path: string; sha256: string }[]; revision: string; sourceModified?: boolean };
  ab1Checks: ReturnType<typeof checkS8AB>[];
  ab1Verdict: 'accepted' | 'rejected' | 'unresolved';
  ab2Checks: unknown[];
  ab2Verdict: 'accepted' | 'rejected' | 'unresolved';
  acceptance: Record<'A' | 'B' | 'A2' | 'B2', { status: string; diagnostics: string[]; levels: {
    factor: number; probes: number; path: { status: string }; curvature: { status: string; upper: number };
    undeclared: string[]; solves: { status: string; settleMoveMm: number }[];
  }[] }>;
};

export function firstS8ABPass(s: S8ABSnapshot) {
  return s.version === 1
    ? { status: s.status, A: s.A, B: s.B, marks: { A: s.marks.A, B: s.marks.B }, checks: s.checks, acceptance: { A: s.acceptance.A, B: s.acceptance.B } }
    : { status: s.ab1Verdict, A: s.A1, B: s.B1, marks: { A: s.marks.A, B: s.marks.B }, checks: s.ab1Checks, acceptance: { A: s.acceptance.A, B: s.acceptance.B } };
}

export function assertS8ABSnapshot(s: S8ABSnapshot, root: string) {
  if (!((s.version === 1 && s.kind === 's8-a1-b1-control') || (s.version === 2 && s.kind === 's8-a1-b1-a2-b2-control')))
    throw new Error('Invalid A1/B1 control snapshot.');
  const pass = firstS8ABPass(s);
  if (!['accepted', 'rejected', 'unresolved'].includes(pass.status)
    || pass.A.threadId === pass.B.threadId || pass.A.spans.some(p => p.threadId !== pass.A.threadId)
    || pass.B.spans.some(p => p.threadId !== pass.B.threadId) || pass.checks.length !== 6
    || pass.marks.A.length !== 8 || pass.marks.B.length !== 8) throw new Error('Invalid A1/B1 control snapshot.');
  if (pass.status === 'accepted' && (pass.acceptance.A.status !== 'accepted' || pass.acceptance.B.status !== 'accepted'
    || pass.acceptance.A.diagnostics.length || pass.acceptance.B.diagnostics.length
    || pass.checks.some(c => c.status !== 'passed' || c.surfaceCrossings !== 8 || c.clearance.status !== 'passed' || c.diagnostics.length))) {
    throw new Error('An accepted AB illustration requires both ladders and every inter-thread check.');
  }
  const factors = [1, 1.5, 2, 3, 4, 4];
  for (const group of ['A', 'B'] as const) {
    const levels = pass.acceptance[group].levels;
    if (levels.length !== 6 || levels.some((l, i) => l.factor !== factors[i] || l.probes !== (i === 5 ? 8 : 4)))
      throw new Error('AB snapshot requires both canonical ladders and doubled-probe rebuilds.');
    if (pass.status === 'accepted' && levels.some(l => l.path.status !== 'passed' || l.undeclared.length
      || l.curvature.status !== 'certified' || !(l.curvature.upper < 1) || l.solves.length !== 16
      || l.solves.some(w => w.status !== 'converged' || !Number.isFinite(w.settleMoveMm) || w.settleMoveMm > .0001)))
      throw new Error('Accepted AB snapshot has an unresolved numerical level.');
  }
  const source = modelSource(root, 'src/components/temari/s8-kiku-ab.ts');
  if (s.source.digest !== source.digest)
    throw new Error('S8 AB sources changed: recompute the snapshot before generating its illustration.');
}

/** Orthographic pole camera. The scale is shared by body, marks and actual thread paths. */
export function projectAB(p: PointMm, R: number): [number, number, number] {
  return [100 + p[0] * 78 / R, 100 + p[2] * 78 / R, p[1]];
}

export function renderABOverview(s: S8ABSnapshot) {
  const pass = firstS8ABPass(s);
  const R = pass.A.bodyRadiusMm;
  const f = (x: number) => x.toFixed(4);
  const pieces: { depth: number; path: string }[] = [];
  for (const [group, c] of [['A', pass.A], ['B', pass.B]] as const) {
    for (const span of c.spans.filter(p => p.zone === 'surface')) {
      const sample = sampleCurve(span.curve, .01);
      for (let i = 1; i < sample.points.length; i++) {
        const a = projectAB(sample.points[i - 1], R), b = projectAB(sample.points[i], R);
        pieces.push({ depth: (a[2] + b[2]) / 2, path: `<path data-thread="${group}" d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}" stroke="${group === 'A' ? '#963e44' : '#31546c'}" stroke-width="${f(2 * c.threadRadiusMm * 78 / R)}"/>` });
      }
    }
  }
  pieces.sort((a, b) => a.depth - b.depth);
  const marks = [...pass.marks.A, ...pass.marks.B].filter(t => t.role === 'lower');
  const pins = marks.map(t => { const p = projectAB(t.markMm, R); return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="1.7" />`; }).join('');
  const guides = marks.map(t => {
    const p = projectAB(t.markMm, R), dx = p[0] - 100, dy = p[1] - 100, length = Math.hypot(dx, dy);
    return `M100 100L${f(100 + 78 * dx / length)} ${f(100 + 78 * dy / length)}`;
  }).join('');
  const status = pass.status === 'accepted' ? 'Численно проверенный контрольный путь; ремесленная приёмка открыта.'
    : 'Диагностический путь: численная приёмка не пройдена. Не инструкция для готовой вышивки.';
  return `<figure id="s8-ab-overview" data-status="${pass.status}" data-source="${s.source.digest}">
          <svg class="ball" viewBox="0 0 200 200" aria-labelledby="s8-ab-svg-title s8-ab-svg-desc">
            <title id="s8-ab-svg-title">Кику Simple 8: первый круг A, затем первый круг B</title>
            <desc id="s8-ab-svg-desc">Две отдельные нити, проекция вычисленных пространственных путей. Только первый проход; скрытые подхваты видны в лаборатории.</desc>
            <circle cx="100" cy="100" r="78" fill="url(#g)" stroke="#0c0b09" stroke-width="1.15"/>
            <path d="${guides}" fill="none" stroke="#9a8b6a" stroke-width=".5" opacity=".6"/>
            <g fill="none" stroke-linecap="round">${pieces.map(p => p.path).join('')}</g>
            <g fill="#f7f3ea" stroke="#705b40" stroke-width=".7">${pins}</g>
            <text x="100" y="102" text-anchor="middle" font-size="5.5" fill="#665f58">NP</text>
          </svg>
          <figcaption><strong>Кику · S8 · A1 → B1.</strong> Бордо: первая рабочая нить A. Синий: вторая нить B,
            уложенная после A. Восемь колец отмечают нижние метки GT14 на ⅓ дуги вверх от экватора.
            Это проекция тех же данных, что в <a href="./s8-ab.html">контрольном 3D-образце</a>, не ручные звёзды.
            Вторые ряды здесь не показаны. ${status}</figcaption>
        </figure>`;
}
