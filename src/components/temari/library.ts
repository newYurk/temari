/**
 * Pattern catalog. The dock shows one name per family; this file is data.
 *
 *   family     the pattern (kiku, hoshi, …) — what the player picks
 *   id         one implementation of that pattern on a division
 *   compatibility  exact division claims and their evidence, not runtime support
 *   recipe     geometry / stitch order (compileKiku reads this)
 *   names      ja / reading / en / ru — never a book number
 *   note       sources, if any (TemariKai, Ozaki, Suess GT14 as a match)
 *
 * A book heading is a footnote, not an id. New division = new row + compiler,
 * not a GT-number and not a slider.
 */

import { MARI_SIZES, STITCH_THREAD_MM, WRAP_THREAD_MM } from "./measure.ts";
import { STITCH_THREADS, type ThreadKind } from "./thread.ts";
import { KIKU_8_POINT, type Crossing, type PatternRecipe } from "./kagari.ts";
import type { DivisionId } from "./division-config.ts";

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
  /** Толщина берётся из таблиц measure.ts / thread.ts, здесь её не заводят. */
  mm: number;
  /** Как эта нить рисуется, если рендер её умеет. */
  kind?: ThreadKind;
  names: CatalogName;
  note: string;
  status: CatalogStatus;
};

export type DivisionEntry = {
  id: DivisionId;
  names: CatalogName;
  kind: "simple" | "combination" | "extra";
  poles?: number;
  /** Сколько лучей сходится в центре; у комбинированных — сорта центров. */
  rays?: string;
  /** Разметка, поверх которой эта строится. */
  builtOn?: DivisionId;
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

/**
 * An evidence-backed claim is not implementation or human acceptance.
 * Unlisted combinations are unknown, NOT impossible in the craft.
 */
export type DivisionCompatibility =
  | {
      state: "documented";
      divisionIds: readonly [DivisionId, ...DivisionId[]];
      sourceUrls: readonly [string, ...string[]];
      note: string;
    }
  | {
      state: "unverified";
      divisionIds: readonly [DivisionId, ...DivisionId[]];
      note: string;
    }
  | {
      state: "unknown";
      family?: "simple" | "combination" | "extra";
      note: string;
    };

/** One catalogue variant. Only entries with a matching runtime recipe execute. */
export type MotifEntry = {
  /** Implementation key (`kiku-8-point`). Never a Suess / GT id. */
  id: string;
  /** Pattern the player names. Several rows may share a family. */
  family: MotifFamily;
  names: CatalogName;
  stitch: string;
  compatibility: DivisionCompatibility;
  skip?: 1 | 2;
  direction?: "outward" | "inward";
  crossing?: Crossing;
  centers?: "facing-pole" | "both-poles";
  status: CatalogStatus;
  appears: AppearsIn;
  /** Craft note + bibliography if a source matches this sew, not the law. */
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
  { id: "wrap-sew", role: "wrap", mm: WRAP_THREAD_MM.sew.mm, kind: "serger", names: n("縫い糸", "nui-ito", "sewing thread", "швейная"), note: WRAP_THREAD_MM.sew.what, status: "now" },
  { id: "pearl-5", role: "kagari", mm: STITCH_THREAD_MM.pearl5, kind: "pearl5", names: n("パール5", "pearl 5", "pearl cotton #5", "перле 5"), note: "TemariKai: 7 × #5 = 0.5 см", status: "now" },
  { id: "pearl-8", role: "kagari", mm: STITCH_THREAD_MM.pearl8, kind: "pearl8", names: n("パール8", "pearl 8", "pearl cotton #8", "перле 8"), note: "тоньше кагари", status: "v1" },
  { id: "mark-metallic", role: "mark", mm: STITCH_THREAD_MM.mark, kind: "metallic", names: n("地割り糸", "jiwari-ito", "marking thread", "дзивари"), note: "металлик / тонкая разметочная", status: "now" },
  { id: "hana-ito", role: "kagari", mm: STITCH_THREADS.hana.mm, names: n("花糸", "hana-ito", "flower thread / silk", "хана-ито"), note: "шёлк; picker не сейчас (#76)", status: "later" },
  { id: "bunka", role: "kagari", mm: STITCH_THREADS.bunka.mm, names: n("文化糸", "bunka-ito", "bunka", "бунка"), note: "не этот этап", status: "later" },
];

export const DIVISION_CATALOG: DivisionEntry[] = [
  { id: "s8", names: n("単純8等分", "tanjyun 8 toubun", "Simple 8", "простое 8"), kind: "simple", poles: 2, rays: "8 лучей у каждого полюса", status: "now", appears: "dock", note: "Два полюса, экватор, 8 лучей. Учебный старт." },
  { id: "c8", names: n("8等分の組み合わせ", "hachitobun no kumiawase", "C8", "C8"), kind: "combination", poles: 6, rays: "6 центров по 8 лучей и 8 центров по 6", builtOn: "s8", status: "now", appears: "dock", note: "6 восьмилучевых центров." },
  { id: "c10", names: n("10等分の組み合わせ", "jutobun no kumiawase", "C10", "C10"), kind: "combination", poles: 12, rays: "12 центров по 10 лучей", builtOn: "s10", status: "v1", appears: "dock", note: "12 десятилучевых. Серый, пока C8 честный." },
  { id: "s4", names: n("単純4等分", "tanjyun 4 toubun", "Simple 4", "простое 4"), kind: "simple", poles: 2, rays: "4 луча у каждого полюса", status: "v1", appears: "data-only", note: "В каталоге указан Suess Autumn Moon. Это не ограничивает другие узоры на Simple 4." },
  { id: "s10", names: n("単純10等分", "tanjyun 10 toubun", "Simple 10", "простое 10"), kind: "simple", poles: 2, rays: "10 лучей у каждого полюса", status: "v1", appears: "data-only", note: "База для C10." },
  { id: "s16", names: n("単純16等分", "tanjyun 16 toubun", "Simple 16", "простое 16"), kind: "simple", poles: 2, rays: "16 лучей у каждого полюса", status: "later", appears: "data-only", note: "Заявлено для «кику 16»; требуется сверка конкретного источника." },
  { id: "c6", names: n("6等分の組み合わせ", "combination 6", "C6", "C6"), kind: "combination", status: "later", appears: "data-only", note: "Suess workbook, не стандарт JTA." },
  { id: "double-c8", names: n("二重8組み合わせ", "double C8", "Double C8", "двойное C8"), kind: "combination", builtOn: "c8", status: "later", appears: "data-only", note: "Suess workbook." },
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
    names: n("菊かがり", "kiku kagari", "Chrysanthemum", "Кику"),
    stitch: "uwagake-chidori",
    compatibility: {
      state: "documented",
      divisionIds: ["s8"],
      sourceUrls: ["https://www.temarikai.com/PatternsPages/Simple/GT14.html"],
      note: "Контрольный вариант на Simple 8. Другие разметки семейства кику этим рецептом не описаны.",
    },
    skip: 2,
    direction: "outward",
    crossing: "over-all",
    centers: "facing-pole",
    status: "now",
    appears: "dock",
    note: "Полюсная кику на Simple 8, compileKiku. TemariKai / Ozaki beginner. Suess GT14 — совпадающий вариант, не имя в игре.",
    recipe: KIKU_8_POINT,
  },
  {
    id: "kiku-both-poles",
    family: "kiku",
    names: n("菊（両極）", "kiku both poles", "kiku both poles", "кику оба полюса"),
    stitch: "uwagake-chidori",
    compatibility: {
      state: "unverified", divisionIds: ["s8"],
      note: "Каталог описывает композицию на двух полюсах S8; отдельного рецепта этой строки нет.",
    },
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
    compatibility: {
      state: "unknown", family: "simple",
      note: "В старом каталоге было только семейство Simple; точное деление и рецепт не установлены.",
    },
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
    compatibility: {
      state: "unknown", family: "simple",
      note: "В старом каталоге было только семейство Simple; точное деление и рецепт не установлены.",
    },
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
    compatibility: {
      state: "unknown", family: "simple",
      note: "В старом каталоге было только семейство Simple; точное деление и рецепт не установлены.",
    },
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
    compatibility: {
      state: "unverified", divisionIds: ["s16"],
      note: "S16 заявлено в заметке Suess 16-layered / Skip 1. Требуется сверка конкретного источника; это не готовый рецепт.",
    },
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
    compatibility: {
      state: "unverified", divisionIds: ["c10"],
      note: "C10 заявлено прежним каталогом; источник конкретного варианта и рецепт не проверены.",
    },
    status: "v1",
    appears: "dock",
    note: "ход 1-3-5-2-4. Иконка — заглушка.",
  },
  {
    id: "hishi",
    family: "hishi",
    names: n("菱", "hishi", "diamond", "хиси"),
    stitch: "sankaku",
    compatibility: {
      state: "unverified", divisionIds: ["c8"],
      note: "C8 заявлено прежним каталогом; источник конкретного варианта и рецепт не проверены.",
    },
    status: "v1",
    appears: "dock",
    note: "Вложенный ромб по готовой грани. Заглушка.",
  },
  {
    id: "obi",
    family: "obi",
    names: n("帯", "obi", "sash / equatorial band", "оби"),
    stitch: "maki-kagari",
    compatibility: {
      state: "unknown",
      note: "Прежнее any не задаёт ни разметку, ни границы полосы. Нужен конкретный вариант оби.",
    },
    status: "v1",
    appears: "dock",
    note: "Малые круги у экватора.",
  },
  {
    id: "shikaku",
    family: "shikaku",
    names: n("四角", "shikaku", "square", "сикаку"),
    stitch: "shikaku",
    compatibility: {
      state: "unverified", divisionIds: ["s4", "s8"],
      note: "S4/S8 заявлены заметкой Honka; источник конкретного варианта и рецепт не проверены.",
    },
    status: "v1",
    appears: "data-only",
    note: "Honka: квадрат на S4/S8.",
  },
  {
    id: "asanoha",
    family: "asanoha",
    names: n("麻の葉", "asa no ha", "hemp leaf / flax leaf", "асаноха"),
    stitch: "kousa",
    compatibility: {
      state: "unverified", divisionIds: ["c8"],
      note: "C8 заявлено прежним каталогом; источник конкретного варианта и рецепт не проверены.",
    },
    status: "later",
    appears: "data-only",
    note: "Не этот этап (#54).",
  },
  {
    id: "bara",
    family: "bara",
    names: n("薔薇", "bara", "rose", "бара"),
    stitch: "uwagake-chidori",
    compatibility: {
      state: "unverified", divisionIds: ["c10"],
      note: "C10 заявлено прежним каталогом; источник конкретного варианта и рецепт не проверены.",
    },
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
