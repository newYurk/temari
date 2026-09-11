/**
 * Workshop shelves — not a picker UI.
 * Four catalogs the engine already consumes in pieces:
 * mari size, yarn, stitch, motif recipe.
 * Status is the contract: now = executable, v1 = after honest kiku, later = not this stage.
 */

import { MARI_SIZES, STITCH_THREAD_MM, WRAP_THREAD_MM } from "./measure.ts";
import { KIKU_8_POINT, type PatternRecipe } from "./kagari.ts";

export type CatalogStatus = "now" | "v1" | "later";

export type YarnEntry = {
  id: string;
  role: "wrap" | "mark" | "kagari";
  mm: number;
  label: string;
  note: string;
  status: CatalogStatus;
};

export type StitchEntry = {
  id: string;
  name: string;
  reading: string;
  ja: string;
  what: string;
  status: CatalogStatus;
};

export type MotifEntry = {
  id: string;
  name: string;
  reading: string;
  stitch: string;
  requires: "simple" | "c8" | "c10" | "any";
  status: CatalogStatus;
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

export const STITCH_CATALOG: StitchEntry[] = [
  {
    id: "uwagake-chidori",
    name: "увагакэ тидори",
    reading: "uwagake chidori kagari",
    ja: "上掛け千鳥かがり",
    what: "зигзаг; у внутреннего угла нить поверх уже лежащих рядов и подхват всех. Не западный herringbone.",
    status: "now",
  },
  {
    id: "chidori",
    name: "тидори",
    reading: "chidori kagari",
    ja: "千鳥かがり",
    what: "тот же зигзаг без нахлёста поверх пачки. Укус 1–2 мм.",
    status: "v1",
  },
  {
    id: "sakasa",
    name: "сакаса увагакэ",
    reading: "sakasa uwagake",
    ja: "逆さ上掛け",
    what: "то же, от края фигуры к полюсу — фигура густеет внутрь.",
    status: "v1",
  },
  {
    id: "shitagake",
    name: "ситагакэ тидори",
    reading: "shitagake chidori kagari",
    ja: "下掛け千鳥かがり",
    what: "ряд прячется под предыдущий (descending). Не кику этого этапа.",
    status: "later",
  },
  {
    id: "sujidate",
    name: "судзидатэ",
    reading: "sujidate uwagake",
    ja: "筋立て",
    what: "увагакэ только через один предыдущий ряд (over-1).",
    status: "later",
  },
  {
    id: "sankaku",
    name: "санкаку",
    reading: "sankaku kagari",
    ja: "三角かがり",
    what: "треугольник за круг по трём сторонам грани.",
    status: "v1",
  },
  {
    id: "matsuba",
    name: "мацуба",
    reading: "matsuba kagari",
    ja: "松葉かがり",
    what: "прямые сосновые иглы от центра.",
    status: "later",
  },
  {
    id: "maki-kagari",
    name: "маки-кагари",
    reading: "maki kagari",
    ja: "巻きかがり",
    what: "пояса по окружности — намотка, не стежок.",
    status: "v1",
  },
  {
    id: "kousa",
    name: "коуса",
    reading: "kousa kagari",
    ja: "交差かがり",
    what: "переплетение поясов. Не кику.",
    status: "later",
  },
];

export const MOTIF_CATALOG: MotifEntry[] = [
  {
    id: "kiku-8-point",
    name: "кику 8",
    reading: "kiku",
    stitch: "uwagake-chidori",
    requires: "simple",
    status: "now",
    note: "Simple 8, два набора по 4 луча, внутренние метки 1 см, низ ⅓ от экватора, растяжка внешнего угла.",
    recipe: KIKU_8_POINT,
  },
  {
    id: "kiku-both-poles",
    name: "кику оба полюса",
    reading: "kiku",
    stitch: "uwagake-chidori",
    requires: "simple",
    status: "v1",
    note: "Тот же рецепт на юге. Учебный шар.",
  },
  {
    id: "kiku-16",
    name: "кику 16",
    reading: "kiku",
    stitch: "uwagake-chidori",
    requires: "simple",
    status: "later",
    note: "S16 / skip 1. Не этот этап.",
  },
  {
    id: "sakasa-kiku",
    name: "сакаса-кику",
    reading: "sakasa kiku",
    stitch: "sakasa",
    requires: "simple",
    status: "v1",
    note: "От внешнего края к полюсу.",
  },
  {
    id: "hoshi",
    name: "хоси",
    reading: "hoshi",
    stitch: "chidori",
    requires: "c10",
    status: "v1",
    note: "Пятиконечная; ход 1-3-5-2-4. Иконка в доке — заглушка.",
  },
  {
    id: "hishi",
    name: "хиси",
    reading: "hishi",
    stitch: "sankaku",
    requires: "c8",
    status: "v1",
    note: "Вложенный ромб по готовой грани. Иконка — заглушка.",
  },
  {
    id: "obi",
    name: "оби",
    reading: "obi / maki kagari",
    stitch: "maki-kagari",
    requires: "any",
    status: "v1",
    note: "Малые круги у экватора + крестик на меридиане.",
  },
  {
    id: "asanoha",
    name: "асаноха",
    reading: "asa no ha",
    stitch: "kousa",
    requires: "c8",
    status: "later",
    note: "Не этот этап (#54).",
  },
  {
    id: "bara",
    name: "бара",
    reading: "bara",
    stitch: "uwagake-chidori",
    requires: "c10",
    status: "later",
    note: "Не этот этап (#54).",
  },
];

export function nowMotifs() {
  return MOTIF_CATALOG.filter((m) => m.status === "now");
}
