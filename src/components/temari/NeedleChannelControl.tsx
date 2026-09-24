import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TemariScene, type InspectionView } from './scene';
import { createThreadSpanMesh } from './thread-path-mesh';
import { buildSingleNeedleCatch, type NeedleCatchCase, type SingleNeedleCatch } from './single-needle-catch';
import { buildFirstVisitRoute } from './first-visit-route';
import { createResolvedThreadGeometry } from './stitches';
import type { SingleNeedleEquilibrium } from './single-needle-equilibrium';
import type { SingleNeedleEquilibriumMessage } from './single-needle-equilibrium.worker';
import type { EquilibriumYarn } from './yarn-equilibrium';
import type { ThreadSpan } from './thread-path';

declare const __NEEDLE_CHANNEL_SOURCE__: unknown;
const gold = '#e8b020';
const button = 'rounded-lg border border-ink/25 px-3 py-2 text-sm aria-pressed:bg-ink aria-pressed:text-linen';
const mm = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

function CatchGeometry({ model, needle, transparent, resolved }: {
  model: SingleNeedleCatch; needle: boolean; transparent: boolean; resolved: EquilibriumYarn | null;
}) {
  const { R, rThread, rNeedle, layerThickness } = model.parameters;
  const sourceColour = model.geometryStatus === 'rejected' ? '#c84f42' : gold;
  const meshes = useMemo(() => {
    const merge = (id: string, spans: ThreadSpan[], radius: number, colour: string) => {
      const parts = spans.map(span => createThreadSpanMesh(span, radius, R));
      try {
        const geometry = mergeGeometries(parts.map(p => p.geometry), false);
        if (!geometry) throw new Error('Не удалось собрать контрольный путь.');
        return { id, geometry, colour };
      } finally { parts.forEach(p => p.geometry.dispose()); }
    };
    const solved = resolved ? {
      id: 'resolved-thread',
      geometry: createResolvedThreadGeometry(resolved.nodes.map(n =>
        new Vector3(...n.positionMm).divideScalar(R)), resolved.radiusMm / R),
      colour: '#46a47a',
    } : null;
    return [merge('thread', model.spans, rThread, sourceColour), merge('needle', model.channel.spans, rNeedle, '#777e88'),
      ...(solved ? [solved] : []),
      ...model.supports.map(s => merge(s.id, [{ id: s.id, threadId: s.id, opId: s.id, step: 0, zone: 'surface', curve: s.curve }], s.radiusMm, '#877458'))];
  }, [model, R, rThread, rNeedle, resolved, sourceColour]);
  useEffect(() => () => meshes.forEach(m => m.geometry.dispose()), [meshes]);
  const active = needle ? 'needle' : resolved ? 'resolved-thread' : 'thread';
  return <>
    <mesh><sphereGeometry args={[1, 192, 96]} />
      <meshStandardMaterial key={String(transparent)} color="#d9c9af" roughness={.94} transparent={transparent}
        opacity={transparent ? .13 : 1} depthWrite={!transparent} />
    </mesh>
    {transparent && <mesh><sphereGeometry args={[(R - layerThickness) / R, 192, 96]} />
      <meshStandardMaterial color="#c4b59f" roughness={.95} />
    </mesh>}
    {meshes.filter(m => !['thread', 'needle', 'resolved-thread'].includes(m.id) || m.id === active)
      .map(m => <mesh key={m.id} geometry={m.geometry} dispose={null}>
      <meshStandardMaterial color={m.colour} roughness={.67} />
    </mesh>)}
    {(needle ? [model.channel.ports.entry.positionMm, model.channel.ports.exit.positionMm] : []).map((p, i) =>
      <mesh key={`cap-${i}`} position={p.map(x => x / R) as [number, number, number]}>
        <sphereGeometry args={[(needle ? rNeedle : rThread) / R, 24, 16]} />
        <meshStandardMaterial color={needle ? '#777e88' : gold} roughness={.67} />
      </mesh>)}
    {Object.entries(model.channel.ports).map(([side, port]) => <mesh key={port.id} position={port.positionMm.map(x => x / R) as [number, number, number]}>
      <sphereGeometry args={[.12 / R, 12, 8]} /><meshBasicMaterial color={side === 'entry' ? '#101010' : '#ffffff'} />
    </mesh>)}
  </>;
}

function VisitGeometry() {
  const route = useMemo(() => buildFirstVisitRoute(), []);
  const mesh = useMemo(() => {
    const curves = [route.approach, route.channels[0].spans[0].curve, ...route.bridges.slice(0, 3),
      route.channels[1].spans[0].curve, ...route.bridges.slice(3), route.channels[2].spans[0].curve, route.departure];
    const spans: ThreadSpan[] = curves.map((curve, i) => ({
      id: `first-visit/${i}`, threadId: 'first-visit/physical-thread-1', opId: 'first-visit', step: i, zone: 'surface', curve,
    }));
    const parts = spans.map(span => createThreadSpanMesh(span, route.threadRadiusMm, route.R));
    try {
      const geometry = mergeGeometries(parts.map(part => part.geometry), false);
      if (!geometry) throw new Error('Не удалось собрать первый визит.');
      return geometry;
    } finally { parts.forEach(part => part.geometry.dispose()); }
  }, [route]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <>
    <mesh><sphereGeometry args={[1, 192, 96]} />
      <meshStandardMaterial color="#d9c9af" roughness={.94} transparent opacity={.13} depthWrite={false} />
    </mesh>
    <mesh><sphereGeometry args={[(route.R - route.layerMm) / route.R, 96, 48]} />
      <meshStandardMaterial color="#c4b59f" roughness={.95} />
    </mesh>
    <mesh geometry={mesh} dispose={null}><meshStandardMaterial color={gold} roughness={.67} /></mesh>
  </>;
}

/** Exact planar section containing the straight channel and the sphere centre. */
function ChannelSection({ model, needle, resolved }: { model: SingleNeedleCatch; needle: boolean; resolved: boolean }) {
  const { R, layerThickness, widthMm, rNeedle, rThread } = model.parameters;
  const a = widthMm / 2, depth = model.channel.chordDepthMm, radius = needle ? rNeedle : rThread;
  const state = needle ? 'needle' : resolved ? 'resolved' : model.geometryStatus === 'rejected' ? 'rejected' : 'source';
  const colour = needle ? '#777e88' : resolved ? '#46a47a' : model.geometryStatus === 'rejected' ? '#c84f42' : gold;
  const extent = a + 1;
  const boundary = (r: number) => Array.from({ length: 161 }, (_, i) => {
    const x = -extent + 2 * extent * i / 160;
    return `${i ? 'L' : 'M'}${x},${R - Math.sqrt(r * r - x * x)}`;
  }).join(' ');
  return <svg role="img" aria-label="Сечение прямого канала в миллиметрах" data-thread-state={state}
    className="h-full w-full" viewBox={`${-extent} -1.15 ${extent * 2} 3.7`}>
    <path d={`${boundary(R)} L ${extent},2.55 L ${-extent},2.55 Z`} fill="#ded0b9" />
    <path d={`${boundary(R - layerThickness)} L ${extent},2.55 L ${-extent},2.55 Z`} fill="#bcae97" />
    <path d={boundary(R)} fill="none" stroke="#8b795e" strokeWidth=".025" />
    <path d={boundary(R - layerThickness)} fill="none" stroke="#7b6b53" strokeWidth=".025" />
    <path data-role="thread-section" d={`M ${a},${depth} H ${-a}`} stroke={colour}
      strokeWidth={2 * radius} strokeLinecap={needle ? 'round' : 'butt'} />
    <path d={`M ${a},${depth} H ${-a}`} stroke="#282828" strokeWidth=".015" strokeDasharray=".08 .07" />
    <circle cx="0" cy="-.1" r=".1" fill="#877458" fillOpacity=".55" stroke="#695131" strokeWidth=".025">
      <title>Сечение разметки; пересечение областей означает коллизию</title>
    </circle>
    <circle cx={a} cy={depth} r=".045" fill="#101010" /><circle cx={-a} cy={depth} r=".045" fill="#ffffff" />
  </svg>;
}

export default function NeedleChannelControl() {
  const [caseId, setCaseId] = useState<NeedleCatchCase>('clearance-control');
  const [feed, setFeed] = useState(60);
  const model = useMemo(() => buildSingleNeedleCatch(caseId, feed), [caseId, feed]);
  const sourceColour = model.geometryStatus === 'rejected' ? '#c84f42' : gold;
  const [mode, setMode] = useState<'solid' | 'transparent' | 'section'>('transparent');
  const [needle, setNeedle] = useState(false);
  const [view, setView] = useState<InspectionView>('close');
  const [visit, setVisit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equilibrium, setEquilibrium] = useState<SingleNeedleEquilibrium | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [running, setRunning] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const resetEquilibrium = () => {
    worker.current?.terminate(); worker.current = null;
    setRunning(false); setEquilibrium(null); setShowResolved(false); setError(null);
  };
  const visitFocus = useMemo(() => {
    const port = buildFirstVisitRoute().channels[1].ports.entry.positionMm;
    const scale = Math.hypot(...port);
    return port.map(value => value / scale) as [number, number, number];
  }, []);
  const focus = visit ? visitFocus : model.placement.normal;
  const resolved = showResolved && equilibrium?.result ? equilibrium.result.threads[0] : null;
  const solve = () => {
    if (running) {
      worker.current?.terminate(); worker.current = null; setRunning(false); return;
    }
    setRunning(true); setError(null);
    const w = new Worker(new URL('./single-needle-equilibrium.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<SingleNeedleEquilibriumMessage>) => {
      if (worker.current !== w) return;
      if (data.kind === 'result') {
        setEquilibrium(data.equilibrium);
        setShowResolved(!!data.equilibrium.result);
      } else setError(data.message);
      w.terminate(); worker.current = null; setRunning(false);
    };
    w.onerror = event => {
      if (worker.current !== w) return;
      setError(event.message || 'Расчёт не завершён.');
      w.terminate(); worker.current = null; setRunning(false);
    };
    w.postMessage({ kind: 'solve', options: { caseId, suppliedLengthMm: feed } });
  };
  const download = () => {
    const data = { version: 2, kind: 'single-needle-catch-diagnostic', source: __NEEDLE_CHANNEL_SOURCE__, model, equilibrium };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'single-needle-catch.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="absolute inset-0 flex flex-col bg-linen" aria-label="Контроль прямого игольного прохода">
    <header className="z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <strong>Один прямой проход</strong><nav className="flex gap-3"><a className="underline" href="?upper-bundle=1">Три визита</a><a className="underline" href="./">К мастерской</a></nav>
    </header>
    <div className="relative min-h-0 flex-1">
      {visit ? <TemariScene inspection={{ view, focus }} onError={setError}><VisitGeometry /></TemariScene>
        : mode === 'section' ? <ChannelSection model={model} needle={needle} resolved={!!resolved} /> :
        <TemariScene inspection={{ view, focus }} onError={setError}><CatchGeometry model={model} needle={needle}
          transparent={mode === 'transparent'} resolved={resolved ?? null} /></TemariScene>}
      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg bg-ink/85 px-3 py-2 text-xs text-linen" aria-label="Легенда контроля">
        <div className="flex items-center gap-2"><span className="h-3 w-3"
          style={{ backgroundColor: needle ? '#777e88' : resolved ? '#46a47a' : sourceColour }} />
          {visit ? 'Первый визит · рецепт, золотой, механика не принята'
            : needle ? 'Игла · только участок канала'
            : resolved ? 'Одна нить · рассчитанный прямой срез, зелёный'
            : model.geometryStatus === 'rejected' ? 'Одна нить · отклонённая коллизия, красная'
            : 'Одна нить · заданный полный контекст, золотой'}</div>
        <div className="mt-1">Коричневая — разметка</div>
        {mode !== 'solid' && <>
          <div className="mt-1">Светлый — условный слой {mm(model.parameters.layerThickness)} мм</div>
          <div className="mt-1">Тёмный — запретная область контроля</div>
        </>}
      </div>
    </div>
    <div className="z-10 max-h-[48dvh] overflow-y-auto border-t border-ink/15 bg-linen px-4 py-3 text-sm">
      <p role="status" className="mb-2"><b>{model.status === 'rejected' ? 'Контроль отклонён.' : model.geometryStatus === 'passed'
        ? 'Исходная геометрия проверена.' : 'Допустимость исходной геометрии не установлена.'}</b>{' '}
        {model.geometryStatus === 'rejected' ? 'Узкий проход пересекает неподвижную разметку.' : 'Широкий инженерный пример — не исправленный подхват кику.'}
        {model.material.status === 'rejected' && ' Заданной подачи недостаточно для показанного пути.'}</p>
      {equilibrium && <p role="status" className="mb-2">
        <b>{equilibrium.physicalAcceptance === 'not-certified' ? 'Прямой расчёт сошёлся; физическая приёмка не выдана.'
          : equilibrium.physicalAcceptance === 'rejected-preflight' ? 'Расчёт остановлен входной геометрией.'
          : equilibrium.physicalAcceptance.startsWith('rejected') ? 'Расчётный проход отклонён.'
          : 'Расчётный проход остался неопределённым.'}</b>{' '}
        Канал: {equilibrium.passageAudit?.status ?? 'не проверялся'};
        конечное сечение: {equilibrium.geometryInspection?.status ?? 'не строилось'}.
      </p>}
      {error && <p role="alert" className="mb-2 text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={button} aria-pressed={visit} onClick={() => setVisit(v => !v)}>Первый визит</button>
        {(['clearance-control', 'narrow'] as const).map((id, i) => <button className={button} key={id} aria-pressed={caseId === id && !visit}
          onClick={() => { resetEquilibrium(); setCaseId(id); }}>{['Контроль 11 мм', 'Узкий 2 мм'][i]}</button>)}
        <label className="flex items-center gap-1">Подача <select aria-label="Подача материала" className="rounded border border-ink/25 bg-linen p-2" value={feed}
          onChange={e => { resetEquilibrium(); setFeed(Number(e.target.value)); }}>
          <option value={60}>60 мм</option><option value={40}>40 мм</option>
        </select></label>
        <button className={button} aria-pressed={!needle} onClick={() => setNeedle(false)}>Нить</button>
        <button className={button} aria-pressed={needle} onClick={() => setNeedle(true)}>Игла</button>
        <button className={button} onClick={solve}>{running ? 'Остановить расчёт' : 'Рассчитать прямой проход'}</button>
        {equilibrium?.result && <>
          <button className={button} aria-pressed={!showResolved} onClick={() => { setNeedle(false); setShowResolved(false); }}>Исходный контекст</button>
          <button className={button} aria-pressed={showResolved} onClick={() => { setNeedle(false); setShowResolved(true); }}>Результат расчёта</button>
        </>}
        {(['solid', 'transparent', 'section'] as const).map((m, i) => <button key={m} className={button} aria-pressed={mode === m}
          onClick={() => setMode(m)}>{['Шар', 'Прозрачная мари', 'Сечение'][i]}</button>)}
        {mode !== 'section' && (['pole', 'close', 'side'] as const).map((v, i) => <button className={button} key={v} aria-pressed={view === v}
          onClick={() => setView(v)}>{['Полюс', 'Крупно', 'Сбоку'][i]}</button>)}
        <button className={button} onClick={download}>Скачать данные</button>
      </div>
      <p className="mt-2 text-xs">Основа условная: шар Ø{mm(2 * model.parameters.R)} мм, доступный слой {mm(model.parameters.layerThickness)} мм.
        Это не измеренная мари. <a className="underline" href="design.html#mari-shell">Толщина реальной основы</a>.</p>
      <p className="mt-2 text-xs">Расчётная глубина оси: {mm(model.channel.chordDepthMm)} мм — из ширины прохода {mm(model.parameters.widthMm)} мм на недеформированной сфере.
        Сечение нити Ø{mm(2 * model.parameters.rThread)} мм, иглы Ø{mm(2 * model.parameters.rNeedle)} мм.
        Чёрная точка — вход оси, белая — выход на номинальной сфере. Это не измеренные проколы волокон.</p>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs" aria-label="Баланс материала">
        <dt>Назначено одной нити</dt><dd>120 мм</dd>
        <dt>Показанный участок, включая свободный конец</dt><dd>{mm(model.geometryLengthMm)} мм</dd>
        <dt>Из него свободный конец</dt><dd>{mm(model.freeLengthMm)} мм</dd>
        <dt>В запасе вне изображения</dt><dd>{model.material.reservoirAfterMm === null ? 'Не определён' : `${mm(model.material.reservoirAfterMm)} мм`}</dd>
        <dt>Баланс</dt><dd>{model.material.status === 'conserved' ? 'Сходится' : 'Не сходится'}</dd>
      </dl>
      {equilibrium?.result && <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-ink/15 pt-2 text-xs"
        aria-label="Результат механического расчёта">
        <dt>Численный статус</dt><dd>{equilibrium.result.status}</dd>
        <dt>Представленный прямой срез</dt><dd>{mm(equilibrium.route.representedLengthMm)} мм</dd>
        <dt>Остаток одной рабочей нити</dt><dd>{equilibrium.result.materialLedger[0].mode === 'sliding-inextensible-feed'
          ? `${mm(equilibrium.result.materialLedger[0].reserveLengthMm)} мм` : 'не рассчитан'}</dd>
        <dt>Пространственный канал</dt><dd>{equilibrium.passageAudit?.status ?? 'не проверен'}</dd>
        <dt>Вывернутые грани</dt><dd>{equilibrium.geometryInspection?.threads[0].mesh?.foldedFaces ?? 'нет меша'}</dd>
        <dt>Итог проверки</dt><dd>{equilibrium.physicalAcceptance}</dd>
      </dl>}
      <details className="mt-2"><summary>Что здесь задано, а что ещё не решено</summary>
        <p className="my-2">Прямой канал соответствует одному проходу иглы без поворота. Показана только часть иглы между входом и выходом;
          ушко и движение всего стержня не рассчитаны. Вид нити — отдельная заданная конфигурация после удаления иглы, а не результат затягивания.</p>
        <p className="my-2">Наружные ветви удерживаются в заданной форме. Толщина разрешённого слоя назначена для теста;
          это не типичная толщина намотки. Его податливость и трение не рассчитаны.
          Более толстая оболочка сама по себе не углубляет прямую хорду между теми же точками сферы.
          Нить толще иглы: расширение отверстия ещё предстоит обосновать. Маленький реальный стежок не объявляется невозможным из-за отказа этой жёсткой модели.</p>
        <p className="my-2">Подача задана заранее; она перемещает свободный конец. Это учёт длины, не симуляция протягивания. Запас снаружи не имеет восстановленной формы.
          Сечение показывает канал и номинальную сферу, без наружных ветвей. Торцы нити здесь — срезы наблюдения; они не концы материала.
          Проверочная оболочка консервативно включает круглые окончания. Частично выступающий объём в 3D не скрыт маской.</p>
        <p className="my-2">Кнопка расчёта проверяет только прямой участок между двумя наружными срезами на продолжении оси иглы.
          Порты не закреплены как дополнительные узлы: допустимая область канала остаётся неподвижной в пространстве.
          Зелёный результат использует тот же конечный круглый меш, который проверяется на вывернутые грани.
          Прямая ось стационарна по симметрии; это проверка связности модели, а не рассчитанная форма изогнутых наружных ветвей.</p>
        <p>Полный захват, механика и ремесленная приёмка открыты. <a className="underline" href="design.html#needle-channel">Основания и ограничения</a></p>
      </details>
    </div>
  </section>;
}
