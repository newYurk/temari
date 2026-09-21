import { DIVISION_CATALOG, MOTIF_CATALOG, STITCH_CATALOG } from "./library.ts";
import { catalogImplementation } from "./catalog-compatibility.ts";
import { DIVISION_IDS } from "./division-config.ts";

export const COVERAGE_BASIS = {
  url: "https://www.temarikai.com/ResourcesPages/jtacertification.html",
  updated: "2017-04",
  checked: "2026-09-21",
  currentJtaRequirementsConfirmed: false,
  scope: "Техники четырёх уровней в описании TemariKai, не официальная сертификация программы.",
  rights: "Ссылки и собственный пересказ; разрешение на распространение материалов источника не получено.",
} as const;

export const CRAFT_LEVELS = ["honka", "koutouka", "shihan", "kyoujyu"] as const;
export type CraftLevel = typeof CRAFT_LEVELS[number];
export type RequirementKind = "preparation" | "marking" | "stitch" | "composition" | "workflow";
export type CatalogReference = { kind: "division" | "stitch" | "motif"; id: string };
type RequirementName = { catalog: CatalogReference; label?: never } | { label: string; catalog?: never };

export type CraftRequirement = RequirementName & {
  id: string;
  firstLevel: CraftLevel;
  kind: RequirementKind;
  aliases: readonly string[];
  /** A linked lesson is not a reviewed, executable recipe. */
  lessonUrls: readonly string[];
  /** Proposed implementation dependencies, not an official JTA syllabus. */
  prerequisiteIds: readonly string[];
  limits: string;
};

const lesson = (path: string) => `https://www.temarikai.com/${path}`;
const entry = (
  id: string, firstLevel: CraftLevel, kind: RequirementKind, name: RequirementName,
  path: string, prerequisiteIds: readonly string[] = [], aliases: readonly string[] = [],
  limits = "Точный маршрут, параметры и контрольный рецепт ещё требуют проверки.",
): CraftRequirement => ({
  id, firstLevel, kind, ...name, aliases, lessonUrls: path ? [lesson(path)] : [],
  prerequisiteIds, limits,
});
const stitch = (id: string): RequirementName => ({ catalog: { kind: "stitch", id } });
const motif = (id: string): RequirementName => ({ catalog: { kind: "motif", id } });
const division = (id: string): RequirementName => ({ catalog: { kind: "division", id } });

export const CRAFT_REQUIREMENTS: readonly CraftRequirement[] = [
  entry("mari", "honka", "preparation", { label: "Подготовка мари" }, "HowToPages/maritutorial.html", [], [],
    "В текущем образце принята готовая круглая основа; изготовление и деформация ядра не проверены."),
  entry("wrap", "honka", "preparation", { label: "Намотка основы" }, "HowToPages/maritutorial.html", ["mari"], ["maki"],
    "Визуальная подложка не доказывает покрытие намоткой; это не maki kagari."),
  entry("simple", "honka", "marking", { label: "Простые деления S4/S6/S8/S12" }, "HowToPages/simpledivision.html", ["wrap"], [],
    "Runtime simple означает только S8. Наличие каталожного имени S4 не означает исполнения S4."),
  entry("chidori", "honka", "stitch", stitch("chidori"), "HowToPages/ToolKit/chidorikagari.html", ["simple"]),
  entry("matsuba", "honka", "stitch", stitch("matsuba"), "HowToPages/ToolKit/matsuba.html", ["simple"]),
  entry("shikaku", "honka", "stitch", stitch("shikaku"), "HowToPages/ToolKit/masu.html", ["simple"], ["masu kagari"]),
  entry("tsumu", "honka", "composition", { label: "Tsumu" }, "HowToPages/ToolKit/tsumu.html", ["simple"]),
  entry("uwagake", "honka", "stitch", stitch("uwagake-chidori"), "HowToPages/ToolKit/uwagakechidori.html", ["chidori"], [],
    "Есть исполняемый вариант кику S8, но его наличие не подтверждает все ряды, материалы и композиции."),
  entry("mitsubane", "honka", "composition", { label: "Mitsubane kikkou" }, "HowToPages/ToolKit/mitsubanekikkou.html", ["simple"]),
  entry("jyouge-douji", "honka", "workflow", stitch("jyouge-douji"), "HowToPages/ToolKit/jyougedouji.html", ["simple"], [],
    "Согласованная работа от двух полюсов; два отдельно вышитых цветка не доказывают эту технику."),
  entry("hoshi", "honka", "composition", motif("hoshi"), "HowToPages/ToolKit/hoshi.html", ["simple"]),
  entry("nejiri", "honka", "workflow", stitch("nejiri"), "HowToPages/nejiri.html", ["simple"]),
  entry("kousa", "honka", "workflow", stitch("kousa"), "HowToPages/ToolKit/kousa.html", ["simple"]),
  entry("obi", "honka", "composition", motif("obi"), "HowToPages/uwagakekiku.html", ["simple"], [],
    "Пояс входит в контрольную S12-композицию; каталожная запись не является рецептом."),
  entry("c8", "koutouka", "marking", division("c8"), "HowToPages/8combinationdiv.html", ["simple"], ["8 tobun"]),
  entry("c10", "koutouka", "marking", division("c10"), "HowToPages/10combinationdivIntro.html", ["simple"], ["10 tobun"]),
  entry("shitagake", "koutouka", "stitch", stitch("shitagake"), "HowToPages/ToolKit/shitagake.html", ["chidori"]),
  entry("yubinuki", "koutouka", "composition", { label: "Yubinuki" }, "HowToPages/yubinukiobi.html", ["obi"]),
  entry("maki-kagari", "koutouka", "stitch", stitch("maki-kagari"), "HowToPages/ToolKit/maki.html", ["simple"]),
  entry("renzoku", "koutouka", "workflow", { label: "Renzoku kagari" }, "HowToPages/mawashi-renzoku.html", ["c8", "c10"]),
  entry("asanoha", "koutouka", "composition", motif("asanoha"), "HowToPages/asanoha.html", ["kousa"]),
  entry("bara", "koutouka", "composition", motif("bara"), "HowToPages/ToolKit/bara.html", ["uwagake"]),
  entry("kagome", "koutouka", "composition", { label: "Kagome" }, "HowToPages/kagomebasket.html", ["kousa"]),
  entry("hitohudegake", "koutouka", "workflow", { label: "Hitohudegake" }, "PatternsPages/C10/GT57.html", ["c10"], ["hitofudegake"]),
  entry("tamentai", "shihan", "marking", division("tamentai"), "HowToPages/multiplefacemarking1.html", ["c10"]),
  entry("extra-markings", "shihan", "marking", { label: "Дополнительные разметки C8/C10" }, "HowToPages/ExtraMarkings/ExtraMarkingContents.html", ["c8", "c10"]),
  entry("sujidate", "shihan", "stitch", stitch("sujidate"), "HowToPages/ToolKit/sujidateuwagake.html", ["uwagake"]),
  entry("uzu", "shihan", "composition", { label: "Uzu" }, "HowToPages/temariglossary.html", ["renzoku"]),
  entry("sakasa", "shihan", "stitch", stitch("sakasa"), "HowToPages/ToolKit/sakasa.html", ["uwagake"]),
  entry("all-over-kousa", "shihan", "composition", { label: "Полное покрытие kousa" }, "HowToPages/kousastylehelp.html", ["kousa"], [],
    "Нужен контроль непокрытой поверхности и всех контактов, а не только красивый финальный кадр."),
  entry("shishuu", "shihan", "stitch", { label: "Shishuu / свободная вышивка" }, "", ["simple"], [],
    "Указана на странице сертификации; конкретный набор операций ещё не установлен. В продукте — рецепт, не обязательное ручное управление иглой."),
  entry("original-composition", "shihan", "workflow", { label: "Собственные композиции" }, "ResourcesPages/originalcompostion.html", ["c8", "c10"], [],
    "Конструктор сочетает поддерживаемые техники; оригинальность не удостоверяется автоматически."),
  entry("relative-measures", "shihan", "workflow", { label: "Относительные мерки рецепта" }, "", ["original-composition"], [],
    "Именованные интервалы и доли; численные допуски не являются правилами экзамена JTA."),
  entry("polyhedra-variants", "kyoujyu", "marking", { label: "Многогранные варианты на C8/C10" }, "", ["tamentai", "extra-markings"], [],
    "Треугольные, квадратные, пяти- и шестиугольные области; точный перечень контрольных построений открыт."),
  entry("complex-renzoku", "kyoujyu", "workflow", { label: "Сложные renzoku" }, "HowToPages/mawashi-renzoku.html", ["renzoku", "original-composition"]),
  entry("complex-hitohudegake", "kyoujyu", "workflow", { label: "Сложные hitohudegake" }, "PatternsPages/C10/GT57.html", ["hitohudegake", "original-composition"]),
];

export type CraftControl = {
  id: string;
  label: string;
  level: CraftLevel;
  requirementIds: readonly string[];
  division: string;
  /** Null means no exact catalogue recipe has been established, not a family fallback. */
  recipeId: string | null;
};

export const HONKA_CONTROLS: readonly CraftControl[] = [
  { id: "honka-s4", label: "S4: shikaku / masu", level: "honka", requirementIds: ["simple", "shikaku"], division: "s4", recipeId: null },
  { id: "honka-s6", label: "S6: hexagon + mitsubane kikkou", level: "honka", requirementIds: ["simple", "mitsubane"], division: "s6", recipeId: null },
  { id: "honka-s8", label: "S8: jyouge douji", level: "honka", requirementIds: ["simple", "jyouge-douji"], division: "s8", recipeId: null },
  { id: "honka-s12", label: "S12: uwagake / kiku + obi", level: "honka", requirementIds: ["simple", "uwagake", "obi"], division: "s12", recipeId: null },
];

export type EvidenceStage = "designed" | "implemented" | "numerical" | "visual" | "human";
export type CraftEvidence = {
  requirementId: string;
  stage: EvidenceStage;
  artifact: string;
  revision: string;
  scope: string;
  completeRequirement: boolean;
};

export const CRAFT_EVIDENCE: readonly CraftEvidence[] = [
  {
    requirementId: "uwagake", stage: "numerical", artifact: "spec/s8-two-threads.md",
    revision: "d2242e7", scope: "Исторический численный образец S8, C230, один полюс, A1/B1; не многорядная композиция.",
    completeRequirement: false,
  },
];

export function requirementLabel(requirement: CraftRequirement): string {
  if (!requirement.catalog) return requirement.label;
  const { kind, id } = requirement.catalog;
  const catalog = kind === "division" ? DIVISION_CATALOG : kind === "stitch" ? STITCH_CATALOG : MOTIF_CATALOG;
  const found = catalog.find((item) => item.id === id);
  if (!found) throw new Error(`${requirement.id}: unknown ${kind} catalogue reference ${id}`);
  return found.names.reading;
}

export function requirementsForLevel(level: CraftLevel, includePrerequisites = true): CraftRequirement[] {
  const index = CRAFT_LEVELS.indexOf(level);
  if (index < 0) throw new Error(`Unknown craft level: ${level}`);
  return CRAFT_REQUIREMENTS.filter((requirement) => includePrerequisites
    ? CRAFT_LEVELS.indexOf(requirement.firstLevel) <= index : requirement.firstLevel === level);
}

export function controlImplementation(control: CraftControl) {
  if (!control.recipeId) return { implemented: false, reason: "Точный контрольный рецепт ещё не установлен." };
  const recipe = MOTIF_CATALOG.find((item) => item.id === control.recipeId);
  if (!recipe) throw new Error(`${control.id}: unknown catalogue recipe ${control.recipeId}`);
  const divisionId = DIVISION_IDS.find((id) => id === control.division);
  if (!divisionId) return { implemented: false, reason: "Точное деление ещё не подключено к каталогу." };
  return catalogImplementation(recipe, divisionId);
}

export function requirementProgress(id: string, evidence: readonly CraftEvidence[] = CRAFT_EVIDENCE) {
  const requirement = CRAFT_REQUIREMENTS.find((item) => item.id === id);
  if (!requirement) throw new Error(`Unknown craft requirement: ${id}`);
  const records = evidence.filter((item) => item.requirementId === id);
  const examples = MOTIF_CATALOG
    .filter((item) => requirement.catalog?.kind === "motif" ? item.id === requirement.catalog.id
      : requirement.catalog?.kind === "stitch" && item.stitch === requirement.catalog.id)
    .flatMap((item) => item.recipe ? [{ id: item.id, division: item.recipe.divisionId,
      ...catalogImplementation(item, item.recipe.divisionId) }] : []);
  const stages: readonly EvidenceStage[] = ["designed", "implemented", "numerical", "visual", "human"];
  return {
    listedBySource: true,
    runtimeExamples: examples,
    stages: stages.map((stage) => ({
      stage,
      status: records.some((item) => item.stage === stage && item.completeRequirement) ? "complete"
        : records.some((item) => item.stage === stage) ? "partial" : "unverified",
    })),
    evidence: records,
  };
}

export function validateCraftCoverage(
  requirements: readonly CraftRequirement[] = CRAFT_REQUIREMENTS,
  controls: readonly CraftControl[] = HONKA_CONTROLS,
  evidence: readonly CraftEvidence[] = CRAFT_EVIDENCE,
): void {
  const byId = new Map<string, CraftRequirement>();
  for (const item of requirements) {
    if (!item.id.trim() || byId.has(item.id)) throw new Error(`Duplicate or empty craft requirement: ${item.id}`);
    byId.set(item.id, item);
    requirementLabel(item);
    if (!CRAFT_LEVELS.includes(item.firstLevel) || !item.limits.trim()) throw new Error(`${item.id}: invalid level or empty limits`);
    for (const url of item.lessonUrls) {
      if (new URL(url).protocol !== "https:") throw new Error(`${item.id}: lesson requires HTTPS`);
    }
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`Cyclic craft prerequisites: ${id}`);
    if (visited.has(id)) return;
    const item = byId.get(id);
    if (!item) throw new Error(`Unknown craft prerequisite: ${id}`);
    visiting.add(id);
    for (const dependency of item.prerequisiteIds) {
      const prerequisite = byId.get(dependency);
      if (prerequisite && CRAFT_LEVELS.indexOf(prerequisite.firstLevel) > CRAFT_LEVELS.indexOf(item.firstLevel)) {
        throw new Error(`${id}: prerequisite belongs to a later level`);
      }
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  const controlIds = new Set<string>();
  for (const control of controls) {
    if (controlIds.has(control.id) || !control.id || !control.division || !control.requirementIds.length
      || !CRAFT_LEVELS.includes(control.level)) {
      throw new Error(`Invalid or duplicate craft control: ${control.id}`);
    }
    controlIds.add(control.id);
    for (const id of control.requirementIds) {
      const requirement = byId.get(id);
      if (!requirement || CRAFT_LEVELS.indexOf(requirement.firstLevel) > CRAFT_LEVELS.indexOf(control.level)) {
        throw new Error(`${control.id}: unknown or later-level requirement ${id}`);
      }
    }
    controlImplementation(control);
  }
  for (const record of evidence) {
    if (!byId.has(record.requirementId) || !record.artifact.trim() || !record.revision.trim() || !record.scope.trim()) {
      throw new Error(`Incomplete craft evidence: ${record.requirementId}`);
    }
  }
}
