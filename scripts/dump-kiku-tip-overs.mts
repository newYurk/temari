/**
 * Named over/under table for one north-pole petal's inner tips.
 * Metadata from compileKiku — not what the studio tubes currently sit as.
 */
import { compileKiku } from '../src/components/temari/patterns.ts';
import { traceKagariOperations } from '../src/components/temari/kagari-topology.ts';
import { KIKU_8_POINT } from '../src/components/temari/kagari.ts';

const rounds = Number(process.argv.find(a => a.startsWith('--rounds='))?.slice(9) ?? 3);
const ops = compileKiku('simple', 'out', 'even', 0, 0, rounds, 0);
const traces = traceKagariOperations(ops, KIKU_8_POINT.id);
const inners = ops
  .map((op, i) => ({ op, tr: traces[i]! }))
  .filter(({ op }) => op.mark.t === 'inner' && op.set === 0 && op.pole === 0);

// Group by approximate tip latitude (kai)
const rows = inners.map(({ op, tr }) => ({
  operationId: tr.operationId,
  kai: op.kai,
  over: tr.overOperations,
  overCount: op.over.length,
  previous: tr.previousInThread,
}));
console.log(JSON.stringify({
  fixture: { division: 'simple', pole: 0, set: 0, rounds, tip: 'inner' },
  note: 'Recipe overOperations for stacked uwagake. Studio sitA/sitB still 0/1; annotateSetCrossings skips same-set. Not a mesh clearance certificate.',
  tips: rows,
}, null, 2));
