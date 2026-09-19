import { isClosedContour, kikuMarksReady as kikuPinsComplete, kikuSpec, motifSupport, type KagariDir, type KagariSpacing, type MotifId } from "./patterns";
import type { Craft } from "./craft";
import type { Division } from "./division";
import type { JiwariPhase } from "./jiwari";
import type { Mode } from "./store";
import { useTemari } from "./store";
import type { PaletteId } from "./palettes";

export type CraftCluster = "jiwari" | "kagari" | "correction";

export type TemariCraftState = {
  mode: Mode;
  layerDone: boolean;
  craft: Craft;
  jiwariOn: boolean;
  jiwariPhase: JiwariPhase;
  division: Division;
  motif: MotifId;
  closedContour: boolean;
  hasPin: boolean;
  pinCount: number;
  undoEmpty: boolean;
  kagariDir: KagariDir;
  kagariSpacing: KagariSpacing;
  kagariSet: 0 | 1;
  kagariHistory: unknown[];
  kagariIdleComplete: boolean;
  kikuLayers: number;
  kikuFit: number;
  kikuMarksReady: boolean;
  selectedColor: number;
  paletteId: PaletteId;
};

export interface CraftAction {
  id: string;
  label: string;
  cluster: CraftCluster;
  canExecute: (state: TemariCraftState) => boolean;
  isActive?: (state: TemariCraftState) => boolean;
  getDisabledReason: (state: TemariCraftState) => string | null;
}

const needWrap = (s: TemariCraftState) =>
  s.mode === "studio" && s.layerDone ? null : "Сначала намотайте базу";

export function getCraftState(): TemariCraftState {
  const s = useTemari.getState();
  const undoEmpty =
    s.mode === "kata"
      ? s.history.length === 0
      : s.craft === "pin" || s.motif === "none"
        ? s.pinHistory.length === 0 && s.kagariHistory.length === 0
        : s.sewnHistory.length === 0 && s.kagariHistory.length === 0;
  return {
    mode: s.mode,
    layerDone: s.layerDone,
    craft: s.craft,
    jiwariOn: s.jiwariOn,
    jiwariPhase: s.jiwariPhase,
    division: s.division,
    motif: s.motif,
    closedContour: isClosedContour(s.pins.map((pin) => pin.p)),
    hasPin: s.pins.length > 0,
    pinCount: s.pins.length,
    undoEmpty,
    kagariDir: s.kagariDir,
    kagariSpacing: s.kagariSpacing,
    kagariSet: s.kagariSet,
    kagariHistory: s.kagariHistory,
    kagariIdleComplete:
      !s.kagariPlaying && s.kagariPlan.length > 0 && s.kagariLaid >= s.kagariPlan.length,
    kikuLayers: s.kikuLayers,
    kikuFit: kikuSpec(s.division, s.kagariSpacing, "fit").capacity,
    kikuMarksReady: s.motif !== "kiku" || kikuPinsComplete(s.pins, s.division, s.facingPole),
    selectedColor: s.selectedColor,
    paletteId: s.paletteId,
  };
}

const jiwariReady = (s: TemariCraftState) => s.jiwariOn && s.jiwariPhase === "done";
const needFinishedMarking = (s: TemariCraftState) =>
  s.jiwariOn && !jiwariReady(s) ? "Дождитесь завершения разметки" : null;

const needMarks = (s: TemariCraftState) =>
  needWrap(s) ?? (jiwariReady(s) || s.hasPin ? null : "Сначала разметка");

const needRecipe = (s: TemariCraftState, motif = s.motif) => {
  const support = motifSupport(s.division, motif);
  return support.supported ? null : support.reason;
};

const needMotif = (s: TemariCraftState, motif: MotifId) =>
  needWrap(s) ?? needRecipe(s, motif) ??
  (motif === "kiku"
    ? !s.jiwariOn ? "Выберите S8 в разделе „Разметка“" : needFinishedMarking(s)
    : needMarks(s));

const canFillMotif = (s: TemariCraftState) =>
  s.closedContour || s.motif !== "none" || jiwariReady(s);

export const CRAFT_ACTIONS: CraftAction[] = [
  {
    id: "pin",
    label: "Булавки",
    cluster: "jiwari",
    canExecute: (s) => !needWrap(s) && !needFinishedMarking(s),
    isActive: (s) => s.craft === "pin" && s.layerDone,
    getDisabledReason: (s) => needWrap(s) ?? needFinishedMarking(s),
  },
  {
    id: "jiwari-off",
    label: "Нет",
    cluster: "jiwari",
    canExecute: (s) => !needWrap(s),
    isActive: (s) => s.layerDone && !s.jiwariOn,
    getDisabledReason: needWrap,
  },
  {
    id: "jiwari-simple",
    label: "Простое",
    cluster: "jiwari",
    canExecute: (s) => !needWrap(s),
    isActive: (s) => s.jiwariOn && s.division === "simple",
    getDisabledReason: needWrap,
  },
  {
    id: "jiwari-c8",
    label: "C8",
    cluster: "jiwari",
    canExecute: (s) => !needWrap(s),
    isActive: (s) => s.jiwariOn && s.division === "c8",
    getDisabledReason: needWrap,
  },
  {
    id: "jiwari-c10",
    label: "C10",
    cluster: "jiwari",
    canExecute: (s) => !needWrap(s),
    isActive: (s) => s.jiwariOn && s.division === "c10",
    getDisabledReason: needWrap,
  },
  {
    id: "stitch",
    label: "Стежок",
    cluster: "kagari",
    canExecute: (s) => !needWrap(s) && !needRecipe(s) && !needFinishedMarking(s) &&
      (s.motif === "none" ? s.pinCount >= 2 : (s.jiwariOn ? jiwariReady(s) : s.hasPin) && s.kikuMarksReady),
    isActive: (s) => s.craft === "stitch",
    getDisabledReason: (s) =>
      needWrap(s) ??
      needRecipe(s) ??
      needFinishedMarking(s) ??
      (s.motif === "none"
        ? s.pinCount >= 2 ? null : "Сначала поставьте две булавки для эскиза"
        : !s.kikuMarksReady
        ? "Поставьте метки: полюс и треть пути от экватора к полюсу"
        : s.jiwariOn
          ? jiwariReady(s)
            ? null
            : "Сначала доведите разметку полоской"
          : s.hasPin
            ? null
            : "Сначала выберите опорную булавку или линию разметки"),
  },
  {
    id: "motif-none",
    label: "Ряд",
    cluster: "kagari",
    canExecute: (s) => !needWrap(s),
    isActive: (s) => s.motif === "none",
    getDisabledReason: needWrap,
  },
  {
    id: "motif-kiku",
    label: "Кику",
    cluster: "kagari",
    canExecute: (s) => !needMotif(s, "kiku"),
    isActive: (s) => s.motif === "kiku",
    getDisabledReason: (s) => needMotif(s, "kiku"),
  },
  {
    id: "motif-hoshi",
    label: "Хоси",
    cluster: "kagari",
    canExecute: (s) => !needMotif(s, "hoshi"),
    isActive: (s) => s.motif === "hoshi",
    getDisabledReason: (s) => needMotif(s, "hoshi"),
  },
  {
    id: "motif-hishi",
    label: "Хиси",
    cluster: "kagari",
    canExecute: (s) => !needMotif(s, "hishi"),
    isActive: (s) => s.motif === "hishi",
    getDisabledReason: (s) => needMotif(s, "hishi"),
  },
  {
    id: "motif-obi",
    label: "Оби",
    cluster: "kagari",
    canExecute: (s) => !needMotif(s, "obi"),
    isActive: (s) => s.motif === "obi",
    getDisabledReason: (s) => needMotif(s, "obi"),
  },
  {
    id: "kagari-in",
    label: "Внутрь",
    cluster: "kagari",
    canExecute: (s) => !needMarks(s) && canFillMotif(s) && s.motif !== "kiku",
    isActive: (s) => s.kagariDir === "in",
    getDisabledReason: (s) =>
      needMarks(s) ??
      (s.motif === "kiku"
        ? "Кику шьют от полюса. Сакаса — другой стежок."
        : canFillMotif(s)
          ? null
          : "Сначала разметка или замкнутый контур"),
  },
  {
    id: "kagari-out",
    label: "Наружу",
    cluster: "kagari",
    canExecute: (s) => !needMarks(s) && canFillMotif(s),
    isActive: (s) => s.kagariDir === "out",
    getDisabledReason: (s) =>
      needMarks(s) ?? (canFillMotif(s) ? null : "Сначала разметка или замкнутый контур"),
  },
  {
    id: "fill",
    label: "Залить",
    cluster: "kagari",
    canExecute: (s) => {
      if (needMarks(s) || needRecipe(s) || !canFillMotif(s) || !s.kikuMarksReady) return false;
      if (s.motif === "kiku" && s.kagariIdleComplete) {
        if (s.kagariSet === 0) return false;
        if (s.kikuLayers >= s.kikuFit) return false;
      }
      return true;
    },
    getDisabledReason: (s) =>
      needMarks(s) ??
      needRecipe(s) ??
      (!s.kikuMarksReady
        ? "Поставьте метки: полюс и треть пути от экватора к полюсу"
        : s.motif === "kiku" && s.kagariIdleComplete && s.kagariSet === 0
        ? "Сначала нажмите «Вторая группа»"
        : s.motif === "kiku" && s.kagariIdleComplete && s.kikuLayers >= s.kikuFit
          ? "Экватор этого полюса. Дальше — переверните шар."
          : canFillMotif(s)
            ? null
            : "Сначала разметка или замкнутый контур"),
  },
  {
    id: "space-open",
    label: "Реже",
    cluster: "kagari",
    canExecute: (s) => !needMarks(s) && canFillMotif(s),
    isActive: (s) => s.kagariSpacing === "open",
    getDisabledReason: (s) =>
      needMarks(s) ?? (canFillMotif(s) ? null : "Сначала разметка или замкнутый контур"),
  },
  {
    id: "space-even",
    label: "Так",
    cluster: "kagari",
    canExecute: (s) => !needMarks(s) && canFillMotif(s),
    isActive: (s) => s.kagariSpacing === "even",
    getDisabledReason: (s) =>
      needMarks(s) ?? (canFillMotif(s) ? null : "Сначала разметка или замкнутый контур"),
  },
  {
    id: "space-tight",
    label: "Плотнее",
    cluster: "kagari",
    canExecute: (s) => !needMarks(s) && canFillMotif(s),
    isActive: (s) => s.kagariSpacing === "tight",
    getDisabledReason: (s) =>
      needMarks(s) ?? (canFillMotif(s) ? null : "Сначала разметка или замкнутый контур"),
  },
  {
    id: "undo",
    label: "Распороть",
    cluster: "correction",
    canExecute: (s) => !s.undoEmpty,
    getDisabledReason: (s) => (s.undoEmpty ? "Пока нечего отменять" : null),
  },
  {
    id: "reset",
    label: "Сброс слоя",
    cluster: "correction",
    canExecute: () => true,
    getDisabledReason: () => null,
  },
  {
    id: "quick-kiku",
    label: "Кику здесь",
    cluster: "kagari",
    canExecute: (s) => s.mode === "studio",
    getDisabledReason: (s) => (s.mode === "studio" ? null : "Откройте мастерскую"),
  },
  {
    id: "kiku-finish",
    label: "Дошить",
    cluster: "kagari",
    // Only with both groups standing, the row finished and room left at this pole.
    canExecute: (s) =>
      s.mode === "studio" && s.motif === "kiku" && s.kikuMarksReady &&
      s.kagariIdleComplete && s.kagariSet === 1 && s.kikuLayers < s.kikuFit,
    getDisabledReason: (s) =>
      s.motif !== "kiku"
        ? "Сначала выберите кику"
        : !s.kagariIdleComplete || s.kagariSet === 0
          ? "Сначала обе группы лепестков"
          : s.kikuLayers >= s.kikuFit
            ? "Экватор этого полюса. Дальше — переверните шар."
            : null,
  },
  {
    id: "example",
    label: "Пример",
    cluster: "correction",
    canExecute: (s) => s.mode === "studio" && s.layerDone,
    getDisabledReason: (s) =>
      s.mode === "studio" && s.layerDone ? null : "Сначала намотайте базу",
  },
];

export function dispatchCommand(actionId: string, payload?: unknown) {
  const action = CRAFT_ACTIONS.find((item) => item.id === actionId);
  const state = getCraftState();
  if (!action || !action.canExecute(state)) return;

  const s = useTemari.getState();
  switch (actionId) {
    case "pin":
      s.setCraft("pin");
      return;
    case "jiwari-off":
      s.clearJiwari();
      return;
    case "jiwari-simple":
      s.setDivision("simple");
      return;
    case "jiwari-c8":
      s.setDivision("c8");
      return;
    case "jiwari-c10":
      s.setDivision("c10");
      return;
    case "stitch":
      s.setCraft("stitch");
      return;
    case "motif-none":
      s.setMotif("none");
      return;
    case "motif-kiku":
      s.setMotif("kiku");
      return;
    case "motif-hoshi":
      s.setMotif("hoshi");
      return;
    case "motif-hishi":
      s.setMotif("hishi");
      return;
    case "motif-obi":
      s.setMotif("obi");
      return;
    case "kagari-in":
      s.setKagariDir("in");
      return;
    case "kagari-out":
      s.setKagariDir("out");
      return;
    case "fill":
      s.fillKiku();
      return;
    case "space-open":
      s.setKagariSpacing("open");
      return;
    case "space-even":
      s.setKagariSpacing("even");
      return;
    case "space-tight":
      s.setKagariSpacing("tight");
      return;
    case "undo":
      s.undo();
      return;
    case "reset":
      s.reset();
      return;
    case "example":
      s.showExample();
      return;
    case "quick-kiku":
      s.quickKiku();
      return;
    case "kiku-finish":
      s.finishKiku();
      return;
    case "layer":
      if (typeof payload === "number") s.setKikuLayers(s.kikuLayers + payload);
      return;
    default:
      return;
  }
}
