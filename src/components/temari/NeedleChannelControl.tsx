import { useEffect, useMemo, useState } from 'react';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TemariScene, type InspectionView } from './scene';
import { createThreadSpanMesh } from './thread-path-mesh';
import { buildSingleNeedleCatch, type NeedleCatchCase, type SingleNeedleCatch } from './single-needle-catch';
import type { ThreadSpan } from './thread-path';

declare const __NEEDLE_CHANNEL_SOURCE__: unknown;
const gold = '#e8b020';
const button = 'rounded-lg border border-ink/25 px-3 py-2 text-sm aria-pressed:bg-ink aria-pressed:text-linen';
const mm = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

function CatchGeometry({ model, needle, transparent }: { model: SingleNeedleCatch; needle: boolean; transparent: boolean }) {
  const { R, rThread, rNeedle, layerThickness } = model.parameters;
  const meshes = useMemo(() => {
    const merge = (id: string, spans: ThreadSpan[], radius: number, colour: string) => {
      const parts = spans.map(span => createThreadSpanMesh(span, radius, R));
      try {
        const geometry = mergeGeometries(parts.map(p => p.geometry), false);
        if (!geometry) throw new Error('Не удалось собрать контрольный путь.');
        return { id, geometry, colour };
      } finally { parts.forEach(p => p.geometry.dispose()); }
    };
    return [merge('thread', model.spans, rThread, gold), merge('needle', model.channel.spans, rNeedle, '#777e88'),
      ...model.supports.map(s => merge(s.id, [{ id: s.id, threadId: s.id, opId: s.id, step: 0, zone: 'surface', curve: s.curve }], s.radiusMm, '#877458'))];
  }, [model, R, rThread, rNeedle]);
  useEffect(() => () => meshes.forEach(m => m.geometry.dispose()), [meshes]);
  return <>
    <mesh><sphereGeometry args={[1, 192, 96]} />
      <meshStandardMaterial key={String(transparent)} color="#d9c9af" roughness={.94} transparent={transparent}
        opacity={transparent ? .13 : 1} depthWrite={!transparent} />
    </mesh>
    {transparent && <mesh><sphereGeometry args={[(R - layerThickness) / R, 192, 96]} />
      <meshStandardMaterial color="#c4b59f" roughness={.95} />
    </mesh>}
    {meshes.filter(m => m.id !== (needle ? 'thread' : 'needle')).map(m => <mesh key={m.id} geometry={m.geometry} dispose={null}>
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

/** Exact planar section containing the straight channel and the sphere centre. */
function ChannelSection({ model, needle }: { model: SingleNeedleCatch; needle: boolean }) {
  const { R, layerThickness, widthMm, rNeedle, rThread } = model.parameters;
  const a = widthMm / 2, depth = model.channel.chordDepthMm, radius = needle ? rNeedle : rThread;
  const extent = a + 1;
  const boundary = (r: number) => Array.from({ length: 161 }, (_, i) => {
    const x = -extent + 2 * extent * i / 160;
    return `${i ? 'L' : 'M'}${x},${R - Math.sqrt(r * r - x * x)}`;
  }).join(' ');
  return <svg role="img" aria-label="Сечение прямого канала в миллиметрах" className="h-full w-full" viewBox={`${-extent} -1.15 ${extent * 2} 3.7`}>
    <path d={`${boundary(R)} L ${extent},2.55 L ${-extent},2.55 Z`} fill="#ded0b9" />
    <path d={`${boundary(R - layerThickness)} L ${extent},2.55 L ${-extent},2.55 Z`} fill="#bcae97" />
    <path d={boundary(R)} fill="none" stroke="#8b795e" strokeWidth=".025" />
    <path d={boundary(R - layerThickness)} fill="none" stroke="#7b6b53" strokeWidth=".025" />
    <path d={`M ${a},${depth} H ${-a}`} stroke={needle ? '#777e88' : gold} strokeWidth={2 * radius} strokeLinecap={needle ? 'round' : 'butt'} />
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
  const [mode, setMode] = useState<'solid' | 'transparent' | 'section'>('transparent');
  const [needle, setNeedle] = useState(false);
  const [view, setView] = useState<InspectionView>('close');
  const [error, setError] = useState<string | null>(null);
  const focus = useMemo(() => model.placement.normal, [model]);
  const download = () => {
    const data = { version: 1, kind: 'single-needle-catch-diagnostic', source: __NEEDLE_CHANNEL_SOURCE__, model };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'single-needle-catch.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="absolute inset-0 flex flex-col bg-linen" aria-label="Контроль прямого игольного прохода">
    <header className="z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <strong>Один прямой проход</strong><nav className="flex gap-3"><a className="underline" href="?upper-bundle=1">Три визита</a><a className="underline" href="./">К мастерской</a></nav>
    </header>
    <div className="relative min-h-0 flex-1">
      {mode === 'section' ? <ChannelSection model={model} needle={needle} /> :
        <TemariScene inspection={{ view, focus }} onError={setError}><CatchGeometry model={model} needle={needle} transparent={mode === 'transparent'} /></TemariScene>}
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-ink/85 px-3 py-2 text-xs text-linen" aria-label="Легенда контроля">
        <div className="flex items-center gap-2"><span className="h-3 w-3" style={{ backgroundColor: needle ? '#777e88' : gold }} />
          {needle ? 'Игла · только участок канала' : 'Одна нить · визит 1, золотой'}</div>
        <div className="mt-1">Коричневая — разметка</div>
        {mode === 'section' && <div className="mt-1">Светлый слой — намотка; тёмный — ядро</div>}
      </div>
    </div>
    <div className="z-10 max-h-[48dvh] overflow-y-auto border-t border-ink/15 bg-linen px-4 py-3 text-sm">
      <p role="status" className="mb-2"><b>{model.status === 'rejected' ? 'Контроль отклонён.' : model.geometryStatus === 'passed'
        ? 'Геометрия проверена. Механика не рассчитана.' : 'Допустимость геометрии не установлена.'}</b>{' '}
        {model.geometryStatus === 'rejected' ? 'Узкий проход пересекает неподвижную разметку.' : 'Широкий инженерный пример — не исправленный подхват кику.'}
        {model.material.status === 'rejected' && ' Заданной подачи недостаточно для показанного пути.'}</p>
      {error && <p role="alert" className="mb-2 text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {(['clearance-control', 'narrow'] as const).map((id, i) => <button className={button} key={id} aria-pressed={caseId === id}
          onClick={() => setCaseId(id)}>{['Контроль 11 мм', 'Узкий 2 мм'][i]}</button>)}
        <label className="flex items-center gap-1">Подача <select aria-label="Подача материала" className="rounded border border-ink/25 bg-linen p-2" value={feed} onChange={e => setFeed(Number(e.target.value))}>
          <option value={60}>60 мм</option><option value={40}>40 мм</option>
        </select></label>
        <button className={button} aria-pressed={!needle} onClick={() => setNeedle(false)}>Нить</button>
        <button className={button} aria-pressed={needle} onClick={() => setNeedle(true)}>Игла</button>
        {(['solid', 'transparent', 'section'] as const).map((m, i) => <button key={m} className={button} aria-pressed={mode === m}
          onClick={() => setMode(m)}>{['Шар', 'Прозрачная мари', 'Сечение'][i]}</button>)}
        {mode !== 'section' && (['pole', 'close', 'side'] as const).map((v, i) => <button className={button} key={v} aria-pressed={view === v}
          onClick={() => setView(v)}>{['Полюс', 'Крупно', 'Сбоку'][i]}</button>)}
        <button className={button} onClick={download}>Скачать данные</button>
      </div>
      <p className="mt-2 text-xs">Глубина оси: {mm(model.channel.chordDepthMm)} мм. Сечение нити Ø0,71 мм, иглы Ø0,4 мм.
        Чёрная точка — вход оси, белая — выход на номинальной сфере. Это не измеренные проколы волокон.</p>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs" aria-label="Баланс материала">
        <dt>Назначено одной нити</dt><dd>120 мм</dd>
        <dt>Показанный участок, включая свободный конец</dt><dd>{mm(model.geometryLengthMm)} мм</dd>
        <dt>Из него свободный конец</dt><dd>{mm(model.freeLengthMm)} мм</dd>
        <dt>В запасе вне изображения</dt><dd>{model.material.reservoirAfterMm === null ? 'Не определён' : `${mm(model.material.reservoirAfterMm)} мм`}</dd>
        <dt>Баланс</dt><dd>{model.material.status === 'conserved' ? 'Сходится' : 'Не сходится'}</dd>
      </dl>
      <details className="mt-2"><summary>Что здесь задано, а что ещё не решено</summary>
        <p className="my-2">Прямой канал соответствует одному проходу иглы без поворота. Показана только часть иглы между входом и выходом;
          ушко и движение всего стержня не рассчитаны. Вид нити — отдельная заданная конфигурация после удаления иглы, а не результат затягивания.</p>
        <p className="my-2">Наружные ветви удерживаются в заданной форме. Слой 1,2 мм разрешает геометрический проход, но его податливость и трение не рассчитаны.
          Нить толще иглы: расширение отверстия ещё предстоит обосновать. Маленький реальный стежок не объявляется невозможным из-за отказа этой жёсткой модели.</p>
        <p className="my-2">Подача задана заранее; она перемещает свободный конец. Это учёт длины, не симуляция протягивания. Запас снаружи не имеет восстановленной формы.
          Сечение показывает канал и номинальную сферу, без наружных ветвей. Торцы нити здесь — срезы наблюдения; они не концы материала.
          Проверочная оболочка консервативно включает круглые окончания. Частично выступающий объём в 3D не скрыт маской.</p>
        <p>Полный захват, механика и ремесленная приёмка открыты. <a className="underline" href="design.html#needle-channel">Основания и ограничения</a></p>
      </details>
    </div>
  </section>;
}
