import { isClosedContour, type KagariDir, type KagariSpacing, type MotifId } from "./patterns";
import type { Craft } from "./craft";
import type { Division } from "./division";
import type { Mode } from "./store";
import { useTemari } from "./store";

export type ActionCategory = "wrap" | "mark" | "stitch" | "edit";

export type TemariCommand =
  | { type: "finishLayer" }
  | { type: "clearJiwari" }
  | { type: "setDivision"; division: Division }
  | { type: "setCraft"; craft: Craft }
  | { type: "setMotif"; motif: MotifId }
  | { type: "setKagariDir"; dir: KagariDir }
  | { type: "setKagariSpacing"; spacing: KagariSpacing }
  | { type: "fillKiku" }
  | { type: "showExample" }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "setKikuLayers"; delta: number };

export type WorldSnapshot = {
  mode: Mode;
  layerDone: boolean;
  wrapStarted: boolean;
  wrapProgress: number;
  craft: Craft;
  jiwariOn: boolean;
  division: Division;
  motif: MotifId;
  closedContour: boolean;
  undoEmpty: boolean;
  kagariDir: KagariDir;
  kagariSpacing: KagariSpacing;
};

export type GameAction = {
  id: string;
  label: string;
  category: ActionCategory;
  isAvailable: (state: WorldSnapshot) => boolean;
  isActive?: (state: WorldSnapshot) => boolean;
  isBusy?: (state: WorldSnapshot) => boolean;
  getDisabledReason: (state: WorldSnapshot) => string | null;
  command: TemariCommand;
};

const afterWrap = (s: WorldSnapshot) =>
  s.mode === "studio" && s.layerDone ? null : "Сначала намотайте базу";

const afterMark = (s: WorldSnapshot) =>
  afterWrap(s) ??
  (s.craft === "stitch" ? null : "Сначала кагари");

export function snapshotFromStore(): WorldSnapshot {
  const s = useTemari.getState();
  const undoEmpty =
    s.mode === "kata"
      ? s.history.length === 0
      : s.craft === "wind"
        ? s.wrapCount === 0
        : s.craft === "pin"
          ? s.pinHistory.length === 0
          : s.sewnHistory.length === 0;
  return {
    mode: s.mode,
    layerDone: s.layerDone,
    wrapStarted: s.wrapStarted,
    wrapProgress: s.wrapProgress,
    craft: s.craft,
    jiwariOn: s.jiwariOn,
    division: s.division,
    motif: s.motif,
    closedContour: isClosedContour(s.pins.map((pin) => pin.p)),
    undoEmpty,
    kagariDir: s.kagariDir,
    kagariSpacing: s.kagariSpacing,
  };
}

export const GAME_ACTIONS: GameAction[] = [
  {
    id: "finish-wrap",
    label: "База",
    category: "wrap",
    isAvailable: (s) => s.mode === "studio" && !s.layerDone,
    isBusy: (s) => s.mode === "studio" && !s.layerDone && s.wrapProgress > 0 && s.wrapProgress < 1,
    isActive: (s) => s.layerDone,
    getDisabledReason: (s) =>
      s.layerDone ? "База уже намотана" : null,
    command: { type: "finishLayer" },
  },
  {
    id: "craft-pin",
    label: "Дзивари",
    category: "mark",
    isAvailable: (s) => !afterWrap(s),
    isActive: (s) => s.craft === "pin" && s.layerDone,
    getDisabledReason: afterWrap,
    command: { type: "setCraft", craft: "pin" },
  },
  {
    id: "craft-stitch",
    label: "Кагари",
    category: "mark",
    isAvailable: (s) => !afterWrap(s),
    isActive: (s) => s.craft === "stitch" && s.layerDone,
    getDisabledReason: afterWrap,
    command: { type: "setCraft", craft: "stitch" },
  },
  {
    id: "jiwari-off",
    label: "Нет",
    category: "mark",
    isAvailable: (s) => !afterWrap(s),
    isActive: (s) => s.layerDone && !s.jiwariOn,
    getDisabledReason: afterWrap,
    command: { type: "clearJiwari" },
  },
  {
    id: "jiwari-simple",
    label: "Простое",
    category: "mark",
    isAvailable: (s) => !afterWrap(s),
    isActive: (s) => s.jiwariOn && s.division === "simple",
    getDisabledReason: afterWrap,
    command: { type: "setDivision", division: "simple" },
  },
  {
    id: "jiwari-c8",
    label: "C8",
    category: "mark",
    isAvailable: (s) => !afterWrap(s),
    isActive: (s) => s.jiwariOn && s.division === "c8",
    getDisabledReason: afterWrap,
    command: { type: "setDivision", division: "c8" },
  },
  {
    id: "jiwari-c10",
    label: "C10",
    category: "mark",
    isAvailable: (s) => !afterWrap(s),
    isActive: (s) => s.jiwariOn && s.division === "c10",
    getDisabledReason: afterWrap,
    command: { type: "setDivision", division: "c10" },
  },
  {
    id: "motif-none",
    label: "Ряд",
    category: "stitch",
    isAvailable: (s) => !afterMark(s),
    isActive: (s) => s.motif === "none",
    getDisabledReason: afterMark,
    command: { type: "setMotif", motif: "none" },
  },
  {
    id: "motif-kiku",
    label: "Кику",
    category: "stitch",
    isAvailable: (s) => !afterMark(s),
    isActive: (s) => s.motif === "kiku",
    getDisabledReason: afterMark,
    command: { type: "setMotif", motif: "kiku" },
  },
  {
    id: "motif-hoshi",
    label: "Хоси",
    category: "stitch",
    isAvailable: (s) => !afterMark(s),
    isActive: (s) => s.motif === "hoshi",
    getDisabledReason: afterMark,
    command: { type: "setMotif", motif: "hoshi" },
  },
  {
    id: "motif-hishi",
    label: "Хиси",
    category: "stitch",
    isAvailable: (s) => !afterMark(s),
    isActive: (s) => s.motif === "hishi",
    getDisabledReason: afterMark,
    command: { type: "setMotif", motif: "hishi" },
  },
  {
    id: "motif-obi",
    label: "Оби",
    category: "stitch",
    isAvailable: (s) => !afterMark(s),
    isActive: (s) => s.motif === "obi",
    getDisabledReason: afterMark,
    command: { type: "setMotif", motif: "obi" },
  },
  {
    id: "kagari-in",
    label: "Внутрь",
    category: "stitch",
    isAvailable: (s) => !afterMark(s) && s.closedContour,
    isActive: (s) => s.kagariDir === "in",
    getDisabledReason: (s) =>
      afterMark(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
    command: { type: "setKagariDir", dir: "in" },
  },
  {
    id: "kagari-out",
    label: "Наружу",
    category: "stitch",
    isAvailable: (s) => !afterMark(s) && s.closedContour,
    isActive: (s) => s.kagariDir === "out",
    getDisabledReason: (s) =>
      afterMark(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
    command: { type: "setKagariDir", dir: "out" },
  },
  {
    id: "fill",
    label: "Залить",
    category: "stitch",
    isAvailable: (s) => !afterMark(s) && s.closedContour,
    getDisabledReason: (s) =>
      afterMark(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
    command: { type: "fillKiku" },
  },
  {
    id: "space-open",
    label: "Реже",
    category: "stitch",
    isAvailable: (s) => !afterMark(s) && s.closedContour,
    isActive: (s) => s.kagariSpacing === "open",
    getDisabledReason: (s) =>
      afterMark(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
    command: { type: "setKagariSpacing", spacing: "open" },
  },
  {
    id: "space-even",
    label: "Так",
    category: "stitch",
    isAvailable: (s) => !afterMark(s) && s.closedContour,
    isActive: (s) => s.kagariSpacing === "even",
    getDisabledReason: (s) =>
      afterMark(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
    command: { type: "setKagariSpacing", spacing: "even" },
  },
  {
    id: "space-tight",
    label: "Плотнее",
    category: "stitch",
    isAvailable: (s) => !afterMark(s) && s.closedContour,
    isActive: (s) => s.kagariSpacing === "tight",
    getDisabledReason: (s) =>
      afterMark(s) ?? (s.closedContour ? null : "Залить можно, только если контур замкнут"),
    command: { type: "setKagariSpacing", spacing: "tight" },
  },
  {
    id: "example",
    label: "Пример",
    category: "edit",
    isAvailable: (s) => s.mode === "studio" && s.layerDone,
    getDisabledReason: (s) =>
      s.mode === "studio" && s.layerDone ? null : "Сначала намотайте базу",
    command: { type: "showExample" },
  },
  {
    id: "undo",
    label: "Отменить",
    category: "edit",
    isAvailable: (s) => !s.undoEmpty,
    getDisabledReason: (s) => (s.undoEmpty ? "Нечего отменять" : null),
    command: { type: "undo" },
  },
  {
    id: "reset",
    label: "Сбросить",
    category: "edit",
    isAvailable: () => true,
    getDisabledReason: () => null,
    command: { type: "reset" },
  },
];

export function dispatchCommand(command: TemariCommand) {
  const s = useTemari.getState();
  switch (command.type) {
    case "finishLayer":
      s.finishLayer();
      return;
    case "clearJiwari":
      s.clearJiwari();
      return;
    case "setDivision":
      s.setDivision(command.division);
      return;
    case "setCraft":
      s.setCraft(command.craft);
      return;
    case "setMotif":
      s.setMotif(command.motif);
      return;
    case "setKagariDir":
      s.setKagariDir(command.dir);
      return;
    case "setKagariSpacing":
      s.setKagariSpacing(command.spacing);
      return;
    case "fillKiku":
      s.fillKiku();
      return;
    case "showExample":
      s.showExample();
      return;
    case "undo":
      s.undo();
      return;
    case "reset":
      s.reset();
      return;
    case "setKikuLayers":
      s.setKikuLayers(s.kikuLayers + command.delta);
      return;
  }
}
