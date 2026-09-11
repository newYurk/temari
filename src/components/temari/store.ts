import { create } from "zustand";
import {
  emptyFills,
  fillsMatch,
  padFills,
  snapToNode,
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
  kikuArcsFromPins,
  sakasaArcsFromPins,
  kikuCapacity,
  KAGARI_SPACING_META,
  isClosedContour,
  motifStitchPlan,
  stitchFocus,
  stitchPoleIndex,
  nextKagariPole,
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
import { c8Pins, c10Pins, jiwariNormals, jiwariVisiblePins, simplePins, type JiwariPhase } from "./jiwari";

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
  setWrapColor: (index: number) => void;
  paint: (region: number) => void;
  sew: (slot: KikuSlot) => void;
  placePin: (local: Vec3) => void;
  undo: () => void;
  reset: () => void;
  setHover: (region: number) => void;
  setHoverSlot: (slot: KikuSlot | null) => void;
  setPeeking: (value: boolean) => void;
  setPuzzle: (index: number) => void;
  nextPuzzle: () => void;
  resetView: () => void;
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
  setStartPin: (local: Vec3) => void;
  setFacingPole: (index: number) => void;
  showExample: () => void;
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
  };
  persist(state.solved);
}

function sameSlot(a: KikuSlot | null, b: KikuSlot | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.pole === b.pole && a.ring === b.ring && a.sector === b.sector;
}

function currentCap(state: { pins: Pin[]; threadWidth: number; kagariSpacing: KagariSpacing }) {
  return kikuCapacity(
    state.pins.map((pin) => pin.p),
    state.threadWidth,
    KAGARI_SPACING_META[state.kagariSpacing].density,
  );
}

function idleKagari(): Pick<
  TemariState,
  "kagariPlan" | "kagariLaid" | "kagariPlaying" | "kagariFocus" | "kagariKept"
> {
  return { kagariPlan: [], kagariLaid: 0, kagariPlaying: false, kagariFocus: null, kagariKept: [] };
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
  wrapProgress: 0,
  threadWidth: 0.42,
  wrapStarted: false,
  layerDone: false,
  wrapPass: 3,
  kikuLayers: 8,
  kagariDir: "out",
  kagariSpacing: "even",
  kagariPlan: [],
  kagariLaid: 0,
  kagariPlaying: false,
  kagariFocus: null,
  kagariKept: [],
  facingPole: 0,
  startPin: null,
  originNonce: 0,
  wrapSeed: "full",
  jiwariOn: false,
  jiwariPhase: "off",
  jiwariLaid: 0,

  enterStudio: () => {
    feel.unlock();
    const division = studioDraft.division;
    const hasPaint = studioDraft.fills.some((v) => v >= 0);
    set({
      mode: "studio",
      division,
      paletteId: studioDraft.paletteId,
      motif: "none",
      craft: "pin",
      selectedColor: studioDraft.selectedColor,
      wrapColor: get().wrapColor,
      wrapHex: get().wrapHex,
      fills: hasPaint ? padFills(studioDraft.fills, division) : emptyFills(division),
      sewn: [],
      pins: [],
      pinArcs: [],
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
        jiwariOn: true,
        jiwariPhase: "combine",
        jiwariLaid: 1,
        fills: emptyFills("c8"),
        sewn: [],
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
        jiwariOn: true,
        jiwariPhase: "vruler",
        jiwariLaid: 0,
        fills: emptyFills("c10"),
        sewn: [],
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
      jiwariOn: true,
      jiwariPhase: simple ? "strip" : "done",
      jiwariLaid: simple ? 0 : 5,
      fills: emptyFills(division),
      sewn: [],
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
        set({ jiwariPhase: "done", jiwariLaid: 5, pins: simplePins("done") });
      } else {
        set({ jiwariLaid: next });
      }
    }
  },

  clearJiwari: () => {
    if (get().mode === "kata") return;
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
    if (get().motif === id && id !== "none") {
      get().startKagari();
      return;
    }
    set({
      motif: id,
      sewn: [],
      sewnHistory: [...get().sewnHistory, get().sewn].slice(-40),
      hoverSlot: null,
      ...idleKagari(),
    });
    rememberStudio(get());
    if (id !== "none") get().startKagari();
  },

  setCraft: (craft) => {
    if (get().mode === "kata") return;
    if (!get().layerDone && craft !== "wind") return;
    if (get().layerDone && craft === "wind") return;
    set({ craft, hoverSlot: null, activePin: null });
    rememberStudio(get());
  },

  setColor: (index) => {
    const selectedColor = clampColor(index);
    const state = get();
    if (state.motif === "kiku" && state.kagariPlan.length > 0) {
      const fresh = motifStitchPlan(
        state.division,
        state.motif,
        state.kagariDir,
        state.kagariSpacing,
        state.motif === "obi" ? "all" : state.facingPole,
        selectedColor,
      );
      const plan = state.kagariPlan.map((stitch, i) =>
        i >= state.kagariLaid ? (fresh[i] ?? stitch) : stitch,
      );
      set({ selectedColor, kagariPlan: plan });
    } else {
      set({ selectedColor });
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
    if (state.mode !== "studio" || state.craft !== "stitch") return;
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
    if (state.mode !== "studio" || state.craft !== "pin") return;
    const p: Vec3 = snapToNode(local, state.division);
    const hit = pinHit(p, state.pins, 0.995);
    const snap: PinSnap = {
      pins: state.pins,
      pinArcs: state.pinArcs,
      activePin: state.activePin,
    };
    if (hit >= 0) {
      if (state.activePin === hit) {
        const gone = state.pins[hit];
        if (!gone) return;
        feel.pin();
        set({
          pins: state.pins.filter((_, i) => i !== hit),
          pinArcs: state.pinArcs.filter((arc) => {
            const same = (a: Vec3, b: Vec3) =>
              a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
            return !same(arc.a, gone.p) && !same(arc.b, gone.p);
          }),
          activePin: null,
          pinHistory: [...state.pinHistory, snap].slice(-40),
        });
        rememberStudio(get());
        return;
      }
      if (state.activePin !== null && state.activePin !== hit) {
        const from = state.pins[state.activePin];
        const to = state.pins[hit];
        if (from && to) {
          feel.stitch();
          set({
            pinArcs: [...state.pinArcs, { a: from.p, b: to.p, color: state.selectedColor }],
            activePin: hit,
            pinHistory: [...state.pinHistory, snap].slice(-40),
          });
          rememberStudio(get());
        }
        return;
      }
      set({ activePin: hit });
      return;
    }
    if (state.pins.length >= MAX_PINS) return;
    const pin: Pin = { id: `p-${Date.now().toString(36)}-${state.pins.length}`, p };
    const pins = [...state.pins, pin];
    let pinArcs = state.pinArcs;
    if (state.activePin !== null) {
      const from = state.pins[state.activePin];
      if (from) pinArcs = [...pinArcs, { a: from.p, b: pin.p, color: state.selectedColor }];
    }
    feel.pin();
    set({
      pins,
      pinArcs,
      activePin: pins.length - 1,
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
    if (state.craft === "pin") {
      const prev = state.pinHistory[state.pinHistory.length - 1];
      if (!prev) return;
      set({
        pins: prev.pins,
        pinArcs: prev.pinArcs,
        activePin: prev.activePin,
        pinHistory: state.pinHistory.slice(0, -1),
      });
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

  resetView: () => set({ viewNonce: get().viewNonce + 1 }),
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
    set({ kagariDir: dir });
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
    if (state.motif === "none") {
      set(idleKagari());
      return;
    }
    const which = state.motif === "obi" ? "all" : state.facingPole;
    const plan = motifStitchPlan(
      state.division,
      state.motif,
      state.kagariDir,
      state.kagariSpacing,
      which,
      state.selectedColor,
    );
    const prev = [...state.kagariKept, ...state.kagariPlan.slice(0, state.kagariLaid)];
    const kept =
      which === "all"
        ? []
        : prev.filter((stitch) => stitchPoleIndex(stitch, state.division, state.motif) !== which);
    const first = plan.length > 0 ? 1 : 0;
    if (first) feel.stitch();
    set({
      kagariPlan: plan,
      kagariLaid: first,
      kagariPlaying: plan.length > first,
      kagariFocus: stitchFocus(plan[0], state.division, state.motif),
      kagariKept: kept,
      craft: "stitch",
    });
    rememberStudio(get());
  },
  setFacingPole: (index) => {
    const i = Math.max(0, Math.round(index));
    if (get().facingPole === i) return;
    set({ facingPole: i });
  },
  advanceKagari: () => {
    const state = get();
    if (!state.kagariPlaying) return;
    const next = state.kagariLaid + 1;
    if (next >= state.kagariPlan.length) {
      feel.kikuFill();
      const nextPole = nextKagariPole(
        state.division,
        state.motif,
        state.kagariPlan,
        state.kagariKept,
      );
      if (nextPole == null) {
        set({ kagariLaid: state.kagariPlan.length, kagariPlaying: false });
        return;
      }
      const kept = [...state.kagariKept, ...state.kagariPlan];
      const plan = motifStitchPlan(
        state.division,
        state.motif,
        state.kagariDir,
        state.kagariSpacing,
        nextPole,
        state.selectedColor,
      );
      const first = plan.length > 0 ? 1 : 0;
      if (first) feel.stitch();
      set({
        kagariKept: kept,
        kagariPlan: plan,
        kagariLaid: first,
        kagariPlaying: plan.length > first,
        kagariFocus: stitchFocus(plan[0], state.division, state.motif),
        facingPole: nextPole,
        viewNonce: state.viewNonce + 1,
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
    if (state.motif !== "none") {
      if (state.kagariPlaying) return;
      if (state.kagariLaid < state.kagariPlan.length) {
        set({ kagariPlaying: true });
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
  showExample: () => {
    feel.unlock();
    feel.layer();
    set({
      mode: "studio",
      division: "simple",
      paletteId: "beni",
      motif: "kiku",
      sewn: [],
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
      selectedColor: 0,
      kagariDir: "out",
      jiwariOn: true,
      jiwariPhase: "done",
      jiwariLaid: 5,
      pins: simplePins("done"),
    });
    rememberStudio(get());
    get().startKagari();
  },
}));
