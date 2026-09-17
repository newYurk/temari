import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { jiwariNormals } from './components/temari/jiwari';
import { evaluateCurve } from './components/temari/thread-geometry';
import type { C8ThreadCoupon, ThreadCurve } from './components/temari/thread-path';
import type { S8KikuStage } from './components/temari/s8-kiku';
import type { S8KikuSummary } from './s8-kiku.worker';

const stage = document.getElementById('s8-view')!;
const labels = document.getElementById('s8-labels')!;
const el = <T extends HTMLElement>(id: string) => document.getElementById(`s8-${id}`) as T;
const text = (id: string, value: string) => { el(id).textContent = value; };
const R = 230 / (2 * Math.PI);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0xece8e1, 0);
renderer.domElement.setAttribute('aria-label', 'Кику Simple 8: рабочая нить, скрытые подхваты и разметка у полюса');
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-45, 45, 45, -45, .01, 1000);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enablePan = false; orbit.minZoom = .5; orbit.maxZoom = 40;
scene.add(new THREE.HemisphereLight(0xfffaf0, 0x8b837a, 2.2));
const light = new THREE.DirectionalLight(0xfff6e4, 2.1); scene.add(light);
const body = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 144), new THREE.MeshStandardMaterial({ color: 0xd6cabb, roughness: 1, transparent: true, opacity: 1 }));
scene.add(body);
// The full marking circles are drawn as thin guides; only short segments are physical supports.
const guides = new THREE.Group();
for (const normal of jiwariNormals('simple')) {
  const n = new THREE.Vector3(...normal).normalize(), a = new THREE.Vector3(1, 0, 0);
  if (Math.abs(n.dot(a)) > .9) a.set(0, 0, 1);
  const x = a.clone().cross(n).normalize(), y = n.clone().cross(x);
  const points = Array.from({ length: 721 }, (_, i) => x.clone().multiplyScalar(Math.cos(i * Math.PI / 360)).add(y.clone().multiplyScalar(Math.sin(i * Math.PI / 360))).multiplyScalar(R + .03));
  guides.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x8b837a, transparent: true, opacity: .55 })));
}
scene.add(guides);
let model = new THREE.Group(); scene.add(model);
const results = new Map<S8KikuStage, S8KikuSummary>();
const pending = new Map<S8KikuStage, Worker>();
let current: S8KikuStage = 'stitch', view: 'flower' | 'lower' | 'upper' | 'side' = 'flower', stopped = false;

class YarnCurve extends THREE.Curve<THREE.Vector3> {
  constructor(readonly curve: ThreadCurve) { super(); }
  getPoint(t: number, target = new THREE.Vector3()) { return target.fromArray(evaluateCurve(this.curve, t)); }
}
function run(curves: ThreadCurve[], radius: number, color: number) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (const curve of curves) path.add(new YarnCurve(curve));
  const segments = Math.min(8000, Math.max(24, Math.ceil(path.getLength() / .04)));
  return new THREE.Mesh(new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, segments, radius, 14, false),
    new THREE.MeshStandardMaterial({ color, roughness: .58 }));
}
function dispose() {
  model.traverse(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m.dispose());
  });
  scene.remove(model);
}
const COLORS = { visible: 0x963e44, latest: 0xc98a2e, hidden: 0x31688f, support: 0x705b40 };
function draw() {
  dispose(); model = new THREE.Group(); scene.add(model);
  const summary = results.get(current);
  stage.dataset.stage = current;
  if (!summary) { render(); return; }
  const coupon: C8ThreadCoupon = summary.coupon, step = Number(el<HTMLInputElement>('step').value);
  const shown = new Set(coupon.operations.filter(op => op.step <= step).map(op => op.id));
  const spans = coupon.spans.filter(s => shown.has(s.opId));
  // Consecutive spans of one colour share a tube, so the thread stays one smooth mesh.
  let runCurves: ThreadCurve[] = [], runColor = -1;
  const flush = () => { if (runCurves.length) model.add(run(runCurves, coupon.threadRadiusMm, runColor)); runCurves = []; };
  for (const span of spans) {
    const color = span.zone !== 'surface' ? COLORS.hidden : span.step === step && step > 0 ? COLORS.latest : COLORS.visible;
    if (color !== runColor) { flush(); runColor = color; }
    runCurves.push(span.curve);
  }
  flush();
  for (const support of coupon.supports) model.add(run([support.curve], support.radiusMm, COLORS.support));
  stage.dataset.shownSpans = String(spans.length);
  render();
}
function render() {
  if (stopped) return;
  const inside = el<HTMLInputElement>('inside').checked;
  const material = body.material as THREE.MeshStandardMaterial;
  material.opacity = inside ? .14 : 1; material.depthWrite = !inside;
  const size = stage.clientWidth;
  renderer.setSize(size, size, false);
  light.position.copy(camera.position).add(new THREE.Vector3(8, 12, -4));
  camera.updateMatrixWorld(); renderer.render(scene, camera);
  labels.replaceChildren();
  const summary = results.get(current);
  if (!summary || !el<HTMLInputElement>('marks').checked) return;
  for (const tip of summary.tips) {
    const p = new THREE.Vector3(...tip.markMm).project(camera);
    if (Math.abs(p.x) > .95 || Math.abs(p.y) > .95) continue;
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const outward = new THREE.Vector3(...tip.markMm).add(new THREE.Vector3(...tip.frame.outward).multiplyScalar(view === 'flower' ? 3 : .9)).project(camera);
    for (const [k, v] of Object.entries({ x: 300 + outward.x * 300, y: 300 - outward.y * 300 + 6, fill: '#342e28', 'font-size': size < 400 ? 26 : 17,
      'text-anchor': 'middle', stroke: '#ece8e1', 'stroke-width': 4, 'paint-order': 'stroke' })) label.setAttribute(k, String(v));
    label.textContent = String(tip.index + 1);
    labels.append(label);
  }
}
function setView(next: typeof view) {
  view = next;
  for (const id of ['flower', 'lower', 'upper', 'side']) el(`view-${id}`).setAttribute('aria-pressed', String(id === next));
  stage.dataset.view = next;
  const summary = results.get(current);
  const tips = summary?.tips;
  const pole = new THREE.Vector3(0, 1, 0);
  const tip = tips?.[next === 'upper' ? 2 : 1];
  const target = next === 'flower' || !tip ? pole.clone().multiplyScalar(R) : new THREE.Vector3(...tip.markMm);
  const radial = target.clone().normalize();
  const up = tip ? new THREE.Vector3(...tip.frame.outward) : new THREE.Vector3(1, 0, 0);
  const half = next === 'flower' ? 46 : next === 'upper' ? 3 : 4;
  camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half; camera.zoom = 1;
  orbit.target.copy(target);
  const offset = next === 'side' && tip
    ? radial.clone().multiplyScalar(14).add(new THREE.Vector3(...tip.frame.progress).multiplyScalar(22)).add(up.clone().multiplyScalar(-6))
    : radial.clone().multiplyScalar(60);
  camera.position.copy(target).add(offset);
  camera.up.copy(next === 'flower' && tips ? new THREE.Vector3(...tips[0].frame.outward) : up);
  camera.lookAt(target); camera.updateProjectionMatrix(); orbit.update(); render();
}
function show(summary: S8KikuSummary) {
  const status = el('status');
  stage.dataset.status = summary.status;
  status.dataset.status = summary.status === 'accepted' ? 'passed' : 'unresolved';
  const maxStep = Math.max(...summary.coupon.operations.map(op => op.step));
  const slider = el<HTMLInputElement>('step');
  slider.max = String(maxStep); slider.value = String(maxStep); text('step-value', String(maxStep));
  text('status', summary.status === 'accepted'
    ? `Принято: все ${summary.levels.length} уровня сетки сходятся и проходят проверку всей нити. Это модель толстой нити, не равновесие настоящей пряжи.`
    : `Не принято (${summary.status === 'rejected' ? 'отказ' : 'не подтверждено'}): ${summary.diagnostics.join(' ')}`);
  const mm = (v: number, digits = 3) => `${v.toFixed(digits).replace('.', ',')} мм`;
  const finest = summary.levels.at(-1)!;
  text('length', mm(finest.lengthMm, 2));
  text('bend', `${finest.curvature.toFixed(3).replace('.', ',')} (предел ${summary.metrics.curvatureLimit.toFixed(2).replace('.', ',')} + 0,02)`);
  text('refine', `длина ${mm(summary.metrics.lengthDifferenceMm, 4)}, форма ${mm(summary.metrics.maxShapeDifferenceMm, 3)}`);
  const list = el('levels');
  list.replaceChildren(...summary.levels.map(level => {
    const item = document.createElement('li');
    const solved = level.solves.filter(s => s.status === 'converged').length;
    item.textContent = `×${String(level.factor).replace('.', ',')}: окна ${solved}/${level.solves.length} сошлись, путь — ${level.validation === 'passed' ? 'проверки пройдены' : `${level.validation} (${level.codes.join(', ')})`}, r·κ ≤ ${level.curvature.toFixed(3).replace('.', ',')}, скрытые ≤ ${level.hiddenCurvature.toFixed(3).replace('.', ',')}`;
    return item;
  }));
  const worst = new Map<string, { length: number; shape: number }>();
  for (const r of summary.refinements) {
    const w = worst.get(r.windowId) ?? { length: 0, shape: 0 };
    worst.set(r.windowId, { length: Math.max(w.length, r.lengthDifferenceMm), shape: Math.max(w.shape, r.shapeDifferenceMm) });
  }
  el('windows').replaceChildren(...summary.windows.map(w => {
    const item = document.createElement('li'), d = worst.get(w.id)!;
    const name = w.kind === 'approach' ? 'приход к' : w.kind === 'departure' ? 'уход от' : 'возврат поверх начала к';
    item.textContent = `${name} точке ${w.tip + 1}: ${w.minimumSpans}+ пролётов; Δдлины ${mm(d.length, 4)}, Δформы ${mm(d.shape, 3)}`;
    item.dataset.ok = String(d.length <= .002 && d.shape <= .02);
    return item;
  }));
  setView(view);
  draw();
}
function compute(next: S8KikuStage) {
  if (results.has(next) || pending.has(next)) return;
  text('status', next === 'stitch' ? 'Считаем стежок на трёх уровнях сетки…' : 'Считаем круг на трёх уровнях сетки — это занимает больше времени…');
  el('status').dataset.status = 'unresolved';
  const worker = new Worker(new URL('./s8-kiku.worker.ts', import.meta.url), { type: 'module' });
  pending.set(next, worker);
  worker.onmessage = event => {
    worker.terminate(); pending.delete(next);
    if (event.data.error) { if (current === next) { text('status', `Расчёт не завершён: ${event.data.error}`); stage.dataset.status = 'unresolved'; } return; }
    results.set(next, event.data.summary);
    if (current === next) show(event.data.summary);
  };
  worker.onerror = () => { worker.terminate(); pending.delete(next); if (current === next) { text('status', 'Расчёт не завершён.'); stage.dataset.status = 'unresolved'; } };
  worker.postMessage({ stage: next });
}
function setStage(next: S8KikuStage) {
  current = next;
  el('stage-stitch').setAttribute('aria-pressed', String(next === 'stitch'));
  el('stage-round').setAttribute('aria-pressed', String(next === 'round'));
  delete stage.dataset.status;
  const summary = results.get(next);
  if (summary) show(summary); else { draw(); compute(next); }
}
el('stage-stitch').addEventListener('click', () => setStage('stitch'));
el('stage-round').addEventListener('click', () => setStage('round'));
for (const id of ['flower', 'lower', 'upper', 'side'] as const) el(`view-${id}`).addEventListener('click', () => setView(id));
el('step').addEventListener('input', () => { text('step-value', el<HTMLInputElement>('step').value); draw(); });
el('inside').addEventListener('change', render);
el('marks').addEventListener('change', render);
orbit.addEventListener('change', render);
setView('flower');
const observer = new ResizeObserver(render); observer.observe(stage);
const intersection = new IntersectionObserver(entries => {
  if (!entries.some(e => e.isIntersecting)) return;
  intersection.disconnect();
  setStage('stitch');
}, { rootMargin: '300px' });
intersection.observe(stage);
window.addEventListener('pagehide', () => {
  stopped = true; for (const w of pending.values()) w.terminate(); observer.disconnect(); intersection.disconnect(); orbit.dispose();
  dispose(); body.geometry.dispose(); (body.material as THREE.Material).dispose(); renderer.dispose();
});
