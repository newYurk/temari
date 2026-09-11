/**
 * Thread roles in real temari (TemariKai wrappingmari / stitchingthreads / beginnerhelp).
 *
 * Wrap is not embroidery. Three (sometimes four) passes, thick → thin.
 * The player sees only the last: single-strand sewing / serger thread.
 * Stitching thread is pearl, hana, miyako, bunka — never the wrap yarn.
 *
 * Picker UI comes later. Geometry reads thickness from here.
 */
import { STITCH_THREAD_MM, unitFromMm } from "./measure";
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
    hint: "делимая, мягкий блеск — новичкам не советуют",
  },
  metallic: {
    label: "Металлик",
    role: "mark",
    thickness: 0.14,
    sheen: 0.86,
    hint: "дзивари и акценты; не тоньше вышивки",
  },
};

export const DEFAULT_KIND: Record<ThreadRole, ThreadKind> = {
  wrap: "serger",
  mark: "metallic",
  stitch: "pearl5",
};

/** Real wrap stack. Player sees `sew` only. */
export const WRAP_PASSES = {
  yarn: {
    id: "yarn" as const,
    mm: 3.2,
    label: "пряжа",
    craft: "worsted / baby, 4-ply sweater yarn",
    hint: "дешёвая акрил или шерсть, мягкая baby лучше формует. Цвет не обязан совпадать с верхом — её не видно.",
  },
  fine: {
    id: "fine" as const,
    mm: 1.4,
    label: "тоньше",
    craft: "sport / fingering / sock, 1–2 ply",
    hint: "сглаживает пряжу. Без резкого контраста к финальной нити — иначе просветит.",
  },
  power: {
    id: "power" as const,
    mm: 0.9,
    label: "несколько швейных",
    craft: "2–3 strands of serger at once",
    hint: "не чтобы быстрее, а как камни в ведре: переход к одной нити. Конусы оверлока.",
  },
  sew: {
    id: "sew" as const,
    mm: 0.3,
    label: "швейная",
    craft: "cotton / poly sewing or serger, single strand",
    hint: "это и есть видимая база. Дешёвая коротковолокнистая лучше дорогой гладкой. Не мулине, не квилтинг, не вискоза для машинной вышивки.",
  },
} as const;

export const WRAP_FORBIDDEN = [
  "крючковый хлопок — жёсткий шнур, не сглаживается и плохо шьётся",
  "квилтинг и полированный полиэстер — слишком гладкие, сползают",
  "вискоза / machine embroidery — не для намотки",
  "шёлк и «особенные» волокна на базу — плохо формуют",
] as const;

export const STITCH_THREADS = {
  pearl5: { label: "перле №5", mm: 0.71, note: "2-ply, блеск, не делится. Новичкам это." },
  pearl8: { label: "перле №8", mm: 0.5, note: "тоньше; часто дзивари, если не металлик" },
  pearl3: { label: "перле №3", mm: 1.0, note: "толще, редкий крупный узор" },
  hana: { label: "хана", mm: 0.6, note: "полиэстер, мат, 5 прядей. В Японии новичкам: не скользит." },
  miyako: { label: "мияко", mm: 0.45, note: "Fujix, 30 м, замена kyo. Не мешать с kyo в одном шаре." },
  bunka: { label: "бунка", mm: 0.55, note: "цепочка, распускают; традиция после шёлка" },
  metallic: { label: "металлик", mm: 0.2, note: "дзивари; DMC Art 282 или не эластичный lame" },
} as const;

export function isThreadKind(value: unknown): value is ThreadKind {
  return THREAD_KINDS.includes(value as ThreadKind);
}

/** Ribbon half-width on the unit sphere — metallic jiwari and belts. */
export function ribbonWidth(kind: ThreadKind) {
  const mm =
    kind === "pearl8"
      ? STITCH_THREAD_MM.pearl8
      : kind === "metallic"
        ? STITCH_THREAD_MM.mark
        : STITCH_THREAD_MM.pearl5;
  return unitFromMm(mm) * (kind === "metallic" ? 0.55 : 0.5);
}

/** Round pearl on the mari. Slightly under half a millimetre so cords read. */
export function stitchRadius(kind: ThreadKind) {
  const mm =
    kind === "pearl8"
      ? STITCH_THREAD_MM.pearl8
      : kind === "metallic"
        ? STITCH_THREAD_MM.mark
        : STITCH_THREAD_MM.pearl5;
  return unitFromMm(mm) * 0.46;
}

/** Slider 0–1 → tube diameter on the unit sphere for the wrap thread. */
export function wrapRibbonWidth(slider: number) {
  const t = Math.max(0, Math.min(1, slider));
  return 0.012 + t * 0.014;
}

/** World-space sewing-thread diameter on the unit mari. */
export function wrapLineWidth(slider: number) {
  const t = Math.max(0, Math.min(1, slider));
  return 0.009 + t * 0.005;
}

export function threadRoughness(kind: ThreadKind) {
  return 0.72 - THREAD_KIND_META[kind].sheen * 0.5;
}

export function threadMetalness(kind: ThreadKind) {
  return THREAD_KIND_META[kind].sheen * 0.18;
}
