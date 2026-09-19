import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateThreadCoupon } from '../src/components/temari/thread-geometry.ts';
import { boundCurvatureTimesRadius } from '../src/components/temari/curvature-bound.ts';
import { assertDiagramSnapshot, type DiagramSnapshot } from './lib/stitch-diagram-data.ts';
import { renderStitchBlock } from './lib/stitch-diagram-renderer.ts';

const root=resolve(import.meta.dirname,'..');
const write=process.argv.includes('--write'),check=process.argv.includes('--check');
if(write===check)throw new Error('Choose --write or --check');
const snapshot:DiagramSnapshot=JSON.parse(await readFile(join(root,'docs/fixtures/lower-kagari-diagram.json'),'utf8'));
assertDiagramSnapshot(snapshot,root);
const validation=validateThreadCoupon(snapshot.coupon,.001);
const curvature=boundCurvatureTimesRadius(snapshot.coupon.spans.map(s=>s.curve),snapshot.coupon.threadRadiusMm);
if(validation.status!=='passed'||curvature.status!=='certified'||curvature.upper>=1){
  throw new Error('Stored control path no longer passes independent geometric checks.');
}
const path=join(root,'public/design.html'),source=await readFile(path,'utf8');
const start='<!-- model-stitch-diagrams:start -->',end='<!-- model-stitch-diagrams:end -->';
if(source.split(start).length!==2||source.split(end).length!==2)throw new Error('Expected one generated diagram block.');
const from=source.indexOf(start)+start.length,to=source.indexOf(end);
const updated=source.slice(0,from)+'\n'+renderStitchBlock(snapshot)+'\n      '+source.slice(to);
if(write)await writeFile(path,updated);
else if(updated!==source)throw new Error('Stitch diagrams are stale: run scripts/build-stitch-diagrams.mts --write, then sync-design.mjs --write.');
console.log(JSON.stringify({views:2,status:snapshot.status,sourceDigest:snapshot.source.digest,
  pathValidation:validation.status,curvatureUpper:curvature.upper,mode:write?'written':'matches'}));
