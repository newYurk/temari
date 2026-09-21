/**
 * s8-kiku-ab2.test.ts — структурные тесты второго прохода A2/B2.
 *
 * Эти тесты проверяют контракт модуля без запуска решателя:
 * - отдельные пространства ID,
 * - правильный сдвиг порядка операций,
 * - геометрическую независимость от первого прохода,
 * - корректный отказ при нарушении инвариантов.
 *
 * Численная приёмка (решатель, снимок) — отдельный шаг.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planS8Kiku } from './s8-kiku';
import { nameS8Thread, planS8AB } from './s8-kiku-ab';
import {
  planS8AB2,
  nameS8Thread2,
  checkS8AB2,
  judgeS8AB2,
} from './s8-kiku-ab2';
import type { C8ThreadCoupon, PointMm } from './thread-path';

const line = (id: string, from: PointMm, to: PointMm, order = 1): C8ThreadCoupon => ({
  kind: 'engineering-thread-path', bodyRadiusMm: 1, threadId: id, threadRadiusMm: 0.2,
  spans: [{
    id: `${id}:span`, threadId: id, opId: `${id}:lay`, step: 1, zone: 'surface',
    curve: {
      kind: 'bezier',
      controls: [
        from,
        from.map((v, i) => v + (to[i] - v) / 3) as unknown as PointMm,
        from.map((v, i) => v + 2 * (to[i] - v) / 3) as unknown as PointMm,
        to,
      ],
    },
  }],
  supports: [], marks: [], fixture: {}, assumptions: [],
  operations: [{ id: `${id}:lay`, order, step: 1, kind: 'lay', spanIds: [`${id}:span`] }],
});

describe('S8 second pass (A2/B2)', () => {
  it('planS8AB2 is cumulative row2 staging, not yet a continuation-only plan', () => {
    const ab1 = planS8AB(), ab2 = planS8AB2();
    const a2 = planS8Kiku({ stage: 'row2' });
    const b2 = planS8Kiku({ stage: 'row2', phase: 1 });
    assert.deepEqual(ab2.A2.windows, a2.windows);
    assert.deepEqual(ab2.B2.windows, b2.windows);
    assert.notDeepEqual(ab2.A2.windows, ab1.A.windows, 'row2 shifts ports off A1');
    assert.notDeepEqual(ab2.B2.windows, ab1.B.windows, 'row2 shifts ports off B1');
    for (const [first, second] of [[ab1.A, ab2.A2], [ab1.B, ab2.B2]]) {
      assert.equal(second.rows, 2);
      assert.deepEqual(second.windows.filter(w => w.round === 0), first.windows,
        'staging retains the entire first-round seed; this is not a solved second pass');
    }
  });

  it('nameS8Thread2 assigns A2:/B2: prefixes and does not mutate the source', () => {
    const src = line('raw', [-1, 3, 0], [1, 3, 0]);
    const before = structuredClone(src);

    const a2 = nameS8Thread2(src, 'A2', 10);
    assert.deepEqual(src, before);                         // исходник не мутирован
    assert.equal(a2.threadId, 'A2:s8-kiku-thread');
    assert.ok(a2.spans[0].id.startsWith('A2:'));
    assert.ok(a2.spans[0].threadId === a2.threadId);
    assert.equal(a2.operations[0].order, 11);              // 1 + offset 10
    assert.deepEqual(a2.spans[0].curve, src.spans[0].curve); // геометрия не тронута

    const b2 = nameS8Thread2(src, 'B2', 20);
    assert.ok(b2.spans[0].id.startsWith('B2:'));
    assert.equal(b2.operations[0].order, 21);
    // A2 и B2 не имеют общих span ID.
    assert.notEqual(a2.spans[0].id, b2.spans[0].id);
  });

  it('A2/B2 operation orders do not overlap A1/B1 orders', () => {
    // Offsets are applied by nameS8Thread / nameS8Thread2, not by the planner.
    const A1 = nameS8Thread(line('a1', [-1, 3, 0], [1, 3, 0]), 'A');
    const B1 = nameS8Thread(line('b1', [0, 3.5, -1], [0, 3.5, 1]), 'B', A1.operations.length);
    const a1Max = Math.max(...A1.operations.map(o => o.order));
    const b1Max = Math.max(...B1.operations.map(o => o.order));
    const a2Offset = A1.operations.length + B1.operations.length;
    const A2 = nameS8Thread2(line('a2', [-1, 4, 0], [1, 4, 0]), 'A2', a2Offset);
    const a2Min = Math.min(...A2.operations.map(o => o.order));
    assert.ok(a2Min > b1Max, 'A2 orders must start after B1 orders');
    assert.ok(a2Min > a1Max, 'A2 orders must start after A1 orders');
  });

  it('checkS8AB2 throws on duplicate thread IDs', () => {
    const a = line('A', [-1, 3, 0], [1, 3, 0]);
    const b = line('B', [0, 3.5, -1], [0, 3.5, 1]);
    const a2 = nameS8Thread2(line('raw', [-1, 3.4, 0.1], [1, 3.4, 0.1]), 'A2', 4);
    assert.throws(() => checkS8AB2(a, a, a2, a2), RangeError, 'duplicate IDs must throw');
  });

  it('checkS8AB2 throws on span ID collision', () => {
    const threads = ['A', 'B', 'A2', 'B2'].map((id, i) =>
      line(id, [-1, 3 + i, 0], [1, 3 + i, 0], i));
    threads[2].spans[0].id = threads[0].spans[0].id;
    assert.throws(() => checkS8AB2(threads[0], threads[1], threads[2], threads[3]),
      /span IDs must be globally unique/);
  });

  it('checkS8AB2 refuses missing or ambiguous operation chronology before geometry checks', () => {
    const fixture = () => ['A', 'B', 'A2', 'B2'].map((id, i) =>
      line(id, [-1, 3 + i, 0], [1, 3 + i, 0], i));
    for (const order of [1, -1, NaN, Infinity]) {
      const [a1, b1, a2, b2] = fixture();
      a2.operations[0].order = order;
      assert.throws(() => checkS8AB2(a1, b1, a2, b2), /strictly increasing operation order/);
    }
    const [a1, b1, a2, b2] = fixture();
    a2.operations[0].id = b1.operations[0].id;
    assert.throws(() => checkS8AB2(a1, b1, a2, b2), /operation IDs must be globally unique/);
    a2.operations = [];
    assert.throws(() => checkS8AB2(a1, b1, a2, b2), /operations for every pass/);
  });

  it('checkS8AB2 returns unresolved (not failed) before crossing count is known', () => {
    // Четыре отдельные непересекающиеся нити — зазоры пройдут, но
    // crossingCountUnknown = true, поэтому статус unresolved, не passed.
    const a1 = { ...line('A1x', [-1, 3, 0], [1, 3, 0]), threadId: 'A:s8-kiku-thread' };
    const b1 = { ...line('B1x', [0, 3.5, -1], [0, 3.5, 1], 2), threadId: 'B:s8-kiku-thread' };
    const a2 = { ...line('A2x', [-1, 4, 0.5], [1, 4, 0.5]), threadId: 'A2:s8-kiku-thread',
      spans: [{
        ...line('A2x', [-1, 4, 0.5], [1, 4, 0.5]).spans[0],
        id: 'A2:span', threadId: 'A2:s8-kiku-thread', opId: 'A2:lay',
      }],
      operations: [{ id: 'A2:lay', order: 5, step: 1, kind: 'lay' as const, spanIds: ['A2:span'] }],
    };
    const b2 = { ...line('B2x', [0, 4.5, -1], [0, 4.5, 1]), threadId: 'B2:s8-kiku-thread',
      spans: [{
        ...line('B2x', [0, 4.5, -1], [0, 4.5, 1]).spans[0],
        id: 'B2:span', threadId: 'B2:s8-kiku-thread', opId: 'B2:lay',
      }],
      operations: [{ id: 'B2:lay', order: 6, step: 1, kind: 'lay' as const, spanIds: ['B2:span'] }],
    };
    const result = checkS8AB2(a1, b1, a2, b2);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.crossingCountUnknown, true);
  });

  it('checkS8AB2 fails on inter-thread penetration', () => {
    // a1 и a2 пересекаются — зазор failed.
    const a1 = { ...line('A1p', [-1, 3, 0], [1, 3, 0]), threadId: 'A:s8-kiku-thread' };
    const b1 = { ...line('B1p', [0, 3.5, -1], [0, 3.5, 1], 2), threadId: 'B:s8-kiku-thread' };
    // a2 проходит сквозь a1 (радиусы 0.2 + 0.2 = 0.4, центры в 0.1 друг от друга).
    const a2 = { ...line('A2p', [-1, 3.1, 0], [1, 3.1, 0]), threadId: 'A2:s8-kiku-thread',
      spans: [{
        ...line('A2p', [-1, 3.1, 0], [1, 3.1, 0]).spans[0],
        id: 'A2:span-p', threadId: 'A2:s8-kiku-thread', opId: 'A2:lay-p',
      }],
      operations: [{ id: 'A2:lay-p', order: 5, step: 1, kind: 'lay' as const, spanIds: ['A2:span-p'] }],
    };
    const b2 = { ...line('B2p', [0, 5, -1], [0, 5, 1]), threadId: 'B2:s8-kiku-thread',
      spans: [{
        ...line('B2p', [0, 5, -1], [0, 5, 1]).spans[0],
        id: 'B2:span-p', threadId: 'B2:s8-kiku-thread', opId: 'B2:lay-p',
      }],
      operations: [{ id: 'B2:lay-p', order: 6, step: 1, kind: 'lay' as const, spanIds: ['B2:span-p'] }],
    };
    const result = checkS8AB2(a1, b1, a2, b2);
    assert.equal(result.status, 'failed');
    assert.equal(result.clearances.a2_vs_a1.status, 'failed');
  });

  it('judgeS8AB2 throws if ab2Checks length does not match b2.levels + 1', () => {
    const stub = (status: 'accepted' | 'rejected' | 'unresolved' = 'unresolved') => ({
      ...planS8Kiku({ stage: 'round' }),
      status,
      levels: [{}, {}, {}, {}, {}],
    } as ReturnType<typeof planS8Kiku> & { status: typeof status; levels: object[] });
    const a1 = stub(), b1 = stub(), a2 = stub(), b2 = stub();
    assert.throws(
      () => judgeS8AB2(a1 as any, b1 as any, a2 as any, b2 as any, 'unresolved', []),
      RangeError,
    );
  });

  it('judgeS8AB2 returns rejected if any single-thread result is rejected', () => {
    const stub = (status: 'accepted' | 'rejected' | 'unresolved') => ({
      ...planS8Kiku({ stage: 'round' }),
      status,
      levels: [{}, {}, {}, {}, {}],
    } as ReturnType<typeof planS8Kiku> & { status: typeof status; levels: object[] });
    const b2 = stub('accepted');
    const fakeChecks = Array.from({ length: b2.levels.length + 1 },
      () => ({ status: 'passed' as const, clearances: {} as any,
        crossings: [], diagnostics: [], surfaceCrossings: 0, crossingCountUnknown: false }));
    assert.equal(
      judgeS8AB2(stub('rejected') as any, stub('accepted') as any, stub('accepted') as any, b2 as any, 'accepted', fakeChecks),
      'rejected',
    );
  });
});
