import {
  localMarkingRays,
  MARKING_EPSILON,
  pointOnMarkingRayMm,
  type LocalMarkingInput,
  type MarkingVector,
} from "./local-marking.ts";

/** Arbitrary engineering fixture. These distances are NOT measurements from GT55. */
export const C8_ENGINEERING_FIXTURE = Object.freeze({
  circumferenceMm: 230,
  innerMm: 5,
  outerMm: 20,
});

export type C8CouponMark = {
  id: string;
  rayIndex: number;
  circleId: string;
  role: "inner" | "outer";
  distanceMm: number;
  positionMm: MarkingVector;
};

/**
 * One eight-mark, four-tip geometric coupon, not a completed GT55 recipe.
 * Checks local eight-ray topology only; it does not certify a whole C8 marking.
 * Legs describe order between ideal marks, not a continuous physical thread path.
 * Catch, anchoring, prior figures, row growth, contacts and hidden routes are unresolved.
 */
export function createC8EngineeringCoupon(
  input: LocalMarkingInput & {
    circumferenceMm: number;
    innerMm: number;
    outerMm: number;
  },
) {
  const rays = localMarkingRays(input);
  if (
    rays.length !== 8 ||
    rays.some((ray, i) => Math.abs(ray.angleRad - (i * Math.PI) / 4) > MARKING_EPSILON)
  ) {
    throw new RangeError("C8 engineering coupon requires eight equally spaced local marking rays");
  }
  if (!Number.isFinite(input.innerMm) || !Number.isFinite(input.outerMm) ||
      input.innerMm <= 0 || input.outerMm <= input.innerMm) {
    throw new RangeError("coupon distances must satisfy 0 < innerMm < outerMm");
  }
  const marks: C8CouponMark[] = rays.map((ray, rayIndex) => {
    const role = rayIndex % 2 === 0 ? "inner" : "outer";
    const distanceMm = role === "inner" ? input.innerMm : input.outerMm;
    return {
      id: `mark-${rayIndex + 1}`,
      rayIndex,
      circleId: ray.circleId,
      role,
      distanceMm,
      positionMm: pointOnMarkingRayMm(input.center, ray.tangent, distanceMm, input.circumferenceMm),
    };
  });
  return {
    kind: "geometric-intent" as const,
    fixture: {
      circumferenceMm: input.circumferenceMm,
      innerMm: input.innerMm,
      outerMm: input.outerMm,
      provenance: "engineering-assumption" as const,
    },
    groupId: "engineering-group-1",
    rays,
    marks,
    legs: marks.map((mark, order) => ({
      id: `leg-${order + 1}`,
      order,
      from: mark.id,
      to: marks[(order + 1) % marks.length].id,
      kind: "ordered-mark-connection" as const,
    })),
    unresolved: ["needle-catches", "anchoring", "prior-figures", "row-growth", "contacts", "hidden-routes"] as const,
  };
}
