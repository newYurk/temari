import { Vector3 } from 'three';
import { compileKiku, stitchesFromOps } from '../../../src/components/temari/patterns.ts';
import { pileParts } from '../../../src/components/temari/stitches.ts';
const R = 240 / (2*Math.PI), records=[];
for (const p of pileParts(stitchesFromOps(compileKiku('simple','out','even',0,0,3,'all')),'pearl5')) {
 for (const f of p.fixedPorts??[]) {
  const from=p.pts[f.approachIndex],r0=from.length(),height=r0-1,n0=from.clone().normalize(),n1=f.point.clone().normalize();
  const direction=from.clone().sub(p.pts[f.approachIndex+(f.side==='end'?-1:1)]).normalize(),s=direction.dot(n0);
  const handle=Math.min(from.distanceTo(f.point),s<0?3*height/-s:Infinity);
  const q1=n0.clone().addScaledVector(direction.clone().addScaledVector(n0,-s),handle/(3*r0));
  const rc=[r0,Math.max(1,r0+s*handle/3),1+height/3,1];
  let max=0,at=0,minSpeed=Infinity;
  for(let j=0;j<=1000;j++) {
   const t=j/1000,u=1-t;
   const r=rc[0]*u**3+3*rc[1]*u*u*t+3*rc[2]*u*t*t+rc[3]*t**3;
   const rd=3*((rc[1]-rc[0])*u*u+2*(rc[2]-rc[1])*u*t+(rc[3]-rc[2])*t*t);
   const rdd=6*((rc[2]-2*rc[1]+rc[0])*u+(rc[3]-2*rc[2]+rc[1])*t);
   const q=n0.clone().multiplyScalar(u**3).addScaledVector(q1,3*u*u*t).addScaledVector(n1,3*u*t*t+t**3);
   const qd=q1.clone().sub(n0).multiplyScalar(3*u*u).addScaledVector(n1.clone().sub(q1),6*u*t);
   const qdd=n1.clone().addScaledVector(q1,-2).add(n0).multiplyScalar(6*u).addScaledVector(q1.clone().sub(n1),6*t);
   const L=q.length(),n=q.clone().divideScalar(L),Ld=n.dot(qd);
   const nd=qd.clone().addScaledVector(n,-Ld).divideScalar(L);
   const Ldd=nd.dot(qd)+n.dot(qdd);
   const ndd=qdd.clone().addScaledVector(n,-Ldd).addScaledVector(nd,-2*Ld).divideScalar(L);
   const pd=n.clone().multiplyScalar(rd).addScaledVector(nd,r);
   const pdd=n.clone().multiplyScalar(rdd).addScaledVector(nd,2*rd).addScaledVector(ndd,r);
   const speed=pd.length(), k=pd.clone().cross(pdd).length()/speed**3;
   const ratio=.1775/R*k;
   minSpeed=Math.min(minSpeed,speed);
   if(ratio>max){max=ratio;at=t;}
  }
  records.push({part:p.at.operation.operationId,owner:f.operationId,side:f.side,maxMinimumSectionCurvatureRatio:max,at,minSpeed});
 }
}
if (!records.length) throw new Error("Apply the rejected-short-approach.patch in a disposable checkout of fe572dd first; this is an experiment witness, not a current-model check.");
console.log(JSON.stringify({total:records.length,inadmissible:records.filter(r=>r.maxMinimumSectionCurvatureRatio>=1).length,max:Math.max(...records.map(r=>r.maxMinimumSectionCurvatureRatio)),reference:records.filter(r=>r.owner.endsWith('s0/r2/inner-2')),records},null,2));
