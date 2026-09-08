import {
  ICOSA_FACE_NORMALS,
  REGION_COUNT,
  type Division,
} from "./division";
import { type PaletteId } from "./palettes";

export type Puzzle = {
  id: string;
  name: string;
  hint: string;
  division: Division;
  paletteId: PaletteId;
  target: number[];
};

function fills(division: Division, fn: (i: number) => number): number[] {
  return Array.from({ length: REGION_COUNT[division] }, (_, i) => fn(i));
}

export const PUZZLES: Puzzle[] = [
  {
    id: "poles",
    name: "Север и юг",
    hint: "Два полушария, две нити",
    division: "simple",
    paletteId: "beni",
    target: fills("simple", (i) => (i < 8 ? 0 : 1)),
  },
  {
    id: "gores",
    name: "Доли",
    hint: "Через одну по меридиану",
    division: "simple",
    paletteId: "ai",
    target: fills("simple", (i) => {
      const sector = i % 8;
      return sector % 2 === 0 ? (i < 8 ? 0 : 1) : 2;
    }),
  },
  {
    id: "octa",
    name: "Восемь граней",
    hint: "Соседние грани — разный цвет",
    division: "c8",
    paletteId: "matsu",
    target: fills("c8", (i) => {
      const sx = i & 1;
      const sy = (i >> 1) & 1;
      const sz = (i >> 2) & 1;
      return (sx + sy + sz) % 2 === 0 ? 0 : 2;
    }),
  },
  {
    id: "winds",
    name: "Четыре ветра",
    hint: "Противоположные грани одного цвета",
    division: "c8",
    paletteId: "beni",
    target: fills("c8", (i) => Math.min(i, 7 - i)),
  },
  {
    id: "kiku",
    name: "Хризантема",
    hint: "Пояса от полюса к экватору",
    division: "c10",
    paletteId: "sumi",
    target: fills("c10", (i) => {
      const y = ICOSA_FACE_NORMALS[i]?.[1] ?? 0;
      if (y > 0.4) return 0;
      if (y > 0) return 1;
      if (y > -0.4) return 2;
      return 3;
    }),
  },
];
