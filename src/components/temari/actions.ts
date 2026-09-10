import { isClosedContour, type KagariDir, type KagariSpacing, type MotifId } from "./patterns";
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
  undoEmpty: boolean;
  kagariDir: KagariDir;
  kagariSpacing: KagariSpacing;
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

const needKagari = (s: TemariCraftState) =>
  needWrap(s) ?? (s.craft === "stitch" ? null : "Сначала стежок");

export function getCraftState(): TemariCraftState {
  const s = useTemari.getState();
  const undoEmpty =
    s.mode === "kata"
      ? s.history.length === 0
      : s.craft === "pin"
        ? s.pinHistory.length === 0
        : s.sewnHistory.length === 0;
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
    undoEmpty,
    kagariDir: s.kagariDir,
    kagariSpacing: s.kagariSpacing,
    selectedColor: s.selectedColor,
    paletteId: s.paletteId,
  };
}

const jiwariReady = (s: TemariCraftState) => s.jiwariOn && s.jiwariPhase === "done";

const simpleDone = (s: TemariCraftState) =>
  s.jiwariOn && s.division === "simple" && s.jiwariPhase === "done";

const c8Done = (s: TemariCraftState) =>
  s.jiwariOn && s.division === "c8" && s.jiwariPhase === "done";

export const CRAFT_ACTIONS: CraftAction[] = [
  {
    id: "pin",
    label: "Булавки",
    cluster: "jiwari",
    canExecute: (s) => !needWrap(s),
    isActive: (s) => s.craft === "pin" && s.layerDone,
    getDisabledReason: needWrap,
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
    canExecute: (s) => !needWrap(s) && (simpleDone(s) || s.division === "c8"),
    isActive: (s) => s.jiwariOn && s.division === "c8",
    getDisabledReason: (s) =>
      needWrap(s) ??
      (simpleDone(s) || s.division === "c8"
        ? null
        : "Сначала Простое — C8 из него"),
  },
  {
    id: "jiwari-c10",
    label: "C10",
    cluster: "jiwari",
    canExecute: (s) => !needWrap(s) && c8Done(s),
    isActive: (s) => s.jiwariOn && s.division === "c10",
    getDisabledReason: (s) =>
      needWrap(s) ?? (c8Done(s) ? null : "C10 — после C8, линейка V"),
  },
  {
    id: "stitch",
    label: "Стежок",
    cluster: "kagari",
    canExecute: (s) => !needWrap(s) && (s.jiwariOn ? jiwariReady(s) : s.hasPin),
    isActive: (s) => s.craft === "stitch",
    getDisabledReason: (s) =>
      needWrap(s) ??
      (jiwariReady(s) || s.hasPin
        ? null
        : s.jiwariOn
          ? "Сначала доведите разметку полоской"
          : "Сначала выберите опорную булавку или линию разметки"),
  },
  {
    id: "motif-none",
    label: "Ряд",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s),
    isActive: (s) => s.motif === "none",
    getDisabledReason: needKagari,
  },
  {
    id: "motif-kiku",
    label: "Кику",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s),
    isActive: (s) => s.motif === "kiku",
    getDisabledReason: needKagari,
  },
  {
    id: "motif-hoshi",
    label: "Хоси",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s),
    isActive: (s) => s.motif === "hoshi",
    getDisabledReason: needKagari,
  },
  {
    id: "motif-hishi",
    label: "Хиси",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s),
    isActive: (s) => s.motif === "hishi",
    getDisabledReason: needKagari,
  },
  {
    id: "motif-obi",
    label: "Оби",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s),
    isActive: (s) => s.motif === "obi",
    getDisabledReason: needKagari,
  },
  {
    id: "kagari-in",
    label: "Внутрь",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s) && s.closedContour,
    isActive: (s) => s.kagariDir === "in",
    getDisabledReason: (s) =>
      needKagari(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
  },
  {
    id: "kagari-out",
    label: "Наружу",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s) && s.closedContour,
    isActive: (s) => s.kagariDir === "out",
    getDisabledReason: (s) =>
      needKagari(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
  },
  {
    id: "fill",
    label: "Залить",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s) && s.closedContour,
    getDisabledReason: (s) =>
      needKagari(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
  },
  {
    id: "space-open",
    label: "Реже",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s) && s.closedContour,
    isActive: (s) => s.kagariSpacing === "open",
    getDisabledReason: (s) =>
      needKagari(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
  },
  {
    id: "space-even",
    label: "Так",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s) && s.closedContour,
    isActive: (s) => s.kagariSpacing === "even",
    getDisabledReason: (s) =>
      needKagari(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
  },
  {
    id: "space-tight",
    label: "Плотнее",
    cluster: "kagari",
    canExecute: (s) => !needKagari(s) && s.closedContour,
    isActive: (s) => s.kagariSpacing === "tight",
    getDisabledReason: (s) =>
      needKagari(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
  },
  {
    id: "undo",
    label: "Распороть",
    cluster: "correction",
    canExecute: (s) => !s.undoEmpty,
    getDisabledReason: (s) => (s.undoEmpty ? "Нет стежка, который можно распороть" : null),
  },
  {
    id: "reset",
    label: "Сброс слоя",
    cluster: "correction",
    canExecute: () => true,
    getDisabledReason: () => null,
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
    case "layer":
      if (typeof payload === "number") s.setKikuLayers(s.kikuLayers + payload);
      return;
    default:
      return;
  }
}
