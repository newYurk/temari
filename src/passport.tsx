import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  addForecast, addObservation, compareObservation, circumferenceMm, DIVISIONS, exampleParameters, exportObservations,
  forecastLengthMm, forecastReason, MATERIALS, MAX_PASSPORT_BYTES, newPassport, parseNumber, readPassport,
  sameParameters, savePassport, toMm, validateModel, withParameters,
  type Basis, type Component, type CraftPassport, type Method, type PassportModel, type Scope, type Slot, type WorkParameters,
} from './components/temari/craft-passport';
import './passport.css';

const scopeLabels: Record<Scope, string> = { 's8-first-pass-one-pole': 'S8: A1 + B1, один полюс', 'whole-ball': 'Всё изделие', 'other-fragment': 'Другой фрагмент' };
const componentLabels: Record<Component, string> = { embroidery: 'Вышивка', wrapping: 'Намотка основы', marking: 'Разметка', tails: 'Концы и закрепления', waste: 'Обрезки и потери' };
const basisLabels: Record<Basis, string> = { 'in-project': 'Длина в указанной части изделия', consumed: 'Общий расход с катушки', purchased: 'Купленное количество' };
const methodLabels: Record<Method, string> = { 'before-after': 'Измерена длина до / после', 'cut-minus-left': 'Отрезки минус измеренные остатки', estimate: 'Приблизительная оценка' };
const materialLabels: Record<typeof MATERIALS[number], string> = { engineering: 'Инженерный образец', 'pearl-5': 'Перле №5', 'pearl-8': 'Перле №8', 'hana-ito': 'Хана-ито', bunka: 'Бунка', other: 'Другая нить', unknown: 'Неизвестно' };
const reasons: Record<string, string> = {
  'model-unavailable': 'Модель не загрузилась. Паспорт и факт можно сохранить без прогноза.',
  scope: 'Проверенный расчёт охватывает только A1 + B1 одного полюса, не всё изделие.',
  recipe: 'Для другого рецепта расчёт ещё не реализован.',
  division: 'Для этой разметки прогноз не подменяется расчётом Simple 8.',
  'rows-centers': 'Пока проверены один проход A1 + B1 и один полюс. Другие ряды и центры не экстраполируются.',
  'ball-size': 'Расчёт есть для окружности готовой основы ровно 230 мм. Другой размер пока не пересчитывается.',
  'thread-size': 'В расчёте две нити диаметром 0,4 мм, каждая в одно сложение. Другие параметры ещё не проверены.',
};
const now = () => new Date().toISOString();
const fresh = () => newPassport(`work-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, now());
const length = (mm: number | null) => mm === null ? 'Нет данных' : `${(mm / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} м`;
const numberText = (n: number | null) => n === null ? '' : String(n);
type Draft = Omit<WorkParameters, 'ball' | 'centers' | 'rows' | 'yarns'> & {
  ball: Omit<WorkParameters['ball'], 'value'> & { value: string }; centers: string; rows: string;
  yarns: Record<'A' | 'B', Omit<WorkParameters['yarns']['A'], 'diameterMm' | 'strands'> & { diameterMm: string; strands: string }>;
};
const draftOf = (p: WorkParameters): Draft => ({ ...p, ball: { ...p.ball, value: numberText(p.ball.value) },
  centers: numberText(p.centers), rows: numberText(p.rows), yarns: Object.fromEntries((['A', 'B'] as const).map(k =>
    [k, { ...p.yarns[k], diameterMm: numberText(p.yarns[k].diameterMm), strands: numberText(p.yarns[k].strands) }])) as Draft['yarns'] });
const parametersOf = (d: Draft): WorkParameters => ({ ...d, ball: { ...d.ball, value: parseNumber(d.ball.value) },
  centers: parseNumber(d.centers), rows: parseNumber(d.rows), yarns: Object.fromEntries((['A', 'B'] as const).map(k =>
    [k, { ...d.yarns[k], diameterMm: parseNumber(d.yarns[k].diameterMm), strands: parseNumber(d.yarns[k].strands) }])) as WorkParameters['yarns'] });
function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{hint && <small>{hint}</small>}</div>;
}
const opts = (labels: Record<string, string>) => Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{text}</option>);
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PassportApp() {
  const [passport, setPassport] = useState<CraftPassport>(() => {
    const p = fresh(); return new URLSearchParams(location.search).get('sample') === 's8-ab' ? withParameters(p, exampleParameters()) : p;
  });
  const [draft, setDraft] = useState(() => draftOf(passport.parameters));
  const [privateData, setPrivate] = useState(passport.private);
  const [model, setModel] = useState<PassportModel | null>(null), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null), [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState(() => new URLSearchParams(location.search).get('sample') === 's8-ab'
    ? 'Подставлены параметры полного контрольного A1/B1 одного полюса. Это не измерение реального изделия.' : ''), [error, setError] = useState('');
  const [pending, setPending] = useState<CraftPassport | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const [fact, writeFact] = useState({ scope: 's8-first-pass-one-pole' as Scope, component: 'embroidery' as Component,
    slot: 'all' as Slot, basis: 'in-project' as Basis, method: 'before-after' as Method, value: '', unit: 'm' as 'mm' | 'cm' | 'm', uncertainty: '' });
  const file = useRef<HTMLInputElement>(null);
  const setFact = (next: typeof fact) => { writeFact(next); setDirty(true); setExportOpen(false); };
  const requireRecordedFact = () => { if (fact.value.trim() || fact.uncertainty.trim()) throw new Error('В поле факта есть не добавленное число. Сначала нажмите «Добавить факт» или очистите ввод.'); };
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => {
    let live = true;
    fetch('./fixtures/passport-model.json').then(r => { if (!r.ok) throw new Error('Файл модели недоступен'); return r.json(); })
      .then(value => { if (live) setModel(validateModel(value)); })
      .catch(() => { if (live) setMessage('Расчётная модель недоступна. Можно вести паспорт и записи без прогноза.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', leave); return () => removeEventListener('beforeunload', leave);
  }, [dirty]);
  const change = (next: Draft) => { setDraft(next); setDirty(true); setExportOpen(false); setError(''); };
  const collect = () => withParameters(passport, parametersOf(draft), privateData);
  const attempt = (action: () => void) => { try { setError(''); action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  const load = (next: CraftPassport) => {
    setPassport(next); setDraft(draftOf(next.parameters)); setPrivate(next.private);
    setSelected(next.forecasts.at(-1)?.id ?? null); setPending(null); setExportOpen(false); setDirty(false);
    writeFact({ scope: next.parameters.scope, component: 'embroidery', slot: 'all', basis: 'in-project', method: 'before-after', value: '', unit: 'm', uncertainty: '' });
    setError(''); setMessage('Паспорт открыт локально. Ничего не отправлено.');
  };
  const selectedForecast = passport.forecasts.find(f => f.id === selected);
  let reason: string | null = null, currentParameters: WorkParameters | null = null;
  try { currentParameters = withParameters(passport, parametersOf(draft), privateData).parameters; reason = forecastReason(currentParameters, model); }
  catch { reason = 'invalid'; }
  const changed = selectedForecast && currentParameters && !sameParameters(selectedForecast.parameters, currentParameters);
  const freezeForecast = () => attempt(() => {
    requireRecordedFact();
    const next = addForecast(collect(), model, now()); setPassport(next); setSelected(next.forecasts.at(-1)!.id);
    setDirty(true); setMessage('Новый снимок сохранён в истории вкладки. Предыдущие прогнозы не изменены.');
  });
  const recordFact = () => attempt(() => {
    const next = addObservation(collect(), { ...fact, value: parseNumber(fact.value), uncertainty: parseNumber(fact.uncertainty) }, selected, now());
    setPassport(next); setDirty(true); setMessage('Факт добавлен отдельной записью. Сохраните файл, чтобы не потерять работу.');
    writeFact({ ...fact, value: '', uncertainty: '' });
  });
  const save = () => attempt(() => {
    requireRecordedFact();
    const next = collect(); download('temari-passport.json', savePassport(next)); setPassport(next); setDirty(false);
    setMessage('Файл подготовлен. Убедитесь, что temari-passport.json появился в загрузках. Он содержит ваши локальные заметки.');
  });
  const safeExport = () => attempt(() => {
    requireRecordedFact();
    const next = collect(); download('temari-comparison.json', JSON.stringify(exportObservations(next), null, 2));
    setMessage('Экспорт подготовлен без свободного текста, дат и локальных ID. Полный паспорт сохраняется отдельной кнопкой.');
  });
  return <main className="passport-shell">
    <a className="skip-link" href="#parameters-title">К параметрам работы</a>
    <nav className="passport-nav" aria-label="Навигация">
      <a className="brand" href="./" data-testid="link-workshop"><img src="./favicon.svg" width="24" height="24" alt="" />Темари</a>
      <div><a href="./s8-ab.html" data-testid="link-control">Образец A1/B1</a><button type="button" onClick={() => setDark(!dark)} data-testid="toggle-theme">{dark ? 'Светлая тема' : 'Тёмная тема'}</button></div>
    </nav>
    <header className="passport-header"><div><p className="eyebrow">Программа мастеров · локальный первый этап</p><h1>Паспорт работы</h1>
      <p>Запишите параметры, сохраните прогноз и сравните его с реальным расходом.</p></div>
      <div className="file-actions">
        <button type="button" data-testid="new-passport" onClick={() => { const p = fresh(); if (dirty || passport.forecasts.length || passport.observations.length) setPending(p); else load(p); }}>Новая работа</button>
        <button type="button" data-testid="open-passport" disabled={loading} onClick={() => file.current?.click()}>Открыть JSON</button>
        <button type="button" className="primary" data-testid="save-passport" onClick={save}>Сохранить паспорт</button>
        <input ref={file} type="file" accept=".json,application/json" disabled={loading} className="visually-hidden" aria-label="Открыть файл паспорта" data-testid="file-passport"
          onChange={async e => {
            const chosen = e.target.files?.[0]; e.target.value = ''; if (!chosen) return;
            if (chosen.size > MAX_PASSPORT_BYTES) { setError('Файл больше 1 МБ. Текущая работа не изменена.'); return; }
            try {
              const next = readPassport(await chosen.text(), model);
              if (dirty || passport.forecasts.length || passport.observations.length) setPending(next); else load(next);
            } catch (e) { setError(`${e instanceof Error ? e.message : String(e)} Текущая работа не изменена.`); }
          }} />
      </div>
    </header>
    <aside className="local-note" data-testid="storage-notice"><strong>Без сервера и регистрации.</strong> Работа живёт в этой вкладке.
      Сохраните JSON на устройство, затем откройте его здесь для продолжения. {dirty ? 'Есть невыгруженные изменения.' : 'Автосохранения в браузере нет.'}</aside>
    {pending && <section className="notice" role="alert"><h2>Заменить текущую работу?</h2><p>Не сохранённые в файл изменения останутся только в этой вкладке и будут потеряны.</p>
      <div className="actions"><button type="button" data-testid="confirm-replace" onClick={() => load(pending)}>Открыть вместо текущей</button>
        <button type="button" data-testid="cancel-replace" onClick={() => setPending(null)}>Отмена</button></div></section>}
    {error && <p className="error" role="alert" data-testid="passport-error">{error}</p>}
    {message && <p className="status" role="status" data-testid="passport-status">{message}</p>}

    <div className="passport-columns">
      <section className="sheet" aria-labelledby="parameters-title">
        <div className="section-title"><span>01</span><h2 id="parameters-title">Параметры работы</h2></div>
        <Field id="work-title" label="Название для себя" hint="Название и все свободные заметки не входят в экспорт для сравнения.">
          <input id="work-title" data-testid="work-title" maxLength={120} value={privateData.title} placeholder="Например, учебный цветок"
            onChange={e => { setPrivate({ ...privateData, title: e.target.value }); setDirty(true); }} />
        </Field>
        <div className="example-row"><button type="button" data-testid="use-example" onClick={() => { change(draftOf(exampleParameters())); setMessage('Подставлены параметры инженерного образца, не данные реальной работы.'); }}>Подставить образец S8</button><small>230 мм · 0,4 мм · A1/B1</small></div>
        <fieldset><legend>Готовая намотанная основа</legend><div className="fields three">
          <Field id="ball-kind" label="Измерено"><select id="ball-kind" data-testid="ball-kind" value={draft.ball.kind} onChange={e => change({ ...draft, ball: { ...draft.ball, kind: e.target.value as Draft['ball']['kind'] } })}>{opts({ circumference: 'Окружность', diameter: 'Диаметр' })}</select></Field>
          <Field id="ball-value" label="Размер"><input id="ball-value" data-testid="ball-value" inputMode="decimal" value={draft.ball.value} placeholder="Неизвестен" onChange={e => change({ ...draft, ball: { ...draft.ball, value: e.target.value } })} /></Field>
          <Field id="ball-unit" label="Единица"><select id="ball-unit" data-testid="ball-unit" value={draft.ball.unit} onChange={e => change({ ...draft, ball: { ...draft.ball, unit: e.target.value as 'mm' | 'cm' } })}>{opts({ mm: 'мм', cm: 'см' })}</select></Field>
        </div><p className="hint" data-testid="normalised-size">{currentParameters && circumferenceMm(currentParameters) !== null
          ? `Окружность ${circumferenceMm(currentParameters)!.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} мм${draft.ball.kind === 'diameter' ? ' (вычислена из диаметра)' : ' (из введённого измерения)'}.`
          : 'Размер до намотки нельзя подставлять вместо размера готовой основы.'}</p></fieldset>
        <fieldset><legend>Разметка и рецепт</legend><div className="fields two">
          <Field id="division" label="Разметка"><select id="division" data-testid="division" value={draft.division} onChange={e => change({ ...draft, division: e.target.value as Draft['division'] })}>{DIVISIONS.map(id => <option key={id} value={id}>{id === 'unknown' ? 'Неизвестна' : id.toUpperCase()}</option>)}</select></Field>
          <Field id="recipe" label="Рецепт"><select id="recipe" data-testid="recipe" value={draft.recipe} onChange={e => change({ ...draft, recipe: e.target.value as Draft['recipe'] })}>{opts({ 'kiku-s8-a1-b1': 'Кику S8 · первый проход A/B', other: 'Другой / ещё не реализован' })}</select></Field>
          <Field id="scope" label="Что описываем"><select id="scope" data-testid="scope" value={draft.scope} onChange={e => change({ ...draft, scope: e.target.value as Scope })}>{opts(scopeLabels)}</select></Field>
          <div className="fields two">
            <Field id="centers" label="Центров"><input id="centers" data-testid="centers" inputMode="numeric" value={draft.centers} onChange={e => change({ ...draft, centers: e.target.value })} /></Field>
            <Field id="rows" label="Рядов в группе"><input id="rows" data-testid="rows" inputMode="numeric" value={draft.rows} onChange={e => change({ ...draft, rows: e.target.value })} /></Field>
          </div>
        </div></fieldset>
        <details className="yarn-details"><summary>Нити A и B: тип, толщина, цвет и артикул</summary>
        {(['A', 'B'] as const).map(slot => {
          const y = draft.yarns[slot], update = (patch: Partial<typeof y>) => change({ ...draft, yarns: { ...draft.yarns, [slot]: { ...y, ...patch } } });
          return <fieldset key={slot}><legend><span className="thread-dot" style={{ background: y.color }} />Нить {slot}</legend><div className="fields two">
            <Field id={`material-${slot}`} label="Тип"><select id={`material-${slot}`} data-testid={`material-${slot}`} value={y.material} onChange={e => update({ material: e.target.value as typeof y.material })}>{opts(materialLabels)}</select></Field>
            <Field id={`diameter-${slot}`} label="Диаметр, мм"><input id={`diameter-${slot}`} data-testid={`diameter-${slot}`} inputMode="decimal" value={y.diameterMm} onChange={e => update({ diameterMm: e.target.value })} /></Field>
            <Field id={`strands-${slot}`} label="Сложений"><input id={`strands-${slot}`} data-testid={`strands-${slot}`} inputMode="numeric" value={y.strands} onChange={e => update({ strands: e.target.value })} /></Field>
            <Field id={`color-${slot}`} label="Цвет"><input id={`color-${slot}`} data-testid={`color-${slot}`} type="color" value={y.color} onChange={e => update({ color: e.target.value })} /></Field>
          </div><Field id={`description-${slot}`} label="Марка / серия / артикул для себя" hint="Свободное описание сохраняется в полном паспорте, но исключается из экспорта для сравнения.">
            <input id={`description-${slot}`} data-testid={`description-${slot}`} maxLength={250} value={y.description} onChange={e => update({ description: e.target.value })} />
          </Field></fieldset>;
        })}</details>
        <details><summary>Локальные заметки</summary><Field id="work-notes" label="Изменения узора, материал и способ работы">
          <textarea id="work-notes" data-testid="work-notes" maxLength={1000} rows={4} value={privateData.notes} onChange={e => { setPrivate({ ...privateData, notes: e.target.value }); setDirty(true); }} />
        </Field></details>
      </section>

      <div className="passport-right">
        <section className="sheet" aria-labelledby="forecast-title">
          <div className="section-title"><span>02</span><h2 id="forecast-title">Замороженный прогноз</h2></div>
          <p className="hint">Снимок параметров и версии модели. Последующие правки не переписывают историю.</p>
          <div className="forecast-preview" data-testid="forecast-preview">
            <p className="eyebrow">{loading ? 'Загрузка модели' : reason ? 'Нет прогноза для этих параметров' : 'Инженерная длина · не список покупок'}</p>
            {!loading && !reason && model ? <><p className="length-total">{length(model.lengthsMm.A.total + model.lengthsMm.B.total)}</p>
              <div className="thread-lengths"><span>A: {length(model.lengthsMm.A.total)}</span><span>B: {length(model.lengthsMm.B.total)}</span></div>
              <p className="hint">Один проход, один полюс, включая заданные скрытые участки. Материал не откалиброван; запас на покупку не добавлен.</p></>
              : <p>{loading ? 'Параметры и записи доступны без ожидания вычислителя.' : reason === 'invalid' ? 'Проверьте числовые поля. Пустое поле означает «неизвестно».' : reasons[reason!]}</p>}
          </div>
          <button type="button" className="primary full" disabled={loading || reason === 'invalid'} data-testid="freeze-forecast" onClick={freezeForecast}>{reason ? 'Сохранить без расчёта' : 'Зафиксировать прогноз'}</button>
          <div className="forecast-history" data-testid="forecast-history">
            {!passport.forecasts.length && <p className="empty">Сохранённых прогнозов пока нет.</p>}
            {passport.forecasts.map((f, i) => <div className={`forecast-entry ${selected === f.id ? 'selected' : ''}`} key={f.id}>
              <button type="button" className="forecast-select" data-testid={`select-${f.id}`} aria-pressed={selected === f.id} onClick={() => setSelected(f.id)}>
                <strong>Прогноз {i + 1} <span>{length(forecastLengthMm(f, 'all'))}</span></strong>
                <small>{new Date(f.createdAt).toLocaleString('ru-RU')} · {f.model ? `версия ${f.model.snapshotDigest.slice(0, 8)}` : 'нет расчёта'}</small>
              </button>
              {selected === f.id && <><p className="hint">{scopeLabels[f.parameters.scope]} · {f.parameters.division.toUpperCase()} · {f.status === 'available' ? 'Длина заданного пути, не реальный закупочный расход.' : reasons[f.reason!]}</p>
                {f.model && f.model.snapshotDigest !== model?.snapshotDigest && <p className="warning">Сохранённая версия модели сейчас недоступна для сверки. Показан записанный прогноз, его числа не пересчитаны.</p>}
                <button type="button" className="text-button" data-testid={`restore-${f.id}`} onClick={() => { change(draftOf(f.parameters)); setMessage('Восстановлены параметры этого прогноза. История не изменена.'); }}>Восстановить параметры</button></>}
            </div>)}
          </div>
          {changed && <p className="warning" data-testid="parameters-changed">Текущие параметры отличаются от выбранного прогноза. Зафиксируйте новый или восстановите прежние перед вводом сопоставимого факта.</p>}
        </section>
        <section className="sheet" aria-labelledby="fact-title">
          <div className="section-title"><span>03</span><h2 id="fact-title">Фактический расход</h2></div>
          <p className="hint">Связан с {selectedForecast ? `прогнозом ${passport.forecasts.indexOf(selectedForecast) + 1}` : 'работой без прогноза'}. Укажите именно ту часть изделия, которую измерили.</p>
          <div className="fields two">
            <Field id="fact-scope" label="Измеренная область"><select id="fact-scope" data-testid="fact-scope" value={fact.scope} onChange={e => setFact({ ...fact, scope: e.target.value as Scope })}>{opts(scopeLabels)}</select></Field>
            <Field id="fact-component" label="Компонент"><select id="fact-component" data-testid="fact-component" value={fact.component} onChange={e => setFact({ ...fact, component: e.target.value as Component })}>{opts(componentLabels)}</select></Field>
            <Field id="fact-slot" label="Какая нить"><select id="fact-slot" data-testid="fact-slot" value={fact.slot} onChange={e => setFact({ ...fact, slot: e.target.value as Slot })}>{opts({ all: 'A и B вместе', A: 'Только A', B: 'Только B' })}</select></Field>
            <Field id="fact-basis" label="Что означает число"><select id="fact-basis" data-testid="fact-basis" value={fact.basis} onChange={e => setFact({ ...fact, basis: e.target.value as Basis })}>{opts(basisLabels)}</select></Field>
            <Field id="fact-value" label="Длина"><input id="fact-value" data-testid="fact-value" inputMode="decimal" value={fact.value} placeholder="Неизвестна" onChange={e => setFact({ ...fact, value: e.target.value })} /></Field>
            <Field id="fact-unit" label="Единица"><select id="fact-unit" data-testid="fact-unit" value={fact.unit} onChange={e => setFact({ ...fact, unit: e.target.value as typeof fact.unit })}>{opts({ mm: 'мм', cm: 'см', m: 'м' })}</select></Field>
          </div>
          <Field id="fact-method" label="Способ получения"><select id="fact-method" data-testid="fact-method" value={fact.method} onChange={e => setFact({ ...fact, method: e.target.value as Method })}>{opts(methodLabels)}</select></Field>
          <Field id="fact-uncertainty" label="Погрешность в выбранной единице, если известна" hint="Пустое поле не равно нулевой погрешности. Масса без линейной плотности не пересчитывается в длину.">
            <input id="fact-uncertainty" data-testid="fact-uncertainty" inputMode="decimal" value={fact.uncertainty} placeholder="Неизвестна" onChange={e => setFact({ ...fact, uncertainty: e.target.value })} />
          </Field>
          <button type="button" className="primary full" data-testid="record-fact" onClick={recordFact}>Добавить факт</button>
        </section>
      </div>
    </div>
    <section className="sheet observations" aria-labelledby="observations-title">
      <div className="section-title"><span>04</span><h2 id="observations-title">Сравнение и записи</h2></div>
      {!passport.observations.length && <p className="empty">Добавьте первый факт. Прогноз и исходные измерения останутся отдельными записями.</p>}
      <div className="observation-list" data-testid="observation-list">{passport.observations.map((o, i) => {
        const c = compareObservation(passport, o);
        return <article key={o.id} data-testid={`row-${o.id}`} data-comparison={c.status}>
          <div><h3>Запись {i + 1} · {componentLabels[o.component]}</h3><p>{scopeLabels[o.scope]} · {o.slot === 'all' ? 'A + B' : o.slot}</p>
            <small>{basisLabels[o.basis]} · {methodLabels[o.method]}</small></div>
          <dl><div><dt>Факт</dt><dd>{length(c.actualMm)}{o.uncertainty !== null && <small> ± {length(toMm(o.uncertainty, o.unit))}</small>}</dd></div><div><dt>Прогноз</dt><dd>{length(c.predictedMm)}</dd></div>
            <div><dt>{c.status === 'consumption' ? 'Сверх пути' : 'Разница'}</dt><dd>{c.deltaMm === null ? 'Не сравниваем' : `${c.deltaMm > 0 ? '+' : ''}${length(c.deltaMm)}`}</dd></div></dl>
          <p className={c.measuredComparablePath ? 'hint' : 'warning'}>{c.message}</p>
        </article>;
      })}</div>
    </section>
    <section className="sheet export-section" aria-labelledby="export-title">
      <div><h2 id="export-title">Два файла для разных задач</h2><p><strong>Полный паспорт</strong> нужен для продолжения работы и содержит ваши заметки.
        <strong> Экспорт для сравнения</strong> содержит только структурированные параметры, версии, прогнозы и измерения.</p></div>
      <div className="actions"><button type="button" data-testid="save-passport-bottom" onClick={save}>Сохранить полный паспорт</button>
        <button type="button" data-testid="review-export" onClick={() => attempt(() => { requireRecordedFact(); collect(); setExportOpen(!exportOpen); })}>Подготовить экспорт</button></div>
      {exportOpen && <div className="export-review" data-testid="export-review"><p><strong>Не попадут в файл:</strong> название работы, все свободные описания нитей и заметки, даты, локальные ID. Полей имени, email или аккаунта здесь нет.</p>
        <p>Будут включены: размеры, точные ID разметок/рецептов, типы нитей из списка, числовые параметры, цвета, версии расчётов и факты. Свободно записанные марки/артикулы исключены; их точное сопоставление с каталогом остаётся следующим этапом.</p>
        <button type="button" className="primary" data-testid="download-export" onClick={safeExport}>Скачать экспорт без свободного текста</button>
        <p className="hint">Ничего не отправляется автоматически. Этот файл не заменяет полный паспорт для повторного открытия.</p></div>}
    </section>
    <footer>Локальный пилот #95. Не калиброванная смета и не рекомендация покупки. <a href="./design.html" data-testid="link-design">О модели вышивки</a></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<PassportApp />);
