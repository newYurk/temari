/**
 * Real-world mari sizes and thread length.
 * Sources: TemariKai wrappingmari / maritutorial / threadgauges,
 * japanesetemari.com how-to, Kaga kit notes.
 *
 * Temari is measured by circumference C, never diameter.
 * Geometry on the unit sphere scales by R = C / 2π.
 */

export const MARI_C_CM = 24;
export const MARI_R_CM = MARI_C_CM / (2 * Math.PI);
export const WRAP_OVERLAP = 1.12;

/** TemariKai: random wrap uses more than a packed great-circle cover. */
export const CRAFT_PACK = 2.5;

export const MARI_SIZES = [
  { id: "kaga", C: 20, label: "малый", note: "Kaga kit ≈ 20 см / Ø 6.4 см" },
  { id: "standard", C: 24, label: "эталон", note: "TemariKai 23–24 см, учебный dodai" },
  { id: "medium", C: 28, label: "средний", note: "частые узоры 28–29 см" },
  { id: "large", C: 32, label: "крупный", note: "SC03 и подобные; ядро больше, не больше пряжи" },
  { id: "musical", C: 38, label: "музыкальный", note: "готовый полистирол 38 см" },
] as const;

export type WrapLayerId = "yarn" | "fine" | "sew";

/** Millimetres of thread/yarn used for each wrap pass. */
export const WRAP_THREAD_MM: Record<WrapLayerId, { mm: number; label: string; what: string }> = {
  yarn: { mm: 3.2, label: "пряжа", what: "свитерная / baby yarn, 4-ply" },
  fine: { mm: 1.4, label: "тоньше", what: "лёгкая пряжа, выравнивает" },
  sew: { mm: 0.3, label: "швейная", what: "оверлок / швейная, верхний слой" },
};

/** TemariKai gauges: 7 × pearl #5 = 0.5 cm → 0.71 mm. */
export const STITCH_THREAD_MM = {
  pearl5: 0.71,
  pearl8: 0.5,
  mark: 0.2,
} as const;

export function wrapsToCover(Ccm: number, dMm: number, overlap = WRAP_OVERLAP) {
  const Rcm = Ccm / (2 * Math.PI);
  const dCm = dMm / 10;
  const raw = (Math.PI * Rcm * overlap) / dCm;
  const nearest = Math.round(raw);
  const wraps = Math.abs(raw - nearest) < 1e-9 ? nearest : Math.ceil(raw);
  return Math.max(1, wraps);
}

export function unitFromMm(mm: number, Ccm = MARI_C_CM) {
  return mm / 10 / (Ccm / (2 * Math.PI));
}

export function wrapHalfWidth(mm: number, Ccm = MARI_C_CM) {
  return unitFromMm(mm, Ccm) * 0.5;
}

/**
 * 0.3 mm at 4096 bake ≈ 5 px. Extra fattening made cords look like yarn
 * and, with z-ordered paint, like a skein. Keep 1.
 */
export const WRAP_RASTER = 1;

/** Visible maki layer: sewing thread, N from the cover formula — not a visual guess. */
export function sewCover(Ccm = MARI_C_CM) {
  const mm = WRAP_THREAD_MM.sew.mm;
  return {
    mm,
    wraps: wrapsToCover(Ccm, mm),
    halfWidth: wrapHalfWidth(mm, Ccm) * WRAP_RASTER,
  };
}

/** GPU loop ceiling. 24 cm sew = 449. Do not invent extra passes past this. */
export const WRAP_GPU_MAX = 512;
export const WRAP_BAKE = { w: 4096, h: 2048 } as const;

export function wrapLengthM(Ccm: number, wraps: number) {
  return (wraps * Ccm) / 100;
}

export type LayerBom = {
  id: WrapLayerId;
  mm: number;
  wraps: number;
  meters: number;
  shopMeters: number;
};

export function wrapBom(Ccm = MARI_C_CM): LayerBom[] {
  return (Object.keys(WRAP_THREAD_MM) as WrapLayerId[]).map((id) => {
    const mm = WRAP_THREAD_MM[id].mm;
    const wraps = wrapsToCover(Ccm, mm);
    const meters = wrapLengthM(Ccm, wraps);
    const shopMeters = id === "sew" ? meters * CRAFT_PACK : meters * 1.35;
    return { id, mm, wraps, meters, shopMeters };
  });
}

/** One jiwari great circle = one circumference. Simple 8 = 4 меридиана + экватор. */
export function jiwariLengthM(
  Ccm: number,
  division: "simple" | "c8" | "c10",
) {
  const circles = division === "simple" ? 5 : division === "c8" ? 9 : 16;
  return wrapLengthM(Ccm, circles);
}

export function formatMeters(m: number) {
  if (m < 1) return `${Math.round(m * 100)} см`;
  if (m < 20) return `${m.toFixed(1)} м`;
  return `${Math.round(m)} м`;
}
