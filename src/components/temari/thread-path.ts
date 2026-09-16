import type { C8CouponMark } from "./c8-engineering-coupon";
import type { MarkingVector } from "./local-marking";

/** All positions and radii use millimetres. Curves describe the yarn centreline. */
export type PointMm = MarkingVector;
export type ThreadCurve =
  | { kind: "arc"; from: PointMm; to: PointMm }
  | { kind: "bezier"; controls: readonly [PointMm, PointMm, PointMm, PointMm] };
export type ThreadZone = "surface" | "piercing" | "buried";
export type ThreadOperationKind = "start" | "lay" | "catch" | "transfer" | "finish";

export type PiercingCorridor = {
  /** Fixed neighbourhood in which this needle passage may enter the base. */
  centerMm: PointMm;
  radiusMm: number;
  maxDepthMm: number;
};
export type ThreadSpan = {
  id: string;
  threadId: string;
  opId: string;
  step: number;
  zone: ThreadZone;
  curve: ThreadCurve;
  corridor?: PiercingCorridor;
};
export type ThreadOperation = {
  id: string;
  order: number;
  step: number;
  kind: ThreadOperationKind;
  spanIds: string[];
  markId?: string;
  captureIds?: string[];
  pass?: "under" | "over";
};
export type MarkingSupport = {
  id: string;
  circleId: string;
  radiusMm: number;
  curve: ThreadCurve;
};
export type C8ThreadCoupon = {
  kind: "engineering-thread-path";
  bodyRadiusMm: number;
  threadId: string;
  threadRadiusMm: number;
  spans: ThreadSpan[];
  operations: ThreadOperation[];
  supports: MarkingSupport[];
  marks: C8CouponMark[];
  fixture: Record<string, number>;
  assumptions: readonly string[];
};

export type PathDiagnostic = {
  code: string;
  severity: "error" | "unresolved";
  spanIds: string[];
  message: string;
  valueMm?: number;
};
export type PathValidation = {
  status: "passed" | "failed" | "unresolved";
  diagnostics: PathDiagnostic[];
  toleranceMm: number;
  lengthMm: { total: number; surface: number; piercing: number; buried: number };
  maxCurvatureTimesRadius: number;
  minSupportGapMm: number;
  minSelfGapMm: number;
};
