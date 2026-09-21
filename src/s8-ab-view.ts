import './lab.css';
import './s8-ab.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { evaluateCurve } from './components/temari/thread-geometry';
import type { C8ThreadCoupon, ThreadCurve } from './components/temari/thread-path';
import type { checkS8AB } from './components/temari/s8-kiku-ab';

type Snapshot = { version: 1; kind: 's8-a1-b1-control'; status: string; A: C8ThreadCoupon; B: C8ThreadCoupon;
  checks: ReturnType<typeof checkS8AB>[]; acceptance: { A: { status: string; diagnostics: string[] }; B: { status: string; diagnostics: string[] } };
  source: { digest: string } } | { version: 2; kind: 's8-a1-b1-a2-b2-control'; ab1Verdict: string; A1: C8ThreadCoupon; B1: C8ThreadCoupon;
  ab1Checks: ReturnType<typeof checkS8AB>[]; acceptance: { A: { status: string; diagnostics: string[] }; B: { status: string; diagnostics: string[] } };
  source: { digest: string } };
function firstPass(data: Snapshot) {
  return data.version === 1
    ? { status: data.status, A: data.A, B: data.B, checks: data.checks, acceptance: data.acceptance }
    : { status: data.ab1Verdict, A: data.A1, B: data.B1, checks: data.ab1Checks, acceptance: data.acceptance };
}
const get = <T extends HTMLElement>(id: string) => document.getElementById(`ab-${id}`) as T;
const host = get('view'), step = get<HTMLInputElement>('step');
let draw = () => {}, setView = (_mode: string) => {};

// Perle #5 is a twisted cord: under tension on the sphere it flattens.
// Render radius is scaled down from the geometric radius used in gap checks.
// 0.75 gives a stack height of ~1.06 mm for two threads (vs theoretical 1.42 mm).
// This is visual only — no geometry or acceptance values are changed.
const VISUAL_FLATTEN = 0.75;

async function init() {
  const response = await fetch('./fixtures/s8-ab.json');
  if (!response.ok) throw new Error(`Данные недоступны (${response.status})`);
  const data: Snapshot = await response.json();
  const pass = firstPass(data);
  if (!((data.version === 1 && data.kind === 's8-a1-b1-control') || (data.version === 2 && data.kind === 's8-a1-b1-a2-b2-control'))
    || !pass.A.spans.length || !pass.B.spans.length || pass.A.threadId === pass.B.threadId || pass.checks.length !== 6)
    throw new Error('Некорректный снимок A/B');
  const latest = pass.checks[4];
  if (pass.status === 'accepted' && (pass.acceptance.A.status !== 'accepted' || pass.acceptance.B.status !== 'accepted'
    || pass.checks.some(c => c.status !== 'passed'))) throw new Error('Статус не соответствует проверкам');
  host.dataset.status = pass.status; host.dataset.source = data.source.digest;
  get('circumference').textContent = (2 * Math.PI * pass.A.bodyRadiusMm).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  get('diameter').textContent = (2 * pass.A.threadRadiusMm).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
  get('status').textContent = pass.status === 'accepted'
    ? 'Численно принято для этой модели. Ремесленная приёмка остаётся открытой.'
    : 'Не принято: показан диагностический путь, а не готовая вышивка.';
  get('crossings').textContent = `${latest.surfaceCrossings} · ${latest.status === 'passed' ? 'проверены' : 'требуют исправления'}`;
  get('gap').textContent = `${latest.clearance.lowerMm.toFixed(5)} мм · ${latest.clearance.status}`;
  get('report').textContent = JSON.stringify({ status: pass.status, A: pass.acceptance.A.status, B: pass.acceptance.B.status,
    problemsA: pass.acceptance.A.diagnostics, problemsB: pass.acceptance.B.diagnostics,
    betweenThreads: latest.diagnostics.map(d => ({ code: d.code, message: d.message })), clearance: latest.clearance }, null, 2);
  const R = pass.A.bodyRadiusMm;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', 'Вычисленные пути двух рабочих нитей; мышью можно вращать шар');
  host.append(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-44, 44, 44, -44, .01, 1000);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enablePan = false; orbit.minZoom = .7; orbit.maxZoom = 12;
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0x8b837a, 2.2));
  const light = new THREE.DirectionalLight(0xfff6e4, 2.1); scene.add(light);
  const material = new THREE.MeshStandardMaterial({ color: 0xd6cabb, roughness: 1, transparent: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), material); scene.add(body);
  const render = () => {
    renderer.setSize(host.clientWidth, host.clientWidth, false);
    light.position.copy(camera.position).add(new THREE.Vector3(8, 12, -4));
    renderer.render(scene, camera);
  };
  class YarnCurve extends THREE.Curve<THREE.Vector3> {
    constructor(readonly curve: ThreadCurve) { super(); }
    getPoint(t: number, target = new THREE.Vector3()) { return target.fromArray(evaluateCurve(this.curve, t)); }
  }
  const tube = (curves: ThreadCurve[], radius: number, color: number) => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    curves.forEach(c => path.add(new YarnCurve(c)));
    return new THREE.Mesh(new THREE.TubeGeometry(path, Math.min(12000, Math.max(12, Math.ceil(path.getLength() / .04))), radius * VISUAL_FLATTEN, 12, false),
      new THREE.MeshStandardMaterial({ color, roughness: .6 }));
  };
  const guides = new THREE.Group(); scene.add(guides);
  // A contains the shared physical marking segments of both sets; do not duplicate them.
  pass.A.supports.forEach(s => guides.add(tube([s.curve], s.radiusMm, 0x705b40)));
  let yarn = new THREE.Group(); scene.add(yarn);
  draw = () => {
    yarn.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(v => v.dispose()); });
    scene.remove(yarn); yarn = new THREE.Group(); scene.add(yarn);
    const limit = Number(step.value); let shown = 0;
    for (const [index, coupon] of [pass.A, pass.B].entries()) {
      const localStep = limit - index * 8;
      if (localStep <= 0) continue;
      const spans = coupon.spans.filter(s => s.step <= localStep);
      // Group by operation and zone: no spurious bridge between disconnected working threads.
      for (const op of coupon.operations) {
        const own = spans.filter(s => s.opId === op.id);
        let curves: ThreadCurve[] = [], zone = '';
        const flush = () => { if (curves.length) yarn.add(tube(curves, coupon.threadRadiusMm, index ? 0x31546c : 0x963e44)); curves = []; };
        for (const s of own) { if (s.zone !== zone) { flush(); zone = s.zone; } curves.push(s.curve); }
        flush();
      }
      shown += spans.length;
    }
    host.dataset.step = String(limit); host.dataset.shownSpans = String(shown);
    get('step-value').textContent = limit === 0 ? 'Только разметка' : limit <= 8 ? `A1 · шаг ${limit}/8` : `A1 готов · B1 · шаг ${limit - 8}/8`;
    get('only-a').setAttribute('aria-pressed', String(limit === 8));
    get('both').setAttribute('aria-pressed', String(limit === 16));
    render();
  };
  setView = mode => {
    const close = mode === 'close', side = mode === 'side', half = close ? 13 : 44;
    camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half; camera.zoom = 1;
    orbit.target.set(0, close ? R - 1 : 0, 0);
    camera.position.copy(orbit.target).add(new THREE.Vector3(0, side ? 110 : 150, side ? 90 : .001));
    camera.up.set(0, 0, -1); camera.lookAt(orbit.target); camera.updateProjectionMatrix();
    orbit.update();
    host.dataset.view = mode;
    ['top', 'side', 'close'].forEach(id => get(id).setAttribute('aria-pressed', String(id === mode)));
    render();
  };
  get<HTMLInputElement>('inside').addEventListener('change', () => {
    const inside = get<HTMLInputElement>('inside').checked;
    material.opacity = inside ? .12 : 1; material.depthWrite = !inside; host.dataset.inside = String(inside); render();
  });
  orbit.addEventListener('change', render);
  new ResizeObserver(render).observe(host);
  ['only-a', 'both', 'step'].forEach(id => (get(id) as HTMLButtonElement | HTMLInputElement).disabled = false);
  setView('top'); draw();
}
step.addEventListener('input', () => draw());
get('only-a').addEventListener('click', () => { step.value = '8'; draw(); });
get('both').addEventListener('click', () => { step.value = '16'; draw(); });
['top', 'side', 'close'].forEach(id => get(id).addEventListener('click', () => setView(id)));
init().catch(error => { get('status').textContent = `Не удалось открыть образец: ${String(error)}`; host.dataset.status = 'error'; });
