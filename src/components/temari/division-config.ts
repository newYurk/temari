import type { Division } from "./division.ts";

/** Exact catalogue configurations, not the three legacy runtime families. */
export const DIVISION_IDS = [
  "s8", "c8", "c10", "s4", "s10", "s16", "c6", "double-c8", "tamentai",
] as const;
export type DivisionId = typeof DIVISION_IDS[number];

/**
 * Explicit adapter to existing geometry. `simple` currently means ONLY S8.
 * S4/S10/S16 must never fall through to that implementation.
 */
export function runtimeDivisionFor(id: DivisionId): Division | undefined {
  switch (id) {
    case "s8": return "simple";
    case "c8": return "c8";
    case "c10": return "c10";
    default: return undefined;
  }
}
