import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildS8KikuLevel, planS8Kiku } from './s8-kiku';

// Split from s8-kiku.test.ts: each slow solve in its own file, so the test
// runner puts them on separate cores (about 71 s and 47 s one after the other).
describe('Simple 8 control kiku: solved windows', () => {
  it('refines only the last round on the finest construction of the earlier one', () => {
    // Rule 1 for later rounds, at the cheapest level: round 1 is taken whole from its
    // own construction; round 2 is solved over it and the complete thread is checked.
    const first = buildS8KikuLevel(planS8Kiku({ stage: 'round' }), 1);
    const plan = planS8Kiku({ stage: 'row2' });
    const level = buildS8KikuLevel(plan, 1, 4, first);
    assert.equal(level.reusedRounds, 1);
    for (const w of plan.windows) {
      const s = level.solves.find(x => x.windowId === w.id)!;
      if (w.round === 0) assert.equal(s, first.solves.find(x => x.windowId === w.id), `${w.id} is reused as is`);
      else assert.equal(s.result.status, 'converged', w.id);
    }
    assert.equal(level.validation.status, 'passed', JSON.stringify(level.validation.diagnostics.slice(0, 3)));
    assert.deepEqual(level.undeclaredCrossings, []);
    // Round-2 upper stitches are taken under the first round's windows at that tip, and the validator agrees.
    const ids = level.coupon.crossings!.map(c => c.id);
    for (const tip of [2, 4, 6]) {
      assert.ok(ids.includes(`bite-${tip}-r2-under-approach-${tip}`) && ids.includes(`bite-${tip}-r2-under-departure-${tip}`), ids.filter(x => x.startsWith(`bite-${tip}-r2`)).join(' '));
    }
    assert.ok(ids.includes('bite-0-r2-under-departure-0'), ids.filter(x => x.startsWith('bite-0-r2')).join(' '));
    assert.ok(!ids.some(x => /^bite-[1357]-r2-under-(?!jiwari)/.test(x)), 'lower stitches of round 2 are 3 mm away from round 1');
    assert.ok(level.curvature.status === 'certified' && level.curvature.upper < 1);
    // The earlier round's spans are the very curves of its construction.
    const firstSpans = first.coupon.spans.filter(s => s.zone === 'surface').map(s => s.curve);
    assert.deepEqual(level.coupon.spans.filter(s => s.zone === 'surface').slice(0, firstSpans.length).map(s => s.curve), firstSpans);
    assert.throws(() => buildS8KikuLevel(plan, 1, 4, { ...first, solves: first.solves.slice(1) }), RangeError);
  });
});
