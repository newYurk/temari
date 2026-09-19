import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertDiagramSnapshot, modelSource, type DiagramSnapshot,
} from '../../../scripts/lib/stitch-diagram-data.ts';
import {
  DIAGRAM, diagramCamera, diagramSegments, diagramCrossing, projectPoint,
  renderStitchSvg, renderStitchBlock,
} from '../../../scripts/lib/stitch-diagram-renderer.ts';
import { createLowerKagariFixture } from './lower-kagari.ts';
import { evaluateCurve, validateThreadCoupon } from './thread-geometry.ts';
import { boundCurvatureTimesRadius } from './curvature-bound.ts';
import type { PointMm } from './thread-path.ts';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const snapshot:DiagramSnapshot=JSON.parse(readFileSync(new URL('../../../docs/fixtures/lower-kagari-diagram.json',import.meta.url),'utf8'));
const near=(a:number,b:number,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const dot=(a:PointMm,b:PointMm)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const pointNear=(a:PointMm,b:PointMm)=>a.forEach((x,i)=>near(x,b[i]));
const segments=diagramSegments(snapshot);

describe('model-derived stitch illustrations',()=>{
  it('uses an accepted canonical snapshot with a current model dependency fingerprint',()=>{
    assert.doesNotThrow(()=>assertDiagramSnapshot(snapshot,root));
    assert.equal(modelSource(root).digest,snapshot.source.digest);
    assert.deepEqual(snapshot.acceptance.resolutions.map(r=>r.controls),[41,60,79]);
    assert.equal(snapshot.source.files.length>1,true);
  });

  it('rejects diagnostic, stale and invalid numerical evidence',()=>{
    const diagnostic=structuredClone(snapshot);
    diagnostic.status='unresolved' as 'accepted';
    assert.throws(()=>assertDiagramSnapshot(diagnostic),/accepted/);
    const stale=structuredClone(snapshot);stale.source.digest='stale';
    assert.throws(()=>assertDiagramSnapshot(stale,root),/Model sources changed/);
    const invalid=structuredClone(snapshot);invalid.acceptance.metrics.maxShapeDifferenceMm=NaN;
    assert.throws(()=>assertDiagramSnapshot(invalid),/Invalid numerical/);
    const unsettled=structuredClone(snapshot);unsettled.acceptance.resolutions[0].settleMoveMm=1;
    assert.throws(()=>assertDiagramSnapshot(unsettled),/not accepted/);
  });

  it('retains the actual fixed fixture, engineering dimensions and one continuous thread',()=>{
    const fixture=createLowerKagariFixture();
    assert.deepEqual(snapshot.fixture.dimensions,fixture.dimensions);
    assert.deepEqual(snapshot.fixture.frame,fixture.frame);
    assert.deepEqual(snapshot.fixture.entry,fixture.entry);
    assert.deepEqual(snapshot.fixture.exit,fixture.exit);
    assert.deepEqual(snapshot.coupon.spans.filter(s=>s.opId!=='lower-outgoing'),
      fixture.coupon.spans.filter(s=>s.opId!=='lower-outgoing'));
    assert.deepEqual([...new Set(snapshot.coupon.spans.map(s=>s.threadId))],['lower-thread']);
    assert.ok(snapshot.coupon.spans.some(s=>s.id.startsWith('lower-computed-')));
    for(let i=1;i<snapshot.coupon.spans.length;i++){
      pointNear(evaluateCurve(snapshot.coupon.spans[i-1].curve,1),evaluateCurve(snapshot.coupon.spans[i].curve,0));
    }
  });

  it('independently validates the saved path and its certified bend bound',()=>{
    assert.equal(validateThreadCoupon(snapshot.coupon,.001).status,'passed');
    const bound=boundCurvatureTimesRadius(snapshot.coupon.spans.map(s=>s.curve),snapshot.coupon.threadRadiusMm);
    assert.equal(bound.status,'certified');
    assert.ok(bound.upper<1);
    near(bound.upper,snapshot.acceptance.resolutions.at(-1)!.curvatureUpper);
  });

  it('samples the original curves rather than drawing independent screen paths',()=>{
    const curves=new Map([
      ...snapshot.coupon.spans.map(s=>[s.id,s.curve] as const),
      ...snapshot.coupon.supports.map(s=>[s.id,s.curve] as const),
    ]);
    for(const s of segments){
      const curve=curves.get(s.spanId)!;
      assert.ok(curve);
      pointNear(s.from,evaluateCurve(curve,s.t0));
      pointNear(s.to,evaluateCurve(curve,s.t1));
      if(s.hidden){
        assert.equal(s.role,'bite');
        assert.ok(Math.hypot(...evaluateCurve(curve,(s.t0+s.t1)/2))<snapshot.coupon.bodyRadiusMm);
      }
    }
    assert.ok(segments.some(s=>s.hidden));
    assert.ok(segments.some(s=>s.role==='bite'&&!s.hidden));
  });

  it('uses orthonormal cameras with the same scale and exactly recoverable world points',()=>{
    for(const view of ['normal','oblique'] as const){
      const c=diagramCamera(snapshot,view);
      for(const axis of [c.right,c.down,c.eye])near(dot(axis,axis),1);
      near(dot(c.right,c.down),0);near(dot(c.eye,c.down),0);near(dot(c.eye,c.right),0);
      for(const p of [snapshot.fixture.entry.positionMm,snapshot.fixture.exit.positionMm,...segments.slice(0,15).map(s=>s.from)]){
        const projected=projectPoint(snapshot,view,p);
        const x=(projected.x-DIAGRAM.centerX)/DIAGRAM.pixelsPerMm;
        const y=(projected.y-DIAGRAM.centerY)/DIAGRAM.pixelsPerMm;
        const recovered=c.origin.map((v,i)=>v+c.right[i]*x+c.down[i]*y+c.eye[i]*projected.depthMm) as unknown as PointMm;
        pointNear(recovered,p);
      }
    }
  });

  it('derives one outgoing-over-incoming crossing from the control path',()=>{
    const crossing=diagramCrossing(snapshot,segments);
    assert.ok(crossing.radialGapMm>=2*snapshot.coupon.threadRadiusMm-.001);
    const a=projectPoint(snapshot,'normal',crossing.incoming);
    const b=projectPoint(snapshot,'normal',crossing.outgoing);
    near(a.x,b.x);near(a.y,b.y);
    assert.ok(b.depthMm>a.depthMm);
  });

  it('places identical world ports and geometry identifiers in both views',()=>{
    const normal=renderStitchSvg(snapshot,'normal'),oblique=renderStitchSvg(snapshot,'oblique');
    const digest=(s:string)=>s.match(/data-geometry-digest="([^"]+)"/)![1];
    assert.equal(digest(normal),digest(oblique));
    for(const svg of [normal,oblique]){
      assert.match(svg,/diagram-hidden-path/);
      assert.match(svg,/data-crossing="outgoing-over-incoming"/);
      assert.match(svg,/data-direction="incoming"/);
      assert.match(svg,/data-direction="outgoing"/);
      assert.match(svg,/<clipPath/);
      for(const arrow of svg.matchAll(/<polygon data-direction="[^"]+" points="([^"]+)"/g)){
        for(const pair of arrow[1].split(' ')){
          const [x,y]=pair.split(',').map(Number);
          assert.ok(x>=16&&x<=344&&y>=18&&y<=352,`direction arrow outside detail: ${pair}`);
        }
      }
      for(const [id,port] of [['1',snapshot.fixture.entry],['2',snapshot.fixture.exit]] as const){
        assert.ok(svg.includes(`data-port="${id}" data-world="${JSON.stringify(port.positionMm)}"`));
      }
      assert.doesNotMatch(svg,/\bNaN\b|\bInfinity\b/);
    }
  });

  it('never changes model coordinates while making the two illustrations',()=>{
    const before=JSON.stringify(snapshot);
    renderStitchBlock(snapshot);
    assert.equal(JSON.stringify(snapshot),before);
  });

  it('keeps the visible documentation block synchronized and bounded in its claims',()=>{
    const doc=readFileSync(new URL('../../../public/design.html',import.meta.url),'utf8');
    const block=doc.split('<!-- model-stitch-diagrams:start -->')[1].split('<!-- model-stitch-diagrams:end -->')[0].trim();
    assert.equal(block,renderStitchBlock(snapshot));
    assert.equal((block.match(/class="model-stitch-svg"/g)||[]).length,2);
    assert.match(block,/одной рабочей нити/);
    assert.match(block,/не восстановлена по фотографии/);
    assert.match(block,/не фотографией|не фотография|а не фотографией/);
    assert.match(block,/id="model-stitch-inside"/);
    assert.match(block,/длинные ветви продолжаются за рамкой/);
    assert.match(doc,/:has\(#model-stitch-inside:not\(:checked\)\)/);
  });
});
