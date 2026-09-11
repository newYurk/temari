/**
 * Workshop catalogs from Suess glossary + Divisions & Markings,
 * cross-checked with TemariKai. Data only — the dock never dumps this list.
 *
 * Names: store four, show one.
 *   id        machine key, English kebab (uwagake-chidori)
 *   names.ja  上掛け千鳥かがり — canonical, matches the books
 *   names.reading  Hepburn, TemariKai/Suess
 *   names.en  book heading for lookup, never a craft button
 *   names.ru  current UI
 */

import { MARI_SIZES, STITCH_THREAD_MM, WRAP_THREAD_MM } from "./measure.ts";
import { KIKU_8_POINT, type Crossing, type PatternRecipe } from "./kagari.ts";

export type CatalogStatus = "now" | "v1" | "later";
export type AppearsIn = "dock" | "variant-chip" | "data-only";
export type MotifFamily = "kiku" | "hoshi" | "hishi" | "obi" | "shikaku" | "matsuba" | "mitsubane" | "asanoha" | "bara";
export type LabelSurface = "ui" | "status" | "book";

export type CatalogName = {
  ja: string;
  reading: string;
  en: string;
  ru: string;
};

function n(ja: string, reading: string, en: string, ru: string): CatalogName {
  return { ja, reading, en, ru };
}

/** ui = screen language; status = tooltip; book = design-doc / look-up. */
export function catalogLabel(names: CatalogName, surface: LabelSurface) {
  if (surface === "ui") return names.ru;
  if (surface === "status") return `${names.reading} · ${names.ja}`;
  return `${names.ja}（${names.reading}）`;
}

export type YarnEntry = {
  id: string;
  role: "wrap" | "mark" | "kagari";
  mm: number;
  names: CatalogName;
  note: string;
  status: CatalogStatus;
};

export type DivisionEntry = {
  id: string;
  names: CatalogName;
  kind: "simple" | "combination" | "extra";
  poles?: number;
  status: CatalogStatus;
  appears: AppearsIn;
  note: string;
};

export type StitchEntry = {
  id: string;
  names: CatalogName;
  family: "chidori" | "polygon" | "wrap" | "other";
  what: string;
  status: CatalogStatus;
  appears: AppearsIn;
};

export type MotifEntry = {
  id: string;
  family: MotifFamily;
  names: CatalogName;
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
  { id: "wrap-yarn", role: "wrap", mm: WRAP_THREAD_MM.yarn.mm, names: n("毛糸", "keito", "yarn", "пряжа"), note: WRAP_THREAD_MM.yarn.what, status: "now" },
  { id: "wrap-fine", role: "wrap", mm: WRAP_THREAD_MM.fine.mm, names: n("細い毛糸", "hosoi keito", "fine yarn", "тоньше"), note: WRAP_THREAD_MM.fine.what, status: "now" },
  { id: "wrap-sew", role: "wrap", mm: WRAP_THREAD_MM.sew.mm, names: n("縫い糸", "nui-ito", "sewing thread", "швейная"), note: WRAP_THREAD_MM.sew.what, status: "now" },
  { id: "pearl-5", role: "kagari", mm: STITCH_THREAD_MM.pearl5, names: n("パール5", "pearl 5", "pearl cotton #5", "перле 5"), note: "TemariKai: 7 × #5 = 0.5 см", status: "now" },
  { id: "pearl-8", role: "kagari", mm: STITCH_THREAD_MM.pearl8, names: n("パール8", "pearl 8", "pearl cotton #8", "перле 8"), note: "тоньше кагари", status: "v1" },
  { id: "mark-metallic", role: "mark", mm: STITCH_THREAD_MM.mark, names: n("地割り糸", "jiwari-ito", "marking thread", "дзивари"), note: "металлик / тонкая разметочная", status: "now" },
  { id: "hana-ito", role: "kagari", mm: 0.4, names: n("花糸", "hana-ito", "flower thread / silk", "хана-ито"), note: "шёлк; picker не сейчас (#76)", status: "later" },
  { id: "bunka", role: "kagari", mm: 0.9, names: n("文化糸", "bunka-ito", "bunka", "бунка"), note: "не этот этап", status: "later" },
];

export const DIVISION_CATALOG: DivisionEntry[] = [
  { id: "s8", names: n("単純8等分", "tanjyun 8 toubun", "Simple 8", "простое 8"), kind: "simple", poles: 2, status: "now", appears: "dock", note: "Два полюса, экватор, 8 лучей. Учебный старт." },
  { id: "c8", names: n("8等分の組み合わせ", "hachitobun no kumiawase", "C8", "C8"), kind: "combination", poles: 6, status: "now", appears: "dock", note: "6 восьмилучевых центров." },
  { id: "c10", names: n("10等分の組み合わせ", "jutobun no kumiawase", "C10", "C10"), kind: "combination", poles: 12, status: "v1", appears: "dock", note: "12 десятилучевых. Серый, пока C8 честный." },
  { id: "s4", names: n("単純4等分", "tanjyun 4 toubun", "Simple 4", "простое 4"), kind: "simple", poles: 2, status: "v1", appears: "data-only", note: "Suess Autumn Moon. Не кику." },
  { id: "s10", names: n("単純10等分", "tanjyun 10 toubun", "Simple 10", "простое 10"), kind: "simple", poles: 2, status: "v1", appears: "data-only", note: "База для C10." },
  { id: "s16", names: n("単純16等分", "tanjyun 16 toubun", "Simple 16", "простое 16"), kind: "simple", poles: 2, status: "later", appears: "data-only", note: "16-слойное кику." },
  { id: "c6", names: n("6等分の組み合わせ", "combination 6", "C6", "C6"), kind: "combination", status: "later", appears: "data-only", note: "Suess workbook, не стандарт JTA." },
  { id: "double-c8", names: n("二重8組み合わせ", "double C8", "Double C8", "двойное C8"), kind: "combination", status: "later", appears: "data-only", note: "Suess workbook." },
  { id: "tamentai", names: n("多面体", "tamentai", "multicenter marking", "таментай"), kind: "extra", status: "later", appears: "data-only", note: "Не этот этап (#54)." },
];

export const STITCH_CATALOG: StitchEntry[] = [
  {
    id: "uwagake-chidori",
    names: n("上掛け千鳥かがり", "uwagake chidori kagari", "kiku herringbone", "увагакэ тидори"),
    family: "chidori",
    what: "зигзаг, у внутреннего угла нить поверх всех предыдущих рядов. Suess зовёт kiku herringbone — это не западный шов.",
    status: "now",
    appears: "variant-chip",
  },
  {
    id: "chidori",
    names: n("千鳥かがり", "chidori kagari", "single herringbone / zigzag", "тидори"),
    family: "chidori",
    what: "тот же зигзаг, укус 1–2 мм, без нахлёста пачки.",
    status: "v1",
    appears: "variant-chip",
  },
  {
    id: "sakasa",
    names: n("逆さ上掛け千鳥かがり", "sakasa uwagake chidori kagari", "reverse kiku herringbone", "сакаса увагакэ"),
    family: "chidori",
    what: "от края фигуры к полюсу.",
    status: "v1",
    appears: "variant-chip",
  },
  {
    id: "shitagake",
    names: n("下掛け千鳥かがり", "shitagake chidori kagari", "descending herringbone", "ситагакэ тидори"),
    family: "chidori",
    what: "следующий ряд под предыдущим.",
    status: "later",
    appears: "variant-chip",
  },
  {
    id: "sujidate",
    names: n("筋立て菊", "sujidagiku", "ribbed kiku herringbone", "судзидагику"),
    family: "chidori",
    what: "увагакэ только через один ряд (over-1).",
    status: "later",
    appears: "variant-chip",
  },
  {
    id: "sankaku",
    names: n("三角かがり", "sankaku kagari", "triangle stitching", "санкаку"),
    family: "polygon",
    what: "треугольник за круг по трём сторонам грани.",
    status: "v1",
    appears: "data-only",
  },
  {
    id: "shikaku",
    names: n("四角かがり", "shikaku kagari", "square stitching", "сикаку"),
    family: "polygon",
    what: "квадрат вокруг двух перпендикуляров. Honka JTA. Также masu kagari.",
    status: "v1",
    appears: "data-only",
  },
  {
    id: "matsuba",
    names: n("松葉かがり", "matsuba kagari", "pine-needle stitch", "мацуба"),
    family: "other",
    what: "сосновые иглы от центра. Honka JTA.",
    status: "later",
    appears: "data-only",
  },
  {
    id: "maki-kagari",
    names: n("巻きかがり", "maki kagari", "wrapped bands", "маки-кагари"),
    family: "wrap",
    what: "пояса по окружности — намотка, не стежок.",
    status: "v1",
    appears: "data-only",
  },
  {
    id: "jyouge-douji",
    names: n("上下同時かがり", "jyouge douji kagari", "merry-go-round", "дзёге додзи"),
    family: "other",
    what: "север и юг одновременно.",
    status: "later",
    appears: "data-only",
  },
  {
    id: "kousa",
    names: n("交差かがり", "kousa kagari", "interwoven / layered stitching", "коуса"),
    family: "other",
    what: "переплетение поясов.",
    status: "later",
    appears: "data-only",
  },
  {
    id: "nejiri",
    names: n("ねじりかがり", "nejiri kagari", "interlocking / twisted", "недзири"),
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
    names: n("菊", "kiku", "chrysanthemum, 8-point", "кику 8"),
    stitch: "uwagake-chidori",
    requires: "simple",
    skip: 2,
    direction: "outward",
    crossing: "over-all",
    centers: "facing-pole",
    status: "now",
    appears: "dock",
    note: "Классика Simple 8. Два набора по 4 луча.",
    recipe: KIKU_8_POINT,
  },
  {
    id: "kiku-both-poles",
    family: "kiku",
    names: n("菊（両極）", "kiku both poles", "kiku both poles", "кику оба полюса"),
    stitch: "uwagake-chidori",
    requires: "simple",
    skip: 2,
    direction: "outward",
    crossing: "over-all",
    centers: "both-poles",
    status: "v1",
    appears: "variant-chip",
    note: "Тот же стежок на юге. Студия поворачивает шар после северного цветка — чип не нужен.",
  },
  {
    id: "kiku-sakasa",
    family: "kiku",
    names: n("逆さ菊", "sakasa kiku", "reverse kiku", "сакаса-кику"),
    stitch: "sakasa",
    requires: "simple",
    skip: 2,
    direction: "inward",
    crossing: "over-all",
    status: "v1",
    appears: "variant-chip",
    note: "От внешнего края к полюсу.",
  },
  {
    id: "kiku-shitagake",
    family: "kiku",
    names: n("下掛け菊", "shitagake kiku", "descending kiku", "ситагакэ-кику"),
    stitch: "shitagake",
    requires: "simple",
    skip: 2,
    direction: "outward",
    crossing: "under",
    status: "later",
    appears: "variant-chip",
    note: "Ряд под предыдущим.",
  },
  {
    id: "kiku-sujidate",
    family: "kiku",
    names: n("筋立て菊", "sujidagiku", "ribbed kiku", "судзидагику"),
    stitch: "sujidate",
    requires: "simple",
    skip: 2,
    direction: "outward",
    crossing: "over-1",
    status: "later",
    appears: "variant-chip",
    note: "Увагакэ через один ряд.",
  },
  {
    id: "kiku-16",
    family: "kiku",
    names: n("16段菊", "16-layered kiku", "16-layered kiku", "кику 16"),
    stitch: "uwagake-chidori",
    requires: "simple",
    skip: 1,
    direction: "outward",
    crossing: "over-all",
    status: "later",
    appears: "variant-chip",
    note: "Suess 16-layered. Skip 1 / S16.",
  },
  {
    id: "hoshi",
    family: "hoshi",
    names: n("星かがり", "hoshi kagari", "5-point star", "хоси"),
    stitch: "chidori",
    requires: "c10",
    status: "v1",
    appears: "dock",
    note: "ход 1-3-5-2-4. Иконка — заглушка.",
  },
  {
    id: "hishi",
    family: "hishi",
    names: n("菱", "hishi", "diamond", "хиси"),
    stitch: "sankaku",
    requires: "c8",
    status: "v1",
    appears: "dock",
    note: "Вложенный ромб по готовой грани. Заглушка.",
  },
  {
    id: "obi",
    family: "obi",
    names: n("帯", "obi", "sash / equatorial band", "оби"),
    stitch: "maki-kagari",
    requires: "any",
    status: "v1",
    appears: "dock",
    note: "Малые круги у экватора.",
  },
  {
    id: "shikaku",
    family: "shikaku",
    names: n("四角", "shikaku", "square", "сикаку"),
    stitch: "shikaku",
    requires: "simple",
    status: "v1",
    appears: "data-only",
    note: "Honka: квадрат на S4/S8.",
  },
  {
    id: "asanoha",
    family: "asanoha",
    names: n("麻の葉", "asa no ha", "hemp leaf / flax leaf", "асаноха"),
    stitch: "kousa",
    requires: "c8",
    status: "later",
    appears: "data-only",
    note: "Не этот этап (#54).",
  },
  {
    id: "bara",
    family: "bara",
    names: n("薔薇", "bara", "rose", "бара"),
    stitch: "uwagake-chidori",
    requires: "c10",
    status: "later",
    appears: "data-only",
    note: "Не этот этап (#54).",
  },
];

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

export function variantChips(family: MotifFamily) {
  const now = MOTIF_CATALOG.filter((m) => m.family === family && m.status === "now");
  if (now.length < 2) return [];
  return now;
}

export function nowMotifs() {
  return MOTIF_CATALOG.filter((m) => m.status === "now");
}
