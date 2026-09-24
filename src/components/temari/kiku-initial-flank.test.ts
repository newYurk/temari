import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { compileKiku, stitchesFromOps } from './patterns.ts';
import type { KagariOp } from './kagari.ts';

const compile = (pole: number, rows: number, set: 0 | 1 | 'all' = 'all', count?: number) =>
  compileKiku('simple', 'out', 'even', pole, 2, rows, set, count);
const initial = (ops: KagariOp[], set: 0 | 1) => ops.find(op => op.set === set)!;
const withoutVia = ({ lay, ...op }: KagariOp) => ({ ...op, lay: { from: lay.from, to: lay.to } });
const trace = (ops: KagariOp[], index: number) => {
  const stitch = stitchesFromOps(ops)[index]!;
  assert.equal(stitch.kind, 'arc');
  return stitch.kind === 'arc' ? stitch.operation : undefined;
};

describe('the already laid initial kiku flank participates at its matching seam catch', () => {
  for (const pole of [0, 1]) for (const rows of [1, 2, 3, 10]) {
    it(`applies the same lateral constraint to initial and ordinary first-row flanks: pole ${pole}, ${rows} rows`, () => {
      const ops = compile(pole, rows);
      for (const set of [0, 1] as const) {
        const first = initial(ops, set), separate = initial(compile(pole, rows, set), set);
        assert.deepEqual(first.lay.via, separate.lay.via, 'interleaving A/B must not invent or lose a captured initial branch');
        if (rows === 1) assert.equal(first.lay.via, undefined, 'no later catch has happened');
        else assert.ok(first.lay.via?.length, 'the initial first-row flank must not escape all later gathers');
        for (const quarter of [1, 2, 3]) {
          const other = ops.find(op => op.kai === 0 && op.set === set && op.mark.t === 'outer'
            && op.mark.line === (first.mark.line + 2 * quarter) % 8)!;
          const expected = first.lay.via ?? [], actual = other.lay.via ?? [];
          assert.equal(actual.length, expected.length);
          const axis = new Vector3(0, pole === 0 ? 1 : -1, 0);
          expected.forEach((point, i) => {
            const turned = new Vector3(...point).applyAxisAngle(axis, quarter * Math.PI / 2);
            assert.ok(turned.distanceTo(new Vector3(...actual[i]!)) < 1e-10,
              `constraint shape, not a physical capture certificate: sample ${i}`);
          });
        }
      }
    });
  }

  for (const pole of [0, 1]) for (const set of [0, 1] as const) {
    it(`changes the initial flank only when its own later seam catch executes: pole ${pole}, set ${set}`, () => {
      const all = compile(pole, 3);
      const seam = all.find(op => op.kai === 1 && op.set === set && op.mark.t === 'inner' && op.mark.line === set)!;
      const before = compile(pole, 10, 'all', seam.i), after = compile(pole, 10, 'all', seam.i + 1);
      const firstBefore = initial(before, set), firstAfter = initial(after, set);
      assert.equal(firstBefore.lay.via, undefined, 'neighbouring catches must not reshape the seam branch early');
      assert.ok(firstAfter.lay.via?.length, 'the matching seam catch has now executed');
      assert.deepEqual(withoutVia(firstAfter), withoutVia(firstBefore), 'ports and start identity are fixed');
      assert.deepEqual(trace(after, firstAfter.i), trace(before, firstBefore.i));
      const otherSet = (1 - set) as 0 | 1;
      assert.deepEqual(initial(after, otherSet), initial(before, otherSet), 'another working thread is untouched');
      for (const op of before.filter(op => op.set === set && op.kai === 0 && op.mark.t === 'outer' && op !== firstBefore)) {
        assert.deepEqual(after[op.i], op, 'a seam catch must not reapply a neighbouring tip constraint');
      }
      assert.deepEqual(after, compile(pole, 2, 'all', seam.i + 1), 'scheduled future rows have no effect');

      const oneSetSeam = compile(pole, 3, set).find(op => op.kai === 1 && op.mark.t === 'inner' && op.mark.line === set)!;
      assert.equal(initial(compile(pole, 10, set, oneSetSeam.i), set).lay.via, undefined);
      assert.deepEqual(initial(compile(pole, 10, set, oneSetSeam.i + 1), set).lay.via, firstAfter.lay.via);

      const closure = after[seam.over[0]!]!;
      const continuation = after.find(op => op.i > closure.i && op.set === set)!;
      assert.equal(continuation.kai, 1, 'actual next in the open thread is still the next row');
      assert.ok(continuation.resume, 'park/resume is not replaced by a fictitious closed loop');
      assert.equal(trace(after, continuation.i)?.previousInThread, trace(after, closure.i)?.operationId);
      assert.notDeepEqual(continuation.lay.via, before[continuation.i]!.lay.via,
        'the already executed true continuation still receives its existing constraint');
    });
  }

  it('keeps ports, endpoints and traces at starts, closures and continuations unchanged from creation', () => {
    for (const pole of [0, 1]) {
      const complete = compile(pole, 10);
      // Include both starts, closures and row continuations at all requested extents.
      const counts = [1, 8, 9, 16, 17, 24, 25, 32, 33, 40, 41, 48, 145, 152, 153, 160];
      for (const count of counts) {
        const prefix = compile(pole, 10, 'all', count), op = prefix.at(-1)!;
        assert.deepEqual(withoutVia(complete[op.i]!), withoutVia(op));
        assert.deepEqual(trace(complete, op.i), trace(prefix, op.i));
      }
    }
  });
});
