/**
 * Thread roles in real temari (TemariKai / Suess):
 *  wrap  — serger / sewing thread, thin, matte; covers the mari
 *  mark  — metallic or fine pearl; jiwari guidelines
 *  stitch — pearl cotton #5 (default), #8, mouliné, metallic accents
 *
 * Picker UI comes later. Geometry and materials should already read from here.
 */
export type ThreadRole = "wrap" | "mark" | "stitch";
export type ThreadKind = "serger" | "pearl5" | "pearl8" | "mouline" | "metallic";

export const THREAD_KINDS: ThreadKind[] = [
  "serger",
  "pearl5",
  "pearl8",
  "mouline",
  "metallic",
];

export const THREAD_KIND_META: Record<
  ThreadKind,
  { label: string; role: ThreadRole; thickness: number; sheen: number; hint: string }
> = {
  serger: {
    label: "Намотка",
    role: "wrap",
    thickness: 0.22,
    sheen: 0.08,
    hint: "швейная / оверлок — тонкий мат, база мари",
  },
  pearl5: {
    label: "Перле №5",
    role: "stitch",
    thickness: 0.62,
    sheen: 0.58,
    hint: "самая частая вышивальная нить",
  },
  pearl8: {
    label: "Перле №8",
    role: "stitch",
    thickness: 0.4,
    sheen: 0.52,
    hint: "тоньше, для мелкого узора",
  },
  mouline: {
    label: "Мулине",
    role: "stitch",
    thickness: 0.52,
    sheen: 0.2,
    hint: "делимая, мягкий блеск",
  },
  metallic: {
    label: "Металлик",
    role: "mark",
    thickness: 0.14,
    sheen: 0.86,
    hint: "дзивари и акценты",
  },
};

export const DEFAULT_KIND: Record<ThreadRole, ThreadKind> = {
  wrap: "serger",
  mark: "metallic",
  stitch: "pearl5",
};

export function isThreadKind(value: unknown): value is ThreadKind {
  return THREAD_KINDS.includes(value as ThreadKind);
}

/** Ribbon half-width on a unit sphere. */
export function ribbonWidth(kind: ThreadKind) {
  const t = THREAD_KIND_META[kind].thickness;
  return 0.011 + t * 0.028;
}

/** Slider 0–1 → tube diameter on the unit sphere for the wrap thread. */
export function wrapRibbonWidth(slider: number) {
  const t = Math.max(0, Math.min(1, slider));
  return 0.012 + t * 0.014;
}

/** World-space sewing-thread diameter on the unit mari. */
export function wrapLineWidth(slider: number) {
  const t = Math.max(0, Math.min(1, slider));
  return 0.007 + t * 0.004;
}

export function threadRoughness(kind: ThreadKind) {
  return 0.72 - THREAD_KIND_META[kind].sheen * 0.5;
}

export function threadMetalness(kind: ThreadKind) {
  return THREAD_KIND_META[kind].sheen * 0.18;
}
