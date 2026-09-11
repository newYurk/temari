/**
 * Workshop catalogs from Suess glossary + Divisions & Markings,
 * cross-checked with TemariKai. Data only — the dock never dumps this list.
 *
 * appears:
 *   dock          — icon in the craft row, only if status is now
 *   variant-chip  — compact chip under the selected family, when ≥2 now
 *   data-only     — named so the engine can grow; no control
 */

import { MARI_SIZES, STITCH_THREAD_MM, WRAP_THREAD_MM } from "./measure.ts";
import { KIKU_8_POINT, type Crossing, type PatternRecipe } from "./kagari.ts";

export type CatalogStatus = "now" | "v1" | "later";
export type AppearsIn = "dock" | "variant-chip" | "data-only";
export type MotifFamily = "kiku" | "hoshi" | "hishi" | "obi" | "shikaku" | "matsuba" | "mitsubane" | "asanoha" | "bara";

export type YarnEntry = {
  id: string;
  role: "wrap" | "mark" | "kagari";
  mm: number;
  label: string;
  note: string;
  status: CatalogStatus;
};

export type DivisionEntry = {
  id: string;
  name: string;
  reading: string;
  kind: "simple" | "combination" | "extra";
  poles?: number;
  status: CatalogStatus;
  appears: AppearsIn;
  note: string;
};

export type StitchEntry = {
  id: string;
  name: string;
  reading: string;
  ja: string;
  family: "chidori" | "polygon" | "wrap" | "other";
  what: string;
  status: CatalogStatus;
  appears: AppearsIn;
};

export type MotifEntry = {
  id: string;
  family: MotifFamily;
  name: string;
  reading: string;
  stitch: string;
  requires: "simple" | "c8" | "c10" | "any";
  skip?: 1 | 2;
  direction?: "outward" | "inward";
  crossing?: Crossing;
  centers?: "facing-pole" | "both-poles";
  status: CatalogStatus;
  appears: AppearsIn;
  note: string;
  recipe?: PatternRecipe;
};

export const MARI_CATALOG = MARI_SIZES.map((s) => ({
  ...s,
  status: (s.id === "standard" ? "now" : "v1") as CatalogStatus,
}));

export const YARN_CATALOG: YarnEntry[] = [
  { id: "wrap-yarn", role: "wrap", mm: WRAP_THREAD_MM.yarn.mm, label: "пряжа", note: WRAP_THREAD_MM.yarn.what, status: "now" },
  { id: "wrap-fine", role: "wrap", mm: WRAP_THREAD_MM.fine.mm, label: "тоньше", note: WRAP_THREAD_MM.fine.what, status: "now" },
  { id: "wrap-sew", role: "wrap", mm: WRAP_THREAD_MM.sew.mm, label: "швейная", note: WRAP_THREAD_MM.sew.what, status: "now" },
  { id: "pearl-5", role: "kagari", mm: STITCH_THREAD_MM.pearl5, label: "перле 5", note: "TemariKai: 7 × #5 = 0.5 см", status: "now" },
  { id: "pearl-8", role: "kagari", mm: STITCH_THREAD_MM.pearl8, label: "перле 8", note: "тоньше кагари", status: "v1" },
  { id: "mark-metallic", role: "mark", mm: STITCH_THREAD_MM.mark, label: "дзивари", note: "металлик / тонкая разметочная", status: "now" },
  { id: "hana-ito", role: "kagari", mm: 0.4, label: "хана-ито", note: "шёлк; picker не сейчас (#76)", status: "later" },
  { id: "bunka", role: "kagari", mm: 0.9, label: "бунка", note: "не этот этап", status: "later" },
];

/** Suess workbook: simple S4–S32, C6/C8/C10, extra mentai. Standard three first. */
export const DIVISION_CATALOG: DivisionEntry[] = [
  { id: "s8", name: "простое 8", reading: "tanjyun toubun 8", kind: "simple", poles: 2, status: "now", appears: "dock", note: "Два полюса, экватор, 8 лучей. Учебный старт." },
  { id: "c8", name: "C8", reading: "hachitobun no kumiawase", kind: "combination", poles: 6, status: "now", appears: "dock", note: "6 восьмилучевых центров. В доке есть; геометрия ещё не октаэдр темари." },
  { id: "c10", name: "C10", reading: "jutobun no kumiawase", kind: "combination", poles: 12, status: "v1", appears: "dock", note: "12 десятилучевых. Серый, пока C8 честный." },
  { id: "s4", name: "простое 4", reading: "S4", kind: "simple", poles: 2, status: "v1", appears: "data-only", note: "Suess Autumn Moon. Не кику." },
  { id: "s10", name: "простое 10", reading: "S10", kind: "simple", poles: 2, status: "v1", appears: "data-only", note: "База для C10." },
  { id: "s16", name: "простое 16", reading: "S16", kind: "simple", poles: 2, status: "later", appears: "data-only", note: "16-слойное кику." },
  { id: "c6", name: "C6", reading: "combination 6", kind: "combination", status: "later", appears: "data-only", note: "Suess workbook, не стандарт JTA." },
  { id: "double-c8", name: "двойное C8", reading: "double C8", kind: "combination", status: "later", appears: "data-only", note: "Suess workbook." },
  { id: "tamentai", name: "таментай", reading: "tamentai", kind: "extra", status: "later", appears: "data-only", note: "Не этот этап (#54)." },
];

/**
 * Suess herringbone family is one stitch with six ways.
 * Other stitches are separate families.
 */
export const STITCH_CATALOG: StitchEntry[] = [
  {
    id: "uwagake-chidori",
    name: "увагакэ тидори",
    reading: "uwagake chidori kagari",
    ja: "上掛け千鳥かがり",
    family: "chidori",
    what: "кику-herringbone: зигзаг, у внутреннего угла нить поверх всех предыдущих рядов. Не западный herringbone.",
    status: "now",
    appears: "variant-chip",
  },
  {
    id: "chidori",
    name: "тидори",
    reading: "chidori kagari",
    ja: "千鳥かがり",
    family: "chidori",
    what: "single herringbone. Тот же зигзаг, укус 1–2 мм, без нахлёста пачки.",
    status: "v1",
    appears: "variant-chip",
  },
  {
    id: "sakasa",
    name: "сакаса увагакэ",
    reading: "sakasa uwagake chidori kagari",
    ja: "逆さ上掛け千鳥かがり",
    family: "chidori",
    what: "reverse kiku: от края фигуры к полюсу.",
    status: "v1",
    appears: "variant-chip",
  },
  {
    id: "shitagake",
    name: "ситагакэ тидори",
    reading: "shitagake chidori kagari",
    ja: "下掛け千鳥かがり",
    family: "chidori",
    what: "descending: следующий ряд под предыдущим.",
    status: "later",
    appears: "variant-chip",
  },
  {
    id: "sujidate",
    name: "судзидатэ / судзидагику",
    reading: "sujidagiku",
    ja: "筋立て菊",
    family: "chidori",
    what: "ribbed kiku: увагакэ только через один ряд (over-1).",
    status: "later",
    appears: "variant-chip",
  },
  {
    id: "sankaku",
    name: "санкаку",
    reading: "sankaku kagari",
    ja: "三角かがり",
    family: "polygon",
    what: "треугольник за круг по трём сторонам грани.",
    status: "v1",
    appears: "data-only",
  },
  {
    id: "shikaku",
    name: "сикаку / масу",
    reading: "shikaku / masu kagari",
    ja: "四角かがり",
    family: "polygon",
    what: "квадрат вокруг двух перпендикуляров. Honka JTA.",
    status: "v1",
    appears: "data-only",
  },
  {
    id: "matsuba",
    name: "мацуба",
    reading: "matsuba kagari",
    ja: "松葉かがり",
    family: "other",
    what: "сосновые иглы от центра. Honka JTA.",
    status: "later",
    appears: "data-only",
  },
  {
    id: "maki-kagari",
    name: "маки-кагари",
    reading: "maki kagari",
    ja: "巻きかがり",
    family: "wrap",
    what: "пояса по окружности — намотка, не стежок.",
    status: "v1",
    appears: "data-only",
  },
  {
    id: "jyouge-douji",
    name: "дзёге додзи",
    reading: "jyouge douji kagari",
    ja: "上下同時かがり",
    family: "other",
    what: "merry-go-round: север и юг одновременно.",
    status: "later",
    appears: "data-only",
  },
  {
    id: "kousa",
    name: "коуса",
    reading: "kousa kagari",
    ja: "交差かがり",
    family: "other",
    what: "переплетение поясов.",
    status: "later",
    appears: "data-only",
  },
  {
    id: "nejiri",
    name: "недзири",
    reading: "nejiri kagari",
    ja: "ねじりかがり",
    family: "other",
    what: "скрученное переплетение.",
    status: "later",
    appears: "data-only",
  },
];

export const MOTIF_CATALOG: MotifEntry[] = [
  {
    id: "kiku-8-point",
    family: "kiku",
    name: "кику 8",
    reading: "kiku / 8-layered",
    stitch: "uwagake-chidori",
    requires: "simple",
    skip: 2,
    direction: "outward",
    crossing: "over-all",
    centers: "facing-pole",
    status: "now",
    appears: "dock",
    note: "Классика Simple 8. Два набора по 4 луча. Suess: kiku herringbone.",
    recipe: KIKU_8_POINT,
  },
  {
    id: "kiku-both-poles",
    family: "kiku",
    name: "кику оба полюса",
    reading: "kiku",
    stitch: "uwagake-chidori",
    requires: "simple",
    skip: 2,
    direction: "outward",
    crossing: "over-all",
    centers: "both-poles",
    status: "v1",
    appears: "variant-chip",
    note: "Тот же стежок на юге. Учебный шар.",
  },
  {
    id: "kiku-sakasa",
    family: "kiku",
    name: "сакаса-кику",
    reading: "sakasa kiku",
    stitch: "sakasa",
    requires: "simple",
    skip: 2,
    direction: "inward",
    crossing: "over-all",
    status: "v1",
    appears: "variant-chip",
    note: "Reverse kiku herringbone. От внешнего края к полюсу.",
  },
  {
    id: "kiku-shitagake",
    family: "kiku",
    name: "ситагакэ-кику",
    reading: "shitagake kiku",
    stitch: "shitagake",
    requires: "simple",
    skip: 2,
    direction: "outward",
    crossing: "under",
    status: "later",
    appears: "variant-chip",
    note: "Descending herringbone. Ряд под предыдущим.",
  },
  {
    id: "kiku-sujidate",
    family: "kiku",
    name: "судзидагику",
    reading: "sujidagiku",
    stitch: "sujidate",
    requires: "simple",
    skip: 2,
    direction: "outward",
    crossing: "over-1",
    status: "later",
    appears: "variant-chip",
    note: "Ribbed kiku. Увагакэ через один ряд.",
  },
  {
    id: "kiku-16",
    family: "kiku",
    name: "кику 16",
    reading: "16-layered kiku",
    stitch: "uwagake-chidori",
    requires: "simple",
    skip: 1,
    direction: "outward",
    crossing: "over-all",
    status: "later",
    appears: "variant-chip",
    note: "Suess 16-layered. Skip 1 / S16. Не этот этап.",
  },
  {
    id: "hoshi",
    family: "hoshi",
    name: "хоси",
    reading: "hoshi kagari",
    stitch: "chidori",
    requires: "c10",
    status: "v1",
    appears: "dock",
    note: "Пятиконечная; ход 1-3-5-2-4. Иконка — заглушка.",
  },
  {
    id: "hishi",
    family: "hishi",
    name: "хиси",
    reading: "hishi",
    stitch: "sankaku",
    requires: "c8",
    status: "v1",
    appears: "dock",
    note: "Вложенный ромб по готовой грани. Заглушка.",
  },
  {
    id: "obi",
    family: "obi",
    name: "оби",
    reading: "obi / maki kagari",
    stitch: "maki-kagari",
    requires: "any",
    status: "v1",
    appears: "dock",
    note: "Малые круги у экватора.",
  },
  {
    id: "shikaku",
    family: "shikaku",
    name: "сикаку",
    reading: "shikaku / masu",
    stitch: "shikaku",
    requires: "simple",
    status: "v1",
    appears: "data-only",
    note: "Honka: квадрат на S4/S8.",
  },
  {
    id: "asanoha",
    family: "asanoha",
    name: "асаноха",
    reading: "asa no ha",
    stitch: "kousa",
    requires: "c8",
    status: "later",
    appears: "data-only",
    note: "Не этот этап (#54).",
  },
  {
    id: "bara",
    family: "bara",
    name: "бара",
    reading: "bara",
    stitch: "uwagake-chidori",
    requires: "c10",
    status: "later",
    appears: "data-only",
    note: "Не этот этап (#54).",
  },
];

/** Icons that belong in the craft row right now. */
export function dockMotifs() {
  const families = new Set<MotifFamily>();
  const out: MotifEntry[] = [];
  for (const m of MOTIF_CATALOG) {
    if (m.status !== "now" || m.appears !== "dock") continue;
    if (families.has(m.family)) continue;
    families.add(m.family);
    out.push(m);
  }
  return out;
}

/** Chips under the selected family — only once two variants are honest. */
export function variantChips(family: MotifFamily) {
  const now = MOTIF_CATALOG.filter((m) => m.family === family && m.status === "now");
  if (now.length < 2) return [];
  return now;
}

export function nowMotifs() {
  return MOTIF_CATALOG.filter((m) => m.status === "now");
}
