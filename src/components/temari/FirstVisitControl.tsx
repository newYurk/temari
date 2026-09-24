import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, Line, LineBasicMaterial, Vector3 } from 'three';
import { TemariScene, type InspectionView } from './scene';
import { buildFirstVisitSnapshot, type FirstVisitSnapshot } from './first-visit-snapshot';
import type { FirstVisitSnapshotMessage } from './first-visit-snapshot.worker';
import { createResolvedThreadGeometry } from './stitches';

declare const __FIRST_VISIT_SOURCE__: unknown;
const gold = '#e8b020';
const button = 'rounded-lg border border-ink/25 px-3 py-2 text-sm aria-pressed:bg-ink aria-pressed:text-linen disabled:opacity-40';
const mm = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const acceptanceText: Record<FirstVisitSnapshot['acceptance'], string> = {
  'rejected-geometry': 'Геометрия отклонена проверкой.',
  'rejected-channel': 'Путь нарушает допуск канала.',
  'rejected-mechanics': 'Механический расчёт отклонён.',
  unresolved: 'Допустимость не установлена.',
  'not-certified': 'Физическая и ремесленная приёмка не выдана.',
};

/** Build once from exactly the inspected nodes, in millimetres. Revealing a
 * prefix changes only drawRange, never the positions, frames or inspection. */
function useSnapshotGeometry(snapshot: FirstVisitSnapshot, visibleSegments: number) {
  const rendered = useMemo(() => {
    const points = snapshot.thread.nodes.map(node => new Vector3(...node.positionMm));
    try {
      return { mesh: createResolvedThreadGeometry(points, snapshot.thread.radiusMm), axis: null, error: null };
    } catch (error) {
      const finite = points.length > 1 && points.every(p => [p.x, p.y, p.z].every(Number.isFinite));
      const axis = finite ? new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: gold })) : null;
      return { mesh: null, axis, error: `Меш не построен: ${error instanceof Error ? error.message : String(error)}.` };
    }
  }, [snapshot]);
  useLayoutEffect(() => {
    if (rendered.mesh) {
      const indicesPerSegment = rendered.mesh.userData.section.radialSegments * 6;
      rendered.mesh.setDrawRange(0, visibleSegments * indicesPerSegment);
    }
    if (rendered.axis) rendered.axis.geometry.setDrawRange(0, visibleSegments > 0 ? visibleSegments + 1 : 0);
  }, [rendered, visibleSegments]);
  useEffect(() => () => {
    rendered.mesh?.dispose();
    rendered.axis?.geometry.dispose();
    rendered.axis?.material.dispose();
  }, [rendered]);
  return rendered;
}

export default function FirstVisitControl({ onStraight }: { onStraight: () => void }) {
  const [prepared] = useState(() => {
    try { return { snapshot: buildFirstVisitSnapshot(), error: null }; }
    catch (error) { return { snapshot: null, error: error instanceof Error ? error.message : String(error) }; }
  });
  if (!prepared.snapshot) return <section className="absolute inset-0 overflow-auto bg-linen p-4">
    <h1 className="mb-3 font-medium">Первый полный визит</h1>
    <p role="alert">Не удалось подготовить снимок: {prepared.error}</p>
    <button className={`${button} mt-3`} onClick={onStraight}>Прямой контроль</button>
    <a className="ml-3 underline" href="./">К мастерской</a>
  </section>;
  return <FirstVisitSnapshotView prepared={prepared.snapshot} onStraight={onStraight} />;
}

function FirstVisitSnapshotView({ prepared, onStraight }: { prepared: FirstVisitSnapshot; onStraight: () => void }) {
  const [solved, setSolved] = useState<FirstVisitSnapshot | null>(null);
  const [showSolved, setShowSolved] = useState(false);
  const [transparent, setTransparent] = useState(true);
  const [view, setView] = useState<InspectionView>('pole');
  const [reveal, setReveal] = useState(100);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const snapshot = showSolved && solved ? solved : prepared;
  const count = snapshot.thread.nodes.length - 1;
  const visibleSegments = Math.floor(count * reveal / 100);
  const rendered = useSnapshotGeometry(snapshot, visibleSegments);
  const { R, layerMm } = snapshot.route;
  const focus = useMemo(() => {
    const p = new Vector3(...snapshot.route.channels[1].ports.entry.positionMm).normalize();
    return p.toArray() as [number, number, number];
  }, [snapshot]);
  const inspection = snapshot.inspection.threads.find(t => t.threadId === snapshot.thread.id);
  const phaseText = snapshot.phase === 'prepared' ? 'Исходный маршрут' : 'Результат ограниченного расчёта';
  useEffect(() => () => worker.current?.terminate(), []);
  const solve = () => {
    if (running) {
      worker.current?.terminate(); worker.current = null; setRunning(false);
      setError('Расчёт остановлен. Показанный снимок не изменён.');
      return;
    }
    setError(null);
    let w: Worker;
    try { w = new Worker(new URL('./first-visit-snapshot.worker.ts', import.meta.url), { type: 'module' }); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); return; }
    worker.current = w; setRunning(true);
    const finish = () => { w.terminate(); worker.current = null; setRunning(false); };
    w.onmessage = ({ data }: MessageEvent<FirstVisitSnapshotMessage>) => {
      if (worker.current !== w) return;
      if (data.kind === 'result') { setSolved(data.snapshot); setShowSolved(true); setReveal(100); }
      else setError(data.message);
      finish();
    };
    w.onerror = event => {
      if (worker.current !== w) return;
      setError(event.message || 'Расчёт не завершён.'); finish();
    };
    w.postMessage({ kind: 'solve' });
  };
  const download = () => {
    const data = { version: 1, kind: 'first-visit-snapshot-export', source: __FIRST_VISIT_SOURCE__, snapshot,
      display: { view, transparent, revealedSegments: visibleSegments, totalSegments: count,
        revealMeaning: 'fixed-path-visibility-only', meshError: rendered.error } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `first-visit-${snapshot.phase}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="absolute inset-0 flex flex-col bg-linen" aria-label="Первый полный визит"
    data-snapshot-phase={snapshot.phase} data-snapshot-acceptance={snapshot.acceptance}>
    <header className="z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <strong>Первый полный визит</strong>
      <nav className="flex flex-wrap gap-x-3 gap-y-2"><button className="underline" onClick={onStraight}>Прямой контроль</button>
        <a className="underline" href="./">К мастерской</a></nav>
    </header>
    <div className="relative min-h-0 flex-1">
      <TemariScene inspection={{ view, focus }} onError={setError}>
        <mesh><sphereGeometry args={[1, 128, 64]} />
          <meshStandardMaterial key={String(transparent)} color="#d9c9af" roughness={.94} transparent={transparent}
            opacity={transparent ? .13 : 1} depthWrite={!transparent} />
        </mesh>
        {transparent && <mesh><sphereGeometry args={[(R - layerMm) / R, 96, 48]} />
          <meshStandardMaterial color="#c4b59f" roughness={.95} />
        </mesh>}
        <group scale={1 / R}>
          {rendered.mesh && <mesh geometry={rendered.mesh} dispose={null}>
            <meshStandardMaterial color={gold} roughness={.67} />
          </mesh>}
          {rendered.axis && <primitive object={rendered.axis} dispose={null} />}
        </group>
      </TemariScene>
      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg bg-ink/85 px-3 py-2 text-xs text-linen"
        aria-label="Легенда первого визита">
        <p className="flex items-center gap-2"><span className="h-3 w-3 shrink-0" style={{ backgroundColor: gold }} />
          Первый ряд · одна нить · {rendered.error ? rendered.axis ? 'только ось' : 'путь не показан' : `Ø${mm(2 * snapshot.thread.radiusMm)} мм`}</p>
        <p className="mt-1">{phaseText}; приёмка не выдана</p>
        {transparent && <p className="mt-1">Светлый — условный слой; тёмный — ядро</p>}
      </div>
    </div>
    <div className="z-10 max-h-[48dvh] overflow-y-auto border-t border-ink/15 bg-linen px-4 py-3 text-sm">
      <p role="status" className="mb-2"><b>{phaseText}. {acceptanceText[snapshot.acceptance]}</b></p>
      {running && <p role="status" className="mb-2">Идёт ограниченный расчёт: до 2 × 40 итераций. Пока показан прежний снимок.</p>}
      {rendered.error && <p role="alert" className="mb-2 text-red-800">{rendered.error} {rendered.axis ? 'Показана только ось, без сечения.' : 'Путь не показан.'}</p>}
      {error && <p role="alert" className="mb-2 text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={solve}>{running ? 'Остановить расчёт' : 'Рассчитать первый визит'}</button>
        <button className={button} aria-pressed={!showSolved} onClick={() => { setShowSolved(false); setReveal(100); }}>Исходный маршрут</button>
        <button className={button} disabled={!solved} aria-pressed={showSolved}
          onClick={() => { setShowSolved(true); setReveal(100); }}>Результат расчёта</button>
        <button className={button} aria-pressed={!transparent} onClick={() => setTransparent(false)}>Шар</button>
        <button className={button} aria-pressed={transparent} onClick={() => setTransparent(true)}>Прозрачная мари</button>
        {(['pole', 'close', 'side'] as const).map((v, i) => <button className={button} key={v} aria-pressed={view === v}
          onClick={() => setView(v)}>{['Сверху', 'Крупно', 'Сбоку'][i]}</button>)}
        <button className={button} onClick={download}>Скачать показанный снимок</button>
      </div>
      <label className="mt-3 block">Открыть фиксированный путь: {visibleSegments} из {count} отрезков
        <input className="mt-1 block w-full accent-ink" type="range" min={0} max={100} step={1} value={reveal}
          aria-label="Видимая часть фиксированного пути" onChange={e => setReveal(Number(e.target.value))} />
      </label>
      <p className="mt-1 text-xs">Ползунок меняет только видимость готового пути. Это не движение иглы, шитьё или затягивание.
        Проверка и экспорт относятся ко всему выбранному снимку.</p>
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs" aria-label="Проверка показанного снимка">
        <dt>Узлов оси</dt><dd>{snapshot.thread.nodes.length}</dd>
        <dt>Прохождение каналов</dt><dd>{snapshot.channelStatus === 'passed' ? 'проверено' : snapshot.channelStatus === 'rejected' ? 'отклонено' : 'не установлено'}</dd>
        <dt>Вывернутых граней / видимых</dt><dd>{inspection?.mesh ? `${inspection.mesh.foldedFaces} / ${inspection.mesh.foldedVisibleFaces}` : 'меш не проверен'}</dd>
        <dt>Вырожденных граней</dt><dd>{inspection?.mesh?.degenerateFaces ?? 'не определено'}</dd>
        <dt>Оценка rκ по тройкам узлов</dt><dd>{inspection?.curvatureProxy ? mm(inspection.curvatureProxy.maximumRadiusTimesCurvature) : 'не определена'}</dd>
        <dt>Назначено материала</dt><dd>{mm(snapshot.material.availableLengthMm)} мм</dd>
        <dt>Длина показанного пути</dt><dd>{mm(snapshot.material.laidLengthMm)} мм</dd>
        <dt>Запас материала</dt><dd>{mm(snapshot.material.reserveLengthMm)} мм</dd>
        <dt>Численный статус</dt><dd>{snapshot.solver?.status ?? 'не рассчитывался'}</dd>
        {snapshot.solver && <><dt>Итераций</dt><dd>{snapshot.solver.iterations}</dd>
          <dt>Максимальное проникновение</dt><dd>{mm(snapshot.solver.residuals.maxPenetrationMm)} мм</dd></>}
      </dl>
      <p className="mt-2 text-xs">Три последовательных канала: нижний → верхний → нижний. Порты взяты из текущего рецепта.
        Слой {mm(layerMm)} мм задан для контроля; он не измерен на реальной мари.</p>
      <details className="mt-2"><summary>Что ещё не подтверждено</summary>
        <ul className="my-2 list-disc space-y-1 pl-5">{snapshot.limitations.map(text => <li key={text}>{text}</li>)}</ul>
        {inspection?.diagnostics.length ? <p className="my-2 break-words text-xs">{inspection.diagnostics.join(' ')}</p> : null}
        <a className="underline" href="design.html#needle-channel">Основания и ограничения модели</a>
      </details>
    </div>
  </section>;
}
