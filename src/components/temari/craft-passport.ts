/** Local files only. No account, browser storage, network write or calibration fit. */
export const PASSPORT_SCHEMA = 1;
export const MAX_PASSPORT_BYTES = 1_000_000;
export const SCOPES = ['s8-first-pass-one-pole', 'whole-ball', 'other-fragment'] as const;
export const COMPONENTS = ['embroidery', 'wrapping', 'marking', 'tails', 'waste'] as const;
export const MATERIALS = ['engineering', 'pearl-5', 'pearl-8', 'hana-ito', 'bunka', 'other', 'unknown'] as const;
export const DIVISIONS = ['s4', 's8', 's10', 's16', 'c6', 'c8', 'c10', 'double-c8', 'tamentai', 'unknown'] as const;
export type Scope = typeof SCOPES[number];
export type Component = typeof COMPONENTS[number];
export type Unit = 'mm' | 'cm' | 'm';
export type Slot = 'A' | 'B' | 'all';
export type Method = 'before-after' | 'cut-minus-left' | 'estimate';
export type Basis = 'in-project' | 'consumed' | 'purchased';
export type YarnRecord = {
  material: typeof MATERIALS[number]; diameterMm: number | null; strands: number | null;
  color: string; description: string;
};
export type WorkParameters = {
  ball: { kind: 'circumference' | 'diameter'; value: number | null; unit: 'mm' | 'cm' };
  division: typeof DIVISIONS[number]; recipe: 'kiku-s8-a1-b1' | 'other';
  scope: Scope; centers: number | null; rows: number | null;
  yarns: { A: YarnRecord; B: YarnRecord };
};
export type LengthParts = { total: number; surface: number; piercing: number; buried: number };
export type PassportModel = {
  schemaVersion: 1; id: 's8-a1-b1-control'; sourceDigest: string; snapshotDigest: string;
  status: 'accepted'; calibrated: false;
  circumferenceMm: number; threadDiameterMm: number; lengthsMm: { A: LengthParts; B: LengthParts };
};
export const REASONS = ['model-unavailable', 'scope', 'recipe', 'division', 'rows-centers', 'ball-size', 'thread-size'] as const;
export type Forecast = {
  id: string; createdAt: string; parameters: WorkParameters;
  status: 'available' | 'unavailable'; reason: typeof REASONS[number] | null;
  model: PassportModel | null;
};
export type ObservationInput = {
  scope: Scope; component: Component; slot: Slot; basis: Basis; method: Method;
  value: number | null; unit: Unit; uncertainty: number | null;
};
export type Observation = ObservationInput & {
  id: string; createdAt: string; forecastId: string | null; parameters: WorkParameters;
};
export type CraftPassport = {
  kind: 'temari-local-passport'; schemaVersion: 1; id: string; createdAt: string;
  private: { title: string; notes: string }; parameters: WorkParameters;
  forecasts: Forecast[]; observations: Observation[];
};
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
const fail = (message: string): never => { throw new Error(message); };
const record = (v: unknown, keys: string[], name: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${name}: нужен объект.`);
  const r = v as Record<string, unknown>;
  if (Object.keys(r).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(r, k))) fail(`${name}: неизвестные или отсутствующие поля.`);
  return r;
};
const enumeration = <T extends string>(v: unknown, values: readonly T[], name: string): T =>
  typeof v === 'string' && values.includes(v as T) ? v as T : fail(`${name}: неизвестное значение.`);
function number(v: unknown, name: string, max = 1e7, positive = false): number | null {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || (positive ? v <= 0 : v < 0) || v > max) fail(`${name}: недопустимое число.`);
  return v as number;
}
function text(v: unknown, name: string, max: number) {
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) fail(`${name}: недопустимый текст.`);
  return v as string;
}
function id(v: unknown) {
  if (typeof v !== 'string' || !/^[a-z0-9-]{1,90}$/.test(v)) fail('Некорректный ID.');
  return v as string;
}
function date(v: unknown) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) || !Number.isFinite(Date.parse(v))) fail('Некорректная дата.');
  return v as string;
}
export function parseNumber(value: string): number | null {
  const s = value.trim();
  if (!s) return null;
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(s)) fail('Введите неотрицательное число, например 23 или 0,4.');
  return number(Number(s.replace(',', '.')), 'Число');
}
export const toMm = (value: number | null, unit: Unit) => value === null ? null : value * ({ mm: 1, cm: 10, m: 1000 }[unit]);
export const circumferenceMm = (p: WorkParameters) => {
  const length = toMm(p.ball.value, p.ball.unit);
  return length === null ? null : length * (p.ball.kind === 'diameter' ? Math.PI : 1);
};
export function validateParameters(value: unknown): WorkParameters {
  const p = record(value, ['ball', 'division', 'recipe', 'scope', 'centers', 'rows', 'yarns'], 'Параметры');
  const ball = record(p.ball, ['kind', 'value', 'unit'], 'Размер шара');
  enumeration(ball.kind, ['circumference', 'diameter'], 'Способ измерения');
  enumeration(ball.unit, ['mm', 'cm'], 'Единица шара');
  number(ball.value, 'Размер шара', 10000, true);
  enumeration(p.division, DIVISIONS, 'Разметка'); enumeration(p.recipe, ['kiku-s8-a1-b1', 'other'], 'Рецепт');
  enumeration(p.scope, SCOPES, 'Область');
  for (const key of ['centers', 'rows']) {
    const n = number(p[key], key, 10000, true);
    if (n !== null && !Number.isInteger(n)) fail('Число центров и рядов должно быть целым.');
  }
  const yarns = record(p.yarns, ['A', 'B'], 'Нити');
  for (const key of ['A', 'B']) {
    const yarn = record(yarns[key], ['material', 'diameterMm', 'strands', 'color', 'description'], `Нить ${key}`);
    enumeration(yarn.material, MATERIALS, 'Материал'); number(yarn.diameterMm, 'Диаметр нити', 100, true);
    const strands = number(yarn.strands, 'Сложения', 100, true);
    if (strands !== null && !Number.isInteger(strands)) fail('Число сложений должно быть целым.');
    if (typeof yarn.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(yarn.color)) fail('Цвет должен быть в формате #RRGGBB.');
    text(yarn.description, 'Описание нити', 250);
  }
  return copy(value) as WorkParameters;
}
export function validateModel(value: unknown): PassportModel {
  const m = record(value, ['schemaVersion', 'id', 'sourceDigest', 'snapshotDigest', 'status', 'calibrated', 'circumferenceMm', 'threadDiameterMm', 'lengthsMm'], 'Модель');
  if (m.schemaVersion !== 1 || m.id !== 's8-a1-b1-control' || m.status !== 'accepted' || m.calibrated !== false) fail('Модель не является принятым инженерным образцом S8.');
  for (const key of ['sourceDigest', 'snapshotDigest']) if (typeof m[key] !== 'string' || !/^[a-f0-9]{64}$/.test(m[key] as string)) fail('Некорректный отпечаток модели.');
  if (typeof m.circumferenceMm !== 'number' || !Number.isFinite(m.circumferenceMm) || Math.abs(m.circumferenceMm - 230) > 1e-9
    || typeof m.threadDiameterMm !== 'number' || !Number.isFinite(m.threadDiameterMm) || Math.abs(m.threadDiameterMm - .4) > 1e-12)
    fail('В этой версии паспорт поддерживает только контрольный C230 / 0,4 мм.');
  const lengths = record(m.lengthsMm, ['A', 'B'], 'Длины');
  for (const key of ['A', 'B']) {
    const parts = record(lengths[key], ['total', 'surface', 'piercing', 'buried'], 'Части пути');
    for (const field of Object.keys(parts)) if (number(parts[field], 'Длина', 100000, true) === null) fail('В модели не может быть неизвестной длины.');
    if (Math.abs((parts.total as number) - (parts.surface as number) - (parts.piercing as number) - (parts.buried as number)) > 1e-6) fail('Части пути не складываются в итог.');
  }
  return copy(value) as PassportModel;
}
export function exampleParameters(): WorkParameters {
  const yarn = (color: string): YarnRecord => ({ material: 'engineering', diameterMm: .4, strands: 1, color, description: '' });
  return { ball: { kind: 'circumference', value: 23, unit: 'cm' }, division: 's8', recipe: 'kiku-s8-a1-b1',
    scope: 's8-first-pass-one-pole', centers: 1, rows: 1, yarns: { A: yarn('#963e44'), B: yarn('#31546c') } };
}
export function newPassport(workId: string, now: string): CraftPassport {
  id(workId); date(now);
  const parameters = exampleParameters();
  parameters.ball.value = null;
  return freeze({ kind: 'temari-local-passport', schemaVersion: 1, id: workId, createdAt: now,
    private: { title: '', notes: '' }, parameters, forecasts: [], observations: [] } as CraftPassport);
}
export function withParameters(passport: CraftPassport, parameters: WorkParameters, privateData = passport.private): CraftPassport {
  text(privateData.title, 'Название', 120); text(privateData.notes, 'Заметки', 1000);
  return freeze({ ...passport, parameters: validateParameters(parameters), private: copy(privateData) });
}
const nextId = (prefix: string, ids: string[]) => { let n = 1; while (ids.includes(`${prefix}-${n}`)) n++; return `${prefix}-${n}`; };
/** Equivalent units do not invent a different work; descriptive material changes do. */
export function sameParameters(a: WorkParameters, b: WorkParameters) {
  const norm = (p: WorkParameters) => ({ ball: circumferenceMm(p) === null ? null : Math.round(circumferenceMm(p)! * 1e8) / 1e8,
    division: p.division, recipe: p.recipe, scope: p.scope, centers: p.centers, rows: p.rows,
    yarns: (['A', 'B'] as const).map(k => { const y = p.yarns[k]; return {
      material: y.material, diameterMm: y.diameterMm, strands: y.strands, color: y.color.toLowerCase(), description: y.description.trim(),
    }; }) });
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
export function forecastReason(p: WorkParameters, model: PassportModel | null): typeof REASONS[number] | null {
  if (!model) return 'model-unavailable';
  if (p.scope !== 's8-first-pass-one-pole') return 'scope';
  if (p.recipe !== 'kiku-s8-a1-b1') return 'recipe';
  if (p.division !== 's8') return 'division';
  if (p.centers !== 1 || p.rows !== 1) return 'rows-centers';
  if (circumferenceMm(p) === null || Math.abs(circumferenceMm(p)! - model.circumferenceMm) > 1e-6) return 'ball-size';
  if ([p.yarns.A, p.yarns.B].some(y => y.diameterMm === null || Math.abs(y.diameterMm - model.threadDiameterMm) > 1e-9 || y.strands !== 1)) return 'thread-size';
  return null;
}
export function addForecast(passport: CraftPassport, model: PassportModel | null, now: string): CraftPassport {
  const parameters = validateParameters(passport.parameters), checked = model ? validateModel(model) : null;
  date(now);
  if (passport.forecasts.length >= 100) fail('В одном файле допускается не больше 100 прогнозов.');
  const reason = forecastReason(parameters, checked);
  const entry: Forecast = { id: nextId('forecast', passport.forecasts.map(f => f.id)), createdAt: now, parameters,
    status: reason ? 'unavailable' : 'available', reason, model: reason ? null : checked };
  const updated = { ...passport, forecasts: [...passport.forecasts, entry] };
  savePassport(updated);
  return freeze(updated);
}
function validateObservationInput(value: unknown): ObservationInput {
  const o = record(value, ['scope', 'component', 'slot', 'basis', 'method', 'value', 'unit', 'uncertainty'], 'Измерение');
  enumeration(o.scope, SCOPES, 'Область факта'); enumeration(o.component, COMPONENTS, 'Компонент');
  enumeration(o.slot, ['A', 'B', 'all'], 'Нить'); enumeration(o.basis, ['in-project', 'consumed', 'purchased'], 'Вид расхода');
  enumeration(o.method, ['before-after', 'cut-minus-left', 'estimate'], 'Метод измерения');
  enumeration(o.unit, ['mm', 'cm', 'm'], 'Единицы факта');
  number(o.value, 'Фактическая длина'); number(o.uncertainty, 'Погрешность');
  if (o.value === null && o.uncertainty !== null) fail('Погрешность нельзя задавать без измерения.');
  return copy(value) as ObservationInput;
}
export function addObservation(passport: CraftPassport, input: ObservationInput, forecastId: string | null, now: string): CraftPassport {
  if (passport.observations.length >= 500) fail('В одном файле допускается не больше 500 измерений.');
  if (forecastId !== null && !passport.forecasts.some(f => f.id === forecastId)) fail('Выбранный прогноз отсутствует.');
  date(now);
  const entry: Observation = { ...validateObservationInput(input), id: nextId('observation', passport.observations.map(o => o.id)),
    createdAt: now, forecastId, parameters: validateParameters(passport.parameters) };
  const updated = { ...passport, observations: [...passport.observations, entry] };
  savePassport(updated);
  return freeze(updated);
}
export const forecastLengthMm = (forecast: Forecast, slot: Slot): number | null => {
  if (forecast.status !== 'available' || !forecast.model) return null;
  const l = forecast.model.lengthsMm;
  return slot === 'all' ? l.A.total + l.B.total : l[slot].total;
};
export type Comparison = { status: string; message: string; predictedMm: number | null; actualMm: number | null;
  deltaMm: number | null; deltaPercentOfPrediction: number | null; measuredComparablePath: boolean };
export function compareObservation(passport: CraftPassport, observation: Observation): Comparison {
  const actualMm = toMm(observation.value, observation.unit);
  const base: Comparison = { status: 'unavailable', message: '', predictedMm: null, actualMm, deltaMm: null, deltaPercentOfPrediction: null, measuredComparablePath: false };
  const stop = (status: string, message: string): Comparison => ({ ...base, status, message });
  const forecast = passport.forecasts.find(f => f.id === observation.forecastId);
  if (!forecast || forecast.status !== 'available') return stop('no-forecast', 'Для этой записи нет доступного прогноза. Это не нулевой расход.');
  if (observation.scope !== forecast.parameters.scope || observation.scope !== observation.parameters.scope) return stop('scope-mismatch', 'Область факта и прогноза различается: часть изделия нельзя сравнить с целым.');
  if (!sameParameters(observation.parameters, forecast.parameters)) return stop('parameters-mismatch', 'Параметры работы изменились. Нужен прогноз именно для измеренной версии.');
  if (observation.component !== 'embroidery') return stop('component-mismatch', 'Этот прогноз относится только к вышивке; намотка, разметка, концы и отходы учитываются отдельно.');
  if (observation.basis === 'purchased') return stop('purchase', 'Купленное количество не является измерением расхода.');
  if (actualMm === null) return stop('missing', 'Фактическая длина пока неизвестна.');
  const predictedMm = forecastLengthMm(forecast, observation.slot)!;
  const deltaMm = actualMm - predictedMm;
  const measured = observation.method !== 'estimate' && observation.basis === 'in-project';
  return { status: observation.method === 'estimate' ? 'estimated' : observation.basis === 'consumed' ? 'consumption' : 'comparable',
    message: observation.method === 'estimate' ? 'Оценка, не точное измерение: не используем как измеренную ошибку модели.'
      : observation.basis === 'consumed' ? 'Расход сверх геометрической длины может включать концы и отходы; это не чистая ошибка модели.'
        : 'Сравнена длина одной области. Модель инженерная и ещё не откалибрована по реальной пряже.',
    predictedMm, actualMm, deltaMm, deltaPercentOfPrediction: predictedMm > 0 ? 100 * deltaMm / predictedMm : null, measuredComparablePath: measured };
}
/** Strict file schema. Unknown fields are rejected, never forwarded into an export. */
export function readPassport(json: string, currentModel?: PassportModel | null): CraftPassport {
  if (new TextEncoder().encode(json).length > MAX_PASSPORT_BYTES) fail('Файл больше 1 МБ.');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { fail('Не удалось прочитать JSON-файл.'); }
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).kind === 'temari-comparison-export')
    fail('Это экспорт для сравнения, не полный паспорт. Откройте файл temari-passport.json.');
  const p = record(raw, ['kind', 'schemaVersion', 'id', 'createdAt', 'private', 'parameters', 'forecasts', 'observations'], 'Паспорт');
  if (p.kind !== 'temari-local-passport' || p.schemaVersion !== PASSPORT_SCHEMA) fail('Неподдерживаемая версия паспорта. Исходный файл не изменён.');
  id(p.id); date(p.createdAt); validateParameters(p.parameters);
  const privateData = record(p.private, ['title', 'notes'], 'Локальные заметки');
  text(privateData.title, 'Название', 120); text(privateData.notes, 'Заметки', 1000);
  if (!Array.isArray(p.forecasts) || p.forecasts.length > 100 || !Array.isArray(p.observations) || p.observations.length > 500) fail('Недопустимый размер истории.');
  const forecastIds = new Set<string>(), observationIds = new Set<string>();
  for (const value of p.forecasts as unknown[]) {
    const f = record(value, ['id', 'createdAt', 'parameters', 'status', 'reason', 'model'], 'Прогноз');
    const fid = id(f.id); if (forecastIds.has(fid)) fail('Повторяющийся ID прогноза.'); forecastIds.add(fid);
    date(f.createdAt); const parameters = validateParameters(f.parameters);
    enumeration(f.status, ['available', 'unavailable'], 'Статус прогноза');
    if (f.status === 'available') {
      if (f.reason !== null) fail('Доступный прогноз не должен содержать причину отказа.');
      const model = validateModel(f.model);
      if (forecastReason(parameters, model)) fail('Прогноз не соответствует своим параметрам.');
      if (currentModel?.snapshotDigest === model.snapshotDigest && (model.sourceDigest !== currentModel.sourceDigest
        || (['A', 'B'] as const).some(k => (['total', 'surface', 'piercing', 'buried'] as const).some(part =>
          model.lengthsMm[k][part] !== currentModel.lengthsMm[k][part])))) fail('Данные известной версии модели изменены.');
    } else {
      enumeration(f.reason, REASONS, 'Причина отсутствия прогноза');
      if (f.model !== null) fail('Недоступный прогноз не может содержать рассчитанный расход.');
    }
  }
  for (const value of p.observations as unknown[]) {
    const o = record(value, ['scope', 'component', 'slot', 'basis', 'method', 'value', 'unit', 'uncertainty', 'id', 'createdAt', 'forecastId', 'parameters'], 'Факт');
    const oid = id(o.id); if (observationIds.has(oid)) fail('Повторяющийся ID факта.'); observationIds.add(oid);
    date(o.createdAt); validateParameters(o.parameters);
    if (o.forecastId !== null && !forecastIds.has(id(o.forecastId))) fail('Факт ссылается на отсутствующий прогноз.');
    validateObservationInput(Object.fromEntries(['scope', 'component', 'slot', 'basis', 'method', 'value', 'unit', 'uncertainty'].map(k => [k, o[k]])));
  }
  return freeze(copy(raw) as CraftPassport);
}
export function savePassport(passport: CraftPassport) {
  const json = JSON.stringify(passport, null, 2);
  readPassport(json);
  return json;
}
/** Whitelist only: no free text, dates, work IDs, participant ID, contacts or filenames. */
export function exportObservations(passport: CraftPassport) {
  const checked = readPassport(savePassport(passport));
  const parameters = (p: WorkParameters) => ({
    ball: { kind: p.ball.kind, value: p.ball.value, unit: p.ball.unit, circumferenceMm: circumferenceMm(p) },
    division: p.division, recipe: p.recipe, scope: p.scope, centers: p.centers, rows: p.rows,
    yarns: (['A', 'B'] as const).map(slot => ({ slot, material: p.yarns[slot].material, diameterMm: p.yarns[slot].diameterMm,
      strands: p.yarns[slot].strands, color: p.yarns[slot].color.toLowerCase() })),
    freeTextMaterialDetailsOmitted: true,
  });
  return {
    kind: 'temari-comparison-export', schemaVersion: 1, privacy: 'no-free-text-contacts-dates-or-local-ids',
    parameters: parameters(checked.parameters),
    forecasts: checked.forecasts.map((f, i) => ({ index: i + 1, parameters: parameters(f.parameters), status: f.status,
      reason: f.reason, model: f.model ? copy(f.model) : null })),
    observations: checked.observations.map((o, i) => ({
      index: i + 1, forecastIndex: o.forecastId === null ? null : checked.forecasts.findIndex(f => f.id === o.forecastId) + 1,
      parameters: parameters(o.parameters), scope: o.scope, component: o.component, slot: o.slot, basis: o.basis,
      method: o.method, original: { value: o.value, unit: o.unit, uncertainty: o.uncertainty },
      lengthMm: toMm(o.value, o.unit), uncertaintyMm: toMm(o.uncertainty, o.unit),
      comparison: (() => { const c = compareObservation(checked, o); return { status: c.status, predictedMm: c.predictedMm,
        actualMm: c.actualMm, deltaMm: c.deltaMm, deltaPercentOfPrediction: c.deltaPercentOfPrediction, measuredComparablePath: c.measuredComparablePath }; })(),
    })),
  };
}
