import type { ReactNode } from "react";
import { Eye, LocateFixed, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CRAFT_META, WRAP_META, WRAP_STYLES, type Craft } from "./craft";
import { DIVISION_META, fillsMatch, type Division } from "./division";
import { PALETTE_LIST, PALETTES } from "./palettes";
import { MOTIF_LIST, MOTIF_META } from "./patterns";
import { PUZZLES } from "./puzzles";
import { useTemari } from "./store";
import { unlock } from "./feel";

const DIVISIONS: Division[] = ["simple", "c8", "c10"];

export function Overlay() {
  const mode = useTemari((s) => s.mode);

  if (mode === "title") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20">
        <TitleLayer />
      </div>
    );
  }

  return <Workbench />;
}

function RecenterButton({ className }: { className?: string }) {
  const resetView = useTemari((s) => s.resetView);
  return (
    <button
      type="button"
      aria-label="Вернуть шар в исходный вид"
      onClick={resetView}
      className={cn(
        "pointer-events-auto flex size-11 items-center justify-center rounded-full bg-elevated/90 text-linen ring-1 ring-linen/15",
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
          Крутите шар — нить идёт вокруг или спиралью от булавки-начала.
          Смена цвета — от того же места или от новой булавки. Ошибиться нельзя.
        </p>
        <div className="temari-rise temari-rise-4 pointer-events-auto mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            onPointerDown={() => unlock()}
            onClick={enterStudio}
          >
            Начать
          </Button>
          <Button variant="ghost" onClick={() => enterKata()}>
            По образцу
          </Button>
        </div>
      </div>
    </div>
  );
}

function Seg({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-11 flex-1 rounded-sm px-2 text-xs tracking-wide transition-colors duration-150",
        active ? "bg-linen/10 text-linen" : "text-stone hover:text-linen",
        disabled && "opacity-35",
      )}
    >
      {children}
    </button>
  );
}

function Workbench() {
  const mode = useTemari((s) => s.mode);
  const division = useTemari((s) => s.division);
  const paletteId = useTemari((s) => s.paletteId);
  const motif = useTemari((s) => s.motif);
  const craft = useTemari((s) => s.craft);
  const selectedColor = useTemari((s) => s.selectedColor);
  const fills = useTemari((s) => s.fills);
  const pins = useTemari((s) => s.pins);
  const puzzleIndex = useTemari((s) => s.puzzleIndex);
  const solved = useTemari((s) => s.solved);
  const history = useTemari((s) => s.history);
  const sewnHistory = useTemari((s) => s.sewnHistory);
  const pinHistory = useTemari((s) => s.pinHistory);
  const wrapCount = useTemari((s) => s.wrapCount);
  const wrapProgress = useTemari((s) => s.wrapProgress);
  const threadWidth = useTemari((s) => s.threadWidth);
  const layerDone = useTemari((s) => s.layerDone);
  const kikuLayers = useTemari((s) => s.kikuLayers);
  const wrapStyle = useTemari((s) => s.wrapStyle);
  const startPin = useTemari((s) => s.startPin);
  const toTitle = useTemari((s) => s.toTitle);
  const setDivision = useTemari((s) => s.setDivision);
  const setPalette = useTemari((s) => s.setPalette);
  const setMotif = useTemari((s) => s.setMotif);
  const setCraft = useTemari((s) => s.setCraft);
  const setColor = useTemari((s) => s.setColor);
  const undo = useTemari((s) => s.undo);
  const reset = useTemari((s) => s.reset);
  const finishLayer = useTemari((s) => s.finishLayer);
  const setThreadWidth = useTemari((s) => s.setThreadWidth);
  const setKikuLayers = useTemari((s) => s.setKikuLayers);
  const fillKiku = useTemari((s) => s.fillKiku);
  const setWrapStyle = useTemari((s) => s.setWrapStyle);
  const setPeeking = useTemari((s) => s.setPeeking);
  const setPuzzle = useTemari((s) => s.setPuzzle);
  const nextPuzzle = useTemari((s) => s.nextPuzzle);

  const palette = PALETTES[paletteId];
  const puzzle = PUZZLES[puzzleIndex];
  const complete =
    mode === "kata" && puzzle ? fillsMatch(fills, puzzle.target) : false;
  const embroidering = mode === "studio" && layerDone;

  const undoDisabled =
    mode === "kata"
      ? history.length === 0
      : craft === "wind"
        ? wrapCount === 0
        : craft === "pin"
          ? pinHistory.length === 0
          : sewnHistory.length === 0;

  const hint =
    mode === "studio"
      ? !layerDone
        ? wrapProgress >= 1
          ? "слой набран — завершите, чтобы вышивать"
          : startPin
            ? WRAP_META[wrapStyle].hint
            : "тык — булавка-начало, крутите шар"
        : craft === "pin" && pins.length >= 3
          ? "три булавки — можно залить кику"
          : CRAFT_META[craft].hint
      : puzzle
        ? puzzle.hint
        : "";

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-5 pt-5 md:px-8 md:pt-8">
        <div className="pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={toTitle}
            className="pointer-events-auto font-display text-xl font-medium tracking-tight text-linen"
          >
            Темари
          </button>
          <p className="mt-1 max-w-[16rem] text-xs tracking-wide text-stone">{hint}</p>
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

      <div className="pointer-events-auto relative z-20 shrink-0 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] md:px-8">
        <div className="mx-auto max-w-xl rounded-xl bg-elevated/95 p-2 ring-1 ring-linen/10 md:p-3">
          {mode === "studio" ? (
            <>
              <div className="mb-1.5 flex gap-1 rounded-md bg-ink p-0.5">
                <Seg
                  active={craft === "wind"}
                  disabled={layerDone}
                  onClick={() => setCraft("wind")}
                >
                  Намотка
                </Seg>
                <Seg
                  active={embroidering}
                  disabled={!layerDone}
                  onClick={() => setCraft(craft === "stitch" ? "stitch" : "pin")}
                >
                  Вышивка
                </Seg>
              </div>

              {!layerDone ? (
                <div className="mb-1.5 px-0.5">
                  <div className="mb-1.5 flex gap-1 rounded-md bg-ink p-0.5">
                    {WRAP_STYLES.map((id) => (
                      <Seg
                        key={id}
                        active={wrapStyle === id}
                        onClick={() => setWrapStyle(id)}
                      >
                        {WRAP_META[id].label}
                      </Seg>
                    ))}
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-ink">
                    <div
                      className="h-full bg-linen/55 transition-[width] duration-150"
                      style={{ width: `${Math.round(wrapProgress * 100)}%` }}
                    />
                  </div>
                  <label className="mt-2 flex items-center gap-3">
                    <span className="block h-px w-4 shrink-0 bg-stone/70" aria-hidden />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={threadWidth}
                      aria-label="Толщина нити"
                      onChange={(e) => setThreadWidth(Number(e.target.value))}
                      className="h-11 w-full accent-linen"
                    />
                    <span className="block h-1 w-5 shrink-0 rounded-full bg-stone" aria-hidden />
                  </label>
                  <button
                    type="button"
                    onClick={finishLayer}
                    className="mt-1.5 min-h-11 w-full rounded-md bg-ink px-2 text-xs tracking-wide text-linen ring-1 ring-linen/10"
                  >
                    Завершить слой
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-1.5 flex gap-1 rounded-md bg-ink p-0.5">
                    {(["pin", "stitch"] as Craft[]).map((id) => (
                      <Seg key={id} active={craft === id} onClick={() => setCraft(id)}>
                        {CRAFT_META[id].label}
                      </Seg>
                    ))}
                  </div>
                  <div className="mb-1.5 flex gap-1 rounded-md bg-ink p-0.5">
                    {DIVISIONS.map((id) => (
                      <Seg
                        key={id}
                        active={division === id}
                        onClick={() => setDivision(id)}
                      >
                        {DIVISION_META[id].label}
                      </Seg>
                    ))}
                  </div>
                  {craft === "pin" && pins.length >= 3 ? (
                    <div className="mb-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={fillKiku}
                        className="min-h-11 flex-1 rounded-md bg-ink px-2 text-xs tracking-wide text-linen ring-1 ring-linen/10"
                      >
                        Заполнить кику
                      </button>
                      <button
                        type="button"
                        aria-label="Меньше слоёв"
                        onClick={() => setKikuLayers(kikuLayers - 1)}
                        className="flex size-11 items-center justify-center rounded-md text-stone ring-1 ring-linen/10"
                      >
                        −
                      </button>
                      <span className="min-w-10 text-center text-xs tabular-nums text-linen">
                        {kikuLayers}
                      </span>
                      <button
                        type="button"
                        aria-label="Больше слоёв"
                        onClick={() => setKikuLayers(kikuLayers + 1)}
                        className="flex size-11 items-center justify-center rounded-md text-stone ring-1 ring-linen/10"
                      >
                        +
                      </button>
                    </div>
                  ) : null}
                  {craft === "stitch" ? (
                    <div className="mb-1.5 flex gap-1 rounded-md bg-ink p-0.5">
                      {MOTIF_LIST.map((id) => (
                        <Seg
                          key={id}
                          active={motif === id}
                          onClick={() => setMotif(id)}
                        >
                          {MOTIF_META[id].label}
                        </Seg>
                      ))}
                    </div>
                  ) : null}
                </>
              )}

              <div className="mb-1.5 flex gap-1">
                {PALETTE_LIST.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPalette(item.id)}
                    className={cn(
                      "min-h-11 flex-1 rounded-sm px-1 text-xs tracking-wide transition-colors duration-150",
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
                    "min-h-11 shrink-0 rounded-sm px-3 text-xs tracking-wide transition-colors duration-150",
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
            <div className="flex flex-1 gap-2">
              {palette.colors.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Нить ${i + 1}`}
                  onClick={() => setColor(i)}
                  className={cn(
                    "size-11 rounded-full transition-transform duration-150 active:scale-[0.96]",
                    selectedColor === i
                      ? "ring-2 ring-linen ring-offset-2 ring-offset-elevated"
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
                  className="size-11 px-0"
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
              ) : embroidering ? (
                <Button
                  variant="ghost"
                  className="min-h-11 px-2.5 text-xs"
                  aria-label="Пример узора"
                  onClick={() => {
                    setCraft("stitch");
                    setMotif("kiku");
                  }}
                >
                  Пример
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="size-11 px-0"
                aria-label="Отменить"
                disabled={undoDisabled}
                onClick={undo}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                className="size-11 px-0"
                aria-label="Сбросить слой"
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
    </>
  );
}
