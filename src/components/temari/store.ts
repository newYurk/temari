import { create } from "zustand";
import {
  emptyFills,
  fillsMatch,
  padFills,
  type Division,
} from "./division";
import { isPaletteId, type PaletteId } from "./palettes";
import {
  fillKikuSewn,
  isMotifId,
  slotKey,
  type KikuSlot,
  type MotifId,
  type SewnEntry,
} from "./patterns";
import { PUZZLES } from "./puzzles";

export type Mode = "title" | "studio" | "kata";

type Save = {
  v: 1;
  division: Division;
  paletteId: PaletteId;
  selectedColor: number;
  fills: number[];
  solved: string[];
  motif?: MotifId;
  sewn?: SewnEntry[];
};

const SAVE_KEY = "temari-v1";

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

function loadSave(): Partial<Save> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Save;
    if (data.v !== 1) return {};
    return data;
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
      ? Math.min(3, Math.max(0, initial.selectedColor))
      : 0,
  fills: Array.isArray(initial.fills) ? initial.fills : emptyFills("c8"),
  motif: isMotifId(initial.motif) ? initial.motif : "none",
  sewn: isSewn(initial.sewn) ? initial.sewn : [],
};

function persist(solved: string[]) {
  writeSave({ v: 1, ...studioDraft, solved });
}

type TemariState = {
  mode: Mode;
  division: Division;
  paletteId: PaletteId;
  motif: MotifId;
  selectedColor: number;
  fills: number[];
  sewn: SewnEntry[];
  hover: number;
  hoverSlot: KikuSlot | null;
  peeking: boolean;
  puzzleIndex: number;
  solved: string[];
  history: number[][];
  sewnHistory: SewnEntry[][];
  viewNonce: number;
  enterStudio: () => void;
  enterKata: (index?: number) => void;
  toTitle: () => void;
  setDivision: (division: Division) => void;
  setPalette: (id: PaletteId) => void;
  setMotif: (id: MotifId) => void;
  setColor: (index: number) => void;
  paint: (region: number) => void;
  sew: (slot: KikuSlot) => void;
  undo: () => void;
  reset: () => void;
  setHover: (region: number) => void;
  setHoverSlot: (slot: KikuSlot | null) => void;
  setPeeking: (value: boolean) => void;
  setPuzzle: (index: number) => void;
  nextPuzzle: () => void;
  resetView: () => void;
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
  };
  persist(state.solved);
}

function sameSlot(a: KikuSlot | null, b: KikuSlot | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.pole === b.pole && a.ring === b.ring && a.sector === b.sector;
}

export const useTemari = create<TemariState>((set, get) => ({
  mode: "title",
  division: "c8",
  paletteId: "beni",
  motif: "kiku",
  selectedColor: 0,
  fills: emptyFills("c8"),
  sewn: [],
  hover: -1,
  hoverSlot: null,
  peeking: false,
  puzzleIndex: 0,
  solved: Array.isArray(initial.solved) ? initial.solved : [],
  history: [],
  sewnHistory: [],
  viewNonce: 0,

  enterStudio: () => {
    const division = studioDraft.division;
    const hasPaint = studioDraft.fills.some((v) => v >= 0);
    const motif = studioDraft.motif === "kiku" && !studioDraft.sewn?.length ? "none" : (studioDraft.motif ?? "none");
    set({
      mode: "studio",
      division,
      paletteId: studioDraft.paletteId,
      motif,
      selectedColor: studioDraft.selectedColor,
      fills: hasPaint ? padFills(studioDraft.fills, division) : emptyFills(division),
      sewn: isSewn(studioDraft.sewn) ? studioDraft.sewn : [],
      history: [],
      sewnHistory: [],
      peeking: false,
      hover: -1,
      hoverSlot: null,
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
      fills: emptyFills(puzzle.division),
      sewn: [],
      selectedColor: 0,
      history: [],
      sewnHistory: [],
      peeking: false,
      hover: -1,
      hoverSlot: null,
    });
  },

  toTitle: () => {
    set({
      mode: "title",
      division: "c8",
      paletteId: "beni",
      motif: "kiku",
      fills: emptyFills("c8"),
      sewn: [],
      peeking: false,
      hover: -1,
      hoverSlot: null,
      history: [],
      sewnHistory: [],
    });
  },

  setDivision: (division) => {
    if (get().mode === "kata") return;
    const motif = get().motif;
    set({
      division,
      fills: emptyFills(division),
      sewn: motif === "kiku" ? fillKikuSewn(division) : [],
      history: [],
      sewnHistory: [],
      hover: -1,
      hoverSlot: null,
    });
    rememberStudio(get());
  },

  setPalette: (id) => {
    if (get().mode === "kata") return;
    set({ paletteId: id });
    rememberStudio(get());
  },

  setMotif: (id) => {
    if (get().mode === "kata") return;
    const division = get().division;
    set({
      motif: id,
      sewn: id === "kiku" ? fillKikuSewn(division) : [],
      sewnHistory: [...get().sewnHistory, get().sewn].slice(-40),
      hoverSlot: null,
    });
    rememberStudio(get());
  },

  setColor: (index) => {
    set({ selectedColor: Math.min(3, Math.max(0, index)) });
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
    if (state.mode !== "studio") return;
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
    set({
      sewn: next,
      sewnHistory: [...state.sewnHistory, prev].slice(-40),
      hoverSlot: slot,
      motif: state.motif === "kiku" ? "kiku" : state.motif,
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
      fills: emptyFills(puzzle.division),
      sewn: [],
      selectedColor: 0,
      history: [],
      sewnHistory: [],
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
}));
