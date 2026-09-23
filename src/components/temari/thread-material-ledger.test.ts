import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditThreadMaterial, type ThreadMaterialRequest } from './thread-material-ledger';

const request = (changes: Partial<ThreadMaterialRequest> = {}): ThreadMaterialRequest => ({
  previous: { placedLengthMm: 0, reservoirMm: 100, totalMaterialMm: 100 },
  next: { placedLengthMm: 20 }, boundary: { kind: 'prescribed-exchange', exchangeMm: 20 },
  lengthModel: 'inextensible-kinematic', ...changes,
});
const codes = (r: ReturnType<typeof auditThreadMaterial>) => r.diagnostics.map(d => d.code);

describe('finite thread material ledger', () => {
  it('accounts for a first catch from an explicitly assigned supply and carries the finite balance', () => {
    const input = request(); const original = structuredClone(input);
    const first = auditThreadMaterial(input);
    assert.equal(first.status, 'conserved');
    assert.equal(first.materialDeltaMm, 20); assert.equal(first.prescribedExchangeMm, 20);
    assert.equal(first.reservoirAfterMm, 80); assert.equal(first.mismatchMm, 0);
    assert.deepEqual(first.nextState, { placedLengthMm: 20, reservoirMm: 80, totalMaterialMm: 100 });
    const second = auditThreadMaterial(request({ previous: first.nextState!, next: { placedLengthMm: 35 },
      boundary: { kind: 'prescribed-exchange', exchangeMm: 15 } }));
    assert.deepEqual(second.nextState, { placedLengthMm: 35, reservoirMm: 65, totalMaterialMm: 100 });
    assert.deepEqual(input, original, 'checking does not rewrite the caller allocation or exchange');
  });

  it('returns prescribed pullback to the reservoir, then allows a no-slip shape change of equal length', () => {
    const result = auditThreadMaterial(request({ previous: { placedLengthMm: 20, reservoirMm: 80, totalMaterialMm: 100 },
      next: { placedLengthMm: 12 }, boundary: { kind: 'prescribed-exchange', exchangeMm: -8 } }));
    assert.equal(result.status, 'conserved'); assert.equal(result.materialDeltaMm, -8);
    assert.equal(result.reservoirAfterMm, 88);
    const fixed = auditThreadMaterial(request({ previous: result.nextState!, next: { placedLengthMm: 12 }, boundary: { kind: 'no-slip' } }));
    assert.equal(fixed.status, 'conserved'); assert.equal(fixed.prescribedExchangeMm, 0);
  });

  it('rejects no-slip shortening and lengthening instead of changing exchange or the assigned supply', () => {
    for (const nextLength of [15, 25]) {
      const result = auditThreadMaterial(request({ previous: { placedLengthMm: 20, reservoirMm: 80, totalMaterialMm: 100 },
        next: { placedLengthMm: nextLength }, boundary: { kind: 'no-slip' } }));
      assert.equal(result.status, 'rejected'); assert.equal(result.nextState, null);
      assert.equal(result.prescribedExchangeMm, 0); assert.equal(result.reservoirAfterMm, 80);
      assert.equal(result.mismatchMm, nextLength - 20);
      assert.ok(codes(result).includes('material-length-mismatch'));
    }
  });

  it('rejects double-counted initial material even if a later discrepancy would cancel it', () => {
    const result = auditThreadMaterial(request({ previous: { placedLengthMm: 20, reservoirMm: 100, totalMaterialMm: 100 },
      next: { placedLengthMm: 0 }, boundary: { kind: 'no-slip' } }));
    assert.equal(result.initialMismatchMm, 20); assert.equal(result.mismatchMm, 0);
    assert.equal(result.status, 'rejected'); assert.equal(result.nextState, null);
    assert.ok(codes(result).includes('initial-allocation-mismatch'));
  });

  it('does not infer an unknown exchange, including when the measured length stays the same', () => {
    for (const placedLengthMm of [0, 20]) {
      const result = auditThreadMaterial(request({ next: { placedLengthMm }, boundary: { kind: 'unknown' } }));
      assert.equal(result.status, 'unresolved'); assert.equal(result.materialDeltaMm, placedLengthMm);
      assert.equal(result.prescribedExchangeMm, null); assert.equal(result.reservoirAfterMm, null);
      assert.equal(result.mismatchMm, null); assert.equal(result.nextState, null);
    }
    const impossible = auditThreadMaterial(request({ next: { placedLengthMm: 101 }, boundary: { kind: 'unknown' } }));
    assert.equal(impossible.status, 'rejected'); assert.ok(codes(impossible).includes('insufficient-total-material'));
  });

  it('rejects a negative reservoir even within comparison tolerance, without clamping it', () => {
    const result = auditThreadMaterial(request({ next: { placedLengthMm: 101 }, boundary: { kind: 'prescribed-exchange', exchangeMm: 101 } }));
    assert.equal(result.status, 'rejected'); assert.equal(result.reservoirAfterMm, -1);
    assert.equal(result.mismatchMm, 0); assert.equal(result.nextState, null);
    const tiny = auditThreadMaterial(request({ previous: { placedLengthMm: 0, reservoirMm: 0, totalMaterialMm: 0 },
      next: { placedLengthMm: 1e-12 }, boundary: { kind: 'prescribed-exchange', exchangeMm: 1e-12 } }));
    assert.equal(tiny.status, 'rejected'); assert.equal(tiny.reservoirAfterMm, -1e-12);
  });

  it('does not count the same prescribed feed twice when the next path consumed it only once', () => {
    const result = auditThreadMaterial(request({ boundary: { kind: 'prescribed-exchange', exchangeMm: 40 } }));
    assert.equal(result.status, 'rejected'); assert.equal(result.prescribedExchangeMm, 40);
    assert.equal(result.materialDeltaMm, 20); assert.equal(result.reservoirAfterMm, 60);
    assert.equal(result.mismatchMm, -20);
  });

  it('rejects nonfinite, negative and overflow inputs with JSON-safe diagnostic output', () => {
    const inputs: ThreadMaterialRequest[] = [];
    for (const invalid of [NaN, Infinity, -Infinity, -1]) {
      for (const field of ['placedLengthMm', 'reservoirMm', 'totalMaterialMm'] as const) {
        inputs.push(request({ previous: { ...request().previous, [field]: invalid } }));
      }
      inputs.push(request({ next: { placedLengthMm: invalid } }), request({ toleranceMm: invalid }));
      if (!Number.isFinite(invalid)) inputs.push(request({ boundary: { kind: 'prescribed-exchange', exchangeMm: invalid } }));
    }
    inputs.push(request({ previous: { placedLengthMm: Number.MAX_VALUE, reservoirMm: Number.MAX_VALUE, totalMaterialMm: Number.MAX_VALUE } }));
    for (const input of inputs) {
      const result = auditThreadMaterial(input);
      assert.equal(result.status, 'rejected'); assert.equal(result.nextState, null);
      assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'no NaN/Infinity escapes into a snapshot');
    }
  });

  it('uses tolerance only for the numerical ledger and requires the length idealization to be declared', () => {
    const close = auditThreadMaterial(request({ next: { placedLengthMm: 20 + 1e-10 } }));
    assert.equal(close.status, 'conserved'); assert.equal(close.prescribedExchangeMm, 20);
    assert.equal(close.reservoirAfterMm, 80); assert.notEqual(close.mismatchMm, 0);
    const exact = auditThreadMaterial(request({ next: { placedLengthMm: 20 + 1e-10 }, toleranceMm: 0 }));
    assert.equal(exact.status, 'rejected');
    const undeclared = auditThreadMaterial({ ...request(), lengthModel: undefined } as unknown as ThreadMaterialRequest);
    assert.equal(undeclared.status, 'unresolved'); assert.equal(undeclared.nextState, null);
    assert.ok(codes(undeclared).includes('length-model-unknown'));
  });
});
