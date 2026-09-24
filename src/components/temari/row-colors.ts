import { useSyncExternalStore } from "react";

/** Inspection changes materials only, never the recipe's thread colours or identities. */
export const ROW_COLORS = [0xe8b020, 0x2f7fe0, 0x2fb050, 0xd03fb0, 0xff6a00,
  0x00c0c0, 0x8050ff, 0x80ff40, 0xff3050, 0x606060] as const;

let enabled = typeof location !== "undefined" && new URLSearchParams(location.search).get("rows") === "1";
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function toggleRowColors() {
  enabled = !enabled;
  for (const fn of listeners) fn();
}

export function useRowColors() {
  return useSyncExternalStore(subscribe, () => enabled, () => false);
}

export function kikuRow(operationId: unknown) {
  if (typeof operationId !== "string") return null;
  const match = operationId.match(/\/s([01])\/r(\d+)\//);
  if (!match) return null;
  const row = Number(match[2]);
  return { row, group: Number(match[1]), color: ROW_COLORS[row % ROW_COLORS.length]! };
}
