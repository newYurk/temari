import { pointNeedleChannelClearance, segmentNeedleChannelClearance,
  type NeedleChannelDomain } from './needle-channel-clearance';
import { buildFirstVisitRoute } from './first-visit-route';
import { evaluateCurve } from './thread-geometry';
import { curvesLength } from './thick-rope-ladder';
import type { PointMm, ThreadCurve } from './thread-path';
import { solveYarnEquilibrium, type EquilibriumYarn, type YarnEquilibriumInput,
  type YarnEquilibriumOptions } from './yarn-equilibrium';

const STEP_MM = 2;
const MARGIN_MM = 0.05;
const TOLERANCE_MM = 0.002;
const distance = (a: PointMm, b: PointMm) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const domainOf = (route: ReturnType<typeof buildFirstVisitRoute>, index: number): NeedleChannelDomain => {
  const channel = route.channels[index]!;
  return {
    sphereCenterMm: [0, 0, 0], bodyRadiusMm: route.R,
    entryMm: channel.ports.entry.positionMm, exitMm: channel.ports.exit.positionMm,
    channelRadiusMm: route.threadRadiusMm + MARGIN_MM, threadRadiusMm: route.threadRadiusMm,
  };
};

const clearPoint = (point: PointMm, domain: NeedleChannelDomain) =>
  pointNeedleChannelClearance(point, domain).gapMm >= -TOLERANCE_MM;

const clearSegment = (a: PointMm, b: PointMm, domain: NeedleChannelDomain) => {
  const segment = segmentNeedleChannelClearance(a, b, domain, { toleranceMm: TOLERANCE_MM, maxEvaluations: 2049 });
  return segment.clearance !== 'outside-domain' && segment.clearance !== 'unresolved' && segment.status !== 'unresolved';
};

/** One sliding thread through the three recipe channels. Ports stay unfixed. */
export function buildFirstVisitEquilibriumInput() {
  const route = buildFirstVisitRoute();
  const domains = [0, 1, 2].map(i => domainOf(route, i));
  const pieces: { curve: ThreadCurve; domain: number }[] = [
    { curve: route.approach, domain: 0 },
    { curve: route.channels[0].spans[0].curve, domain: 0 },
    { curve: route.bridges[0], domain: 0 },
    { curve: route.bridges[1], domain: 0 },
    { curve: route.bridges[2], domain: 1 },
    { curve: route.channels[1].spans[0].curve, domain: 1 },
    { curve: route.bridges[3], domain: 1 },
    { curve: route.bridges[4], domain: 1 },
    { curve: route.bridges[5], domain: 2 },
    { curve: route.channels[2].spans[0].curve, domain: 2 },
    { curve: route.departure, domain: 2 },
  ];
  const points: PointMm[] = [];
  const ranges: { domain: number; start: number; end: number }[] = [];
  for (const piece of pieces) {
    const count = Math.max(1, Math.ceil(curvesLength([piece.curve]) / STEP_MM));
    const start = points.length;
    for (let i = 0; i <= count; i++) {
      const point = evaluateCurve(piece.curve, i / count);
      if (points.length && distance(points.at(-1)!, point) < 1e-8) continue;
      points.push(point);
    }
    if (points.length > start) ranges.push({ domain: piece.domain, start, end: points.length - 1 });
  }
  const pointOk = (index: number, domain: number) => clearPoint(points[index]!, domains[domain]!);
  const firstBridge = ranges[3];
  const secondBridge = ranges[7];
  const firstSplit = firstBridge && secondBridge ? Array.from({ length: firstBridge.end - firstBridge.start }, (_, k) => firstBridge.start + k + 1)
    .find(i => pointOk(i, 0) && pointOk(i, 1) && points.slice(0, i + 1).every((_, k) => pointOk(k, 0))
      && points.slice(i, secondBridge.start + 1).every((_, k) => pointOk(i + k, 1))) ?? -1 : -1;
  const secondSplit = firstSplit > 0 && secondBridge ? Array.from({ length: secondBridge.end - secondBridge.start }, (_, k) => secondBridge.start + k + 1)
    .find(i => pointOk(i, 1) && pointOk(i, 2) && points.slice(firstSplit, i + 1).every((_, k) => pointOk(firstSplit + k, 1))
      && points.slice(i).every((_, k) => pointOk(i + k, 2))) ?? -1 : -1;
  const initialSegmentsOutside = firstSplit > 0 && secondSplit > 0 && [
    [0, firstSplit, 0], [firstSplit, secondSplit, 1], [secondSplit, points.length - 1, 2],
  ].some(([from, to, domain]) => {
    for (let i = from + 1; i <= to; i++) if (!clearSegment(points[i - 1]!, points[i]!, domains[domain]!)) return true;
    return false;
  });
  if (firstSplit < 0 || secondSplit < 0) throw new Error('The first visit has no ordered channel partition inside the assigned domains.');
  const threadId = 'first-visit/physical-thread-1';
  const passages = [
    { id: `${threadId}/outer-1`, firstNode: 0, lastNode: firstSplit },
    { id: `${threadId}/inner-2`, firstNode: firstSplit, lastNode: secondSplit },
    { id: `${threadId}/outer-3`, firstNode: secondSplit, lastNode: points.length - 1 },
  ].map((passage, i) => ({ ...passage, domain: domains[i]!, toleranceMm: TOLERANCE_MM, maxEvaluations: 513 }));
  const laid = points.slice(1).reduce((sum, point, i) => sum + distance(points[i]!, point), 0);
  const thread: EquilibriumYarn = {
    id: threadId, radiusMm: route.threadRadiusMm, axialStiffnessN: 10, bendingStiffnessNmm2: 0.001,
    nodes: points.map((positionMm, i) => ({ positionMm, fixed: i === 0 || i === points.length - 1 })),
    restLengthsMm: Array(points.length - 1).fill(laid / (points.length - 1)),
    feed: { tensionN: 0.05, availableLengthMm: laid + 80, discretization: 'equal-chord' },
    channelPassages: passages,
  };
  const input: YarnEquilibriumInput = { threads: [thread], sphere: { centerMm: [0, 0, 0], radiusMm: route.R } };
  return { model: 'first-visit-equilibrium-v1' as const, route, input, threadId, laidLengthMm: laid,
    initialSegmentsOutside, mechanics: 'prepared' as const, status: 'not-certified' as const };
}

export function solveFirstVisitEquilibrium(options: YarnEquilibriumOptions = {}) {
  const fixture = buildFirstVisitEquilibriumInput();
  const result = solveYarnEquilibrium({ ...fixture.input, options });
  const physicalAcceptance = result.status === 'rejected' ? 'rejected-mechanics' as const
    : result.status === 'converged' && !fixture.initialSegmentsOutside ? 'not-certified' as const
    : 'unresolved' as const;
  return { ...fixture, result, physicalAcceptance };
}
