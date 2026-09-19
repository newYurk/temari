import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildS8KikuLevel, combineS8Rounds, judgeS8Kiku, planS8Kiku, S8_KIKU_DIMENSIONS, S8_KIKU_LADDER, type S8KikuLevel, type S8KikuResult } from './s8-kiku';
import { shapeDifferenceMm } from './thick-rope-ladder';
import { evaluateCurve } from './thread-geometry';
import type { ThreadCurve } from './thread-path';
import type { PointMm } from './thread-path';

const dot = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: PointMm) => Math.hypot(...a);
const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

describe('Simple 8 control kiku: plan (no solves)', () => {
  it('places GT14 marks on the actual Simple 8 rays and alternates upper and lower tips', () => {
    const plan = planS8Kiku();
    const R = 230 / (2 * Math.PI);
    assert.equal(plan.tips.length, 8);
    for (const tip of plan.tips) {
      const expected = tip.index % 2 ? 230 / 4 * 2 / 3 : 5;
      assert.equal(tip.role, tip.index % 2 ? 'lower' : 'upper');
      near(tip.distanceMm, expected);
      // Great-circle distance from the pole.
      near(R * Math.acos(dot(tip.frame.radial, [0, 1, 0])), expected, 1e-9);
      near(norm(tip.markMm), R, 1e-9);
    }
  });

  it('uses the same needle rule at both tips for both working directions', () => {
    for (const handedness of [1, -1] as const) {
      const plan = planS8Kiku({ handedness });
      for (const tip of plan.tips) {
        const q = tip.frame.progress;
        // Enter on +q, leave on -q, where +q points to the next ray in working order.
        assert.ok(dot(sub(tip.entry, tip.markMm), q) > .55 && dot(sub(tip.exit, tip.markMm), q) < -.55);
        const next = plan.tips[(tip.index + 1) % 8];
        assert.ok(dot(sub(next.markMm, tip.markMm), q) > 0);
        const previous = plan.tips[(tip.index + 7) % 8];
        assert.ok(dot(sub(previous.markMm, tip.markMm), q) < 0);
        // Working direction follows the local rays, not a world axis.
        near(dot(q, tip.frame.radial), 0, 1e-12); near(dot(q, tip.frame.outward), 0, 1e-12);
      }
    }
  });

  it('keeps the prescribed bites inside the bend limit and enters the wrapping at the ports', () => {
    const plan = planS8Kiku({ stage: 'round' });
    const limit = S8_KIKU_DIMENSIONS.threadRadiusMm / S8_KIKU_DIMENSIONS.minBendRadiusMm;
    assert.equal(plan.hiddenCurvature.status, 'certified');
    assert.ok(plan.hiddenCurvature.upper <= limit, String(plan.hiddenCurvature.upper));
    const R = plan.R;
    for (const c of plan.catches) {
      const [a, b] = plan.bite(c), f = plan.tips[c.tip];
      // The centre line reaches the ball surface close to the declared port, not a millimetre later.
      const w = plan.bites.find(x => x.tip === c.tip && x.row === c.row)!;
      assert.ok(w.entryHalfWidthMm > .55 && w.entryHalfWidthMm < .8, JSON.stringify(w));
      assert.ok(w.exitHalfWidthMm > .55 && w.exitHalfWidthMm < .8, JSON.stringify(w));
      // One passage under the marking plane, from +q to -q, through the bottom point.
      assert.ok(dot(evaluateCurve(a, 0), f.frame.progress) > 0 && dot(evaluateCurve(b, 1), f.frame.progress) < 0);
      near(norm(evaluateCurve(a, 1)), R - S8_KIKU_DIMENSIONS.depthMm, 1e-9);
    }
  });

  it('builds disjoint physical marking segments and windows on the legs between ports', () => {
    for (const stage of ['stitch', 'round'] as const) {
      const plan = planS8Kiku({ stage });
      assert.equal(plan.supports.length, 8);
      assert.deepEqual(plan.windows.map(w => w.id), stage === 'stitch'
        ? ['departure-0', 'approach-1', 'departure-1', 'approach-2', 'departure-2']
        : ['departure-0', ...[1, 2, 3, 4, 5, 6, 7].flatMap(t => [`approach-${t}`, `departure-${t}`]), 'closing-0']);
      for (const w of plan.windows) {
        assert.equal(w.minimumSpans, Math.ceil(w.seedLengthMm / S8_KIKU_DIMENSIONS.minBendRadiusMm));
        assert.ok(Math.ceil(w.minimumSpans * S8_KIKU_LADDER.at(-1)!) + 3 <= 256);
      }
      assert.deepEqual(plan.factors, [...S8_KIKU_LADDER]);
      assert.equal(plan.canonical, true);
    }
  });

  it('plans the second uwagake row: wider upper stitches, lower stitches farther out, rows in order', () => {
    const plan = planS8Kiku({ stage: 'row2' }), d = S8_KIKU_DIMENSIONS, round = [1, 2, 3, 4, 5, 6, 7];
    assert.deepEqual(plan.catches, [...round.map(tip => ({ tip, row: 0 })), { tip: 0, row: 1 }, ...round.map(tip => ({ tip, row: 1 }))]);
    assert.deepEqual(plan.openEnd, { tip: 0, row: 2 });
    assert.deepEqual(plan.windows.map(w => w.id), ['departure-0', ...round.flatMap(t => [`approach-${t}`, `departure-${t}`]), 'closing-0',
      'departure-0-r2', ...round.flatMap(t => [`approach-${t}-r2`, `departure-${t}-r2`]), 'closing-0-r2']);
    assert.deepEqual(plan.windows.map(w => w.row), [...Array(15).fill(0), ...Array(16).fill(1), 2]);
    // Each window belongs to the round in which it is laid: closing-0 finishes round 1, closing-0-r2 round 2.
    assert.deepEqual(plan.windows.map(w => w.round), [...Array(16).fill(0), ...Array(16).fill(1)]);
    // The first round is unchanged by the second one.
    const round1 = planS8Kiku({ stage: 'round' });
    round1.windows.forEach((w, i) => assert.deepEqual(plan.windows[i].seed, w.seed));
    const R = plan.R, geodesic = (a: PointMm, b: PointMm) => R * Math.atan2(norm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]), dot(a, b));
    for (const c of plan.catches.filter(x => x.row === 1)) {
      const upper = plan.tips[c.tip].role === 'upper', w = plan.bites.find(x => x.tip === c.tip && x.row === 1)!;
      // Upper: one thread width lower and wide enough for the bundle; lower: farther out along the same ray.
      // The frame offsets in the tangent plane at the mark: arc length R atan(advance / R).
      near(geodesic(plan.markOf(c), plan.tips[c.tip].markMm), R * Math.atan((upper ? d.rowAdvanceMm : d.lowerRowAdvanceMm) / R), 1e-9);
      const [lo, hi] = upper ? [.95, 1.25] : [.55, .8];
      assert.ok(w.entryHalfWidthMm > lo && w.entryHalfWidthMm < hi && w.exitHalfWidthMm > lo && w.exitHalfWidthMm < hi, JSON.stringify(w));
      // The hidden passages of the two rows at one tip keep a full thread diameter apart
      // (the start tip has no first-round stitch: the thread starts there).
      if (c.tip === plan.startTip) continue;
      const samples = (curves: ReturnType<typeof plan.bite>) => curves.flatMap(curve => Array.from({ length: 101 }, (_, i) => evaluateCurve(curve, i / 100)));
      const a = samples(plan.bite({ tip: c.tip, row: 0 })), b = samples(plan.bite(c));
      const gap = Math.min(...a.flatMap(p => b.map(q => norm(sub(p, q)))));
      assert.ok(gap > 2 * d.threadRadiusMm, `tip ${c.tip}: ${gap}`);
    }
    assert.equal(plan.hiddenCurvature.status, 'certified');
    assert.ok(plan.hiddenCurvature.upper <= d.threadRadiusMm / d.minBendRadiusMm);
    assert.throws(() => planS8Kiku({ stage: 'row2', lowerRowAdvanceMm: .4 }), RangeError);
  });

  it('builds congruent plans from every upper start tip (a quarter turn about the pole)', () => {
    // Rodrigues rotation by +90 degrees about the pole, independent of the plan's frames.
    const turn = ([x, y, z]: PointMm): PointMm => [z, y, -x];
    const a = planS8Kiku({ stage: 'stitch' }), b = planS8Kiku({ stage: 'stitch', startTip: 2 });
    assert.deepEqual(b.windows.map(w => w.id), ['departure-2', 'approach-3', 'departure-3', 'approach-4', 'departure-4']);
    const rayTurn = norm(sub(turn(a.tips[0].markMm), a.tips[2].markMm)) < 1e-9 ? turn : ([x, y, z]: PointMm): PointMm => [-z, y, x];
    for (let i = 0; i < a.windows.length; i++) {
      const wa = a.windows[i], wb = b.windows[i];
      near(wa.seedLengthMm, wb.seedLengthMm, 1e-9);
      wa.seed.forEach((c, k) => {
        const other = wb.seed[k];
        for (const t of [0, .3, 1]) assert.ok(norm(sub(rayTurn(evaluateCurve(c, t)), evaluateCurve(other, t))) < 1e-9, `${wa.id} ${k} ${t}`);
      });
    }
    for (const catchA of a.catches) a.bite(catchA).forEach((c, k) => {
      const other = b.bite({ tip: (catchA.tip + 2) % 8, row: catchA.row })[k];
      for (const t of [0, .5, 1]) assert.ok(norm(sub(rayTurn(evaluateCurve(c, t)), evaluateCurve(other, t))) < 1e-9);
    });
    assert.throws(() => planS8Kiku({ startTip: 1 }), RangeError);
  });

  it('refuses ladders that cannot show refinement and flags non-canonical ones', () => {
    assert.throws(() => planS8Kiku({ factors: [1.2, 1.201, 1.3] }), RangeError);
    assert.throws(() => planS8Kiku({ factors: [1.5, 4] }), RangeError);
    assert.throws(() => planS8Kiku({ factors: [1, 1.5, 2, 3, 4, 6, 8] }), RangeError);
    assert.equal(planS8Kiku({ factors: [1, 2, 4] }).canonical, false);
    assert.throws(() => planS8Kiku({ minBendRadiusMm: .2 }), RangeError);
    assert.throws(() => planS8Kiku({ rowAdvanceMm: .4 }), RangeError);
    assert.throws(() => planS8Kiku({ center: [1, 0, 0] }), RangeError);
  });

  it('never accepts a non-canonical ladder or a non-contracting refinement', () => {
    const plan = planS8Kiku({ factors: [1, 2, 4] });
    // Synthetic levels: identical perfect constructions with chosen window differences.
    const curve = plan.windows[0].seed;
    const level = (factor: number, shift: number): S8KikuLevel => ({
      factor, samplesPerSpan: 4, reusedRounds: 0, coupon: {} as S8KikuLevel['coupon'], diagnostics: [], undeclaredCrossings: [],
      validation: { status: 'passed', diagnostics: [], toleranceMm: .001, lengthMm: { total: 0, surface: 0, piercing: 0, buried: 0 }, maxCurvatureTimesRadius: 0, minSupportGapMm: 1, minSelfGapMm: 1 },
      curvature: { status: 'certified', lower: .5, upper: .5, minSpeedBound: 1, argmax: { curve: 0, t: 0 }, witnesses: [], leaves: 1 },
      hiddenCurvature: plan.hiddenCurvature, lengthMm: 1,
      solves: plan.windows.map(w => ({ windowId: w.id, controlCount: Math.ceil(w.minimumSpans * factor) + 3, obstacles: 0, restarts: 1, settleMoveMm: 0,
        result: { status: 'converged' as const, controlPointsMm: [], lengthMm: 10 + shift * .01, reactions: [], diagnostics: [],
          metrics: {} as never, curves: curve.map(c => c.kind === 'arc' ? c : { kind: 'bezier' as const, controls: c.controls.map(p => [p[0] + shift, p[1], p[2]] as PointMm) as never }) } })),
    });
    const converging = judgeS8Kiku(plan, [level(1, 0), level(2, .01), level(4, .0101)], level(4, .0101));
    assert.notEqual(converging.status, 'accepted');
    assert.ok(converging.diagnostics.some(d => d.includes('Non-canonical')));
    const canonical = planS8Kiku();
    // Last two refinements 0.015 then 0.014 mm: within tolerance but not contracting.
    const levels = [0, .04, .07, .085, .099].map((shift, i) => ({ ...level(S8_KIKU_LADDER[i], shift), factor: S8_KIKU_LADDER[i] }));
    const judged = judgeS8Kiku(canonical, levels as S8KikuLevel[], levels[4] as S8KikuLevel);
    assert.equal(judged.status, 'unresolved');
    assert.ok(judged.diagnostics.some(d => d.includes('do not contract')), judged.diagnostics.join('\n'));
    // Contracting to below a quarter of the tolerance is accepted by the rule.
    const good = [0, .04, .07, .08, .0801].map((shift, i) => ({ ...level(S8_KIKU_LADDER[i], shift), factor: S8_KIKU_LADDER[i] })) as S8KikuLevel[];
    const accepted = judgeS8Kiku(canonical, good, good[4]);
    assert.ok(!accepted.diagnostics.some(d => d.includes('stabilised') || d.includes('contract')), accepted.diagnostics.join('\n'));
    // Only the selected windows are judged for refinement; the levels are still checked whole.
    const onlyFirst = judgeS8Kiku(canonical, levels as S8KikuLevel[], levels[4] as S8KikuLevel, w => w.id === 'departure-0');
    assert.deepEqual([...new Set(onlyFirst.refinements.map(r => r.windowId))], ['departure-0']);
    assert.ok(onlyFirst.diagnostics.every(d => !d.includes('contract') || d.startsWith('departure-0:')), onlyFirst.diagnostics.join('\n'));
    const none = judgeS8Kiku(canonical, levels as S8KikuLevel[], levels[4] as S8KikuLevel, () => false);
    assert.equal(none.refinements.length, 0);
    assert.equal(none.status, 'accepted');
    // ...but a level that fails as a complete thread still fails, whatever the selection.
    const broken = { ...levels[2], validation: { ...levels[2].validation, status: 'failed' as const, diagnostics: [{ code: 'self-penetration', message: 'x' }] } } as S8KikuLevel;
    assert.equal(judgeS8Kiku(canonical, [levels[0], levels[1], broken, levels[3], levels[4]] as S8KikuLevel[], levels[4] as S8KikuLevel, () => false).status, 'rejected');
    // A failed solve is reported unless the window was reused from an earlier round (reported there).
    const failing = (reusedRounds: number) => ({ ...levels[4], reusedRounds, solves: levels[4].solves.map((s, i) => i ? s
      : { ...s, result: { ...s.result, status: 'failed' as const } }) }) as S8KikuLevel;
    assert.equal(judgeS8Kiku(canonical, levels as S8KikuLevel[], failing(0), () => false).status, 'rejected');
    assert.equal(judgeS8Kiku(canonical, levels as S8KikuLevel[], failing(1), () => false).status, 'accepted');
    const crossing = { ...levels[4], undeclaredCrossings: ['crossing a / b'] } as S8KikuLevel;
    assert.equal(judgeS8Kiku(canonical, levels as S8KikuLevel[], crossing, () => false).status, 'rejected');
    // Changed tolerances or solver settings are diagnostic only, even on the canonical ladder.
    for (const input of [{ lengthToleranceMm: .01 }, { maxSettleRestarts: 2 }, { solverOptions: { samplesPerSpan: 2 } }]) {
      const plan2 = planS8Kiku(input);
      assert.equal(plan2.canonical, true);
      const judged2 = judgeS8Kiku(plan2, good, good[4]);
      assert.notEqual(judged2.status, 'accepted');
      assert.ok(judged2.diagnostics.some(d => d.includes('diagnostic only')), judged2.diagnostics.join('\n'));
    }
    assert.deepEqual(planS8Kiku({ circumferenceMm: 180, handedness: -1 }).overridden, []);
  });
});

describe('Simple 8 control kiku: two rounds', () => {
  it('accepts two rounds only when both are accepted and reports both', () => {
    const result = (status: S8KikuResult['status'], id: string, length: number, diagnostics: string[] = []) => ({
      status, diagnostics, refinements: [{ windowId: id, from: 1, to: 2, lengthDifferenceMm: length, shapeDifferenceMm: length }],
      conditioning: [{ windowId: id, from: 2, to: 2, lengthDifferenceMm: 0, shapeDifferenceMm: 0 }],
      metrics: { lengthDifferenceMm: length, maxShapeDifferenceMm: 2 * length, curvatureLimit: .8 }, levels: [], coupon: {} }) as unknown as S8KikuResult;
    const statuses = ['accepted', 'unresolved', 'rejected'] as const;
    for (const a of statuses) for (const b of statuses) for (const [la, lb] of [[1e-3, 2e-3], [3e-3, 2e-3]]) {
      const lastResult = result(b, 'departure-0-r2', lb, b === 'accepted' ? [] : ['last']);
      const combined = combineS8Rounds(result(a, 'departure-0', la, a === 'accepted' ? [] : ['first']), lastResult);
      const expected = a === 'rejected' || b === 'rejected' ? 'rejected' : a === 'accepted' && b === 'accepted' ? 'accepted' : 'unresolved';
      assert.equal(combined.status, expected, `${a} + ${b}`);
      assert.deepEqual(combined.refinements.map(r => r.windowId), ['departure-0', 'departure-0-r2']);
      assert.deepEqual(combined.conditioning.map(r => r.windowId), ['departure-0', 'departure-0-r2']);
      assert.equal(combined.metrics.lengthDifferenceMm, Math.max(la, lb));
      assert.equal(combined.metrics.maxShapeDifferenceMm, 2 * Math.max(la, lb));
      assert.equal(combined.levels, lastResult.levels);
      assert.equal(combined.coupon, lastResult.coupon);
      assert.equal(combined.earlierRounds!.length, 1);
      if (a !== 'accepted') assert.ok(combined.diagnostics.includes('Round 1: first'));
      if (b !== 'accepted') assert.ok(combined.diagnostics.includes('Round 2 (complete thread): last'));
    }
  });

  it('builds the earlier round against the same marking in both stages', () => {
    const round = planS8Kiku({ stage: 'round' }), row2 = planS8Kiku({ stage: 'row2' });
    assert.deepEqual(row2.supports, round.supports);
    assert.throws(() => planS8Kiku({ stage: 'row2', lowerRowAdvanceMm: 13 }), /beyond the window reach/);
    planS8Kiku({ stage: 'row2', lowerRowAdvanceMm: 12 });
    // Material past the pole's horizon is refused before any solve.
    assert.throws(() => planS8Kiku({ stage: 'round', outerFractionOfQuarter: .78 }), /horizon/);
  });
});

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
