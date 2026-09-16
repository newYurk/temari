/** Analytic marking geometry only; no needle, thread section, or contact model. */
export type MarkingVector = readonly [number, number, number];

export type MarkingCircle = { id: string; normal: MarkingVector };
export type UniqueMarkingCircle = MarkingCircle & { sourceIds: readonly string[] };
export type LocalMarkingRay = {
  circleId: string;
  sourceIds: readonly string[];
  tangent: MarkingVector;
  angleRad: number;
};
export type LocalMarkingInput = {
  center: MarkingVector;
  circles: readonly MarkingCircle[];
  /** A direction, not an unoriented circle normal. Must lie on this source circle. */
  firstRay: { circleId: string; tangent: MarkingVector };
  /** +1 follows center × firstRay; -1 reverses that cyclic order. */
  handedness: 1 | -1;
};

// Dimensionless numerical budget, not a measured craft/material tolerance.
export const MARKING_EPSILON = 1e-10;
const TAU = 2 * Math.PI;

function dot(a: MarkingVector, b: MarkingVector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: MarkingVector, b: MarkingVector): MarkingVector {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function scale(v: MarkingVector, s: number): MarkingVector {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function checkedLength(v: MarkingVector, label: string): number {
  if (v.length !== 3 || !v.every(Number.isFinite)) {
    throw new RangeError(`${label} must contain three finite coordinates`);
  }
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError(`${label} must have finite, nonzero length`);
  }
  return length;
}

function unit(v: MarkingVector, label: string): MarkingVector {
  const length = checkedLength(v, label);
  if (Math.abs(length - 1) > MARKING_EPSILON) {
    throw new RangeError(`${label} must be a unit vector`);
  }
  return scale(v, 1 / length);
}

function tangentAt(center: MarkingVector, tangent: MarkingVector): MarkingVector {
  const t = unit(tangent, "tangent");
  const radial = dot(center, t);
  if (Math.abs(radial) > MARKING_EPSILON) {
    throw new RangeError("tangent must be perpendicular to center");
  }
  // Remove accepted roundoff so the evaluated spherical point stays on the sphere.
  const projected: MarkingVector = [
    t[0] - radial * center[0],
    t[1] - radial * center[1],
    t[2] - radial * center[2],
  ];
  return scale(projected, 1 / Math.hypot(...projected));
}

/**
 * Merge unoriented planes using ||n × m||, including n = -m and sign boundaries.
 * Keep the lexically first source ID and all aliases. No world axis chooses a sign.
 * Source IDs must be unique; normal magnitudes need not be one.
 */
export function uniqueMarkingCircles(
  circles: readonly MarkingCircle[],
): UniqueMarkingCircle[] {
  const ids = new Set<string>();
  const out: UniqueMarkingCircle[] = [];
  for (const circle of [...circles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (!circle.id || ids.has(circle.id)) {
      throw new RangeError("marking circles require distinct, nonempty IDs");
    }
    ids.add(circle.id);
    checkedLength(circle.normal, `normal of ${circle.id}`);
    // Rescale first: subnormal source magnitudes must not corrupt a unit normal.
    const magnitude = Math.max(...circle.normal.map(Math.abs));
    const scaled = circle.normal.map((coordinate) => coordinate / magnitude);
    const length = Math.hypot(...scaled);
    const normal: MarkingVector = [
      scaled[0] / length,
      scaled[1] / length,
      scaled[2] / length,
    ];
    const existing = out.find(
      (q) => Math.hypot(...cross(q.normal, normal)) <= MARKING_EPSILON,
    );
    if (existing) existing.sourceIds = [...existing.sourceIds, circle.id];
    else out.push({ id: circle.id, normal, sourceIds: [circle.id] });
  }
  return out;
}

/** Derive actual rays of incident circles; never synthesize equally spaced rays. */
export function localMarkingRays(input: LocalMarkingInput): LocalMarkingRay[] {
  const center = unit(input.center, "center");
  if (input.handedness !== 1 && input.handedness !== -1) {
    throw new RangeError("handedness must be +1 or -1");
  }
  const first = tangentAt(center, input.firstRay.tangent);
  const incident = uniqueMarkingCircles(input.circles).filter(
    (circle) => Math.abs(dot(circle.normal, center)) <= MARKING_EPSILON,
  );
  const firstCircle = incident.find((c) => c.sourceIds.includes(input.firstRay.circleId));
  if (!firstCircle || Math.abs(dot(firstCircle.normal, first)) > MARKING_EPSILON) {
    throw new RangeError("firstRay must belong to an incident source circle");
  }
  const second = scale(cross(center, first), input.handedness);
  const rays: LocalMarkingRay[] = [];
  for (const circle of incident) {
    const raw = cross(circle.normal, center);
    const forward = scale(raw, 1 / Math.hypot(...raw));
    for (const sign of [1, -1]) {
      const tangent = scale(forward, sign);
      let angleRad = Math.atan2(dot(tangent, second), dot(tangent, first));
      if (Math.abs(angleRad) <= MARKING_EPSILON) angleRad = 0;
      else if (angleRad < 0) angleRad += TAU;
      rays.push({ circleId: circle.id, sourceIds: circle.sourceIds, tangent, angleRad });
    }
  }
  return rays.sort((a, b) => a.angleRad - b.angleRad);
}

/**
 * Surface point in millimetres at directed arclength s: R(c cos(s/R) + t sin(s/R)).
 * This local ray stops before the antipode, where distinct rays meet. No default C24.
 */
export function pointOnMarkingRayMm(
  centerInput: MarkingVector,
  tangentInput: MarkingVector,
  distanceMm: number,
  circumferenceMm: number,
): MarkingVector {
  const center = unit(centerInput, "center");
  const tangent = tangentAt(center, tangentInput);
  if (!Number.isFinite(circumferenceMm) || circumferenceMm <= 0) {
    throw new RangeError("circumferenceMm must be finite and positive");
  }
  if (!Number.isFinite(distanceMm) || distanceMm < 0 || distanceMm >= circumferenceMm / 2) {
    throw new RangeError("distanceMm must be nonnegative and less than half the circumference");
  }
  const radiusMm = circumferenceMm / TAU;
  if (radiusMm === 0) throw new RangeError("circumferenceMm is too small to represent a radius");
  const theta = distanceMm / radiusMm;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    radiusMm * (center[0] * c + tangent[0] * s),
    radiusMm * (center[1] * c + tangent[1] * s),
    radiusMm * (center[2] * c + tangent[2] * s),
  ];
}
