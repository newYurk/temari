import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TemariScene, type InspectionView } from './scene';
import { sampleCurve } from './thread-geometry';
import { createThreadSpanMesh } from './thread-path-mesh';
import { buildUpperBundle, type UpperBundle, type UpperBundleVisit } from './upper-bundle';
import type { UpperBundleAudit, UpperBundleMessage } from './upper-bundle.worker';
import type { PointMm, ThreadSpan } from './thread-path';

declare const __UPPER_BUNDLE_SOURCE__: unknown;
const colours = ['#e8b020', '#2f7fe0', '#2fb050'];
const button = 'rounded-lg border border-ink/25 px-3 py-2 text-sm aria-pressed:bg-ink aria-pressed:text-linen disabled:opacity-40';

function BundleGeometry({ bundle, count, transparent }: { bundle: UpperBundle; count: number; transparent: boolean }) {
  const meshes = useMemo(() => {
    const merge = (id: string, spans: ThreadSpan[], radius: number, colour: string) => {
      const parts = spans.map(span => createThreadSpanMesh(span, radius, bundle.bodyRadiusMm));
      try {
        const geometry = mergeGeometries(parts.map(p => p.geometry), false);
        if (!geometry) throw new Error('Не удалось собрать контрольный путь.');
        return { id, geometry, colour };
      } finally { parts.forEach(p => p.geometry.dispose()); }
    };
    const result = bundle.visits.map(visit => merge(visit.id,
      bundle.spans.filter(s => visit.spanIds.includes(s.id)), bundle.threadRadiusMm, colours[visit.row]));
    for (const support of bundle.supports) result.push(merge(support.id, [{
      id: support.id, opId: support.id, threadId: support.id, step: 0, zone: 'surface', curve: support.curve,
    }], support.radiusMm, '#877458'));
    return result;
  }, [bundle]);
  useEffect(() => () => meshes.forEach(m => m.geometry.dispose()), [meshes]);
  const visits = bundle.visits.slice(0, count);
  return <>
    <mesh>
      <sphereGeometry args={[1, 192, 96]} />
      <meshStandardMaterial key={transparent ? 'transparent' : 'solid'} color="#d9c9af" roughness={.94} transparent={transparent}
        opacity={transparent ? .16 : 1} depthWrite={!transparent} />
    </mesh>
    {meshes.filter(m => !bundle.visits.some(v => v.id === m.id) || visits.some(v => v.id === m.id)).map(m =>
      <mesh key={m.id} geometry={m.geometry} dispose={null}>
        <meshStandardMaterial color={m.colour} roughness={.67} />
      </mesh>)}
    {visits.flatMap(v => Object.entries(v.ports).map(([side, p]) =>
      <mesh key={p.id} position={p.positionMm.map(x => x / bundle.bodyRadiusMm) as [number, number, number]}>
        <sphereGeometry args={[bundle.threadRadiusMm * .55 / bundle.bodyRadiusMm, 12, 8]} />
        <meshBasicMaterial color={side === 'entry' ? '#101010' : '#ffffff'} />
      </mesh>))}
  </>;
}

/** Orthographic diagnostic projection of the very same curves, never a second recipe. */
function BundleMap({ bundle, count, whole }: { bundle: UpperBundle; count: number; whole: boolean }) {
  const paths = useMemo(() => {
    const normal = new Vector3(...bundle.focusMm).normalize();
    const down = normal.clone().multiplyScalar(normal.y).sub(new Vector3(0, 1, 0)).normalize();
    const right = new Vector3().crossVectors(down, normal).normalize();
    const project = (p: PointMm) => [new Vector3(...p).dot(right), new Vector3(...p).dot(down)];
    return {
      project,
      visits: bundle.visits.map(visit => ({ visit, paths: bundle.spans.filter(s => visit.spanIds.includes(s.id)).map(span => ({
        id: span.id, zone: span.zone, d: sampleCurve(span.curve, .002).points.map((p, i) => `${i ? 'L' : 'M'}${project(p).join(',')}`).join(' '),
      })) })),
    };
  }, [bundle]);
  const size = whole ? 46 : 7;
  return <svg role="img" aria-label="Три визита: проекция тех же осевых линий и портов в миллиметрах"
    className="h-full w-full" viewBox={`${-size} ${-size} ${2 * size} ${2 * size}`}>
    <defs><pattern id="bundle-grid" width="1" height="1" patternUnits="userSpaceOnUse">
      <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#776958" strokeOpacity=".18" strokeWidth=".015" />
    </pattern></defs>
    <rect x={-size} y={-size} width={size * 2} height={size * 2} fill="url(#bundle-grid)" />
    <path d={`M 0 ${-size} V ${size}`} fill="none" stroke="#8e7651" strokeWidth=".06" />
    {paths.visits.slice(0, count).map(({ visit, paths: spans }) => <g key={visit.id}>
      {spans.map(span => <path key={span.id} d={span.d} fill="none" stroke={colours[visit.row]} strokeWidth={whole ? .22 : .08}
        strokeDasharray={span.zone === 'surface' ? undefined : '.22 .13'} strokeLinecap="round" />)}
      {Object.entries(visit.ports).map(([side, port]) => {
        const [x, y] = paths.project(port.positionMm);
        return <circle key={port.id} cx={x} cy={y} r={whole ? .34 : .12} stroke={colours[visit.row]}
          strokeWidth=".055" fill={side === 'entry' ? '#101010' : '#ffffff'}><title>{`Визит ${visit.row + 1}: ${side === 'entry' ? 'вход' : 'выход'}`}</title></circle>;
      })}
    </g>)}
  </svg>;
}

function PortReadout({ visit }: { visit: UpperBundleVisit }) {
  return <tr>
    <th className="py-1 text-left font-normal">{visit.row + 1}</th>
    <td>{Math.hypot(...visit.ports.entry.positionMm.map((v, i) => v - visit.ports.exit.positionMm[i])).toFixed(3)}</td>
    <td>{visit.sourceOrders.upperCatch}</td>
  </tr>;
}

export default function UpperBundleControl() {
  const [bundle] = useState(buildUpperBundle);
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState<'solid' | 'transparent' | 'map'>('solid');
  const [view, setView] = useState<InspectionView>('close');
  const [wholeMap, setWholeMap] = useState(false);
  const [audit, setAudit] = useState<UpperBundleAudit | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const focus = useMemo<PointMm>(() => {
    const n = Math.hypot(...bundle.focusMm);
    return [bundle.focusMm[0] / n, bundle.focusMm[1] / n, bundle.focusMm[2] / n];
  }, [bundle]);
  const inspect = () => {
    if (running) { worker.current?.terminate(); worker.current = null; setRunning(false); return; }
    setRunning(true); setAudit(null); setError(null);
    const w = new Worker(new URL('./upper-bundle.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<UpperBundleMessage>) => {
      if (worker.current !== w) return;
      if (data.kind === 'audit') setAudit(data.audit);
      else setError(data.message);
      w.terminate(); worker.current = null; setRunning(false);
    };
    w.onerror = e => {
      if (worker.current !== w) return;
      setError(e.message || 'Проверка не завершена.'); w.terminate(); worker.current = null; setRunning(false);
    };
    w.postMessage({ kind: 'audit', bundle });
  };
  const download = () => {
    const json = { version: 1, kind: 'upper-bundle-diagnostic', source: __UPPER_BUNDLE_SOURCE__, bundle, audit };
    const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'upper-bundle-diagnostic.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="absolute inset-0 flex flex-col bg-linen" aria-label="Контроль трёх верхних подхватов">
    <header className="z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <strong>Верхний подхват · три визита</strong><nav className="flex gap-3"><a className="underline" href="?upper-bundle=1&control=needle">Прямой проход</a><a className="underline" href="./">К мастерской</a></nav>
    </header>
    <div className="relative min-h-0 flex-1">
      {mode === 'map' ? <BundleMap bundle={bundle} count={count} whole={wholeMap} /> :
        <TemariScene inspection={{ view, focus }} onError={setError}>
          <BundleGeometry bundle={bundle} count={count} transparent={mode === 'transparent'} />
        </TemariScene>}
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-ink/85 px-3 py-2 text-xs text-linen" aria-label="Цвета визитов">
        <b>Одна нить · цвета для проверки</b>
        {colours.slice(0, count).map((colour, i) => <div key={colour} className="mt-1 flex items-center gap-2">
          <span className="inline-block h-3 w-3" style={{ backgroundColor: colour }} />Визит {i + 1}
        </div>)}
      </div>
    </div>
    <div className="z-10 max-h-[45dvh] overflow-y-auto border-t border-ink/15 bg-linen px-4 py-3 text-sm">
      <p role="status" className="mb-2"><b>Исходный путь. Укладка пучка ещё не рассчитана.</b>
        {' '}{running ? 'Проверяются исходные кривые…' : audit
          ? audit.status === 'rejected' ? 'Проверка выявила недопустимую геометрию.' : 'Проверка не установила допустимость всей конструкции.'
          : 'Показан инженерный контроль, не исправленная мастерская.'}</p>
      {audit && <p className="mb-2 text-xs">Обнаружены пересечения между визитами: {audit.betweenVisits.filter(p => p.clearance.status === 'failed').length} из {audit.betweenVisits.length} пар.
        {' '}Уровни расчёта сверх бюджета: {audit.wholeSpanBudget.flatMap(b => b.levels).filter(l => !l.withinBudget).length}.
        {' '}Это исходные кривые для будущего решателя; они не приняты как форма нити.</p>}
      {error && <p role="alert" className="mb-2 text-red-800">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label>Визиты <select className="ml-1 rounded border border-ink/25 bg-linen px-2 py-2" value={count} onChange={e => setCount(Number(e.target.value))}>
          <option value={1}>1</option><option value={2}>1–2</option><option value={3}>1–3</option>
        </select></label>
        {(['solid', 'transparent', 'map'] as const).map((m, i) => <button key={m} className={button} aria-pressed={mode === m}
          onClick={() => setMode(m)}>{['Шар', 'Прозрачная мари', 'Схема'][i]}</button>)}
        {mode === 'map' ? <button className={button} aria-pressed={wholeMap} onClick={() => setWholeMap(!wholeMap)}>
          {wholeMap ? 'Крупно острие' : 'Полные пролёты'}
        </button> : (['pole', 'close', 'side'] as const).map((v, i) => <button className={button} key={v}
          aria-pressed={view === v} onClick={() => setView(v)}>{['Полюс', 'Крупно', 'Сбоку'][i]}</button>)}
        <button className={button} onClick={inspect}>{running ? 'Остановить проверку' : 'Проверить исходный путь'}</button>
        <button className={button} onClick={download}>Скачать данные</button>
      </div>
      <p className="mt-2 text-xs opacity-80">C240 · круглое сечение Ø0,71 мм. Чёрная метка — вход, белая — выход заданной кривой.
        {' '}Эти точки находятся над поверхностью; это не фактические проколы и не порты нынешней мастерской.
        Схема показывает те же оси; пунктир — игольный проход, сетка — 1 мм. Границы у нижних подхватов — срезы наблюдения, не закрепления нити.</p>
      <details className="mt-2">
        <summary>Границы модели и измерения</summary>
        <p className="my-2">Остальная часть кругов опущена. Форма проходов и сечение заданы; протягивание материала на границах не определено.
          Пучок не перемещался совместно. Проверка относится ко всем трём визитам независимо от выбранного вида.</p>
        <table className="w-full text-left text-xs"><caption className="text-left">Расстояние между заданными портами, мм</caption>
          <thead><tr><th>Визит</th><th>Расстояние</th><th>Порядок подхвата</th></tr></thead>
          <tbody>{bundle.visits.map(visit => <PortReadout key={visit.id} visit={visit} />)}</tbody>
        </table>
        {audit && <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify(audit, null, 2)}</pre>}
      </details>
    </div>
  </section>;
}
