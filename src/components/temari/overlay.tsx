import type { ReactNode } from "react";
import { Eye, LocateFixed, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CRAFT_META, type Craft } from "./craft";
import { DIVISION_META, fillsMatch, type Division } from "./division";
import { PALETTE_LIST, PALETTES } from "./palettes";
import { MOTIF_LIST, MOTIF_META, KAGARI_DIR_META, type KagariDir } from "./patterns";
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
        "pointer-events-auto flex size-10 items-center justify-center rounded-full bg-linen/80 text-ink ring-1 ring-line",
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
    <div className="flex h-full flex-col px-5 py-6 md:px-10 md:py-10">
      <div className="flex items-start justify-between gap-4 pt-[env(safe-area-inset-top)]">
        <div className="max-w-md">
          <h1 className="temari-rise font-display text-4xl font-medium tracking-tight text-ink md:text-5xl">
            Темари
          </h1>
          <p className="temari-rise temari-rise-2 mt-2 max-w-sm text-sm leading-relaxed text-stone">
            Сначала тонкая намотка. Потом кагари: ряды ёлочки от полюса, или
            фигура по меткам — от большого края внутрь. Булавки только метят углы.
          </p>
        </div>
        <RecenterButton />
      </div>
      <div className="min-h-0 flex-1" aria-hidden />
      <div className="temari-rise temari-rise-3 pointer-events-auto max-w-md pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            onPointerDown={() => unlock()}
            onClick={enterStudio}
            className="bg-ink text-linen"
          >
            Намотать базу
          </Button>
          <Button
            variant="ghost"
            className="text-ink ring-line hover:bg-ink/5"
            onClick={() => useTemari.getState().showExample()}
          >
            Пример кику
          </Button>
          <a
            href="./design.html"
            className="inline-flex h-9 items-center px-2 text-xs tracking-wide text-stone underline-offset-4 hover:text-ink hover:underline"
          >
            схема нити
          </a>
          <Button
            variant="ghost"
            className="text-ink ring-line hover:bg-ink/5"
            onClick={() => enterKata()}
          >
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
        "min-h-10 flex-1 rounded-full px-2 text-xs tracking-wide ring-1 transition-colors duration-150",
        active
          ? "bg-ink/8 text-ink ring-line-strong"
          : "text-stone ring-line hover:text-ink",
        disabled && "opacity-35",
      )}
    >
      {children}
    </button>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-full text-ink ring-1 ring-line disabled:opacity-35"
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
  const kagariDir = useTemari((s) => s.kagariDir);
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
  const setKagariDir = useTemari((s) => s.setKagariDir);
  const fillKiku = useTemari((s) => s.fillKiku);
  const setPeeking = useTemari((s) => s.setPeeking);
  const setPuzzle = useTemari((s) => s.setPuzzle);
  const nextPuzzle = useTemari((s) => s.nextPuzzle);
  const showExample = useTemari((s) => s.showExample);

  const palette = PALETTES[paletteId];
  const puzzle = PUZZLES[puzzleIndex];
  const complete =
    mode === "kata" && puzzle ? fillsMatch(fills, puzzle.target) : false;

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
        ? wrapProgress >= 0.9
          ? "можно ещё мотать, или завершите слой"
          : "полный круг, потом чуть повернуть — в середине витка нельзя"
        : craft === "pin"
          ? "дзивари поверх базы — булавка только метит угол"
          : motif === "kiku"
            ? MOTIF_META.kiku.hint
            : CRAFT_META[craft].hint
      : puzzle
        ? puzzle.hint
        : "";

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-4 pt-4 md:px-8 md:pt-8">
        <div className="pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={toTitle}
            className="pointer-events-auto font-display text-xl font-medium tracking-tight text-ink"
          >
            Темари
          </button>
          <p className="mt-0.5 max-w-[16rem] text-xs tracking-wide text-stone">{hint}</p>
        </div>
        <div className="flex items-start gap-2 pt-[env(safe-area-inset-top)]">
          {mode === "kata" && puzzle ? (
            <div className="pointer-events-auto text-right">
              <p className="font-display text-lg text-ink">{puzzle.name}</p>
              <p className="text-xs tabular-nums text-stone">
                {solved.length} / {PUZZLES.length}
              </p>
            </div>
          ) : null}
          <RecenterButton />
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-linen from-55% via-linen/95 to-transparent" />
        <div className="pointer-events-auto relative px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-8">
        <div className="mx-auto flex max-w-lg flex-col gap-1.5">
          {mode === "studio" && !layerDone ? (
            <>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-line" />
                <div
                  className="h-1 w-16 overflow-hidden rounded-full bg-paper"
                  aria-hidden
                >
                  <div
                    className="h-full bg-cinnabar/70 transition-[width] duration-150"
                    style={{ width: `${Math.round(wrapProgress * 100)}%` }}
                  />
                </div>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={threadWidth}
                  aria-label="Толщина нити"
                  onChange={(e) => setThreadWidth(Number(e.target.value))}
                  className="h-10 min-w-0 flex-1 accent-ink"
                />
                <button
                  type="button"
                  onClick={finishLayer}
                  className="min-h-10 shrink-0 rounded-full px-4 text-xs tracking-wide text-ink ring-1 ring-line"
                >
                  Завершить
                </button>
              </div>
            </>
          ) : null}

          {mode === "studio" && layerDone ? (
            <>
              <div className="flex gap-1">
                {(["pin", "stitch"] as Craft[]).map((id) => (
                  <Seg key={id} active={craft === id} onClick={() => setCraft(id)}>
                    {CRAFT_META[id].label}
                  </Seg>
                ))}
              </div>
              <div className="flex gap-1">
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
                <div className="flex items-center gap-1">
                  {(["in", "out"] as KagariDir[]).map((id) => (
                    <Seg
                      key={id}
                      active={kagariDir === id}
                      onClick={() => setKagariDir(id)}
                    >
                      {KAGARI_DIR_META[id].label}
                    </Seg>
                  ))}
                  <button
                    type="button"
                    onClick={fillKiku}
                    className="min-h-10 flex-[1.4] rounded-full px-3 text-xs tracking-wide text-ink ring-1 ring-line"
                  >
                    Залить
                  </button>
                  <button
                    type="button"
                    aria-label="Меньше слоёв"
                    onClick={() => setKikuLayers(kikuLayers - 1)}
                    className="flex size-10 items-center justify-center rounded-full text-stone ring-1 ring-line"
                  >
                    −
                  </button>
                  <span className="min-w-6 text-center text-xs tabular-nums text-ink">
                    {kikuLayers}
                  </span>
                  <button
                    type="button"
                    aria-label="Больше слоёв"
                    onClick={() => setKikuLayers(kikuLayers + 1)}
                    className="flex size-10 items-center justify-center rounded-full text-stone ring-1 ring-line"
                  >
                    +
                  </button>
                </div>
              ) : null}
              {craft === "stitch" ? (
                <div className="flex gap-1">
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
          ) : null}

          {mode === "kata" ? (
            <div className="flex gap-1 overflow-x-auto">
              {PUZZLES.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPuzzle(i)}
                  className={cn(
                    "min-h-10 shrink-0 rounded-full px-3 text-xs tracking-wide ring-1",
                    i === puzzleIndex
                      ? "bg-ink/8 text-ink ring-line-strong"
                      : "text-stone ring-line",
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-1.5">
            <div className="flex min-w-0 flex-1 gap-1">
              {PALETTE_LIST.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPalette(item.id)}
                  className={cn(
                    "min-h-8 flex-1 rounded-full px-1 text-xs tracking-wide",
                    paletteId === item.id ? "text-ink" : "text-stone",
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-2">
              {palette.colors.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Нить ${i + 1}`}
                  onClick={() => setColor(i)}
                  className={cn(
                    "size-8 rounded-full transition-transform duration-150 active:scale-[0.96]",
                    selectedColor === i ? "ring-2 ring-ink ring-offset-2 ring-offset-linen" : "ring-1 ring-line",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex gap-1">
              {mode === "kata" ? (
                <button
                  type="button"
                  className="flex size-10 items-center justify-center rounded-full text-ink ring-1 ring-line"
                  aria-label="Показать образец"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setPeeking(true);
                  }}
                  onPointerUp={() => setPeeking(false)}
                  onPointerCancel={() => setPeeking(false)}
                >
                  <Eye className="size-4" />
                </button>
              ) : (
                <button
                  type="button"
                  className="min-h-10 rounded-full px-3 text-xs tracking-wide text-ink ring-1 ring-line"
                  aria-label="Пример кику"
                  onClick={showExample}
                >
                  Пример
                </button>
              )}
              <IconBtn label="Отменить" disabled={undoDisabled} onClick={undo}>
                <Undo2 className="size-4" />
              </IconBtn>
              <IconBtn label="Сбросить слой" onClick={reset}>
                <RotateCcw className="size-4" />
              </IconBtn>
            </div>
          </div>

          {complete ? (
            <div className="flex items-center justify-between gap-3 rounded-full px-3 py-1.5 ring-1 ring-line">
              <p className="font-display text-base text-ink">Собрано</p>
              <Button size="compact" className="bg-ink text-linen" onClick={nextPuzzle}>
                Далее
              </Button>
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </>
  );
}
