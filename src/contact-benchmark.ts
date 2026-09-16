import { solveTautContact, type TautSupport, type TautContactResult, type TautSegment } from './components/temari/taut-contact';

const root = document.getElementById('contact-benchmark')!;
const control = (id: string) => document.getElementById(id) as HTMLInputElement;
const setText = (id: string, text: string) => { document.getElementById(id)!.textContent = text; };
const number = (value: number) => value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mm = (value: number) => `${number(value)} мм`;
const NS = 'http://www.w3.org/2000/svg';
function element(tag: string, attributes: Record<string, string | number>) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}
function path(segment: TautSegment) {
  const from = `${segment.from[0]} ${-segment.from[1]}`, to = `${segment.to[0]} ${-segment.to[1]}`;
  return segment.kind === 'line' ? `M ${from} L ${to}` :
    `M ${from} A ${segment.radiusMm} ${segment.radiusMm} 0 ${Math.abs(segment.sweepRad) > Math.PI ? 1 : 0} ${segment.sweepRad < 0 ? 1 : 0} ${to}`;
}
function draw(id: string, result: TautContactResult, supports: TautSupport[], radius: number, contact: boolean) {
  const svg = document.getElementById(id)!;
  svg.replaceChildren();
  for (const [index, support] of supports.entries()) {
    svg.append(element('circle', { cx: support.centerMm[0], cy: -support.centerMm[1], r: support.radiusMm,
      fill: index === 2 ? '#ab8b51' : '#74665a', stroke: '#4f463c', 'stroke-width': .009 }));
    const label = element('text', { x: support.centerMm[0], y: -support.centerMm[1] + .045,
      fill: '#fff8e9', 'font-size': index === 2 ? .12 : .16, 'text-anchor': 'middle' });
    label.textContent = String(index + 1); svg.append(label);
  }
  const segments = result.status === 'passed' ? result.segments : [];
  if (segments.length) svg.append(element('path', {
    d: segments.map((s, i) => i ? path(s).replace(/^M [^ ]+ [^ ]+ /, '') : path(s)).join(' '),
    fill: 'none', class: 'working-thread', stroke: '#963e44', 'stroke-width': radius * 2,
    'stroke-linecap': 'butt', 'stroke-linejoin': 'round', opacity: contact ? 1 : .55,
  }));
  for (const segment of contact ? segments.filter(s => s.kind === 'arc') : []) {
    svg.append(element('path', { d: path(segment), fill: 'none', class: 'working-thread',
      stroke: '#31688f',
      'stroke-width': radius * 2, 'stroke-linecap': 'butt', 'stroke-linejoin': 'round',
      opacity: contact ? 1 : .55 }));
  }
  for (const [label, y] of [['вход', .95], ['выход', -.95]] as const) {
    svg.append(element('circle', { cx: -1.8, cy: -y, r: .025, fill: '#f9f4ec' }));
    const text = element('text', { x: -1.8, y: -y + (y > 0 ? -.19 : .27), fill: '#5a5045',
      'font-size': .2, 'text-anchor': 'middle' });
    text.textContent = label; svg.append(text);
  }
  const scale = element('path', { d: 'M 1.15 1.26 H 2.15 M 1.15 1.22 V 1.3 M 2.15 1.22 V 1.3',
    stroke: '#8a8173', 'stroke-width': .009, fill: 'none' });
  svg.append(scale);
  const scaleLabel = element('text', { x: 1.65, y: 1.16, fill: '#6b6358', 'font-size': .19, 'text-anchor': 'middle' });
  scaleLabel.textContent = '1 мм'; svg.append(scaleLabel);
}
function renderContact() {
  const scenario = control('contact-supports').value;
  const radius = Number(control('contact-diameter').value) / 2;
  const clearance = Number(control('contact-clearance').value);
  const supports: TautSupport[] = [{ id: 'old-1', centerMm: [0, 0], radiusMm: .2 }];
  if (scenario !== 'one') supports.push({ id: 'old-2', centerMm: [.46, 0], radiusMm: .2 });
  if (scenario === 'three') supports.push({ id: 'mark', centerMm: [.23, -.3], radiusMm: .08 });
  const input = { startMm: [-1.8, .95] as const, endMm: [-1.8, -.95] as const,
    supports, threadRadiusMm: radius, direction: -1 as const };
  const reference = solveTautContact({ ...input, clearanceMm: clearance });
  const tight = solveTautContact(input);
  const passed = reference.status === 'passed' && tight.status === 'passed';
  root.dataset.status = passed ? 'passed' : reference.status === 'failed' || tight.status === 'failed' ? 'failed' : 'unresolved';
  root.dataset.scenario = scenario;
  root.dataset.diameter = String(radius * 2);
  root.dataset.clearance = String(clearance);
  root.dataset.length = String(tight.lengthMm);
  root.dataset.referenceLength = String(reference.lengthMm);
  setText('contact-diameter-value', mm(radius * 2));
  setText('contact-clearance-value', mm(clearance));
  setText('contact-reference-length', passed ? mm(reference.lengthMm) : '—');
  setText('contact-tight-length', passed ? mm(tight.lengthMm) : '—');
  setText('contact-slack', passed ? mm(reference.lengthMm - tight.lengthMm) : '—');
  setText('contact-active', passed ? `${tight.contacts.filter(c => c.angleRad > 1e-9).length} из ${supports.length}` : '—');
  setText('contact-curvature', passed ? number(tight.maxCurvatureTimesRadius) : '—');
  setText('contact-status', passed ? 'Касательные сопряжены, толщина учтена, путь не проникает в опоры.' :
    'Для этих параметров расчёт пока не подтверждён. Форма не считается готовой.');
  draw('contact-reference', reference, supports, radius, false);
  draw('contact-tight', tight, supports, radius, true);
}
root.querySelectorAll('input,select').forEach(node => node.addEventListener('input', renderContact));
renderContact();
