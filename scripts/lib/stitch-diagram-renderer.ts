import { createHash } from 'node:crypto';
import { evaluateCurve, sampleCurve } from '../../src/components/temari/thread-geometry.ts';
import type { PointMm, ThreadCurve } from '../../src/components/temari/thread-path.ts';
import type { DiagramSnapshot } from './stitch-diagram-data.ts';

export type DiagramView = 'normal' | 'oblique';
export type DiagramRole = 'incoming' | 'bite' | 'outgoing' | 'marking';
export type DiagramSegment = {
  spanId: string; role: DiagramRole; from: PointMm; to: PointMm;
  t0: number; t1: number; radiusMm: number; hidden: boolean;
};
export const DIAGRAM = Object.freeze({
  width: 360, height: 400, pixelsPerMm: 52, centerX: 180, centerY: 180,
  centerAlongMm: -1, obliqueDegrees: 55, toleranceMm: .001, maxSegmentMm: .04,
});
export const COLORS: Record<DiagramRole, string> = {
  incoming: '#9a6324', bite: '#286183', outgoing: '#963e44', marking: '#6d6252',
};
const add = (a: PointMm, b: PointMm): PointMm => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale = (a: PointMm, s: number): PointMm => [a[0]*s,a[1]*s,a[2]*s];
const sub = (a: PointMm, b: PointMm) => add(a, scale(b, -1));
const dot = (a: PointMm, b: PointMm) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm = (a: PointMm) => Math.hypot(...a);
const mix = (a: PointMm, b: PointMm, t: number) => add(a, scale(sub(b,a),t));
const unit = (a: PointMm) => scale(a,1/norm(a));
const cross = (a: PointMm, b: PointMm): PointMm => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const f = (n: number) => {
  if (!Number.isFinite(n)) throw new Error('Non-finite diagram coordinate');
  return n.toFixed(3);
};
const escape = (s: string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

/** Orthographic views of the same millimetre coordinates, with the same scale. */
export function diagramCamera(snapshot: DiagramSnapshot, view: DiagramView) {
  const { radial, progress, outward } = snapshot.fixture.frame;
  const angle = (view === 'normal' ? 0 : DIAGRAM.obliqueDegrees) * Math.PI / 180;
  const eye = add(scale(radial,Math.cos(angle)),scale(progress,Math.sin(angle)));
  const right = unit(cross(scale(outward,-1),eye));
  const down = scale(cross(eye,right),-1);
  const origin = add(scale(radial,snapshot.coupon.bodyRadiusMm),scale(outward,DIAGRAM.centerAlongMm));
  return { eye,right,down,origin,angle };
}
export function projectPoint(snapshot: DiagramSnapshot, view: DiagramView, p: PointMm) {
  const c = diagramCamera(snapshot,view), local = sub(p,c.origin);
  return {
    x: DIAGRAM.centerX + dot(local,c.right)*DIAGRAM.pixelsPerMm,
    y: DIAGRAM.centerY + dot(local,c.down)*DIAGRAM.pixelsPerMm,
    depthMm: dot(local,c.eye),
  };
}

/** Small real curve intervals support depth sorting; no screen-space curve repair. */
function segmentsOf(
  snapshot: DiagramSnapshot, curve: ThreadCurve, spanId: string, role: DiagramRole, radiusMm: number,
): DiagramSegment[] {
  const sample = sampleCurve(curve, DIAGRAM.toleranceMm), out: DiagramSegment[] = [];
  for (let i=1;i<sample.parameters.length;i++) {
    const t0=sample.parameters[i-1],t1=sample.parameters[i];
    const count=Math.max(1,Math.ceil(norm(sub(sample.points[i],sample.points[i-1]))/DIAGRAM.maxSegmentMm));
    for (let j=0;j<count;j++) {
      const a=t0+(t1-t0)*j/count,b=t0+(t1-t0)*(j+1)/count;
      const from=evaluateCurve(curve,a),to=evaluateCurve(curve,b);
      const hidden=role==='bite' && norm(evaluateCurve(curve,(a+b)/2)) < snapshot.coupon.bodyRadiusMm;
      out.push({spanId,role,from,to,t0:a,t1:b,radiusMm,hidden});
    }
  }
  return out;
}
export function diagramSegments(snapshot: DiagramSnapshot): DiagramSegment[] {
  return [
    ...snapshot.coupon.spans.flatMap(s => {
      const role: DiagramRole = s.opId==='lower-incoming' ? 'incoming'
        : s.opId==='lower-fixed-bite' ? 'bite' : 'outgoing';
      return segmentsOf(snapshot,s.curve,s.id,role,snapshot.coupon.threadRadiusMm);
    }),
    ...snapshot.coupon.supports.flatMap(s=>segmentsOf(snapshot,s.curve,s.id,'marking',s.radiusMm)),
  ];
}

/** Locate the projected crossing from the sampled control path, never a drawn X. */
export function diagramCrossing(snapshot: DiagramSnapshot, segments=diagramSegments(snapshot)) {
  const projected=(role:DiagramRole)=>segments.filter(s=>s.role===role).map(s=>({
    ...s,p:projectPoint(snapshot,'normal',s.from),q:projectPoint(snapshot,'normal',s.to),
  }));
  const incoming=projected('incoming'),outgoing=projected('outgoing');
  const hits: {incoming:PointMm;outgoing:PointMm;radialGapMm:number}[]=[];
  for (const a of incoming) for (const b of outgoing) {
    const p=a.p,q=a.q,r=b.p,s=b.q;
    const ax=q.x-p.x,ay=q.y-p.y,bx=s.x-r.x,by=s.y-r.y,det=ax*by-ay*bx;
    if(Math.abs(det)<1e-10) continue;
    const dx=r.x-p.x,dy=r.y-p.y,t=(dx*by-dy*bx)/det,u=(dx*ay-dy*ax)/det;
    if(t<0||t>1||u<0||u>1) continue;
    const pa=mix(a.from,a.to,t),pb=mix(b.from,b.to,u);
    if(hits.some(h=>norm(sub(h.incoming,pa))<.01))continue;
    hits.push({incoming:pa,outgoing:pb,radialGapMm:dot(sub(pb,pa),snapshot.fixture.frame.radial)});
  }
  if(hits.length!==1 || hits[0].radialGapMm <= 0) {
    throw new Error(`Expected one outgoing-over-incoming crossing; found ${hits.length}.`);
  }
  return hits[0];
}

function polyline(snapshot: DiagramSnapshot, view: DiagramView, points: PointMm[]) {
  return points.map((p,i)=>{
    const q=projectPoint(snapshot,view,p);
    return `${i?'L':'M'}${f(q.x)} ${f(q.y)}`;
  }).join(' ');
}
function surfacePoint(snapshot: DiagramSnapshot, across: number, along: number) {
  const {radial,progress,outward}=snapshot.fixture.frame,R=snapshot.coupon.bodyRadiusMm;
  return scale(unit(add(radial,add(scale(progress,across/R),scale(outward,along/R)))),R);
}
function surface(snapshot: DiagramSnapshot, view: DiagramView) {
  const border: PointMm[]=[];
  for(let i=0;i<=32;i++)border.push(surfacePoint(snapshot,-2.8+5.6*i/32,-4.2));
  for(let i=1;i<=32;i++)border.push(surfacePoint(snapshot,2.8,-4.2+6.8*i/32));
  for(let i=1;i<=32;i++)border.push(surfacePoint(snapshot,2.8-5.6*i/32,2.6));
  for(let i=1;i<=32;i++)border.push(surfacePoint(snapshot,-2.8,2.6-6.8*i/32));
  const out=[`<path d="${polyline(snapshot,view,border)} Z" fill="#e5dfd4" stroke="#c2b9ac" stroke-width="1"/>`];
  for(const across of [-2,-1,0,1,2]) {
    const points=Array.from({length:65},(_,i)=>surfacePoint(snapshot,across,-4.2+6.8*i/64));
    out.push(`<path d="${polyline(snapshot,view,points)}" fill="none" stroke="#ccc3b5" stroke-width=".7"/>`);
  }
  for(const along of [-4,-3,-2,-1,0,1,2]) {
    const points=Array.from({length:65},(_,i)=>surfacePoint(snapshot,-2.8+5.6*i/64,along));
    out.push(`<path d="${polyline(snapshot,view,points)}" fill="none" stroke="#ccc3b5" stroke-width=".7"/>`);
  }
  return out.join('\n');
}
function arrow(snapshot:DiagramSnapshot,view:DiagramView,segments:DiagramSegment[],role:DiagramRole) {
  const selected=segments.filter(s=>s.role===role&&!s.hidden);
  const s=selected.reduce((best,one)=>{
    const y=(segment:DiagramSegment)=>projectPoint(snapshot,view,mix(segment.from,segment.to,.5)).y;
    return Math.abs(y(one)-90)<Math.abs(y(best)-90)?one:best;
  });
  const a=projectPoint(snapshot,view,s.from),b=projectPoint(snapshot,view,s.to);
  const length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
  const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
  const points=[[x+ux*7,y+uy*7],[x-ux*5-uy*6,y-uy*5+ux*6],[x-ux*5+uy*6,y-uy*5-ux*6]];
  return `<polygon data-direction="${role}" points="${points.map(p=>p.map(f).join(',')).join(' ')}" fill="${COLORS[role]}" stroke="#fffaf3" stroke-width="1.2"/>`;
}
function callout(snapshot:DiagramSnapshot,view:DiagramView,point:PointMm,label:string,x:number,y:number,attrs='') {
  const p=projectPoint(snapshot,view,point);
  return `<g ${attrs} font-family="sans-serif" font-size="18" text-anchor="middle">
<path d="M${f(p.x)} ${f(p.y)} L${f(x)} ${f(y)}" stroke="#62594e" stroke-width="1" fill="none"/>
<circle cx="${f(x)}" cy="${f(y)}" r="13" fill="#faf7f0" stroke="#62594e" stroke-width="1.2"/>
<text x="${f(x)}" y="${f(y+6)}" fill="#26221d">${label}</text></g>`;
}

export function renderStitchSvg(snapshot: DiagramSnapshot, view: DiagramView) {
  const segments=diagramSegments(snapshot),crossing=diagramCrossing(snapshot,segments);
  const geometryDigest=createHash('sha256').update(JSON.stringify(snapshot.coupon)).digest('hex');
  const title=view==='normal'?'Вид по нормали к поверхности':'Косой вид того же подхвата';
  const out=[
    `<svg class="model-stitch-svg" viewBox="0 0 ${DIAGRAM.width} ${DIAGRAM.height}" role="img" aria-labelledby="stitch-${view}-title stitch-${view}-desc" data-camera="${view}" data-source-digest="${snapshot.source.digest}" data-geometry-digest="${geometryDigest}" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="stitch-${view}-title">${title}</title>`,
    `<desc id="stitch-${view}-desc">Один численно принятый изолированный нижний подхват. 1: вход, 2: выход, 3: уход поверх прихода. Пунктир показывает скрытый участок заданного пути; цвета обозначают части одной нити.</desc>`,
    `<defs><clipPath id="stitch-${view}-crop"><rect x="16" y="18" width="328" height="334"/></clipPath></defs>`,
    `<g clip-path="url(#stitch-${view}-crop)">`,
    `<g data-surface="sphere-patch">${surface(snapshot,view)}</g>`,
    `<g class="diagram-hidden-path" fill="none" stroke="${COLORS.bite}">`,
  ];
  // Keep hidden pieces continuous so the dash pattern does not restart per pixel.
  let run: PointMm[]=[];
  const flush=()=>{
    if(run.length>1){
      const d=polyline(snapshot,view,run);
      // The translucent band retains physical width; the thin dashed overlay is
      // an explanatory centreline, not a discontinuous or thinner physical yarn.
      out.push(`<path d="${d}" stroke-width="${f(2*snapshot.coupon.threadRadiusMm*DIAGRAM.pixelsPerMm)}" opacity=".22" stroke-linecap="round"/>`);
      out.push(`<path d="${d}" stroke-width="2.4" stroke-dasharray="5 4" opacity=".95" stroke-linecap="butt"/>`);
    }
    run=[];
  };
  for(const s of segments.filter(s=>s.role==='bite')){
    if(s.hidden){if(!run.length)run.push(s.from);run.push(s.to);}else flush();
  }
  flush();out.push('</g>','<g fill="none" stroke-linecap="round">');
  const visible=segments.filter(s=>!s.hidden).map(s=>({
    ...s,depth:(projectPoint(snapshot,view,s.from).depthMm+projectPoint(snapshot,view,s.to).depthMm)/2,
  })).sort((a,b)=>a.depth-b.depth);
  for(const s of visible) {
    out.push(`<path data-role="${s.role}" d="${polyline(snapshot,view,[s.from,s.to])}" stroke="${COLORS[s.role]}" stroke-width="${f(2*s.radiusMm*DIAGRAM.pixelsPerMm)}"/>`);
  }
  out.push('</g>',arrow(snapshot,view,segments,'incoming'),arrow(snapshot,view,segments,'outgoing'),'</g>');
  const ports=[['1',snapshot.fixture.entry.positionMm,312],['2',snapshot.fixture.exit.positionMm,48]] as const;
  for(const [label,p,x] of ports) {
    const projected=projectPoint(snapshot,view,p);
    out.push(`<circle cx="${f(projected.x)}" cy="${f(projected.y)}" r="3.5" fill="#fffaf3" stroke="#26221d" stroke-width="1.4"/>`);
    out.push(callout(snapshot,view,p,label,x,projected.y+42,`data-port="${label}" data-world="${escape(JSON.stringify(p))}"`));
  }
  const crossingScreen=projectPoint(snapshot,view,crossing.outgoing);
  out.push(callout(snapshot,view,crossing.outgoing,'3',view==='normal'?312:48,crossingScreen.y,
    'data-crossing="outgoing-over-incoming"'));
  out.push(`<g font-family="sans-serif" font-size="18" fill="#51493f">
<path d="M38 376h${DIAGRAM.pixelsPerMm} M38 372v8 M${38+DIAGRAM.pixelsPerMm} 372v8" fill="none" stroke="#51493f" stroke-width="1.3"/>
<text x="108" y="382">1 мм в плоскости вида</text></g>`,
    '</svg>');
  return out.join('\n');
}

export function renderStitchBlock(snapshot: DiagramSnapshot) {
  const controls=snapshot.acceptance.resolutions.map(r=>r.controls).join(' / ');
  const curvature=(Math.ceil(snapshot.acceptance.resolutions.at(-1)!.curvatureUpper*1000)/1000).toFixed(3).replace('.',',');
  return `<section class="model-stitch-section" id="model-stitch-diagrams" aria-labelledby="model-stitch-heading">
  <h3 id="model-stitch-heading">Один подхват, два согласованных вида</h3>
  <p>Это один и тот же контрольный путь, а не две независимо нарисованные схемы.
    Первый вид смотрит по нормали к поверхности мари, второй повёрнут на ${DIAGRAM.obliqueDegrees}°.
    Масштаб проекции одинаков; место наблюдения не изменяет координаты нити.
    Показан крупный план подхвата: длинные ветви продолжаются за рамкой.</p>
  <label class="model-stitch-toggle"><input id="model-stitch-inside" type="checkbox" checked />
    Показать скрытый проход сквозь основу</label>
  <div class="model-stitch-pair">
    <figure><h4>По нормали к поверхности</h4>
${renderStitchSvg(snapshot,'normal')}
      <figcaption>Читаются стороны входа и выхода. В точке 3 красная уходящая ветвь проходит над охристой входящей.</figcaption>
    </figure>
    <figure><h4>Косой вид того же пути</h4>
${renderStitchSvg(snapshot,'oblique')}
      <figcaption>Те же точки 1, 2 и тот же перехлёст 3. Пунктир позволяет проследить заданный подхват внутри основы.</figcaption>
    </figure>
  </div>
  <ul class="model-stitch-legend">
    <li><span class="swatch incoming"></span>Охра: приход к точке 1.</li>
    <li><span class="swatch bite"></span>Синий: обратный ход 1 → 2; пунктир показывает ось скрытого участка.</li>
    <li><span class="swatch outgoing"></span>Бордо: уход от точки 2 поверх прихода в точке 3.</li>
    <li><span class="swatch marking"></span>Тёмный тонкий фрагмент: нить дзивари.</li>
  </ul>
  <p class="note">Три цвета обозначают участки <b>одной рабочей нити</b>, не три нити.
    Кольца 1/2 и выноски 1–3 являются обозначениями, не булавками.
    Светлая сетка показывает поверхность мари, не дополнительные нити разметки.
    Пунктирный проход задан моделью; его глубина не восстановлена по фотографии.</p>
  <details class="diagram-provenance">
    <summary>Из каких данных построено и что проверено</summary>
    <p>Изолированный нижний подхват C230: окружность ${snapshot.fixture.dimensions.circumferenceMm} мм,
      радиус рабочей нити ${snapshot.coupon.threadRadiusMm} мм,
      глубина ${snapshot.fixture.dimensions.depthMm} мм.
      Численная проверка: ${controls} контрольных точек, на всех уровнях путь принят;
      сертифицированная верхняя граница r·κ на последнем уровне ${curvature}.
      Размеры относятся к инженерному образцу, не к измеренной перле.</p>
    <p>Менялась только наружная уходящая ветвь. Приход и скрытый проход остаются заданными.
      Схемы являются ортографическими проекциями осевых линий с толщиной нити, а не фотографией,
      полным цветком S8/C8 или доказательством физического равновесия.</p>
    <p>Данные: <code>docs/fixtures/lower-kagari-diagram.json</code>.
      Геометрические исходники: <a href="https://github.com/newYurk/temari/commit/${snapshot.source.revision}">${snapshot.source.revision.slice(0,7)}</a>.
      Сборщик сверяет отпечаток всех зависимостей модели; устаревший снимок не проходит проверку.</p>
    <p><a href="./lab.html#spatial-catch">Рассмотреть подхват в лаборатории</a> ·
      <a href="#lower-chidori">Сверка маршрута с ремесленными источниками</a>.</p>
  </details>
</section>`;
}
