import { computeS8Kiku, S8_KIKU_DIMENSIONS, type S8KikuLevel, type S8KikuStage } from './components/temari/s8-kiku';

export type S8KikuSummary = ReturnType<typeof summarise>;

const levelSummary = (l: S8KikuLevel, rounds: ReadonlyMap<string, number>) => ({ factor: l.factor, samplesPerSpan: l.samplesPerSpan, reusedRounds: l.reusedRounds, validation: l.validation.status,
  codes: [...new Set(l.validation.diagnostics.map(d => d.code))], undeclared: l.undeclaredCrossings.length,
  curvature: l.curvature.upper, hiddenCurvature: l.hiddenCurvature.upper, lengthMm: l.lengthMm,
  solves: l.solves.map(s => ({ windowId: s.windowId, round: rounds.get(s.windowId)!, controlCount: s.controlCount, status: s.result.status, lengthMm: s.result.lengthMm,
    settled: s.settleMoveMm <= S8_KIKU_DIMENSIONS.settleToleranceMm })) });

function summarise(stage: S8KikuStage) {
  const r = computeS8Kiku({ stage }), rounds = new Map(r.windows.map(w => [w.id, w.round]));
  // Only the finest construction is drawn; every level is reported.
  return {
    stage: r.stage, status: r.status, diagnostics: r.diagnostics, metrics: r.metrics, tips: r.tips, factors: r.factors, bites: r.bites,
    windows: r.windows.map(({ id, kind, tip, row, seedLengthMm, minimumSpans }) => ({ id, kind, tip, row, seedLengthMm, minimumSpans })),
    refinements: r.refinements, conditioning: r.conditioning, coupon: r.coupon,
    levels: r.levels.map(l => levelSummary(l, rounds)), perturbed: levelSummary(r.perturbed, rounds),
    earlierRounds: (r.earlierRounds ?? []).map(e => ({ status: e.status, levels: e.levels.map(l => levelSummary(l, rounds)), perturbed: levelSummary(e.perturbed, rounds) })),
  };
}

self.onmessage = (event: MessageEvent<{ stage: S8KikuStage }>) => {
  try { self.postMessage({ stage: event.data.stage, summary: summarise(event.data.stage) }); }
  catch (error) { self.postMessage({ stage: event.data.stage, error: error instanceof Error ? error.message : String(error) }); }
};
