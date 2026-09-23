import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildS8KikuLevel, planS8Kiku, S8_KIKU_DIMENSIONS, S8_KIKU_LADDER, type S8KikuLevel } from './s8-kiku';
import { shapeDifferenceMm } from './thick-rope-ladder';
import type { ThreadCurve, PointMm } from './thread-path';

const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: PointMm) => Math.hypot(...a);
const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

// Split from s8-kiku.test.ts: each slow solve in its own file, so the test
// runner puts them on separate cores.
describe('Simple 8 control kiku: solved windows (quarter turn)', () => {
  it('solves the upper-tip departure covariantly under a quarter turn about the pole', () => {
    // The worst-conditioned window: the departure rides over its own approach
    // right behind the upper tip. Settled solves are fixed points, so the
    // stitch started at tip 2 is the stitch started at tip 0 turned by 90 degrees.
    const turn = ([x, y, z]: PointMm): PointMm => [z, y, -x];
    const a = planS8Kiku({ stage: 'stitch' }), b = planS8Kiku({ stage: 'stitch', startTip: 2 });
    assert.ok(norm(sub(turn(a.tips[0].markMm), a.tips[2].markMm)) < 1e-9);
    // x3: the discrete minimum there is unique (x2 has two KKT points).
    const factor = S8_KIKU_LADDER[3];
    const la = buildS8KikuLevel(a, factor), lb = buildS8KikuLevel(b, factor);
    const solved = (level: S8KikuLevel, id: string) => level.solves.find(s => s.windowId === id)!;
    const da = solved(la, 'departure-2'), db = solved(lb, 'departure-4');
    for (const s of [da, db]) {
      assert.equal(s.result.status, 'converged');
      assert.ok(s.settleMoveMm <= S8_KIKU_DIMENSIONS.settleToleranceMm, String(s.settleMoveMm));
    }
    const turned = da.result.curves.map((c): ThreadCurve => c.kind === 'arc'
      ? { ...c, from: turn(c.from), to: turn(c.to) }
      : { ...c, controls: c.controls.map(turn) as unknown as typeof c.controls });
    const shape = shapeDifferenceMm(turned, db.result.curves);
    // Without the restarts the two solves stop 8e-5 mm apart with the canonical
    // stopping test and exact tubes (1.5e-2 mm with the former looser test and
    // capsules); settled ones agree to 2e-8.
    assert.ok(shape <= S8_KIKU_DIMENSIONS.settleToleranceMm / 4, `quarter-turn shape difference ${shape}`);
    near(da.result.lengthMm, db.result.lengthMm, S8_KIKU_DIMENSIONS.lengthToleranceMm / 4);
  });
});
