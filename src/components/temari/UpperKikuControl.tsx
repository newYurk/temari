import { useEffect, useMemo, useRef, useState } from 'react';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TemariScene, type InspectionView } from './scene';
import { createThreadSpanMesh } from './thread-path-mesh';
import type { UpperSnapshot, UpperWorkerMessage } from './upper-kiku-display';
import type { PointMm } from './thread-path';

function Geometry({ snapshot, rows }: { snapshot: UpperSnapshot | null; rows: number }) {
  const meshes = useMemo(() => {
    if (!snapshot) return [];
    const merge = (spanId: string, parts: ReturnType<typeof createThreadSpanMesh>[], color: string) => {
      const geometry = mergeGeometries(parts.map(p => p.geometry), false);
      parts.forEach(p => p.geometry.dispose());
      if (!geometry) throw new Error('Не удалось собрать сетку контрольной нити.');
      return { spanId, geometry, color };
    };
    const coupons = snapshot.result.rows.slice(0, rows).map(r => r.coupon);
    const threads = coupons.map((c, row) => merge(`row-${row}`,
      c.spans.map(span => createThreadSpanMesh(span, c.threadRadiusMm, c.bodyRadiusMm)), row ? '#b55240' : '#d5a94a'));
    const c = snapshot.result.rows[0].coupon;
    const marking = merge('marking', c.supports.map(s =>
      createThreadSpanMesh({ id: s.id, opId: 'marking', threadId: 'marking', step: 0, zone: 'surface', curve: s.curve },
        s.radiusMm, c.bodyRadiusMm)), '#8f8371');
    return [marking, ...threads];
  }, [snapshot, rows]);
  useEffect(() => () => meshes.forEach(m => m.geometry.dispose()), [meshes]);
  return <>
    <mesh>
      <sphereGeometry args={[1, 512, 256]} />
      <meshStandardMaterial color="#e1d4bd" roughness={.94} />
    </mesh>
    {meshes.map(m => <mesh key={m.spanId} geometry={m.geometry} dispose={null}>
      <meshStandardMaterial color={m.color} roughness={.68} />
    </mesh>)}
  </>;
}

const button = 'rounded-lg border border-ink/20 px-3 py-2 text-sm disabled:opacity-40';
const defaultFocus: PointMm = [0, 1, 0];

export default function UpperKikuControl() {
  const [snapshot, setSnapshot] = useState<UpperSnapshot | null>(null);
  const [message, setMessage] = useState('Один верхний поворот, два ряда одной нити. Расчёт занимает несколько минут.');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState(2);
  const [view, setView] = useState<InspectionView>('pole');
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);
  const start = () => {
    worker.current?.terminate();
    setSnapshot(null); setError(null); setRunning(true); setMessage('Начинается расчёт…');
    const w = new Worker(new URL('./upper-kiku.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<UpperWorkerMessage>) => {
      if (worker.current !== w) return;
      if (data.kind === 'progress') setMessage(data.message);
      else {
        setRunning(false);
        w.terminate(); worker.current = null;
        if (data.kind === 'error') setError(data.message);
        else {
          setSnapshot(data.snapshot);
          setMessage('Диагностический результат. Полная ремесленная топология не подтверждена.');
        }
      }
    };
    w.onerror = event => {
      if (worker.current !== w) return;
      console.error('Upper Kiku worker error', event.message);
      setError(event.message || 'Не удалось выполнить расчёт.');
      setRunning(false); w.terminate(); worker.current = null;
    };
    w.postMessage({ kind: 'compute' });
  };
  const stop = () => {
    worker.current?.terminate(); worker.current = null; setRunning(false);
    setMessage('Расчёт остановлен. Результата нет.');
  };
  const download = () => {
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'upper-kiku-diagnostic.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const focus = useMemo<PointMm>(() => {
    const c = snapshot?.result.rows[0].coupon;
    const span = c?.spans.find(s => s.opId.endsWith('/return'));
    if (!c || span?.curve.kind !== 'bezier') return defaultFocus;
    const p = span.curve.controls[3], length = Math.hypot(...p);
    return [p[0] / length, p[1] / length, p[2] / length];
  }, [snapshot]);
  return <section className="absolute inset-0 flex flex-col bg-linen">
    <header className="z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <strong>Верхний клин · контроль, не принятая кику</strong>
      <a className="underline" href="./">Вернуться к вышивке</a>
    </header>
    <div className="relative min-h-0 flex-1">
      <TemariScene inspection={{ view, focus }} onError={message => setError(`Ошибка отображения: ${message}`)}>
        <Geometry snapshot={snapshot} rows={rows} />
      </TemariScene>
    </div>
    <div className="z-10 max-h-[42dvh] overflow-y-auto border-t border-ink/15 bg-linen px-4 py-3 text-sm">
      <p role="status" className="mb-2">{message}</p>
      {error && <p role="alert" className="mb-2 text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={running ? stop : start}>{running ? 'Остановить' : 'Рассчитать'}</button>
        {(['pole', 'close', 'side'] as const).map((v, i) => <button className={button} key={v}
          aria-pressed={view === v} onClick={() => setView(v)}>{['Полюс', 'Крупно', 'Сбоку'][i]}</button>)}
        <button className={button} disabled={!snapshot} aria-pressed={rows === 1} onClick={() => setRows(rows === 1 ? 2 : 1)}>
          {rows === 1 ? 'Показать второй ряд' : 'Только первый ряд'}
        </button>
        <button className={button} disabled={!snapshot} onClick={download}>Скачать расчёт</button>
      </div>
      <p className="mt-2 opacity-75">C240 · круглая нить Ø0,71 мм · неподвижная основа. Цвета различают ряды одной нити, не две рабочие нити. Остальная часть обхода не показана. Сохранение обычной вышивки не меняется.</p>
      {snapshot && <details className="mt-2">
        <summary>Проверки и ограничения</summary>
        <p>Геометрия: {snapshot.result.geometryStatus}; сетка: {snapshot.mesh.status}; ремесленная топология: частично подтверждена. Это не приёмка мастером.</p>
        <p>Модель {snapshot.result.model}; снимок исходников: {snapshot.source.model.digest.slice(0, 12)} ({snapshot.source.mode}). Для фиксации версии используйте production-сборку.</p>
        <p>Минимальный зазор наружных треугольников до основы: {snapshot.mesh.bodyGapMm.toFixed(6)} мм. Погрешность оболочки сетки ≤ {snapshot.mesh.envelopeErrorMm.toFixed(6)} мм.</p>
        <ul className="list-disc pl-5">{[...snapshot.result.diagnostics, ...snapshot.mesh.diagnostics].map((d, i) => <li key={i}>{d}</li>)}</ul>
      </details>}
    </div>
  </section>;
}
