import { Eye, LocateFixed, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIVISION_META, fillsMatch, type Division } from "./division";
import { PALETTE_LIST, PALETTES } from "./palettes";
import { MOTIF_LIST, MOTIF_META } from "./patterns";
import { PUZZLES } from "./puzzles";
import { useTemari } from "./store";

const DIVISIONS: Division[] = ["simple", "c8", "c10"];

export function Overlay() {
  const mode = useTemari((s) => s.mode);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {mode === "title" ? <TitleLayer /> : <Workbench />}
    </div>
  );
}

function RecenterButton({ className }: { className?: string }) {
  const resetView = useTemari((s) => s.resetView);
  return (
    <button
      type="button"
      aria-label="Вернуть шар в исходный вид"
      onClick={resetView}
      className={cn(
        "pointer-events-auto flex size-10 items-center justify-center rounded-full bg-elevated/90 text-linen ring-1 ring-linen/15",
        className,
      )}
    >
      <LocateFixed className="size-4" />
    </button>
  );
}

function TitleLayer() {
  const enterStudio = useTemari((s) => s.enterStudio);
  const enterKata = useTemari((s) => s.enterKata);

  return (
    <div className="flex h-full flex-col justify-between px-6 py-8 md:px-10 md:py-10">
      <div className="flex items-start justify-between pt-[env(safe-area-inset-top)]">
        <p className="temari-rise font-display text-sm italic tracking-wide text-stone">
          нить на сфере
        </p>
        <RecenterButton />
      </div>
      <div className="max-w-md pb-[env(safe-area-inset-bottom)]">
        <h1 className="temari-rise temari-rise-2 font-display text-5xl font-medium tracking-tight text-linen md:text-6xl">
          Темари
        </h1>
        <p className="temari-rise temari-rise-3 mt-3 max-w-sm text-sm leading-relaxed text-stone">
          Кику, хоси, хиси, оби — готовые узоры. В студии кладёте стежок за
          стежком по сетке деления.
        </p>
        <div className="temari-rise temari-rise-4 pointer-events-auto mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={enterStudio}>Начать</Button>
          <Button variant="ghost" onClick={() => enterKata()}>
            По образцу
          </Button>
        </div>
      </div>
    </div>
  );
}

function Workbench() {
  const mode = useTemari((s) => s.mode);
  const division = useTemari((s) => s.division);
  const paletteId = useTemari((s) => s.paletteId);
  const motif = useTemari((s) => s.motif);
  const selectedColor = useTemari((s) => s.selectedColor);
  const fills = useTemari((s) => s.fills);
  const puzzleIndex = useTemari((s) => s.puzzleIndex);
  const solved = useTemari((s) => s.solved);
  const history = useTemari((s) => s.history);
  const sewnHistory = useTemari((s) => s.sewnHistory);
  const toTitle = useTemari((s) => s.toTitle);
  const setDivision = useTemari((s) => s.setDivision);
  const setPalette = useTemari((s) => s.setPalette);
  const setMotif = useTemari((s) => s.setMotif);
  const setColor = useTemari((s) => s.setColor);
  const undo = useTemari((s) => s.undo);
  const reset = useTemari((s) => s.reset);
  const setPeeking = useTemari((s) => s.setPeeking);
  const setPuzzle = useTemari((s) => s.setPuzzle);
  const nextPuzzle = useTemari((s) => s.nextPuzzle);

  const palette = PALETTES[paletteId];
  const puzzle = PUZZLES[puzzleIndex];
  const complete =
    mode === "kata" && puzzle ? fillsMatch(fills, puzzle.target) : false;

  return (
    <div className="flex h-full flex-col justify-between">
      <header className="flex items-start justify-between gap-4 px-5 pt-5 md:px-8 md:pt-8">
        <div className="pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={toTitle}
            className="pointer-events-auto font-display text-xl font-medium tracking-tight text-linen"
          >
            Темари
          </button>
          <p className="mt-1 text-xs tracking-wide text-stone">
            {mode === "studio"
              ? MOTIF_META[motif].hint
              : puzzle
                ? puzzle.hint
                : ""}
          </p>
        </div>
        <div className="flex items-start gap-2 pt-[env(safe-area-inset-top)]">
          {mode === "kata" && puzzle ? (
            <div className="pointer-events-auto text-right">
              <p className="font-display text-lg text-linen">{puzzle.name}</p>
              <p className="text-xs tabular-nums text-stone">
                {solved.length} / {PUZZLES.length}
              </p>
            </div>
          ) : null}
          <RecenterButton />
        </div>
      </header>

      <div className="pointer-events-auto px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] md:px-8">
        <div className="mx-auto max-w-xl rounded-xl bg-elevated/95 p-2 ring-1 ring-linen/10 md:p-3">
          {mode === "studio" ? (
            <>
              <div className="mb-1.5 flex gap-1 rounded-md bg-ink p-0.5">
                {DIVISIONS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDivision(id)}
                    className={cn(
                      "min-h-9 flex-1 rounded-sm px-2 text-sm transition-colors duration-150",
                      division === id
                        ? "bg-linen/10 text-linen"
                        : "text-stone hover:text-linen",
                    )}
                  >
                    {DIVISION_META[id].label}
                  </button>
                ))}
              </div>
              <div className="mb-1.5 flex gap-1 rounded-md bg-ink p-0.5">
                {MOTIF_LIST.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMotif(id)}
                    className={cn(
                      "min-h-9 flex-1 rounded-sm px-1 text-xs tracking-wide transition-colors duration-150",
                      motif === id ? "bg-linen/10 text-linen" : "text-stone hover:text-linen",
                    )}
                  >
                    {MOTIF_META[id].label}
                  </button>
                ))}
              </div>
              <div className="mb-1.5 flex gap-1">
                {PALETTE_LIST.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPalette(item.id)}
                    className={cn(
                      "min-h-8 flex-1 rounded-sm px-1 text-[11px] tracking-wide transition-colors duration-150",
                      paletteId === item.id ? "text-linen" : "text-stone hover:text-linen",
                    )}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mb-1.5 flex gap-1 overflow-x-auto rounded-md bg-ink p-0.5">
              {PUZZLES.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPuzzle(i)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-sm px-3 text-xs tracking-wide transition-colors duration-150",
                    i === puzzleIndex
                      ? "bg-linen/10 text-linen"
                      : "text-stone hover:text-linen",
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1.5">
              {palette.colors.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Нить ${i + 1}`}
                  onClick={() => setColor(i)}
                  className={cn(
                    "size-9 rounded-md transition-transform duration-150 active:scale-[0.96]",
                    selectedColor === i
                      ? "ring-2 ring-linen ring-offset-1 ring-offset-elevated"
                      : "ring-1 ring-linen/15",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex gap-1">
              {mode === "kata" ? (
                <Button
                  variant="ghost"
                  className="min-h-9 px-2.5"
                  aria-label="Показать образец"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setPeeking(true);
                  }}
                  onPointerUp={() => setPeeking(false)}
                  onPointerCancel={() => setPeeking(false)}
                >
                  <Eye className="size-4" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="min-h-9 px-2.5"
                aria-label="Отменить"
                disabled={mode === "kata" ? history.length === 0 : sewnHistory.length === 0}
                onClick={undo}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                className="min-h-9 px-2.5"
                aria-label="Сбросить"
                onClick={reset}
              >
                <RotateCcw className="size-4" />
              </Button>
            </div>
          </div>

          {complete ? (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-ink px-3 py-2">
              <p className="font-display text-base text-linen">Собрано</p>
              <Button size="compact" onClick={nextPuzzle}>
                Далее
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
