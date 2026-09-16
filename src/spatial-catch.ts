import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createLowerKagariFixture } from './components/temari/lower-kagari';
import { curveDerivative, evaluateCurve, validateThreadCoupon } from './components/temari/thread-geometry';
import type { C8ThreadCoupon, PointMm, ThreadCurve } from './components/temari/thread-path';
import type { computeLowerKagari } from './components/temari/computed-lower-kagari';

const stage = document.getElementById('spatial-view')!;
const labels = document.getElementById('spatial-labels')!;
const fixture = createLowerKagariFixture();
const R = fixture.bodyRadiusMm;
const text = (id: string, value: string) => { document.getElementById(`spatial-${id}`)!.textContent = value; };
const button = (id: string) => document.getElementById(`spatial-${id}`) as HTMLButtonElement;
const check = (id: string) => document.getElementById(`spatial-${id}`) as HTMLInputElement;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0xece8e1, 0);
renderer.domElement.setAttribute('aria-label', 'Непрерывная нить: вход 1, скрытый обратный подхват, выход 2 и перехлёст');
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .01, 500);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enablePan = false;
orbit.minZoom = .5; orbit.maxZoom = 5;
orbit.target.set(0, R, -1.2);
scene.add(new THREE.HemisphereLight(0xfffaf0, 0x8b837a, 2.2));
const light = new THREE.DirectionalLight(0xfff6e4, 2.1); scene.add(light);
const body = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), new THREE.MeshStandardMaterial({
  color: 0xd6cabb, roughness: 1, transparent: true, opacity: .12, depthWrite: false,
}));
scene.add(body);
let model = new THREE.Group(); scene.add(model);
let computed: ReturnType<typeof computeLowerKagari> | undefined;
let showingComputed = false;
let worker: Worker | undefined;
let stopped = false;

class YarnCurve extends THREE.Curve<THREE.Vector3> {
  constructor(readonly curve: ThreadCurve) { super(); }
  getPoint(t: number, target = new THREE.Vector3()) { return target.fromArray(evaluateCurve(this.curve, t)); }
}
function tube(curve: ThreadCurve, radius: number, color: number) {
  return new THREE.Mesh(new THREE.TubeGeometry(new YarnCurve(curve), 96, radius, 16, false),
    new THREE.MeshStandardMaterial({ color, roughness: .58 }));
}
function disposeGroup() {
  model.traverse(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m.dispose());
  });
  scene.remove(model);
}
function drawCoupon(coupon: C8ThreadCoupon) {
  disposeGroup(); model = new THREE.Group(); scene.add(model);
  for (const span of coupon.spans) model.add(tube(span.curve, coupon.threadRadiusMm,
    span.opId === 'lower-incoming' ? 0xa87432 : span.opId === 'lower-fixed-bite' ? 0x31688f : 0x963e44));
  for (const support of coupon.supports) model.add(tube(support.curve, support.radiusMm, 0x705b40));
  stage.dataset.view = showingComputed ? 'computed' : 'reference';
  render();
}
const labelPorts: { point: PointMm; label: string; dx: number }[] = [
  { point: fixture.entry.positionMm, label: '1 · вход', dx: 48 },
  { point: fixture.exit.positionMm, label: '2 · выход', dx: -52 },
];
function render() {
  if (stopped) return;
  const inside = check('inside').checked;
  body.material.opacity = inside ? .10 : 1;
  body.material.depthWrite = !inside;
  const size = stage.clientWidth;
  renderer.setSize(size, size, false);
  light.position.copy(camera.position).add(new THREE.Vector3(4, 5, -2));
  camera.updateMatrixWorld(); renderer.render(scene, camera);
  labels.replaceChildren();
  if (check('contacts').checked) for (const port of labelPorts) {
    const p = new THREE.Vector3(...port.point).project(camera), x = 300 + p.x * 300, y = 300 - p.y * 300;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [k, v] of Object.entries({ x1: x, y1: y, x2: x + port.dx, y2: y + 30, stroke: '#574f46', 'stroke-width': 1 })) line.setAttribute(k, String(v));
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    for (const [k, v] of Object.entries({ x: x + port.dx, y: y + 49, fill: '#342e28', 'font-size': size < 400 ? 23 : 15, 'text-anchor': 'middle', stroke: '#ece8e1', 'stroke-width': 4, 'paint-order': 'stroke' })) label.setAttribute(k, String(v));
    label.textContent = port.label; labels.append(line, label);
  }
}
function view(side = false) {
  camera.zoom = 1;
  camera.up.set(0, 0, -1);
  camera.position.copy(orbit.target).add(side ? new THREE.Vector3(15, 9, 1) : new THREE.Vector3(0, 20, 0));
  camera.lookAt(orbit.target); camera.updateProjectionMatrix(); orbit.update(); render();
}
button('front').addEventListener('click', () => view());
button('side').addEventListener('click', () => view(true));
for (const id of ['inside', 'contacts']) check(id).addEventListener('change', render);
orbit.addEventListener('change', render);
function setComputed(value: boolean) {
  showingComputed = value && !!computed;
  button('before').setAttribute('aria-pressed', String(!showingComputed));
  button('after').setAttribute('aria-pressed', String(showingComputed));
  drawCoupon(showingComputed ? computed!.coupon : fixture.coupon);
}
button('before').addEventListener('click', () => setComputed(false));
button('after').addEventListener('click', () => setComputed(true));
const seed = validateThreadCoupon(fixture.coupon);
stage.dataset.referenceStatus = seed.status;
const outgoingLength = fixture.looseOutgoing.reduce((sum, curve) => {
  const n = 1024;
  let integral = Math.hypot(...curveDerivative(curve, 0)) + Math.hypot(...curveDerivative(curve, 1));
  for (let i = 1; i < n; i++) integral += (i % 2 ? 4 : 2) * Math.hypot(...curveDerivative(curve, i / n));
  return sum + integral / (3 * n);
}, 0);
text('length-before', `${outgoingLength.toFixed(3)} мм`);
text('checks', `Исходная схема: ${seed.status === 'passed' ? 'проверки пройдены' : 'требует уточнения'}. Четыре заданных пересечения; радиус × кривизна ${seed.maxCurvatureTimesRadius.toFixed(3)}. Входящая ветвь и скрытый проход остаются неподвижными.`);
drawCoupon(fixture.coupon); view();
const observer = new ResizeObserver(render); observer.observe(stage);
const intersection = new IntersectionObserver(entries => {
  if (!entries.some(e => e.isIntersecting)) return;
  intersection.disconnect();
  text('status', 'Проверяем наружную укладку на двух разрешениях сплайна…');
  worker = new Worker(new URL('./spatial-catch.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = event => {
    if (event.data.error) { text('status', `Расчёт не завершён: ${event.data.error}`); stage.dataset.status = 'unresolved'; }
    else {
      computed = event.data as ReturnType<typeof computeLowerKagari>;
      stage.dataset.status = computed.status;
      const status = document.getElementById('spatial-status')!;
      status.dataset.status = computed.status === 'accepted' ? 'passed' : 'unresolved';
      text('status', computed.status === 'accepted' ? 'Численные проверки наружной укладки пройдены. Равновесие реальной пряжи этим не подтверждено.' :
        'Вычисленная укладка не принята: сходимости оптимизатора недостаточно — проверка толщины и устойчивости к уточнению сетки выявила проблемы. Можно рассмотреть отклонённый результат.');
      button('after').disabled = false;
      button('after').textContent = computed.status === 'accepted' ? 'После расчёта' : 'Отклонённый расчёт';
      text('length-after', `${computed.result.lengthMm.toFixed(3)} мм`);
      text('length-delta', `${(outgoingLength - computed.result.lengthMm).toFixed(3)} мм`);
      text('checks', `Исходная схема: ${seed.status}. Разрешения: ${computed.checks.resolutions.map(r => `${r.controlCount} точек — оптимизатор ${r.result.status}, геометрия ${r.validation.status}`).join('; ')}. Изменение длины при уточнении: ${computed.metrics.lengthDifferenceMm.toFixed(4)} мм. ${computed.diagnostics.join(' ')}`);
    }
    worker?.terminate(); worker = undefined;
  };
  worker.onerror = () => { text('status', 'Расчёт не завершён. Исходная схема доступна; вычисленная форма не принята.'); stage.dataset.status = 'unresolved'; worker?.terminate(); worker = undefined; };
  worker.postMessage({});
}, { rootMargin: '300px' });
intersection.observe(stage);
window.addEventListener('pagehide', () => {
  stopped = true; worker?.terminate(); observer.disconnect(); intersection.disconnect(); orbit.dispose();
  disposeGroup(); body.geometry.dispose(); body.material.dispose(); renderer.dispose();
});
