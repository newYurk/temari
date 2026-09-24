import { buildFirstVisitEquilibriumInput } from './first-visit-equilibrium';
import { auditAssignedPassage } from './single-needle-equilibrium';
import { inspectEquilibriumGeometry } from './yarn-equilibrium-validation';
import { solveYarnEquilibrium, type YarnEquilibriumOptions, type YarnEquilibriumResult } from './yarn-equilibrium';

type Fixture = ReturnType<typeof buildFirstVisitEquilibriumInput>;

/** One coordinate state for inspection, export and display. A solver outcome is
 * never repaired by a renderer or replaced with its nicer-looking seed. */
export function snapshotFirstVisit(fixture: Fixture, result: YarnEquilibriumResult | null = null) {
  const threads = result?.threads ?? fixture.input.threads;
  if (threads.length !== 1 || threads[0].id !== fixture.threadId) {
    throw new Error('The first visit must retain its one physical thread identity.');
  }
  const thread = threads[0];
  const original = fixture.input.threads[0];
  const contract = (t: typeof thread) => ({
    radiusMm: t.radiusMm, feed: t.feed, channelPassages: t.channelPassages,
    fixed: t.nodes.map(n => n.fixed),
  });
  if (JSON.stringify(contract(thread)) !== JSON.stringify(contract(original))
    || thread.nodes.some((n, i) => n.fixed && n.positionMm.some((x, d) => x !== original.nodes[i].positionMm[d]))) {
    throw new Error('A first-visit result must preserve its material, channels and observation cuts.');
  }
  if (thread.nodes.some(n => n.positionMm.length !== 3 || !n.positionMm.every(Number.isFinite))) {
    throw new Error('Non-finite first-visit coordinates cannot be displayed or exported.');
  }
  const inspection = inspectEquilibriumGeometry([thread], fixture.route.R);
  // A coincident/undefined axis cannot be used for sphere-crossing equations.
  // Keep the failed mesh diagnostic instead of replacing the solver output.
  const passages = (inspection.threads[0].mesh ? thread.channelPassages ?? [] : []).map(passage => ({
    id: passage.id,
    audit: auditAssignedPassage({ ...thread,
      nodes: thread.nodes.slice(passage.firstNode, passage.lastNode + 1),
    }, passage.domain),
  }));
  const laidLengthMm = thread.nodes.slice(1).reduce((sum, node, i) =>
    sum + Math.hypot(...node.positionMm.map((x, d) => x - thread.nodes[i].positionMm[d])), 0);
  const availableLengthMm = thread.feed!.availableLengthMm;
  const material = { availableLengthMm, laidLengthMm, reserveLengthMm: availableLengthMm - laidLengthMm };
  const channelStatus = passages.some(p => p.audit.status === 'rejected') ? 'rejected'
    : passages.length !== fixture.route.channels.length || passages.some(p => p.audit.status === 'unresolved') ? 'unresolved' : 'passed';
  const acceptance = inspection.status === 'invalid' ? 'rejected-geometry' as const
    : channelStatus === 'rejected' ? 'rejected-channel' as const
    : result?.status === 'rejected' || result?.numericallyValid === false || material.reserveLengthMm < 0
      ? 'rejected-mechanics' as const
    : !result || result.status !== 'converged' || channelStatus !== 'passed' ? 'unresolved' as const
    : 'not-certified' as const;
  return {
    kind: 'first-visit-snapshot-v1' as const,
    phase: result ? 'solved' as const : 'prepared' as const,
    route: fixture.route, thread, material, inspection, passages, channelStatus, acceptance,
    solver: result ? { status: result.status, numericallyValid: result.numericallyValid,
      iterations: result.iterations, residuals: result.residuals, diagnostics: result.diagnostics,
      energy: result.energy, materialLedger: result.materialLedger } : null,
    limitations: [
      'Показан участок первого ряда через три канала: нижний, верхний, нижний. Это ещё не цветок и не проверка трёх рядов.',
      'Порты рецепта и расширенные круглые каналы заданы для контроля. Реальные проколы не измерены.',
      'Удерживаются только два среза наблюдения, а не концы материала. Входы и выходы каналов не закрепляют узлы нити.',
      'Натяжение, жёсткость, круглый радиус и слой основы не калиброваны. Трение и деформация намотки не рассчитаны.',
      'Проверяются полные отрезки в консервативных областях каналов и показанный меш круглой нити. Это не полная проверка всех самоконтактов и ремесленной топологии.',
      'В этом примере ещё нет прежнего пучка вышивки и физической разметочной нити.',
      'Ползунок открывает части неподвижного пути. Он не показывает историю шитья, подачи материала или затягивания.',
    ],
  };
}

export type FirstVisitSnapshot = ReturnType<typeof snapshotFirstVisit>;

export function buildFirstVisitSnapshot(): FirstVisitSnapshot {
  return snapshotFirstVisit(buildFirstVisitEquilibriumInput());
}

/** Bounded diagnostic, not an automatic loop that spends time until green. */
export function solveFirstVisitSnapshot(options: YarnEquilibriumOptions = {}): FirstVisitSnapshot {
  const fixture = buildFirstVisitEquilibriumInput();
  const result = solveYarnEquilibrium({ ...fixture.input, options: {
    maxOuterIterations: 2, maxIterationsPerOuter: 40, ...options,
  } });
  return snapshotFirstVisit(fixture, result);
}
