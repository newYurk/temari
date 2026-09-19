/**
 * s8-kiku-ab2.ts — второй проход двух рабочих нитей S8 (A2/B2).
 *
 * Структурно параллелен s8-kiku-ab.ts. A2 строится поверх принятых A1+B1;
 * B2 строится поверх принятых A1+B1+A2. Порядки операций не пересекаются
 * с первым проходом.
 *
 * Числовой расчёт (решатель, снимок) выполняется отдельно генератором
 * compute-s8-ab.mts после ремесленной приёмки A1/B1 человеком.
 */
import {
  planS8Kiku,
  projectedCrossings,
  type S8KikuLevel,
  type S8KikuResult,
} from './s8-kiku';
import {
  nameS8Thread,
  interThreadClearance,
  checkS8AB,
  judgeS8AB,
  type ABGroup,
} from './s8-kiku-ab';
import { validateThreadCrossings } from './thread-crossings';
import type { C8ThreadCoupon, ThreadCrossing, ThreadSpan } from './thread-path';

export type ABGroup2 = 'A2' | 'B2';

/**
 * Планировщик второго прохода — возвращает планы со stage:'row2', что
 * смещает порты на rowAdvanceMm (верхний) и lowerRowAdvanceMm (нижний)
 * относительно первого прохода. Реальные препятствия A1+B1 добавляются
 * в генераторе при запуске решателя.
 */
export const planS8AB2 = () => ({
  A2: planS8Kiku({ stage: 'row2' }),           // фаза 0, порты смещены vs A1
  B2: planS8Kiku({ stage: 'row2', phase: 1 }), // фаза 1, порты смещены vs B1
});

/**
 * Присваивает нити второго прохода отдельное пространство ID.
 * group: 'A2' или 'B2'; orderOffset сдвигает порядок операций за B1.
 */
export function nameS8Thread2(
  c: C8ThreadCoupon,
  group: ABGroup2,
  orderOffset = 0,
): C8ThreadCoupon {
  const prefix = (s: string) => `${group}:${s}`;
  return {
    ...c,
    threadId: `${group}:s8-kiku-thread`,
    spans: c.spans.map(s => ({
      ...s,
      id: prefix(s.id),
      opId: prefix(s.opId),
      threadId: `${group}:s8-kiku-thread`,
    })),
    supports: c.supports.map(s => ({ ...s, id: prefix(s.id) })),
    marks: c.marks.map(m => ({ ...m, id: prefix(m.id) })),
    operations: c.operations.map(o => ({
      ...o,
      id: prefix(o.id),
      order: o.order + orderOffset,
      spanIds: o.spanIds.map(prefix),
      ...(o.markId ? { markId: prefix(o.markId) } : {}),
      ...(o.captureIds ? { captureIds: o.captureIds.map(prefix) } : {}),
    })),
    crossings: c.crossings?.map(x => ({
      ...x,
      id: prefix(x.id),
      opId: prefix(x.opId),
      working: x.working.map(w => ({ ...w, spanId: prefix(w.spanId) })),
      target: { ...x.target, id: prefix(x.target.id) },
      ...(x.targetChain
        ? { targetChain: x.targetChain.map(w => ({ ...w, spanId: prefix(w.spanId) })) }
        : {}),
    })),
  };
}

export interface S8AB2Check {
  status: 'passed' | 'unresolved' | 'failed';
  clearances: {
    a2_vs_a1: ReturnType<typeof interThreadClearance>;
    a2_vs_b1: ReturnType<typeof interThreadClearance>;
    b2_vs_a1: ReturnType<typeof interThreadClearance>;
    b2_vs_b1: ReturnType<typeof interThreadClearance>;
    b2_vs_a2: ReturnType<typeof interThreadClearance>;
  };
  crossings: ThreadCrossing[];
  diagnostics: ReturnType<typeof validateThreadCrossings>;
  surfaceCrossings: number;
  /** Ожидаемое число наружных пересечений не зафиксировано до первого
   *  принятого расчёта A2/B2; проверка возвращает unresolved, а не failed. */
  crossingCountUnknown: boolean;
}

/**
 * Проверяет второй проход поверх принятого первого.
 * a1/b1 — нити первого прохода с префиксами A:/B:.
 * a2/b2 — нити второго прохода с префиксами A2:/B2:.
 */
export function checkS8AB2(
  a1: C8ThreadCoupon,
  b1: C8ThreadCoupon,
  a2: C8ThreadCoupon,
  b2: C8ThreadCoupon,
): S8AB2Check {
  // Все четыре нити должны иметь разные ID и одинаковые тела/сечения.
  const threads = [a1, b1, a2, b2];
  const ids = threads.map(t => t.threadId);
  if (new Set(ids).size !== 4)
    throw new RangeError('AB2 requires four distinct thread IDs.');
  const [r0] = threads.map(t => t.threadRadiusMm);
  if (!threads.every(t => t.bodyRadiusMm === a1.bodyRadiusMm && t.threadRadiusMm === r0))
    throw new RangeError('AB2 requires the same body and thread section for all four threads.');

  // Уникальность span IDs.
  const allSpans = threads.flatMap(t => t.spans);
  if (new Set(allSpans.map(s => s.id)).size !== allSpans.length)
    throw new RangeError('AB2 span IDs must be globally unique.');

  // Межнитевые зазоры.
  const clearances = {
    a2_vs_a1: interThreadClearance(a2, a1),
    a2_vs_b1: interThreadClearance(a2, b1),
    b2_vs_a1: interThreadClearance(b2, a1),
    b2_vs_b1: interThreadClearance(b2, b1),
    b2_vs_a2: interThreadClearance(b2, a2),
  };

  // Проекция пересечений по всем четырём нитям.
  const carrier: C8ThreadCoupon = {
    ...a1,
    spans: allSpans,
    operations: threads.flatMap(t => t.operations),
    supports: [],
    crossings: [],
  };
  const byId = new Map(allSpans.map(s => [s.id, s]));
  const chains = new Map(
    carrier.operations.map(o => [o.id, o.spanIds.map(spanId => ({ spanId, t0: 0, t1: 1 }))]),
  );

  // Пересечения второго прохода поверх первого: B1 поверх A1 (уже
  // проверено в checkS8AB), плюс A2 поверх {A1,B1}, B2 поверх {A1,B1,A2}.
  const secondPassIds = new Set([a2.threadId, b2.threadId]);
  const firstPassIds  = new Set([a1.threadId, b1.threadId]);

  const pairs = new Map<string, [ThreadSpan, ThreadSpan]>();
  for (const pair of projectedCrossings(carrier, [0, 1, 0], 0.001, true)) {
    const x = byId.get(pair.a)!;
    const y = byId.get(pair.b)!;
    if (x.threadId === y.threadId) continue;
    // Включаем только пары, где хотя бы одна нить — второй проход.
    if (!secondPassIds.has(x.threadId) && !secondPassIds.has(y.threadId)) continue;
    // Более поздняя нить (выше по порядку укладки) лежит поверх.
    const xOrder = carrier.operations.find(o => o.spanIds.includes(x.id))?.order ?? 0;
    const yOrder = carrier.operations.find(o => o.spanIds.includes(y.id))?.order ?? 0;
    const [later, earlier] = xOrder >= yOrder ? [x, y] : [y, x];
    pairs.set(`${later.opId}/${earlier.opId}`, [later, earlier]);
  }

  const crossings: ThreadCrossing[] = [...pairs].map(([key, [later, earlier]]) => {
    const targetChain = chains.get(earlier.opId)!;
    return {
      id: `AB2:${key}`,
      opId: later.opId,
      working: chains.get(later.opId)!,
      target: { id: targetChain[0].spanId, t0: 0, t1: 1 },
      targetChain,
      pass: later.zone === 'surface' ? 'over' : 'under',
    };
  });
  carrier.crossings = crossings;

  const diagnostics = validateThreadCrossings(carrier, 0.001);
  const surfaceCrossings = crossings.filter(c => c.pass === 'over').length;

  // Число наружных пересечений не зафиксировано до первого расчёта;
  // пока не добавляем жёсткую проверку. crossingCountUnknown = true.
  const crossingCountUnknown = true;

  const anyFailed =
    Object.values(clearances).some(c => c.status === 'failed') ||
    diagnostics.some(d => d.severity === 'error');
  const anyUnresolved =
    Object.values(clearances).some(c => c.status === 'unresolved') ||
    diagnostics.length > 0 ||
    crossingCountUnknown;

  return {
    status: anyFailed ? 'failed' : anyUnresolved ? 'unresolved' : 'passed',
    clearances,
    crossings,
    diagnostics,
    surfaceCrossings,
    crossingCountUnknown,
  };
}

/** Уровень-обёртка: именует нити второго прохода и проверяет их. */
export function checkS8AB2Level(
  a1Level: S8KikuLevel,
  b1Level: S8KikuLevel,
  a2Level: S8KikuLevel,
  b2Level: S8KikuLevel,
  a1OpCount: number,
  b1OpCount: number,
  a2OpCount: number,
) {
  const A1 = nameS8Thread(a1Level.coupon, 'A' as ABGroup);
  const B1 = nameS8Thread(b1Level.coupon, 'B' as ABGroup, A1.operations.length);
  const A2 = nameS8Thread2(a2Level.coupon, 'A2', a1OpCount + b1OpCount);
  const B2 = nameS8Thread2(b2Level.coupon, 'B2', a1OpCount + b1OpCount + a2OpCount);
  return { A1, B1, A2, B2, check: checkS8AB2(A1, B1, A2, B2) };
}

/**
 * Итоговый вердикт по всем четырём лестницам и всем проверкам.
 * ab1Checks — массив из judgeS8AB первого прохода.
 * ab2Checks — массив из checkS8AB2 для каждого уровня B2 и контрольного пересчёта.
 */
export function judgeS8AB2(
  a1: S8KikuResult,
  b1: S8KikuResult,
  a2: S8KikuResult,
  b2: S8KikuResult,
  ab1Verdict: ReturnType<typeof judgeS8AB>,
  ab2Checks: S8AB2Check[],
): 'accepted' | 'unresolved' | 'rejected' {
  if (ab2Checks.length !== b2.levels.length + 1)
    throw new RangeError('Every B2 ladder level and the conditioning rebuild require an AB2 check.');
  if (
    a1.status === 'rejected' ||
    b1.status === 'rejected' ||
    a2.status === 'rejected' ||
    b2.status === 'rejected' ||
    ab1Verdict === 'rejected' ||
    ab2Checks.some(c => c.status === 'failed')
  )
    return 'rejected';
  if (
    a1.status === 'accepted' &&
    b1.status === 'accepted' &&
    a2.status === 'accepted' &&
    b2.status === 'accepted' &&
    ab1Verdict === 'accepted' &&
    ab2Checks.every(c => c.status === 'passed')
  )
    return 'accepted';
  return 'unresolved';
}
