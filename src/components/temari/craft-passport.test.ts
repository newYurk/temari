import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addForecast, addObservation, circumferenceMm, compareObservation, exampleParameters, exportObservations,
  forecastLengthMm, forecastReason, MAX_PASSPORT_BYTES, newPassport, parseNumber, readPassport, sameParameters,
  savePassport, toMm, validateModel, validateParameters, withParameters, type ObservationInput, type WorkParameters,
} from './craft-passport';
const model = validateModel(JSON.parse(readFileSync(new URL('../../../public/fixtures/passport-model.json', import.meta.url), 'utf8')));
const timestamp = '2026-09-19T19:00:00.000Z';
const work = () => withParameters(newPassport('work-test', timestamp), exampleParameters());
const predicted = () => addForecast(work(), model, timestamp);
const input = (patch: Partial<ObservationInput> = {}): ObservationInput => ({
  scope: 's8-first-pass-one-pole', component: 'embroidery', slot: 'all', basis: 'in-project',
  method: 'before-after', value: .65, unit: 'm', uncertainty: null, ...patch,
});
const measured = (patch: Partial<ObservationInput> = {}) => {
  const p = predicted(); return addObservation(p, input(patch), p.forecasts[0].id, timestamp);
};
const result = (patch: Partial<ObservationInput> = {}) => { const p = measured(patch); return compareObservation(p, p.observations[0]); };
describe('craft passport: explicit dimensions and immutable forecasts', () => {
  it('starts with unknown ball size, not an invented measurement', () => {
    assert.equal(circumferenceMm(newPassport('work-a', timestamp).parameters), null);
  });
  it('accepts decimal comma and point, including fractional shorthand', () => {
    for (const s of ['0.4', '0,4', '.4', ',4']) assert.equal(parseNumber(s), .4);
    assert.equal(parseNumber('  '), null); assert.equal(parseNumber('0'), 0);
    for (const s of ['-1', 'NaN', 'Infinity', '1e3', '1,2,3', 'hello']) assert.throws(() => parseNumber(s));
  });
  it('preserves the original diameter while normalising circumference', () => {
    const p = exampleParameters(), d = structuredClone(p); d.ball = { kind: 'diameter', value: 230 / Math.PI, unit: 'mm' };
    assert.ok(Math.abs(circumferenceMm(d)! - 230) < 1e-9);
    assert.equal(d.ball.kind, 'diameter'); assert.ok(sameParameters(p, d));
    d.ball = { kind: 'circumference', value: 230, unit: 'mm' }; assert.ok(sameParameters(p, d));
  });
  it('does not confuse units of measured yarn length', () => {
    assert.equal(toMm(.65, 'm'), 650); assert.equal(toMm(65, 'cm'), 650); assert.equal(toMm(650, 'mm'), 650);
    assert.equal(toMm(null, 'm'), null);
  });
  it('rejects nonphysical sizes, fractions of rows and invalid sections', () => {
    for (const n of [0, -1, NaN, Infinity, 10001]) { const p = exampleParameters(); p.ball.value = n; assert.throws(() => validateParameters(p)); }
    const p = exampleParameters(); p.rows = 1.5; assert.throws(() => validateParameters(p));
    p.rows = 1; p.yarns.A.diameterMm = 0; assert.throws(() => validateParameters(p));
  });
  it('uses the actual accepted S8 model lengths without shopping coefficients', () => {
    const f = predicted().forecasts[0];
    assert.equal(f.status, 'available'); assert.equal(f.model!.calibrated, false);
    assert.equal(forecastLengthMm(f, 'A'), model.lengthsMm.A.total);
    assert.equal(forecastLengthMm(f, 'all'), model.lengthsMm.A.total + model.lengthsMm.B.total);
  });
  it('never extrapolates to other ball sizes, marks, recipes, scopes, rows, centers or thread sizes', () => {
    const variants: WorkParameters[] = [
      { ...exampleParameters(), ball: { kind: 'circumference' as const, value: 24, unit: 'cm' as const } },
      { ...exampleParameters(), division: 'c8' as const }, { ...exampleParameters(), recipe: 'other' as const },
      { ...exampleParameters(), scope: 'whole-ball' as const }, { ...exampleParameters(), rows: 2 },
      { ...exampleParameters(), centers: 2 },
    ];
    const thicker = exampleParameters(); thicker.yarns.B.diameterMm = .71; variants.push(thicker);
    for (const p of variants) {
      const f = addForecast(withParameters(work(), p), model, timestamp).forecasts[0];
      assert.equal(f.status, 'unavailable'); assert.equal(f.model, null); assert.equal(forecastLengthMm(f, 'all'), null);
    }
  });
  it('can document an unsupported work and a model-loading failure explicitly', () => {
    assert.equal(forecastReason(exampleParameters(), null), 'model-unavailable');
    assert.equal(addForecast(work(), null, timestamp).forecasts[0].status, 'unavailable');
  });
  it('retains the original forecast when inputs or the model version change', () => {
    const first = predicted(), original = JSON.stringify(first.forecasts[0]);
    const p = exampleParameters(); p.rows = 2;
    const second = addForecast(withParameters(first, p), model, timestamp);
    assert.equal(second.forecasts[1].status, 'unavailable'); assert.equal(JSON.stringify(second.forecasts[0]), original);
    const version = structuredClone(model); version.snapshotDigest = 'f'.repeat(64);
    const third = addForecast(withParameters(second, exampleParameters()), version, timestamp);
    assert.equal(third.forecasts[2].model!.snapshotDigest, version.snapshotDigest);
    assert.equal(JSON.stringify(third.forecasts[0]), original); assert.ok(Object.isFrozen(third.forecasts[0].parameters.yarns.A));
  });
  it('copies model/parameter inputs rather than retaining mutable aliases', () => {
    const m = structuredClone(model), p = exampleParameters();
    const saved = addForecast(withParameters(work(), p), m, timestamp);
    m.lengthsMm.A.total = 1; p.yarns.A.description = 'changed';
    assert.equal(saved.forecasts[0].model!.lengthsMm.A.total, model.lengthsMm.A.total);
    assert.equal(saved.forecasts[0].parameters.yarns.A.description, '');
  });
});
describe('craft passport: a fact is not automatically a model error', () => {
  it('compares measured path length for the same work and scope', () => {
    const c = result();
    assert.equal(c.status, 'comparable'); assert.equal(c.actualMm, 650);
    assert.ok(Math.abs(c.deltaMm! - (650 - model.lengthsMm.A.total - model.lengthsMm.B.total)) < 1e-9);
    assert.equal(c.measuredComparablePath, true);
  });
  it('compares each working thread separately', () => {
    const c = result({ slot: 'A', value: 33, unit: 'cm' });
    assert.equal(c.predictedMm, model.lengthsMm.A.total); assert.equal(c.actualMm, 330);
  });
  it('keeps unknown apart from zero, and zero apart from missing', () => {
    assert.equal(result({ value: null }).status, 'missing'); assert.equal(result({ value: null }).actualMm, null);
    const zero = result({ value: 0 }); assert.equal(zero.actualMm, 0); assert.equal(zero.deltaPercentOfPrediction, -100);
  });
  it('does not compare the whole ball against one first pass', () => {
    const c = result({ scope: 'whole-ball' }); assert.equal(c.status, 'scope-mismatch'); assert.equal(c.deltaMm, null);
  });
  it('does not compare measurements from changed parameters to the old forecast', () => {
    const p = exampleParameters(); p.yarns.B.description = 'another brand';
    const w = addObservation(withParameters(predicted(), p), input(), 'forecast-1', timestamp);
    assert.equal(compareObservation(w, w.observations[0]).status, 'parameters-mismatch');
  });
  it('separates wrapping, marking, tails and waste from the embroidery prediction', () => {
    for (const component of ['wrapping', 'marking', 'tails', 'waste'] as const) {
      assert.equal(result({ component }).status, 'component-mismatch');
      assert.equal(result({ component }).predictedMm, null);
    }
  });
  it('never treats purchased yarn as consumption', () => {
    const c = result({ basis: 'purchased' }); assert.equal(c.status, 'purchase'); assert.equal(c.deltaMm, null);
  });
  it('labels total consumption as excess over geometry, not pure model error', () => {
    const c = result({ basis: 'consumed' }); assert.equal(c.status, 'consumption');
    assert.ok(c.deltaMm !== null); assert.equal(c.measuredComparablePath, false);
  });
  it('retains approximate measurements without promoting them to exact facts', () => {
    const c = result({ method: 'estimate' }); assert.equal(c.status, 'estimated'); assert.equal(c.measuredComparablePath, false);
  });
  it('rejects negative lengths, gram inputs, unknown forecast references and uncertainty without a value', () => {
    assert.throws(() => measured({ value: -1 })); assert.throws(() => measured({ unit: 'g' as 'm' }));
    assert.throws(() => measured({ value: null, uncertainty: 1 }));
    assert.throws(() => addObservation(predicted(), input(), 'missing', timestamp));
  });
  it('can record a measurement with no available forecast', () => {
    const p = addObservation(work(), input(), null, timestamp);
    assert.equal(compareObservation(p, p.observations[0]).status, 'no-forecast');
  });
});
describe('craft passport: private round-trip and structured export', () => {
  it('round-trips the complete local record without losing forecasts or facts', () => {
    const p = measured({ uncertainty: .01 }); assert.deepEqual(readPassport(savePassport(p), model), p);
  });
  it('exports no free text, dates, local IDs or contact values, including inside frozen history', () => {
    const p = exampleParameters(); p.yarns.A.description = 'PRIVATE user@example.com phone-123';
    let w = withParameters(work(), p, { title: 'PRIVATE_TITLE', notes: 'PRIVATE_NOTES user@example.com' });
    w = addForecast(w, model, timestamp); w = addObservation(w, input(), 'forecast-1', timestamp);
    const json = JSON.stringify(exportObservations(w));
    for (const marker of ['PRIVATE', 'user@example.com', 'phone-123', 'work-test', timestamp, 'forecast-1', 'observation-1']) assert.ok(!json.includes(marker), marker);
    assert.ok(savePassport(w).includes('PRIVATE_TITLE'));
    const exported = exportObservations(w); assert.equal(exported.observations[0].forecastIndex, 1);
    assert.equal(exported.observations[0].lengthMm, 650); assert.equal(exported.forecasts[0].model!.calibrated, false);
  });
  it('rejects unknown top-level and nested fields, not just known PII spellings', () => {
    const base = JSON.parse(savePassport(measured()));
    for (const key of ['email', 'contact', '__proto__', 'unexpected']) {
      assert.throws(() => readPassport(JSON.stringify({ ...base, [key]: 'leak' })));
    }
    base.forecasts[0].parameters.yarns.A.email = 'bad@example.com'; assert.throws(() => readPassport(JSON.stringify(base)));
  });
  it('rejects malformed JSON, future schema, oversized and inconsistent files', () => {
    assert.throws(() => readPassport('{'));
    assert.throws(() => readPassport(' '.repeat(MAX_PASSPORT_BYTES + 1)));
    const p = JSON.parse(savePassport(measured())); p.schemaVersion = 999; assert.throws(() => readPassport(JSON.stringify(p)));
    p.schemaVersion = 1; p.observations[0].forecastId = 'absent'; assert.throws(() => readPassport(JSON.stringify(p)));
  });
  it('rejects tampered values claiming the current model snapshot', () => {
    const p = JSON.parse(savePassport(predicted()));
    p.forecasts[0].model.lengthsMm.A.total += 1; p.forecasts[0].model.lengthsMm.A.surface += 1;
    assert.throws(() => readPassport(JSON.stringify(p), model), /изменены/);
  });
  it('retains old model versions without silently recalculating them', () => {
    const p = JSON.parse(savePassport(predicted()));
    p.forecasts[0].model.snapshotDigest = 'e'.repeat(64);
    const loaded = readPassport(JSON.stringify(p), model);
    assert.equal(loaded.forecasts[0].model!.snapshotDigest, 'e'.repeat(64));
  });
  it('treats reordered JSON fields as the same parameters and model', () => {
    const reverse = (v: unknown): unknown => Array.isArray(v) ? v.map(reverse) : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).reverse().map(([k, value]) => [k, reverse(value)])) : v;
    const p = measured(), imported = readPassport(JSON.stringify(reverse(p)), model);
    assert.ok(sameParameters(imported.parameters, p.parameters));
    assert.equal(compareObservation(imported, imported.observations[0]).status, 'comparable');
  });
  it('does not collide with an imported nonsequential ID', () => {
    const p = JSON.parse(savePassport(predicted())); p.forecasts[0].id = 'forecast-2';
    const next = addForecast(readPassport(JSON.stringify(p)), model, timestamp);
    assert.equal(new Set(next.forecasts.map(f => f.id)).size, 2);
  });
  it('rejects false calibrated claims and unsupported model dimensions', () => {
    assert.throws(() => validateModel({ ...model, calibrated: true }));
    assert.throws(() => validateModel({ ...model, circumferenceMm: 240 }));
  });
});
