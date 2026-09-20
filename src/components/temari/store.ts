import { create } from "zustand";
import {
  emptyFills,
  fillsMatch,
  padFills,
  snapToNode,
  polePositions,
  type Division,
} from "./division";
import {
  isCraft,
  pinHit,
  type Craft,
  type Pin,
  type PinArc,
} from "./craft";
import { clampColor, isPaletteId, threadHex, type PaletteId } from "./palettes";
import {
  isMotifId,
  motifSupport,
  kikuArcsFromPins,
  sakasaArcsFromPins,
  kikuCapacity,
  KAGARI_SPACING_META,
  isClosedContour,
  motifStitchPlan,
  stitchFocus,
  stitchPoleIndex,
  nextKagariPole,
  kikuSpec,
  kikuWorkingPins,
  kikuMarksReady,
  snapToKikuMark,
  kikuPinHint,
  KIKU_PIN_MISS,
  sameFocus,
  slotKey,
  type KagariDir,
  type KagariSpacing,
  type KikuSlot,
  type MotifId,
  type SewnEntry,
  type Stitch,
  type Vec3,
} from "./patterns";
import { PUZZLES } from "./puzzles";
import * as feel from "./feel";
import { c8Pins, c10Pins, contrastThread, kikuThreads, kikuThreadsFor, jiwariNormals, jiwariVisiblePins, simplePins, type JiwariPhase } from "./jiwari";

export type Mode = "title" | "studio" | "kata";

type Save = {
  v: 2;
  division: Division;
  paletteId: PaletteId;
  selectedColor: number;
  fills: number[];
  solved: string[];
  motif?: MotifId;
  sewn?: SewnEntry[];
  craft?: Craft;
  pins?: Pin[];
  pinArcs?: PinArc[];
  /** The two working threads of a kiku; older saves have none. */
  kagariColors?: [number, number];
};

const SAVE_KEY = "temari-v1";
const MAX_PINS = 48;

function isDivision(value: unknown): value is Division {
  return value === "simple" || value === "c8" || value === "c10";
}

function isSewn(value: unknown): value is SewnEntry[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as SewnEntry).key === "string" &&
      typeof (item as SewnEntry).color === "number",
  );
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function isPins(value: unknown): value is Pin[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as Pin).id === "string" &&
      isVec3((item as Pin).p),
  );
}

function isPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n));
}

function isArcs(value: unknown): value is PinArc[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      isVec3((item as PinArc).a) &&
      isVec3((item as PinArc).b) &&
      typeof (item as PinArc).color === "number",
  );
}

function loadSave(): Partial<Save> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as { v?: number };
    if (data.v !== 1 && data.v !== 2) return {};
    return data as Partial<Save>;
  } catch {
    return {};
  }
}

function writeSave(save: Save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* quota */
  }
}

const initial = loadSave();

let studioDraft: Omit<Save, "v" | "solved"> = {
  division: isDivision(initial.division) ? initial.division : "c8",
  paletteId: isPaletteId(initial.paletteId) ? initial.paletteId : "beni",
  selectedColor:
    typeof initial.selectedColor === "number"
      ? clampColor(initial.selectedColor)
      : 0,
  fills: Array.isArray(initial.fills) ? initial.fills : emptyFills("c8"),
  motif: isMotifId(initial.motif) ? initial.motif : "none",
  sewn: isSewn(initial.sewn) ? initial.sewn : [],
  craft: isCraft(initial.craft) ? initial.craft : "wind",
  pins: isPins(initial.pins) ? initial.pins : [],
  pinArcs: isArcs(initial.pinArcs) ? initial.pinArcs : [],
  kagariColors: isPair(initial.kagariColors)
    ? [clampColor(initial.kagariColors[0]), clampColor(initial.kagariColors[1])]
    : undefined,
};

function persist(solved: string[]) {
  writeSave({ v: 2, ...studioDraft, solved });
}

type PinSnap = { pins: Pin[]; pinArcs: PinArc[]; activePin: number | null };

type TemariState = {
  mode: Mode;
  division: Division;
  paletteId: PaletteId;
  motif: MotifId;
  craft: Craft;
  selectedColor: number;
  wrapColor: number;
  wrapHex: string;
  fills: number[];
  sewn: SewnEntry[];
  pins: Pin[];
  pinArcs: PinArc[];
  pinNote: string | null;
  activePin: number | null;
  hover: number;
  hoverSlot: KikuSlot | null;
  peeking: boolean;
  puzzleIndex: number;
  solved: string[];
  history: number[][];
  sewnHistory: SewnEntry[][];
  pinHistory: PinSnap[];
  wrapCount: number;
  wrapUndoNonce: number;
  wrapResetNonce: number;
  viewNonce: number;
  viewPole: number;
  poseDirty: boolean;
  wrapProgress: number;
  threadWidth: number;
  wrapStarted: boolean;
  layerDone: boolean;
  wrapPass: 1 | 2 | 3;
  kikuLayers: number;
  kagariDir: KagariDir;
  kagariSpacing: KagariSpacing;
  kagariPlan: Stitch[];
  kagariLaid: number;
  kagariPlaying: boolean;
  kagariFocus: Vec3 | null;
  kagariKept: Stitch[];
  kagariSet: 0 | 1;
  /**
   * A kiku is sewn with two working threads that alternate by rounds, and a
   * thread keeps its colour: what set B is sewn in does not repaint set A.
   */
  kagariColors: [number, number];
  /**
   * Which of the two threads the palette paints: 0 or 1 once the player chose
   * «1» or «2», null to follow the thread in hand. Any change of the hand (a
   * group finished, undone, a new flower) returns it to null.
   */
  kagariEdit: 0 | 1 | null;
  /** One entry per group of petals laid, so «Отменить» can take a group back. */
  kagariHistory: KagariStep[];
  facingPole: number;
  startPin: Vec3 | null;
  originNonce: number;
  wrapSeed: "empty" | "full";
  jiwariOn: boolean;
  jiwariPhase: JiwariPhase;
  jiwariLaid: number;
  enterStudio: () => void;
  enterKata: (index?: number) => void;
  toTitle: () => void;
  setDivision: (division: Division) => void;
  advanceJiwari: () => void;
  clearJiwari: () => void;
  setPalette: (id: PaletteId) => void;
  setMotif: (id: MotifId) => void;
  setCraft: (craft: Craft) => void;
  setColor: (index: number) => void;
  /** Choose which working thread of a kiku the palette paints. */
  editThread: (slot: 0 | 1) => void;
  setWrapColor: (index: number) => void;
  paint: (region: number) => void;
  sew: (slot: KikuSlot) => void;
  placePin: (local: Vec3) => void;
  sketchToPin: (local: Vec3) => void;
  undo: () => void;
  reset: () => void;
  setHover: (region: number) => void;
  setHoverSlot: (slot: KikuSlot | null) => void;
  setPeeking: (value: boolean) => void;
  setPuzzle: (index: number) => void;
  nextPuzzle: () => void;
  resetView: () => void;
  setPoseDirty: () => void;
  setWrapCount: (n: number) => void;
  setWrapProgress: (n: number) => void;
  setWrapStarted: () => void;
  setThreadWidth: (n: number) => void;
  finishLayer: () => void;
  setWrapPass: (pass: 1 | 2 | 3) => void;
  setKikuLayers: (n: number) => void;
  setKagariDir: (dir: KagariDir) => void;
  setKagariSpacing: (spacing: KagariSpacing) => void;
  startKagari: () => void;
  advanceKagari: () => void;
  fillKiku: () => void;
  /**
   * Sew every row this pole still has room for, in the order the hand would:
   * one kai of the first four, then of the second four, and so on. One undo.
   */
  finishKiku: () => void;
  /** Grow this pole by `count` kais, or to the equator. Plays the stitches. */
  sewKikuRows: (count: number | "all") => void;
  setStartPin: (local: Vec3) => void;
  setFacingPole: (index: number) => void;
  showExample: () => void;
  /**
   * Test shortcut: S8 marking finished and the kiku working pins set at the
   * pole that faces the viewer, without touching the view. Sewing starts with
   * «Начать кику»; a flower already sewn at another pole stays.
   */
  quickKiku: () => void;
};

function rememberStudio(state: TemariState) {
  if (state.mode !== "studio") return;
  studioDraft = {
    division: state.division,
    paletteId: state.paletteId,
    selectedColor: state.selectedColor,
    fills: state.fills,
    motif: state.motif,
    sewn: state.sewn,
    craft: state.craft,
    pins: state.pins,
    pinArcs: state.pinArcs,
    kagariColors: state.kagariColors,
  };
  persist(state.solved);
}

function sameSlot(a: KikuSlot | null, b: KikuSlot | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.pole === b.pole && a.ring === b.ring && a.sector === b.sector;
}

/** Match pin placement and its preview; an absent grid cannot attract a mark. */
export function pinPosition(local: Vec3, division: Division, jiwariOn: boolean): Vec3 | null {
  const length = Math.hypot(...local);
  if (!Number.isFinite(length) || length === 0) return null;
  const p: Vec3 = [local[0] / length, local[1] / length, local[2] / length];
  return jiwariOn ? snapToNode(p, division) : p;
}

function currentCap(state: { pins: Pin[]; threadWidth: number; kagariSpacing: KagariSpacing }) {
  return kikuCapacity(
    state.pins.map((pin) => pin.p),
    state.threadWidth,
    KAGARI_SPACING_META[state.kagariSpacing].density,
  );
}

function withKikuMarks(
  state: {
    division: Division;
    pins: Pin[];
    jiwariLaid: number;
    jiwariPhase: JiwariPhase;
    facingPole: number;
  },
  motif: MotifId,
): Pin[] {
  if (motif !== "kiku") {
    return jiwariVisiblePins(
      state.division,
      state.jiwariPhase === "off" ? "done" : state.jiwariPhase,
      state.jiwariLaid,
    );
  }
  return kikuWorkingPins(state.division, state.facingPole);
}

function idleKagari(): Pick<
  TemariState,
  "kagariPlan" | "kagariLaid" | "kagariPlaying" | "kagariFocus" | "kagariKept" | "kagariHistory"
> {
  return { kagariPlan: [], kagariLaid: 0, kagariPlaying: false, kagariFocus: null, kagariKept: [],
    kagariHistory: [] };
}

/** What a group of petals is undone back to: the thread as it stood before it. */
type KagariStep = Pick<
  TemariState,
  "kagariPlan" | "kagariLaid" | "kagariFocus" | "kagariKept" | "kagariSet" | "kikuLayers"
  | "craft" | "pins"
>;

function kagariStep(s: TemariState): KagariStep {
  return { kagariPlan: s.kagariPlan, kagariLaid: s.kagariLaid, kagariFocus: s.kagariFocus,
    kagariKept: s.kagariKept, kagariSet: s.kagariSet, kikuLayers: s.kikuLayers, craft: s.craft,
    pins: s.pins };
}

/**
 * Stitches that grow this pole's flower from the rows it has to `toLayer`.
 * First four are one round; after the other four each kai packs both groups —
 * GT14 alternate, not all-of-A then all-of-B, so layers are grown one by one.
 */
function kikuExtra(s: TemariState, toLayer: number): Stitch[] {
  const plan = (layers: number, onlySet: 0 | 1) =>
    motifStitchPlan(s.division, "kiku", s.kagariDir, s.kagariSpacing, s.facingPole,
      s.kagariColors[onlySet], layers, onlySet);
  const extra: Stitch[] = [];
  for (let layer = s.kikuLayers + 1; layer <= toLayer; layer++) {
    for (const onlySet of [0, 1] as const) {
      extra.push(...plan(layer, onlySet).slice(plan(layer - 1, onlySet).length));
    }
  }
  return extra;
}

/** Deeper than a flower has groups; a long session cannot grow it without bound. */
function pushKagari(s: TemariState) {
  return [...s.kagariHistory, kagariStep(s)].slice(-20);
}

export const useTemari = create<TemariState>((set, get) => ({
  mode: "title",
  division: "simple",
  paletteId: "beni",
  motif: "kiku",
  craft: "wind",
  selectedColor: 0,
  wrapColor: 0,
  wrapHex: "#8f3d32",
  fills: emptyFills("simple"),
  sewn: [],
  pins: [],
  pinArcs: [],
  pinNote: null,
  activePin: null,
  hover: -1,
  hoverSlot: null,
  peeking: false,
  puzzleIndex: 0,
  solved: Array.isArray(initial.solved) ? initial.solved : [],
  history: [],
  sewnHistory: [],
  pinHistory: [],
  wrapCount: 0,
  wrapUndoNonce: 0,
  wrapResetNonce: 0,
  viewNonce: 0,
  viewPole: 0,
  poseDirty: true,
  wrapProgress: 0,
  threadWidth: 0.42,
  wrapStarted: false,
  layerDone: false,
  wrapPass: 3,
  kikuLayers: 1,
  kagariDir: "out",
  kagariSpacing: "even",
  kagariPlan: [],
  kagariLaid: 0,
  kagariPlaying: false,
  kagariFocus: null,
  kagariKept: [],
  kagariSet: 0,
  kagariColors: isPair(studioDraft.kagariColors) ? studioDraft.kagariColors : [0, 0],
  kagariEdit: null,
  kagariHistory: [],
  facingPole: 0,
  startPin: null,
  originNonce: 0,
  wrapSeed: "full",
  jiwariOn: false,
  jiwariPhase: "off",
  jiwariLaid: 0,

  enterStudio: () => {
    const savedPair = isPair(studioDraft.kagariColors)
      ? ([clampColor(studioDraft.kagariColors[0]), clampColor(studioDraft.kagariColors[1])] as [number, number])
      : null;
    feel.unlock();
    const division = studioDraft.division;
    const hasPaint = studioDraft.fills.some((v) => v >= 0);
    set({
      mode: "studio",
      division,
      paletteId: studioDraft.paletteId,
      motif: "none",
      craft: "pin",
      // A thread that reads on this wrap; tone on tone stays a deliberate choice.
      // A pair kept from the last visit is the maker's, and outlives the default.
      selectedColor: savedPair ? savedPair[0] : contrastThread(get().wrapColor),
      // Two working threads, as the control pattern asks for; each keeps its set.
      kagariColors: savedPair ?? kikuThreads(get().wrapColor),
      kagariEdit: null,
      wrapColor: get().wrapColor,
      wrapHex: get().wrapHex,
      fills: hasPaint ? padFills(studioDraft.fills, division) : emptyFills(division),
      sewn: [],
      pins: [],
      pinArcs: [],
      pinNote: null,
      activePin: null,
      history: [],
      sewnHistory: [],
      pinHistory: [],
      peeking: false,
      hover: -1,
      hoverSlot: null,
      wrapProgress: 1,
      layerDone: true,
      wrapPass: 3,
      wrapStarted: true,
      wrapResetNonce: get().wrapResetNonce + 1,
      wrapCount: 1,
      startPin: null,
      originNonce: get().originNonce + 1,
      wrapSeed: "full",
      jiwariOn: false,
      jiwariPhase: "off",
      jiwariLaid: 0,
      ...idleKagari(),
    });
  },

  enterKata: (index) => {
    const solved = get().solved;
    const start =
      typeof index === "number"
        ? index
        : Math.max(
            0,
            PUZZLES.findIndex((p) => !solved.includes(p.id)),
          );
    const puzzle = PUZZLES[start] ?? PUZZLES[0];
    if (!puzzle) return;
    set({
      mode: "kata",
      puzzleIndex: start,
      division: puzzle.division,
      paletteId: puzzle.paletteId,
      motif: "none",
      craft: "stitch",
      fills: emptyFills(puzzle.division),
      sewn: [],
      pins: [],
      pinArcs: [],
      activePin: null,
      selectedColor: 0,
      history: [],
      sewnHistory: [],
      pinHistory: [],
      peeking: false,
      hover: -1,
      hoverSlot: null,
    });
  },

  toTitle: () => {
    set({
      mode: "title",
      wrapPass: 3,
      division: "simple",
      paletteId: "beni",
      motif: "kiku",
      craft: "wind",
      fills: emptyFills("simple"),
      sewn: [],
      pins: [],
      pinArcs: [],
      activePin: null,
      peeking: false,
      hover: -1,
      hoverSlot: null,
      history: [],
      sewnHistory: [],
      pinHistory: [],
      wrapResetNonce: get().wrapResetNonce + 1,
      wrapCount: 0,
      wrapProgress: 1,
      wrapStarted: false,
      layerDone: false,
      startPin: null,
      wrapSeed: "full",
    });
  },

  setDivision: (division) => {
    if (get().mode === "kata") return;
    const support = motifSupport(division, get().motif);
    const motif = support.supported ? get().motif : "none";
    const on = get().jiwariOn;
    const phase = get().jiwariPhase;
    if (on && get().division === division) {
      if (
        (division === "simple" && phase !== "done" && phase !== "off") ||
        (division === "c8" && phase === "combine") ||
        (division === "c10" && phase !== "done" && phase !== "off")
      ) {
        get().advanceJiwari();
        return;
      }
      set({
        jiwariOn: false,
        jiwariPhase: "off",
        jiwariLaid: 0,
        pins: [],
        pinArcs: [],
        activePin: null,
        hover: -1,
        hoverSlot: null,
        ...idleKagari(),
      });
      rememberStudio(get());
      return;
    }
    if (division === "c8") {
      set({
        division: "c8",
        motif,
        pinNote: support.supported ? null : support.reason,
        facingPole: 0,
        jiwariOn: true,
        jiwariPhase: "combine",
        jiwariLaid: 1,
        fills: emptyFills("c8"),
        sewn: [],
        pinHistory: [],
        history: [],
        sewnHistory: [],
        hover: -1,
        hoverSlot: null,
        pins: get().layerDone ? c8Pins() : [],
        pinArcs: [],
        activePin: null,
        ...idleKagari(),
      });
      rememberStudio(get());
      return;
    }
    if (division === "c10") {
      set({
        division: "c10",
        motif,
        pinNote: support.supported ? null : support.reason,
        facingPole: 0,
        jiwariOn: true,
        jiwariPhase: "vruler",
        jiwariLaid: 0,
        fills: emptyFills("c10"),
        sewn: [],
        pinHistory: [],
        history: [],
        sewnHistory: [],
        hover: -1,
        hoverSlot: null,
        pins: get().layerDone ? c10Pins("vruler", 0) : [],
        pinArcs: [],
        activePin: null,
        ...idleKagari(),
      });
      rememberStudio(get());
      return;
    }
    const simple = division === "simple";
    set({
      division,
      motif,
      pinNote: support.supported ? null : support.reason,
      facingPole: 0,
      jiwariOn: true,
      jiwariPhase: simple ? "strip" : "done",
      jiwariLaid: simple ? 0 : 5,
      fills: emptyFills(division),
      sewn: [],
      pinHistory: [],
      history: [],
      sewnHistory: [],
      hover: -1,
      hoverSlot: null,
      pins: get().layerDone ? jiwariVisiblePins(division, simple ? "strip" : "done") : [],
      pinArcs: [],
      activePin: null,
      ...idleKagari(),
    });
    rememberStudio(get());
  },

  advanceJiwari: () => {
    const state = get();
    if (!state.jiwariOn) return;
    if (state.pinNote === "Дождитесь завершения разметки") set({ pinNote: null });
    if (state.division === "c8" && state.jiwariPhase === "combine") {
      const next = state.jiwariLaid + 1;
      feel.stitch();
      if (next >= 4) {
        set({ jiwariPhase: "done", jiwariLaid: 4, pins: c8Pins() });
      } else {
        set({ jiwariLaid: next });
      }
      return;
    }
    if (state.division === "c10") {
      if (state.jiwariPhase === "vruler") {
        const next = state.jiwariLaid + 1;
        feel.pin();
        if (next > 5) {
          set({ jiwariPhase: "south", jiwariLaid: 0, pins: c10Pins("south", 0) });
        } else {
          set({ jiwariLaid: next, pins: c10Pins("vruler", next) });
        }
        return;
      }
      if (state.jiwariPhase === "south") {
        const next = state.jiwariLaid + 1;
        feel.pin();
        if (next > 5) {
          set({ jiwariPhase: "meridians", jiwariLaid: 1, pins: c10Pins("done", 0) });
        } else {
          set({ jiwariLaid: next, pins: c10Pins("south", next) });
        }
        return;
      }
      if (state.jiwariPhase === "meridians") {
        const max = jiwariNormals("c10").length;
        const next = state.jiwariLaid + 1;
        feel.stitch();
        if (next >= max) {
          set({ jiwariPhase: "done", jiwariLaid: max, pins: c10Pins("done", 0) });
        } else {
          set({ jiwariLaid: next });
        }
        return;
      }
      return;
    }
    if (state.division !== "simple") return;
    if (state.jiwariPhase === "strip") {
      feel.pin();
      set({ jiwariPhase: "poles", pins: simplePins("poles"), jiwariLaid: 0 });
      return;
    }
    if (state.jiwariPhase === "poles") {
      feel.pin();
      set({ jiwariPhase: "equator", pins: simplePins("equator") });
      return;
    }
    if (state.jiwariPhase === "equator") {
      feel.stitch();
      set({ jiwariPhase: "meridians", jiwariLaid: 1 });
      return;
    }
    if (state.jiwariPhase === "meridians") {
      const next = state.jiwariLaid + 1;
      feel.stitch();
      if (next >= 5) {
        const marks = kikuWorkingPins("simple", state.facingPole);
        set({
          jiwariPhase: "done",
          jiwariLaid: 5,
          pins: [],
          motif: "kiku",
          craft: "pin",
          activePin: null,
          pinNote: kikuPinHint(0, marks.length),
        });
      } else {
        set({ jiwariLaid: next });
      }
    }
  },

  clearJiwari: () => {
    if (get().mode === "kata") return;
    set({
      motif: "none",
      craft: "pin",
      jiwariOn: false,
      jiwariPhase: "off",
      jiwariLaid: 0,
      pins: [],
      pinArcs: [],
      pinHistory: [],
      sewn: [],
      sewnHistory: [],
      pinNote: null,
      activePin: null,
      hover: -1,
      hoverSlot: null,
      ...idleKagari(),
    });
    rememberStudio(get());
  },

  setPalette: (id) => {
    if (get().mode === "kata") return;
    const wrapLocked = get().mode === "studio" && get().layerDone;
    set({
      paletteId: id,
      ...(wrapLocked ? {} : { wrapHex: threadHex(get().wrapColor) }),
    });
    rememberStudio(get());
  },

  setMotif: (id) => {
    if (get().mode === "kata") return;
    const support = motifSupport(get().division, id);
    if (!support.supported) {
      set({ pinNote: support.reason });
      return;
    }
    if (id === "kiku" && (!get().jiwariOn || get().jiwariPhase !== "done")) {
      set({ pinNote: !get().jiwariOn
        ? "Выберите S8 в разделе „Разметка“"
        : "Дождитесь завершения разметки" });
      return;
    }
    if (get().motif === id && id !== "none") {
      if (id === "kiku") {
        const s = get();
        if (!kikuMarksReady(s.pins, s.division, s.facingPole)) {
          const marks = kikuWorkingPins(s.division, s.facingPole);
          const onThisPole = s.pins.some((pin) =>
            marks.some((m) => pin.id === m.id || pin.p[0] * m.p[0] + pin.p[1] * m.p[1] + pin.p[2] * m.p[2] > 0.995),
          );
          if (!onThisPole) {
            const kept = [...s.kagariKept, ...s.kagariPlan.slice(0, s.kagariLaid)];
            set({
              pins: [],
              craft: "pin",
              activePin: null,
              pinNote: null,
              kagariSet: 0,
              kikuLayers: 1,
              kagariPlan: [],
              kagariLaid: 0,
              kagariPlaying: false,
              kagariFocus: null,
              kagariKept: kept,
            });
          }
          return;
        }
        const complete = s.kagariLaid >= s.kagariPlan.length && s.kagariPlan.length > 0;
        if (complete && s.kagariSet === 0) {
          // The hand takes the second thread: the palette shows what it holds.
          set({ kagariSet: 1, selectedColor: s.kagariColors[1], kagariEdit: null, kagariHistory: pushKagari(s) });
          get().startKagari();
          return;
        }
        if (complete && s.kagariSet === 1) {
          const next = nextKagariPole(s.division, s.motif, s.kagariPlan, s.kagariKept);
          if (next != null && s.facingPole === next) {
            set({ kagariSet: 0, kikuLayers: 1, selectedColor: s.kagariColors[0], kagariEdit: null,
              kagariHistory: pushKagari(s) });
            get().startKagari();
          }
          return;
        }
      }
      get().startKagari();
      return;
    }
    const pinningKiku = id === "kiku";
    set({
      motif: id,
      sewn: [],
      sewnHistory: [...get().sewnHistory, get().sewn].slice(-40),
      hoverSlot: null,
      kagariSet: 0,
      kikuLayers: 1,
      kagariDir: id === "kiku" ? "out" : get().kagariDir,
      craft: pinningKiku ? "pin" : get().craft,
      pins: pinningKiku ? [] : get().jiwariOn && get().motif !== "none"
        ? withKikuMarks(get(), id) : get().pins,
      pinArcs: pinningKiku ? [] : get().pinArcs,
      pinNote: pinningKiku
        ? kikuPinHint(0, kikuWorkingPins(get().division, get().facingPole).length)
        : null,
      activePin: null,
      ...idleKagari(),
    });
    rememberStudio(get());
    if (id !== "none" && id !== "kiku") get().startKagari();
  },

  setCraft: (craft) => {
    if (get().mode === "kata") return;
    if (!get().layerDone && craft !== "wind") return;
    if (get().layerDone && craft === "wind") return;
    if (get().craft === craft) return;
    set({ craft, hoverSlot: null, activePin: null, pinNote: null });
    rememberStudio(get());
  },

  editThread: (slot) => {
    const state = get();
    set({ kagariEdit: slot, selectedColor: state.kagariColors[slot] });
  },
  setColor: (index) => {
    const selectedColor = clampColor(index);
    const state = get();
    // The palette holds the thread in hand. With the first group finished the
    // hand has already taken the second thread, even though the set only turns
    // over when «Вторая группа» is pressed.
    const laidOut = state.kagariPlan.length > 0 && state.kagariLaid >= state.kagariPlan.length;
    const inHand: 0 | 1 = state.kagariSet === 0 && laidOut ? 1 : state.kagariSet;
    // The thread chosen with «1»/«2», else the one in hand. Outside a kiku the
    // pick is the first working thread; the second one is kept.
    const target: 0 | 1 = state.motif === "kiku" ? (state.kagariEdit ?? inHand) : 0;
    const kagariColors: [number, number] = target === 1
      ? [state.kagariColors[0], selectedColor]
      : [selectedColor, state.kagariColors[1]];
    // Repainting touches only the thread in hand, and only where it is not laid
    // yet. It changes the colour of those stitches and nothing else: rebuilding
    // the plan from the recipe used to put one set's stitches at another set's
    // places once a grown round held both, which moved thread that was about to
    // be sewn.
    if (state.motif === "kiku" && state.kagariPlan.length > 0) {
      const plan = state.kagariPlan.map((stitch, i) =>
        i >= state.kagariLaid && (stitch.kind === "arc" ? (stitch.set ?? inHand) === target : target === inHand)
          ? { ...stitch, color: selectedColor }
          : stitch,
      );
      set({ selectedColor, kagariColors, kagariPlan: plan });
    } else {
      set({ selectedColor, kagariColors });
    }
    rememberStudio(get());
  },
  setWrapColor: (index) => {
    if (get().mode === "studio" && get().layerDone) return;
    const wrapColor = clampColor(index);
    const wrapHex = threadHex(wrapColor);
    set({ wrapColor, wrapHex, selectedColor: wrapColor });
    rememberStudio(get());
  },

  paint: (region) => {
    const state = get();
    if (state.mode !== "kata") return;
    if (region < 0 || region >= state.fills.length) return;
    const next = state.fills.slice();
    next[region] = next[region] === state.selectedColor ? -1 : state.selectedColor;
    const history = [...state.history, state.fills].slice(-40);
    let solved = state.solved;
    const puzzle = PUZZLES[state.puzzleIndex];
    if (puzzle && fillsMatch(next, puzzle.target) && !solved.includes(puzzle.id)) {
      solved = [...solved, puzzle.id];
    }
    set({ fills: next, history, solved, hover: region });
    persist(get().solved);
  },

  sew: (slot) => {
    const state = get();
    if (state.mode !== "studio" || state.craft !== "stitch" || state.motif !== "kiku" ||
        !motifSupport(state.division, state.motif).supported ||
        !kikuMarksReady(state.pins, state.division, state.facingPole)) return;
    const key = slotKey(slot);
    const color = state.selectedColor;
    const prev = state.sewn;
    const index = prev.findIndex((item) => item.key === key);
    let next: SewnEntry[];
    if (index >= 0 && prev[index].color === color) {
      next = prev.filter((_, i) => i !== index);
    } else if (index >= 0) {
      next = prev.slice();
      next[index] = { key, color };
    } else {
      next = [...prev, { key, color }];
    }
    feel.stitch();
    set({
      sewn: next,
      sewnHistory: [...state.sewnHistory, prev].slice(-40),
      hoverSlot: slot,
      motif: state.motif === "kiku" ? "kiku" : state.motif,
    });
    rememberStudio(get());
  },

  placePin: (local) => {
    const state = get();
    if (state.mode !== "studio" || state.craft !== "pin" || !state.layerDone) return;
    if (state.jiwariOn && state.jiwariPhase !== "done") {
      set({ pinNote: "Дождитесь завершения разметки" });
      return;
    }
    const support = motifSupport(state.division, state.motif);
    if (!support.supported) {
      set({ pinNote: support.reason });
      return;
    }
    const point = pinPosition(local, state.division, state.jiwariOn);
    if (!point) return;
    const mark = state.motif === "kiku"
      ? snapToKikuMark(local, state.division, state.facingPole)
      : null;
    const localUnit = pinPosition(local, state.division, false)!;
    const directHit = pinHit(localUnit, state.pins, 0.995);
    if (state.motif === "kiku" && !mark && directHit < 0) {
      set({ pinNote: KIKU_PIN_MISS });
      return;
    }
    const p = mark?.p ?? point;
    // Prefer the actual clicked pin, including a manually placed mark retained
    // after a grid change. A pin is a temporary mark, never a drawing cursor.
    const hit = directHit >= 0 ? directHit : pinHit(p, state.pins, 0.995);
    if (hit < 0 && state.pins.length >= MAX_PINS) {
      set({ pinNote: "На шаре уже 48 булавок. Снимите ненужную." });
      return;
    }
    const snap: PinSnap = {
      pins: state.pins,
      pinArcs: state.pinArcs,
      activePin: state.activePin,
    };
    const pins = hit >= 0
      ? state.pins.filter((_, i) => i !== hit)
      : [...state.pins, { id: mark?.id ?? `p-${Date.now().toString(36)}-${state.pins.length}`, p }];
    feel.pin();
    const note = state.motif === "kiku"
      ? kikuPinHint(
          kikuWorkingPins(state.division, state.facingPole).filter((m) =>
            pins.some((pin) => pin.p[0] * m.p[0] + pin.p[1] * m.p[1] + pin.p[2] * m.p[2] > 0.995),
          ).length,
          kikuWorkingPins(state.division, state.facingPole).length,
        )
      : null;
    set({
      pins,
      activePin: null,
      pinNote: note,
      pinHistory: [...state.pinHistory, snap].slice(-40),
    });
    rememberStudio(get());
  },

  // A free sketch connects existing marks. It is not a compiled sewing recipe.
  sketchToPin: (local) => {
    const state = get();
    if (state.mode !== "studio" || state.craft !== "stitch" ||
        state.motif !== "none" || !state.layerDone) return;
    if (state.jiwariOn && state.jiwariPhase !== "done") {
      set({ pinNote: "Дождитесь завершения разметки" });
      return;
    }
    const p = pinPosition(local, state.division, false);
    if (!p) return;
    const hit = pinHit(p, state.pins, 0.995);
    if (hit < 0) {
      set({ pinNote: "Выберите булавку — линии эскиза соединяют только метки." });
      return;
    }
    const from = state.activePin === null ? null : state.pins[state.activePin];
    if (!from || state.activePin === hit) {
      set({
        activePin: state.activePin === hit ? null : hit,
        pinNote: state.activePin === hit
          ? "Выберите первую булавку для линии эскиза."
          : "Теперь выберите вторую булавку для линии эскиза.",
      });
      return;
    }
    const to = state.pins[hit]!;
    const snap: PinSnap = {
      pins: state.pins,
      pinArcs: state.pinArcs,
      activePin: state.activePin,
    };
    feel.stitch();
    set({
      pinArcs: [...state.pinArcs, { a: from.p, b: to.p, color: state.selectedColor }],
      activePin: hit,
      pinNote: "Линия эскиза добавлена. Выберите следующую булавку.",
      pinHistory: [...state.pinHistory, snap].slice(-40),
    });
    rememberStudio(get());
  },

  undo: () => {
    const state = get();
    if (state.mode === "kata") {
      const prev = state.history[state.history.length - 1];
      if (!prev) return;
      set({
        fills: prev,
        history: state.history.slice(0, -1),
      });
      return;
    }
    if (state.craft === "wind") {
      if (state.wrapCount <= 0) return;
      set({ wrapUndoNonce: state.wrapUndoNonce + 1, wrapProgress: 0 });
      return;
    }
    if (state.craft === "pin" || state.motif === "none") {
      const prev = state.pinHistory[state.pinHistory.length - 1];
      // With no pin step left, the thread is next: marks first, then the flower.
      if (prev) {
        set({
          pins: prev.pins,
          pinArcs: prev.pinArcs,
          activePin: prev.activePin,
          pinNote: null,
          pinHistory: state.pinHistory.slice(0, -1),
        });
        rememberStudio(get());
        return;
      }
    }
    const group = state.kagariHistory[state.kagariHistory.length - 1];
    if (group) {
      // A laid group goes back whole: the needle stops where it entered it, and
      // the hand holds the thread of the group it has returned to.
      set({ ...group, kagariPlaying: false, selectedColor: state.kagariColors[group.kagariSet], kagariEdit: null,
        kagariHistory: state.kagariHistory.slice(0, -1) });
      rememberStudio(get());
      return;
    }
    const prev = state.sewnHistory[state.sewnHistory.length - 1];
    if (!prev) return;
    set({
      sewn: prev,
      sewnHistory: state.sewnHistory.slice(0, -1),
    });
    rememberStudio(get());
  },

  reset: () => {
    const state = get();
    if (state.mode === "title") return;
    if (state.mode === "kata") {
      set({
        fills: emptyFills(state.division),
        history: [...state.history, state.fills].slice(-40),
      });
      return;
    }
    set({
      sewn: [],
      motif: "none",
      sewnHistory: [...state.sewnHistory, state.sewn].slice(-40),
      fills: emptyFills(state.division),
      pins: [],
      pinArcs: [],
      activePin: null,
      pinHistory: [...state.pinHistory, { pins: state.pins, pinArcs: state.pinArcs, activePin: state.activePin }].slice(-40),
      wrapResetNonce: state.wrapResetNonce + 1,
      wrapCount: 1,
      wrapProgress: 1,
      wrapStarted: true,
      layerDone: true,
      craft: "pin",
      startPin: null,
      originNonce: state.originNonce + 1,
      wrapSeed: "full",
      jiwariOn: false,
      jiwariPhase: "off",
      jiwariLaid: 0,
      ...idleKagari(),
    });
    rememberStudio(get());
  },

  setHover: (region) => {
    if (get().hover === region) return;
    set({ hover: region });
  },

  setHoverSlot: (slot) => {
    if (sameSlot(get().hoverSlot, slot)) return;
    set({ hoverSlot: slot });
  },

  setPeeking: (value) => set({ peeking: value }),

  setPuzzle: (index) => {
    const puzzle = PUZZLES[index];
    if (!puzzle) return;
    set({
      mode: "kata",
      puzzleIndex: index,
      division: puzzle.division,
      paletteId: puzzle.paletteId,
      motif: "none",
      craft: "stitch",
      fills: emptyFills(puzzle.division),
      sewn: [],
      pins: [],
      pinArcs: [],
      activePin: null,
      selectedColor: 0,
      history: [],
      sewnHistory: [],
      pinHistory: [],
      peeking: false,
      hover: -1,
      hoverSlot: null,
    });
  },

  nextPuzzle: () => {
    const next = (get().puzzleIndex + 1) % PUZZLES.length;
    get().setPuzzle(next);
  },

  resetView: () => {
    const poles = polePositions(get().division);
    const n = Math.max(1, poles.length);
    const next = get().poseDirty ? 0 : (get().viewPole + 1) % n;
    const state = get();
    const flipped = next !== state.facingPole;
    set({
      viewPole: next,
      facingPole: next,
      viewNonce: state.viewNonce + 1,
      poseDirty: false,
      // A flower there starts with the first working thread again.
      ...(flipped && state.motif === "kiku" ? { selectedColor: state.kagariColors[0], kagariEdit: null } : {}),
      // Turning to another pole starts a new flower there; what is sewn stays sewn.
      ...(flipped && state.motif === "kiku"
        ? {
            pins: [],
            craft: "pin" as const,
            activePin: null,
            pinNote: kikuPinHint(0, kikuWorkingPins(state.division, next).length),
            kagariSet: 0 as const,
            kikuLayers: 1,
            kagariPlan: [],
            kagariLaid: 0,
            kagariPlaying: false,
            kagariFocus: null,
            kagariKept: [...state.kagariKept, ...state.kagariPlan.slice(0, state.kagariLaid)],
          }
        : {}),
    });
  },
  setPoseDirty: () => {
    if (get().poseDirty) return;
    set({ poseDirty: true });
  },
  setWrapCount: (n) => set({ wrapCount: n }),
  setWrapProgress: (n) => set({ wrapProgress: Math.max(0, Math.min(1, n)) }),
  setWrapStarted: () => {
    if (get().wrapStarted) return;
    set({ wrapStarted: true });
  },
  setThreadWidth: (n) => {
    set({ threadWidth: Math.max(0, Math.min(1, n)) });
  },
  finishLayer: () => {
    if (get().mode !== "studio") return;
    feel.layer();
    set({
      layerDone: true,
      wrapPass: 3,
      craft: "pin",
      wrapSeed: "full",
      wrapProgress: 1,
      jiwariOn: false,
      jiwariPhase: "off",
      jiwariLaid: 0,
      pins: [],
    });
  },
  setWrapPass: (pass) => {
    const n = (pass < 1 ? 1 : pass > 3 ? 3 : pass) as 1 | 2 | 3;
    set({ wrapPass: n });
  },
  setKikuLayers: (n) => {
    const max = Math.max(1, currentCap(get()).max);
    set({ kikuLayers: Math.max(1, Math.min(max, Math.round(n))) });
  },
  setKagariDir: (dir) => {
    const next = get().motif === "kiku" ? "out" : dir;
    set({ kagariDir: next });
    if (get().motif !== "none") get().startKagari();
  },
  setKagariSpacing: (spacing) => {
    const state = get();
    const max = kikuCapacity(
      state.pins.map((pin) => pin.p),
      state.threadWidth,
      KAGARI_SPACING_META[spacing].density,
    ).max;
    set({
      kagariSpacing: spacing,
      kikuLayers: Math.max(1, Math.min(Math.max(1, max), state.kikuLayers)),
    });
    if (get().motif !== "none") get().startKagari();
  },
  startKagari: () => {
    const state = get();
    if (state.mode !== "studio" || !state.layerDone) return;
    const support = motifSupport(state.division, state.motif);
    if (!support.supported) {
      set({ ...idleKagari(), pinNote: support.reason });
      return;
    }
    if (state.motif === "none") {
      set(idleKagari());
      return;
    }
    if (state.motif === "kiku" && !kikuMarksReady(state.pins, state.division, state.facingPole)) return;
    const which = state.motif === "obi" ? "all" : state.facingPole;
    const onlySet = state.motif === "kiku" ? state.kagariSet : "all";
    const plan = motifStitchPlan(
      state.division,
      state.motif,
      state.kagariDir,
      state.kagariSpacing,
      which,
      state.motif === "kiku" ? state.kagariColors[state.kagariSet] : state.selectedColor,
      state.kikuLayers,
      onlySet,
    );
    const prev = [...state.kagariKept, ...state.kagariPlan.slice(0, state.kagariLaid)];
    const kept =
      which === "all"
        ? []
        : state.motif === "kiku" && state.kagariSet === 1
          ? prev
          : prev.filter((stitch) => stitchPoleIndex(stitch, state.division, state.motif) !== which);
    const first = 0;
    set({
      // A group opened from here is the first one; later groups record their own step.
      ...(state.kagariPlan.length === 0 ? { kagariHistory: pushKagari(state) } : {}),
      kagariPlan: plan,
      kagariLaid: first,
      kagariPlaying: plan.length > first,
      kagariFocus: stitchFocus(plan[0], state.division, state.motif),
      kagariKept: kept,
      craft: "stitch",
      pins: state.motif === "kiku" ? state.pins : withKikuMarks(state, state.motif),
    });
    rememberStudio(get());
  },
  setFacingPole: (index) => {
    const i = Math.max(0, Math.round(index));
    const state = get();
    if (state.facingPole === i) return;
    set({ facingPole: i });
  },
  advanceKagari: () => {
    const state = get();
    if (!state.kagariPlaying) return;
    const next = state.kagariLaid + 1;
    if (next >= state.kagariPlan.length) {
      feel.kikuFill();
      // Pins are pulled as the work covers them: none are left in a finished flower.
      const full = state.motif === "kiku" && state.kagariSet === 1 &&
        state.kikuLayers >= kikuSpec(state.division, state.kagariSpacing, "fit").capacity;
      const marks = full ? kikuWorkingPins(state.division, state.facingPole) : [];
      // The first group finished: the hand takes the second thread now, so the
      // palette shows what it holds rather than what was just sewn.
      const takesSecond = state.motif === "kiku" && state.kagariSet === 0 &&
        state.kagariPlan.length > 0;
      set({
        kagariLaid: state.kagariPlan.length,
        kagariPlaying: false,
        ...(takesSecond ? { selectedColor: state.kagariColors[1], kagariEdit: null } : {}),
        ...(full
          ? { pins: state.pins.filter((pin) => !marks.some((m) => pin.id === m.id ||
              pin.p[0] * m.p[0] + pin.p[1] * m.p[1] + pin.p[2] * m.p[2] > 0.995)) }
          : {}),
      });
      return;
    }
    feel.stitch();
    const newest = state.kagariPlan[next - 1];
    const focus = stitchFocus(newest, state.division, state.motif);
    set({
      kagariLaid: next,
      kagariFocus: sameFocus(state.kagariFocus, focus) ? state.kagariFocus : focus,
    });
  },
  fillKiku: () => {
    const state = get();
    if (state.mode !== "studio" || !state.layerDone) return;
    const support = motifSupport(state.division, state.motif);
    if (!support.supported) {
      set({ ...idleKagari(), pinNote: support.reason });
      return;
    }
    if (state.motif !== "none") {
      if (state.kagariPlaying) return;
      if (state.kagariLaid < state.kagariPlan.length) {
        set({ kagariPlaying: true });
        return;
      }
      if (state.motif === "kiku") {
        if (!kikuMarksReady(state.pins, state.division, state.facingPole)) return;
        if (state.kagariPlan.length === 0) {
          get().startKagari();
          return;
        }
        const spec = kikuSpec(state.division, state.kagariSpacing, "fit");
        if (state.kagariSet === 0) return;
        if (state.kikuLayers >= spec.capacity) return;
        get().sewKikuRows(1);
        return;
      }
      get().startKagari();
      return;
    }
    if (state.pins.length < 3) return;
    const pts = state.pins.map((pin) => pin.p);
    if (!isClosedContour(pts)) return;
    const density = KAGARI_SPACING_META[state.kagariSpacing].density;
    const extra =
      state.pins.length >= 5
        ? kikuArcsFromPins(
            pts,
            state.kikuLayers,
            state.selectedColor,
            state.kagariDir,
            state.threadWidth,
            density,
          )
        : sakasaArcsFromPins(
            pts,
            state.kikuLayers,
            state.selectedColor,
            state.kagariDir,
            state.threadWidth,
            density,
          );
    if (extra.length === 0) return;
    feel.kikuFill();
    const snap: PinSnap = {
      pins: state.pins,
      pinArcs: state.pinArcs,
      activePin: state.activePin,
    };
    set({
      pinArcs: [...state.pinArcs, ...extra],
      pinHistory: [...state.pinHistory, snap].slice(-40),
    });
    rememberStudio(get());
  },
  setStartPin: (local) => {
    const state = get();
    if (state.mode !== "studio" || state.layerDone) return;
    const len = Math.hypot(local[0], local[1], local[2]) || 1;
    const p: Vec3 = [local[0] / len, local[1] / len, local[2] / len];
    const prev = state.startPin;
    if (prev) {
      const d = prev[0] * p[0] + prev[1] * p[1] + prev[2] * p[2];
      if (d > 0.997) return;
    }
    feel.pin();
    set({
      startPin: p,
      originNonce: state.originNonce + 1,
    });
  },
  finishKiku: () => {
    get().sewKikuRows("all");
  },
  sewKikuRows: (count) => {
    const state = get();
    if (state.mode !== "studio" || !state.layerDone) return;
    if (state.motif !== "kiku" || state.kagariPlaying) return;
    if (!kikuMarksReady(state.pins, state.division, state.facingPole)) return;
    if (state.kagariSet === 0 || state.kagariPlan.length === 0) return;
    if (state.kagariLaid < state.kagariPlan.length) {
      set({ kagariPlaying: true });
      return;
    }
    const spec = kikuSpec(state.division, state.kagariSpacing, "fit");
    if (state.kikuLayers >= spec.capacity) return;
    const add = count === "all" ? spec.capacity - state.kikuLayers : Math.max(1, Math.floor(count));
    const toLayer = Math.min(spec.capacity, state.kikuLayers + add);
    if (toLayer <= state.kikuLayers) return;
    const extra = kikuExtra(state, toLayer);
    if (extra.length === 0) return;
    feel.stitch();
    set({
      kikuLayers: toLayer,
      kagariHistory: pushKagari(state),
      kagariPlan: [...state.kagariPlan, ...extra],
      kagariPlaying: true,
      kagariFocus: stitchFocus(extra[0], state.division, "kiku"),
    });
    rememberStudio(get());
  },
  quickKiku: () => {
    const s = get();
    if (s.mode !== "studio") return;
    feel.unlock();
    feel.pin();
    const facingPole = s.facingPole < polePositions("simple").length ? s.facingPole : 0;
    const sameBall = s.division === "simple" && s.jiwariOn && s.jiwariPhase === "done" && s.motif === "kiku";
    const sewnBefore = sameBall ? [...s.kagariKept, ...s.kagariPlan.slice(0, s.kagariLaid)] : [];
    const pair = sameBall ? s.kagariColors : kikuThreadsFor(s.kagariColors, s.wrapColor);
    set({
      layerDone: true,
      wrapProgress: 1,
      wrapStarted: true,
      wrapSeed: "full",
      wrapPass: 3,
      division: "simple",
      motif: "kiku",
      // The pin tool keeps the working pole fixed, so a nudge cannot move the flower.
      craft: "pin",
      facingPole,
      // Turn that pole to the eye: the marks are then a wide ring, not a rim of dots.
      viewPole: facingPole,
      viewNonce: s.viewNonce + 1,
      poseDirty: false,
      fills: sameBall ? s.fills : emptyFills("simple"),
      // The same pair of threads carries on around one ball; a new ball keeps
      // the player's pair, bar a thread that would vanish on its wrap. Either
      // way the hand takes the first thread, the group this step prepares.
      kagariColors: pair,
      selectedColor: pair[0],
      kagariEdit: null,
      jiwariOn: true,
      jiwariPhase: "done",
      jiwariLaid: 5,
      pins: withKikuMarks({ division: "simple", pins: [], jiwariLaid: 5, jiwariPhase: "done", facingPole }, "kiku"),
      pinArcs: [],
      activePin: null,
      pinNote: null,
      pinHistory: [],
      sewn: [],
      sewnHistory: [],
      hover: -1,
      hoverSlot: null,
      kagariDir: "out",
      kagariSet: 0,
      kikuLayers: 1,
      ...idleKagari(),
      // The flower at this pole starts again; flowers at other poles stay sewn.
      kagariKept: sewnBefore.filter((stitch) => stitchPoleIndex(stitch, "simple", "kiku") !== facingPole),
      // Starting over on a pole that already carries a flower must not lose it
      // silently: «Отменить» puts the thread back the way it was.
      kagariHistory: sewnBefore.length > 0 ? pushKagari(s) : [],
    });
    rememberStudio(get());
  },
  showExample: () => {
    feel.unlock();
    feel.layer();
    set({
      mode: "studio",
      division: "simple",
      paletteId: "beni",
      motif: "kiku",
      sewn: [],
      history: [],
      sewnHistory: [],
      pinHistory: [],
      pinNote: null,
      facingPole: 0,
      ...idleKagari(),
      fills: emptyFills("simple"),
      pinArcs: [],
      activePin: null,
      craft: "stitch",
      layerDone: true,
      wrapProgress: 1,
      wrapCount: 1,
      wrapStarted: true,
      wrapResetNonce: get().wrapResetNonce + 1,
      wrapSeed: "full",
      startPin: null,
      hoverSlot: null,
      // The example is a ball like any other: a pair of threads that reads on
      // its wrap, not a fixed colour that can land invisible on a red one.
      selectedColor: kikuThreads(get().wrapColor)[0],
      kagariColors: kikuThreads(get().wrapColor),
      kagariEdit: null,
      kagariDir: "out",
      kagariSet: 0,
      kikuLayers: 1,
      jiwariOn: true,
      jiwariPhase: "done",
      jiwariLaid: 5,
      pins: withKikuMarks(
        { division: "simple", pins: simplePins("done"), jiwariLaid: 5, jiwariPhase: "done", facingPole: 0 },
        "kiku",
      ),
    });
    rememberStudio(get());
    get().startKagari();
  },
}));
