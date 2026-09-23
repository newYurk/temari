import type { UpperKikuResult } from './upper-kiku';
import { createThreadSpanMesh, meshBodyGapMm } from './thread-path-mesh';

export type UpperSource = {
  mode: 'build' | 'cli' | 'development-startup';
  model: { digest: string; files: { path: string; sha256: string }[] };
  renderer: { digest: string; files: { path: string; sha256: string }[] };
  dependencies: string;
};

export function auditUpperMeshes(result: UpperKikuResult) {
  let bodyGapMm = Infinity, envelopeErrorMm = 0;
  for (const { coupon } of result.rows) for (const span of coupon.spans) {
    const mesh = createThreadSpanMesh(span, coupon.threadRadiusMm, coupon.bodyRadiusMm);
    try {
      envelopeErrorMm = Math.max(envelopeErrorMm, mesh.envelopeErrorMm);
      if (span.zone === 'surface') bodyGapMm = Math.min(bodyGapMm, meshBodyGapMm(mesh.geometry, coupon.bodyRadiusMm));
    } finally { mesh.geometry.dispose(); }
  }
  const diagnostics: string[] = [];
  if (!(bodyGapMm > 0)) diagnostics.push('A displayed surface triangle intersects the analytical body.');
  for (const row of result.rows) {
    if (row.checks.validation.status !== 'passed'
      || !(row.checks.validation.minSupportGapMm > envelopeErrorMm)
      || !(row.checks.validation.minSelfGapMm > 2 * envelopeErrorMm)
      || row.checks.earlier.some(c => c.status !== 'passed' || !(c.lowerMm > 2 * envelopeErrorMm))) {
      diagnostics.push(`Row ${row.visit.row + 1}: mesh envelope clearance is not certified.`);
    }
  }
  return { status: diagnostics.length ? 'unresolved' as const : 'passed' as const, bodyGapMm, envelopeErrorMm, diagnostics };
}

export type UpperSnapshot = {
  version: 1;
  source: UpperSource;
  result: UpperKikuResult;
  mesh: ReturnType<typeof auditUpperMeshes>;
};
export type UpperWorkerMessage =
  | { kind: 'progress'; message: string }
  | { kind: 'result'; snapshot: UpperSnapshot }
  | { kind: 'error'; message: string };
