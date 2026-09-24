import { buildNeedleChannel } from './needle-channel';
import { auditThreadMaterial } from './thread-material-ledger';
import { boundCurvatureTimesRadius } from './curvature-bound';
import { curveDerivative, evaluateCurve, polynomialRoots01, validateThreadCoupon } from './thread-geometry';
import { curvesLength } from './thick-rope-ladder';
import { compileKiku } from './patterns';
import type { C8ThreadCoupon, MarkingSupport, PointMm, ThreadCurve, ThreadSpan } from './thread-path';

export const SINGLE_NEEDLE_MODEL = 'single-straight-needle-catch-v1';
export type NeedleCatchCase = 'narrow' | 'clearance-control';
const add = (a: PointMm, b: PointMm): PointMm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: PointMm, b: PointMm): PointMm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: PointMm, s: number): PointMm => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: PointMm, b: PointMm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: PointMm): PointMm => mul(a, 1 / Math.hypot(...a));
const cross = (a: PointMm, b: PointMm): PointMm => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const cubic = (...controls: [PointMm, PointMm, PointMm, PointMm]): ThreadCurve => ({ kind: 'bezier', controls });
const line = (a: PointMm, b: PointMm): ThreadCurve => cubic(a, add(a, mul(sub(b, a), 1 / 3)), add(a, mul(sub(b, a), 2 / 3)), b);

/** Numerical polynomial extrema of a cubic, not just its displayed vertices. */
export function cubicMinimumRadius(curve: ThreadCurve) {
  if (curve.kind === 'arc') return Math.hypot(...curve.from);
  const [a, b, c, d] = curve.controls;
  const p = [a, mul(sub(b, a), 3), mul(add(sub(c, mul(b, 2)), a), 3), sub(add(sub(d, mul(c, 3)), mul(b, 3)), a)];
  const sq = Array<number>(7).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) sq[i + j] += dot(p[i], p[j]);
  const roots = polynomialRoots01(sq.slice(1).map((n, i) => n * (i + 1)));
  return Math.min(...[0, ...roots, 1].map(t => Math.hypot(...evaluateCurve(curve, t))));
}

/**
 * A deliberately bounded kinematic fixture, NOT a compiled GT14 stitch.
 * Only its local placement uses S8. Width, layer, held branches and supply
 * are explicit engineering boundary data; no tension equilibrium is solved.
 */
export function buildSingleNeedleCatch(caseId: NeedleCatchCase = 'clearance-control', suppliedLengthMm = 60) {
  if (!['narrow', 'clearance-control'].includes(caseId) || !Number.isFinite(suppliedLengthMm) || suppliedLengthMm <= 0)
    throw new RangeError('A known case and a positive prescribed material supply are required.');
  const R = 240 / (2 * Math.PI), rThread = .355, rNeedle = .2, layerThickness = 1.2;
  const widthMm = caseId === 'narrow' ? 2 : 11;
  const normal = compileKiku('simple', 'out', 'even', 0, 0, 1, 0)[1].mark.at;
  const outward = unit(sub(mul(normal, normal[1]), [0, 1, 0]));
  const across = unit(cross(normal, outward));
  const at = (q: number, v: number, radial: number) => add(add(mul(across, q), mul(outward, v)), mul(normal, radial));
  const a = widthMm / 2, h = Math.sqrt(R * R - a * a);
  const entry = at(a, 0, h), exit = at(-a, 0, h);
  const supportRadius = .1, supportReach = 12, supportR = R + supportRadius;
  const supports: MarkingSupport[] = [{ id: 'fixed-jiwari', circleId: 'reference-meridian', radiusMm: supportRadius,
    curve: { kind: 'arc', from: at(0, -supportR * Math.sin(supportReach / supportR), supportR * Math.cos(supportReach / supportR)),
      to: at(0, supportR * Math.sin(supportReach / supportR), supportR * Math.cos(supportReach / supportR)) } }];
  const threadId = 'single-needle/physical-thread-1';
  const channel = buildNeedleChannel({ R, layerThickness, rNeedle, rThread, entry, exit, supports,
    id: `${threadId}/channel`, threadId, toleranceMm: .0005 });
  // The outside branches are prescribed, held geometry, not a predicted settled shape.
  // Oriented tangents at both mouth points agree exactly with the straight channel.
  const incoming = cubic(at(-8, 8, R + 3), at(-1, 6, R + 3), at(a + 6, 0, h), entry);
  const outgoing = cubic(exit, at(-a - 6, 0, h), at(1, 6, R + 5), at(8, 8, R + 5));
  const baseCurves = [incoming, channel.spans[0].curve, outgoing];
  const baseLengthMm = curvesLength(baseCurves);
  const freeLengthMm = Math.max(0, suppliedLengthMm - baseLengthMm);
  const last = evaluateCurve(outgoing, 1), direction = unit(curveDerivative(outgoing, 1));
  const curves = freeLengthMm > 1e-8 ? [...baseCurves, line(last, add(last, mul(direction, freeLengthMm)))] : baseCurves;
  const roles = ['incoming', 'channel', 'outgoing', 'free-tail'];
  const spans: ThreadSpan[] = curves.map((curve, i) => ({ id: `${threadId}/${roles[i]}`, threadId,
    opId: `fixture-${roles[i]}`, step: i, zone: i === 1 ? 'piercing' : 'surface', curve }));
  const geometryLengthMm = curvesLength(curves);
  const material = auditThreadMaterial({ previous: { placedLengthMm: 0, reservoirMm: 120, totalMaterialMm: 120 },
    next: { placedLengthMm: geometryLengthMm }, boundary: { kind: 'prescribed-exchange', exchangeMm: suppliedLengthMm },
    lengthModel: 'inextensible-kinematic', toleranceMm: 1e-6 });
  // Existing volume checker is used against the impermeable CORE, not the
  // nominal shell. All coordinates/sections are unchanged by this adapter.
  const coupon: C8ThreadCoupon = { kind: 'engineering-thread-path', bodyRadiusMm: R - layerThickness,
    threadRadiusMm: rThread, threadId, spans: spans.map(s => ({ ...s, zone: 'surface' })),
    operations: spans.map((s, i) => ({ id: s.opId, order: i, step: i,
      kind: i === 0 ? 'start' : i === spans.length - 1 ? 'finish' : i === 1 ? 'catch' : 'lay', spanIds: [s.id] })),
    supports, marks: [], fixture: { widthMm, layerThickness, suppliedLengthMm },
    assumptions: ['Adapter start/finish delimit a held represented interval, not craft anchoring in the mari.',
      'The core is impermeable; the nominal outer layer is permitted geometrically, without a constitutive or friction law.'] };
  const validation = validateThreadCoupon(coupon, .0005);
  const curvature = boundCurvatureTimesRadius(curves, rThread);
  const outsideMinimumRadiusMm = Math.min(cubicMinimumRadius(incoming), cubicMinimumRadius(outgoing));
  const additionalEntry = outsideMinimumRadiusMm < R - 1e-7;
  const geometryStatus = channel.geometry === 'rejected' || validation.status === 'failed' || curvature.lower >= 1 || additionalEntry ? 'rejected'
    : channel.geometry === 'unresolved' || validation.status === 'unresolved' || curvature.status !== 'certified' || curvature.upper >= 1 ? 'unresolved' : 'passed';
  const status = geometryStatus === 'rejected' || material.status === 'rejected' ? 'rejected' : 'unresolved';
  return { model: SINGLE_NEEDLE_MODEL, caseId, status, geometryStatus, mechanics: 'unresolved' as const,
    captureTopology: 'unresolved' as const, craftAcceptance: 'open' as const,
    parameters: { R, rThread, rNeedle, layerThickness, widthMm, suppliedLengthMm, totalMaterialMm: 120, exteriorHandleMm: 6 },
    placement: { source: 'S8 inner-2 position only; no claim to compile its recipe', normal, outward, across },
    channel, spans, supports, focusMm: mul(normal, R), geometryLengthMm, baseLengthMm, freeLengthMm, material,
    materialContract: { lengthModel: 'inextensible-kinematic', toleranceMm: 1e-6,
      representedInterval: 'Includes external held branches and the free tail; not length laid on the mari.' },
    boundaries: { start: { kind: 'prescribed-external-hold', positionMm: evaluateCurve(incoming, 0), materialCoordinateMm: 0 },
      end: { kind: 'prescribed-feed-boundary', positionMm: evaluateCurve(curves.at(-1)!, 1),
        prescribedMaterialCoordinateMm: suppliedLengthMm,
        materialCoordinateMm: material.status === 'conserved' ? suppliedLengthMm : null },
      reservoirGeometry: 'not-represented' },
    checks: { validation, curvature, outsideMinimumRadiusMm, additionalEntry },
    assumptions: [
      'A single straight fixed-axis needle pass is prescribed. Keeping the central yarn path on the same line is an engineering condition, not a prediction after tightening.',
      'The 1.2 mm layer and impermeable inner body are engineering test boundaries, not measured mari construction or a typical wrapping thickness. Foundation deformation and holding are unsolved; see spec/material-scale.md.',
      'Round yarn radius 0.355 mm and needle radius 0.2 mm are separate assigned dimensions, not a measured pair.',
      'The 11 mm positive control is deliberately wide. It is NOT a replacement for the small GT14 stitch; the 2 mm case must retain its conflicts.',
      'Both external branches are held as prescribed. Their shape and the fixed marking segment are boundary data, not an equilibrium solution.',
      '120 mm of material is assigned before construction. An explicit supply determines the represented interval; its remainder is a straight free tail with a movable held boundary.',
      'The remaining reservoir has known length but no reconstructed spatial path. Global contacts and real anchoring are not claimed.',
      'Axis intersections with the nominal surface are model mouths, not individually resolved foundation fibres. Partial emergence of the finite yarn tube remains visible.',
    ] };
}
export type SingleNeedleCatch = ReturnType<typeof buildSingleNeedleCatch>;
