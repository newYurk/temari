/** Finite material inventory, in mm, for one explicitly allocated piece of yarn. */
export type ThreadMaterialState = {
  placedLengthMm: number;
  reservoirMm: number;
  /** Assigned before constructing/relaxing a path; never fitted to its result. */
  totalMaterialMm: number;
};
export type ThreadMaterialBoundary =
  | { kind: 'no-slip' }
  /** Positive feeds the placed path from the reservoir; negative returns yarn. */
  | { kind: 'prescribed-exchange'; exchangeMm: number }
  | { kind: 'unknown' };
export type ThreadMaterialRequest = {
  previous: Readonly<ThreadMaterialState>;
  next: { readonly placedLengthMm: number };
  boundary: ThreadMaterialBoundary;
  /** Only under this declared idealization may geometric arc length stand for material length. */
  lengthModel: 'inextensible-kinematic';
  /** Absolute numerical tolerance, not stretch, slack or permission for negative inventory. */
  toleranceMm?: number;
};
export type ThreadMaterialAudit = {
  /** 'conserved' certifies only this scalar ledger, never topology, forces or craft acceptance. */
  status: 'conserved' | 'rejected' | 'unresolved';
  materialDeltaMm: number | null;
  prescribedExchangeMm: number | null;
  reservoirAfterMm: number | null;
  initialMismatchMm: number | null;
  /** next placed + prescribed remaining reservoir - assigned total; null if exchange is unknown. */
  mismatchMm: number | null;
  nextState: ThreadMaterialState | null;
  diagnostics: { code: string; message: string }[];
};

/**
 * Checks a caller's allocation and prescribed transfer; never invents either from a solved curve.
 * A no-slip boundary means zero material exchange. Endpoint positions and local slip are outside
 * this scalar check, as are duplicate material IDs or whether the declared geometry is stretched.
 */
export function auditThreadMaterial(input: ThreadMaterialRequest): ThreadMaterialAudit {
  const result: ThreadMaterialAudit = { status: 'unresolved', materialDeltaMm: null,
    prescribedExchangeMm: null, reservoirAfterMm: null, initialMismatchMm: null, mismatchMm: null,
    nextState: null, diagnostics: [] };
  const reject = (code: string, message: string) => {
    result.status = 'rejected'; result.diagnostics.push({ code, message });
  };
  const { previous, next, boundary } = input;
  const tolerance = input.toleranceMm ?? 1e-9;
  const quantities = [previous.placedLengthMm, previous.reservoirMm, previous.totalMaterialMm, next.placedLengthMm];
  if (quantities.some(n => !Number.isFinite(n) || n < 0) || !Number.isFinite(tolerance) || tolerance < 0
    || (boundary.kind === 'prescribed-exchange' && !Number.isFinite(boundary.exchangeMm))) {
    reject('invalid-quantity', 'Lengths, inventory and tolerance must be finite and nonnegative; signed exchange must be finite.');
    return result;
  }
  if (input.lengthModel !== 'inextensible-kinematic') {
    result.diagnostics.push({ code: 'length-model-unknown', message: 'No declared conversion from geometric length to material length.' });
    return result;
  }
  const initialMismatch = previous.placedLengthMm + previous.reservoirMm - previous.totalMaterialMm;
  if (!Number.isFinite(initialMismatch)) {
    reject('arithmetic-overflow', 'The material ledger exceeds finite arithmetic.'); return result;
  }
  result.initialMismatchMm = initialMismatch;
  result.materialDeltaMm = next.placedLengthMm - previous.placedLengthMm;
  if (Math.abs(initialMismatch) > tolerance) {
    reject('initial-allocation-mismatch', 'Previous placed length and reservoir do not equal the assigned material.');
  }
  if (boundary.kind !== 'no-slip' && boundary.kind !== 'prescribed-exchange') {
    result.diagnostics.push({ code: 'exchange-unknown', message: 'Material transfer must be prescribed independently of the next path.' });
    if (next.placedLengthMm > previous.totalMaterialMm) {
      reject('insufficient-total-material', 'The next placed length exceeds all assigned material.');
    }
    return result;
  }
  const exchange = boundary.kind === 'no-slip' ? 0 : boundary.exchangeMm;
  const reservoirAfter = previous.reservoirMm - exchange;
  const mismatch = next.placedLengthMm + reservoirAfter - previous.totalMaterialMm;
  result.prescribedExchangeMm = exchange;
  if (!Number.isFinite(reservoirAfter) || !Number.isFinite(mismatch)) {
    reject('arithmetic-overflow', 'The prescribed transfer exceeds finite arithmetic.'); return result;
  }
  result.reservoirAfterMm = reservoirAfter;
  result.mismatchMm = mismatch;
  if (reservoirAfter < 0) reject('negative-reservoir', 'Prescribed feed exceeds the external material reservoir.');
  if (Math.abs(result.materialDeltaMm - exchange) > tolerance || Math.abs(mismatch) > tolerance) {
    reject('material-length-mismatch', 'The change in placed length differs from the prescribed transfer or assigned total.');
  }
  if (result.status !== 'rejected') {
    result.status = 'conserved';
    result.nextState = { placedLengthMm: next.placedLengthMm, reservoirMm: reservoirAfter,
      totalMaterialMm: previous.totalMaterialMm };
  }
  return result;
}
