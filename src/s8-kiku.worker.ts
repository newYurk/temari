import { computeS8Kiku, type S8KikuStage } from './components/temari/s8-kiku';

export type S8KikuSummary = ReturnType<typeof summarise>;

function summarise(stage: S8KikuStage) {
  const r = computeS8Kiku({ stage });
  // Only the finest construction is drawn; every level is reported.
  return {
    stage: r.stage, status: r.status, diagnostics: r.diagnostics, metrics: r.metrics, tips: r.tips,
    windows: r.windows.map(({ id, kind, tip, seedLengthMm, minimumSpans }) => ({ id, kind, tip, seedLengthMm, minimumSpans })),
    refinements: r.refinements, coupon: r.coupon,
    levels: r.levels.map(l => ({ factor: l.factor, validation: l.validation.status,
      codes: [...new Set(l.validation.diagnostics.map(d => d.code))], curvature: l.curvature.upper, hiddenCurvature: l.hiddenCurvature.upper,
      lengthMm: l.lengthMm, solves: l.solves.map(s => ({ windowId: s.windowId, controlCount: s.controlCount, status: s.result.status, lengthMm: s.result.lengthMm })) })),
  };
}

self.onmessage = (event: MessageEvent<{ stage: S8KikuStage }>) => {
  try { self.postMessage({ stage: event.data.stage, summary: summarise(event.data.stage) }); }
  catch (error) { self.postMessage({ stage: event.data.stage, error: error instanceof Error ? error.message : String(error) }); }
};
