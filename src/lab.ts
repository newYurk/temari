import * as THREE from "three";
import { polePositions } from "./components/temari/division";
import { jiwariNormals } from "./components/temari/jiwari";
import { C8_ENGINEERING_FIXTURE } from "./components/temari/c8-engineering-coupon";
import { createC8UwagakeCoupon } from "./components/temari/c8-uwagake-coupon";
import { evaluateCurve, validateThreadCoupon } from "./components/temari/thread-geometry";
import { uniqueMarkingCircles, type MarkingVector } from "./components/temari/local-marking";
import type { C8ThreadCoupon, ThreadCurve, ThreadSpan } from "./components/temari/thread-path";
import "./lab.css";
import "./contact-benchmark";

const dot = (a: MarkingVector, b: MarkingVector) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: MarkingVector, b: MarkingVector): MarkingVector =>
  [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = (v: MarkingVector): MarkingVector => {
  const l=Math.hypot(...v); return [v[0]/l,v[1]/l,v[2]/l];
};
const vector = (p: MarkingVector) => new THREE.Vector3(...p);
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const text = (id: string, value: string) => { document.getElementById(id)!.textContent=value; };
const centerSelect = document.getElementById("center") as HTMLSelectElement;
const centers = polePositions("c8");
const circles = uniqueMarkingCircles(jiwariNormals("c8").map((normal,i)=>({id:`circle-${i}`,normal})));
centers.forEach((_,i)=>centerSelect.add(new Option(`Центр ${i+1} из 6`,String(i))));
const stage = document.getElementById("thread-view")!;
const svg = document.getElementById("sphere")!;
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0xece8e1,0);
renderer.domElement.setAttribute("aria-label","Объёмный путь одной рабочей нити на шаре C8");
stage.prepend(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera(-50,50,50,-50,.1,1000);
scene.add(new THREE.HemisphereLight(0xfffaf0,0xaaa094,2.3));
const light=new THREE.DirectionalLight(0xfff5de,2.2);
scene.add(light);
let model=new THREE.Group();
scene.add(model);
let coupon: C8ThreadCoupon;
let geometryKey="";
let center: MarkingVector, first: MarkingVector, frameY: MarkingVector;
let body: THREE.Mesh<THREE.SphereGeometry,THREE.MeshStandardMaterial>;
let guides: THREE.Group;
let threadMeshes: {span:ThreadSpan; mesh:THREE.Mesh}[]=[];
let diagnosticSpans = new Set<string>();
const toleranceMm=.005;
const diagnosticLabels: Record<string,string> = {
  "invalid-dimensions":"Некорректные размеры основы или нити.",
  "invalid-support":"Некорректная разметочная опора.",
  "invalid-span":"Некорректный участок рабочей нити.",
  "invalid-curve":"Не удалось построить заданную кривую.",
  "operation-graph":"Нарушен порядок действий или принадлежность участков нити.",
  "thread-discontinuity":"В рабочей нити обнаружен разрыв.",
  "tangent-discontinuity":"На стыке участков обнаружен резкий излом.",
  "curvature-radius":"Сгиб слишком тесный для заданной толщины нити.",
  "curvature-unresolved":"Максимальная кривизна пока не определена с нужной точностью.",
  "support-body-penetration":"Разметочная опора пересекает основу.",
  "support-body-unresolved":"Зазор между опорой и основой требует уточнения.",
  "missing-piercing-corridor":"Для прокола не задана допустимая область.",
  "body-zone-violation":"Участок нити выходит за пределы допустимой области.",
  "body-zone-unresolved":"Положение нити относительно основы требует уточнения.",
  "self-penetration":"Удалённые части рабочей нити пересекаются.",
  "support-penetration":"Обнаружено пересечение с разметочной опорой или между опорами.",
  "self-contact-unresolved":"Зазор между участками одной нити требует уточнения.",
  "support-contact-unresolved":"Касание разметочной опоры пока не разрешено расчётом.",
  "crossing-contract":"Для прохода над нитью или под ней задан некорректный участок.",
  "crossing-future-target":"Подхват ссылается на ещё не уложенный участок.",
  "crossing-missing":"Нить не пересекает заданный участок пучка в проекции на основу.",
  "crossing-unresolved":"Порядок прохода над нитью и под ней требует уточнения.",
  "crossing-wrong-side":"Нить проходит с неверной стороны прежнего участка.",
  "crossing-penetration":"Нити пересекаются объёмами в месте прохода.",
  "capture-contract":"Некорректно задан состав захватываемого пучка.",
  "capture-incomplete":"Для части пучка отсутствует проход сверху или снизу.",
  "capture-order":"Возврат под пучком происходит раньше подхода сверху.",
};

class YarnCurve extends THREE.Curve<THREE.Vector3> {
  constructor(readonly curve:ThreadCurve) { super(); }
  getPoint(t:number,target=new THREE.Vector3()) { return target.fromArray(evaluateCurve(this.curve,t)); }
}
function disposeModel() {
  model.traverse((object)=>{
    const mesh=object as THREE.Mesh;
    mesh.geometry?.dispose();
    if(mesh.material) (Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>m.dispose());
  });
  scene.remove(model);
  model=new THREE.Group(); scene.add(model);
}
function tube(curve:ThreadCurve,radius:number,color:number) {
  // The radius comes from the model. Camera and lighting do not alter its path or section.
  const geometry=new THREE.TubeGeometry(new YarnCurve(curve),96,radius,12,false);
  const material=new THREE.MeshStandardMaterial({color,roughness:.52,metalness:.04});
  return new THREE.Mesh(geometry,material);
}
function rebuild() {
  const key=[centerSelect.value,input("circumference").value,input("reverse").checked].join("/");
  if(key===geometryKey) return;
  geometryKey=key;
  center=centers[Number(centerSelect.value)];
  const firstCircle=circles.find(c=>Math.abs(dot(c.normal,center))<1e-10)!;
  first=unit(cross(firstCircle.normal,center));
  frameY=cross(center,first);
  coupon=createC8UwagakeCoupon({center,circles,firstRay:{circleId:firstCircle.id,tangent:first},
    handedness:input("reverse").checked?-1:1,...C8_ENGINEERING_FIXTURE,
    circumferenceMm:Number(input("circumference").value)});
  const result=validateThreadCoupon(coupon,toleranceMm);
  diagnosticSpans=new Set(result.diagnostics.flatMap(d=>d.spanIds));
  const status=document.getElementById("validation")!;
  status.dataset.status=result.status;
  text("validation",result.status==="passed" ? "Геометрические проверки пройдены" :
    result.status==="failed" ? "Путь не прошёл проверку" : "Точности проверки пока недостаточно");
  text("validation-detail",result.status==="passed" ?
    "Проверены непрерывность, положение относительно основы, зазоры и порядок прохода над прежними нитями и под ними. Натяжение не рассчитывается." :
    [...new Set(result.diagnostics.map(d=>diagnosticLabels[d.code]??"Численная проверка требует уточнения."))].join(" "));
  const number=(v:number)=>Number.isFinite(v)?v.toFixed(2):"—";
  text("length-total",`${number(result.lengthMm.total)} мм`);
  text("length-surface",`${number(result.lengthMm.surface)} мм`);
  text("length-piercing",`${number(result.lengthMm.piercing)} мм`);
  text("length-buried",`${number(result.lengthMm.buried)} мм`);
  text("thread-diameter",`${number(coupon.threadRadiusMm*2)} мм`);
  text("support-diameter",`${number(coupon.supports[0].radiusMm*2)} мм`);
  text("support-gap",`${number(result.minSupportGapMm)} мм`);
  text("self-gap",`${number(result.minSelfGapMm)} мм`);
  text("curvature",number(result.maxCurvatureTimesRadius));
  text("tolerance",`${toleranceMm} мм`);
  text("crossing-count",String(coupon.crossings?.length??0));
  disposeModel();
  const R=coupon.bodyRadiusMm;
  body=new THREE.Mesh(new THREE.SphereGeometry(R,96,64),new THREE.MeshStandardMaterial({
    color:0xe0d6c5,roughness:1,transparent:true,opacity:1}));
  model.add(body);
  guides=new THREE.Group(); model.add(guides);
  for(const circle of circles) {
    const axis:MarkingVector=Math.abs(circle.normal[0])<.8?[1,0,0]:[0,1,0];
    const a=unit(cross(circle.normal,axis)),b=cross(circle.normal,a);
    const pts=Array.from({length:361},(_,i)=>{
      const t=i*Math.PI/180;
      return new THREE.Vector3(...a.map((x,k)=>(x*Math.cos(t)+b[k]*Math.sin(t))*(R+.015)) as [number,number,number]);
    });
    guides.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({color:0xab9a7e,transparent:true,opacity:.4})));
  }
  for(const support of coupon.supports) model.add(tube(support.curve,support.radiusMm,0x84623f));
  threadMeshes=coupon.spans.map(span=>{
    const color=diagnosticSpans.has(span.id)?0xbd601b:span.zone==="surface"?(span.step<=8?0xa87432:0x963e44):0x31688f;
    const mesh=tube(span.curve,coupon.threadRadiusMm,color);
    mesh.userData.baseColor=color;
    model.add(mesh); return {span,mesh};
  });
  stage.dataset.threadId=coupon.threadId;
  stage.dataset.spanCount=String(coupon.spans.length);
}
function render() {
  rebuild();
  const R=coupon.bodyRadiusMm,step=Number(input("step").value);
  const totalSteps=Math.max(...coupon.spans.map(span=>span.step));
  const capture=coupon.captures?.find(c=>coupon.operations.find(op=>op.id===c.opId)?.step===step);
  const targets=new Set(capture?.targets.map(t=>t.id));
  const inside=input("inside").checked;
  const turn=Number(input("turn").value)*Math.PI/180,tilt=Number(input("tilt").value)*Math.PI/180;
  const view=vector(frameY).multiplyScalar(Math.sin(tilt))
    .addScaledVector(vector(center),Math.cos(turn)*Math.cos(tilt))
    .addScaledVector(vector(first),-Math.sin(turn)*Math.cos(tilt));
  const up=vector(frameY).multiplyScalar(Math.cos(tilt))
    .addScaledVector(vector(center),-Math.cos(turn)*Math.sin(tilt))
    .addScaledVector(vector(first),Math.sin(turn)*Math.sin(tilt));
  const zoom=Number(input("zoom").value);
  const mark=coupon.marks[step%8];
  const target=zoom>1?vector(mark.positionMm):new THREE.Vector3();
  camera.position.copy(target).addScaledVector(view,R*4);
  camera.up.copy(up); camera.lookAt(target);
  const half=R*300/256/zoom;
  camera.left=-half;camera.right=half;camera.top=half;camera.bottom=-half;
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
  light.position.copy(camera.position).addScaledVector(up,R);
  body.material.opacity=inside?.12:1;
  body.material.depthWrite=!inside;
  guides.visible=!inside;
  threadMeshes.forEach(({span,mesh})=>{
    mesh.visible=step>0&&span.step<=step;
    const material=mesh.material as THREE.MeshStandardMaterial;
    material.color.setHex(input("targets").checked&&targets.has(span.id)?0xc49420:mesh.userData.baseColor);
  });
  stage.dataset.visibleSpans=String(threadMeshes.filter(m=>m.mesh.visible).length);
  stage.dataset.inside=String(inside);
  stage.dataset.captureId=capture?.id??"";
  stage.dataset.captureTargets=String(capture?.targets.length??0);
  const size=stage.clientWidth;
  renderer.setSize(size,size,false);
  renderer.render(scene,camera);
  svg.innerHTML="";
  if(input("marks").checked) coupon.marks.forEach((m,i)=>{
    const p=vector(m.positionMm);
    if(!inside && p.dot(view)<0) return;
    p.project(camera);
    if(Math.abs(p.x)>1.1||Math.abs(p.y)>1.1) return;
    const x=300+300*p.x,y=300-300*p.y;
    const el=document.createElementNS("http://www.w3.org/2000/svg","text");
    const attrs={x,y:y-10,fill:"#423a30","font-size":14,"text-anchor":"middle",stroke:"#f6efe2",
      "stroke-width":3,"paint-order":"stroke"};
    Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));
    el.textContent=String(i+1);svg.appendChild(el);
  });
  svg.setAttribute("data-center",centerSelect.value);svg.setAttribute("data-step",String(step));
  text("circumference-value",`${Number(input("circumference").value)/10} см`);
  text("step-value",`${step} / ${totalSteps}`);text("zoom-value",`${zoom}×`);
  input("step").max=String(totalSteps);
  text("progress",step===0?"Только направляющие и восемь разметочных опор":
    `Круг ${Math.ceil(step/8)} · стежок ${((step-1)%8)+1} из 8 · ${(step-1)%8+1} → ${step%8+1}`);
  text("step-note",step===0?"Нажмите «Следующий стежок», чтобы начать нить.":step===8?
    "Первый круг переходит во второй: нить захватывает уже уложенное начало.":step===totalSteps?
    "Два круга завершены одной нитью. Конец уходит внутрь отдельно от начала.":
    `Подхват у метки ${(step%8)+1}. Прозрачная основа позволяет увидеть путь снизу.`);
  const previousTargets=capture?.targets.filter(t=>coupon.spans.some(s=>s.id===t.id)).length??0;
  text("capture-note",previousTargets>0?
    `Ранее уложенных участков в захвате: ${previousTargets}. Рабочая нить проходит над ними, затем возвращается под ними и разметкой.`:
    "Здесь небольшой подхват разметки. Расширенный захват прежнего ряда виден у внутренних меток.");
  (document.getElementById("next") as HTMLButtonElement).disabled=step===totalSteps;
}
let pending=false;
function scheduleRender() { if(!pending) {pending=true;requestAnimationFrame(()=>{pending=false;render();});} }
document.querySelectorAll(".workbench input,.workbench select").forEach(el=>el.addEventListener("input",scheduleRender));
document.getElementById("next")!.addEventListener("click",()=>{input("step").value=String(Math.min(Number(input("step").max),Number(input("step").value)+1));render();});
document.getElementById("restart")!.addEventListener("click",()=>{input("step").value="0";render();});
document.getElementById("first-round")!.addEventListener("click",()=>{input("step").value="8";render();});
document.getElementById("second-catch")!.addEventListener("click",()=>{
  input("step").value="10";input("zoom").value="5";input("turn").value="25";
  input("tilt").value="20";input("inside").checked=true;render();
});
document.getElementById("front")!.addEventListener("click",()=>{input("turn").value="0";input("tilt").value="0";input("zoom").value="1";render();});
document.getElementById("side")!.addEventListener("click",()=>{input("turn").value="65";input("tilt").value="15";render();});
document.getElementById("closeup")!.addEventListener("click",()=>{
  input("zoom").value="5";input("turn").value="25";input("tilt").value="20";
  input("inside").checked=true;render();
});
let drag:{id:number;x:number;y:number;turn:number;tilt:number}|null=null;
renderer.domElement.addEventListener("pointerdown",e=>{
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,turn:Number(input("turn").value),tilt:Number(input("tilt").value)};
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointermove",e=>{
  if(!drag||drag.id!==e.pointerId)return;
  input("turn").value=String(Math.max(-180,Math.min(180,drag.turn+(e.clientX-drag.x)*.4)));
  input("tilt").value=String(Math.max(-85,Math.min(85,drag.tilt+(e.clientY-drag.y)*.4)));
  scheduleRender();
});
renderer.domElement.addEventListener("pointerup",()=>{drag=null;});
renderer.domElement.addEventListener("pointercancel",()=>{drag=null;});
new ResizeObserver(scheduleRender).observe(stage);
window.addEventListener("pagehide",()=>{disposeModel();renderer.dispose();});
render();
