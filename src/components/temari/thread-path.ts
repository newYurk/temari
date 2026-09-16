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
/** Finite material interval of a previously laid span or a fixed marking support. */
export type ThreadTarget = { id: string; t0: number; t1: number };
export type ThreadWindow = { spanId: string; t0: number; t1: number };
export type ThreadCrossing = {
  id: string;
  opId: string;
  /** Consecutive windows allow a crossing through a smooth curve join. */
  working: ThreadWindow[];
  target: ThreadTarget;
  pass: "over" | "under";
};
export type ThreadCapture = {
  id: string;
  opId: string;
  targets: ThreadTarget[];
  overCrossingIds: string[];
  underCrossingIds: string[];
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
  /** Optional on the older single-round engineering baseline. */
  crossings?: ThreadCrossing[];
  captures?: ThreadCapture[];
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
