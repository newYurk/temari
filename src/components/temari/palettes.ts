export type PaletteId = "beni" | "ai" | "matsu" | "sumi";

export type Palette = {
  id: PaletteId;
  name: string;
  reading: string;
  core: string;
  thread: string;
  colors: [string, string, string, string];
};

/** Flat tray for now — any action, any of these. Groups later. */
export const THREAD_COLORS = [
  "#8f3d32",
  "#c4a574",
  "#ece8e1",
  "#2a2420",
  "#3d5f86",
] as const;

export const COLOR_COUNT = THREAD_COLORS.length;

export function clampColor(index: number) {
  return Math.min(COLOR_COUNT - 1, Math.max(0, Math.round(index)));
}

export function threadHex(index: number) {
  return THREAD_COLORS[clampColor(index)] ?? THREAD_COLORS[0];
}

export const PALETTES: Record<PaletteId, Palette> = {
  beni: {
    id: "beni",
    name: "Бэни",
    reading: "киноварь",
    core: "#d8d0c4",
    thread: "#6e5a48",
    colors: ["#8f3d32", "#c4a574", "#ece8e1", "#2a2420"],
  },
  ai: {
    id: "ai",
    name: "Ай",
    reading: "индиго",
    core: "#d4cfc5",
    thread: "#4a5360",
    colors: ["#2a3a4a", "#7b8b98", "#ece8e1", "#1a1c20"],
  },
  matsu: {
    id: "matsu",
    name: "Мацу",
    reading: "сосна",
    core: "#d6d0c4",
    thread: "#4a5346",
    colors: ["#3d4f3a", "#8a847c", "#ece8e1", "#1c1a16"],
  },
  sumi: {
    id: "sumi",
    name: "Суми",
    reading: "тушь",
    core: "#e2ddd4",
    thread: "#3a3834",
    colors: ["#1a1916", "#8a847c", "#ece8e1", "#4a4640"],
  },
};

export const PALETTE_LIST: Palette[] = [
  PALETTES.beni,
  PALETTES.ai,
  PALETTES.matsu,
  PALETTES.sumi,
];

export function isPaletteId(value: unknown): value is PaletteId {
  return value === "beni" || value === "ai" || value === "matsu" || value === "sumi";
}
