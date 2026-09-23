import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PUZZLES } from "./puzzles";
import { fillsMatch, polePositions } from "./division";
import { useTemari } from "./store";
import { ActionBar } from "./ActionBar";
import { IconPoles } from "./icons";

function useChromeVar(
  name: "--temari-chrome-top" | "--temari-chrome-bottom",
  ref: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      document.documentElement.style.setProperty(
        name,
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty(name);
    };
  }, [name]);
}

export function Overlay() {
  const mode = useTemari((s) => s.mode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("kiku") === "1") {
      useTemari.getState().showExample();
      return;
    }
    if (useTemari.getState().mode === "title") useTemari.getState().enterStudio();
  }, []);

  return mode === "title" ? null : <Workbench />;
}

function RecenterButton({ className }: { className?: string }) {
  const resetView = useTemari((s) => s.resetView);
  const viewPole = useTemari((s) => s.viewPole);
  const poseDirty = useTemari((s) => s.poseDirty);
  const division = useTemari((s) => s.division);
  const n = polePositions(division).length;
  const nextNorth = poseDirty || viewPole !== 0 || n !== 2;
  const label =
    n === 2
      ? nextNorth
        ? "Показать север"
        : "Показать юг"
      : "Показать следующий полюс";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={resetView}
      className={cn(
        "pointer-events-auto flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-linen/80 px-2.5 text-sm text-ink ring-1 ring-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-3",
        className,
      )}
    >
      <IconPoles next={nextNorth ? "north" : "south"} className="size-5" />
      <span className="max-w-32 text-xs sm:max-w-none sm:text-sm">{n === 2 ? label : "Следующий полюс"}</span>
    </button>
  );
}

function Workbench() {
  const mode = useTemari((s) => s.mode);
  const puzzleIndex = useTemari((s) => s.puzzleIndex);
  const solved = useTemari((s) => s.solved);
  const fills = useTemari((s) => s.fills);
  const setPuzzle = useTemari((s) => s.setPuzzle);
  const nextPuzzle = useTemari((s) => s.nextPuzzle);
  const puzzle = PUZZLES[puzzleIndex];
  const complete = mode === "kata" && puzzle ? fillsMatch(fills, puzzle.target) : false;

  const headerRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useChromeVar("--temari-chrome-top", headerRef);
  useChromeVar("--temari-chrome-bottom", dockRef);

  return (
    <>
      <header
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 md:px-8 md:pt-8"
      >
        <div className="pt-[env(safe-area-inset-top)]">
          <p className="font-display text-xl font-medium tracking-tight text-ink">Темари</p>
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
        {mode === "studio" && <p className="pointer-events-auto basis-full rounded-lg bg-ink/5 px-3 py-2 text-xs leading-relaxed" aria-label="Состояние модели мастерской">
          <b>Модель в работе.</b> Ширина подхвата, укладка и проколы ещё не исправлены.{" "}
          <a className="underline underline-offset-2" href="?upper-bundle=1&control=needle">Проверка одного прохода</a>
        </p>}
      </header>
      {mode === "kata" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 px-3 md:px-8">
          <div className="pointer-events-auto mx-auto flex max-w-lg gap-1 overflow-x-auto">
            {PUZZLES.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPuzzle(i)}
                className={cn(
                  "min-h-8 shrink-0 rounded-full px-3 text-xs tracking-wide ring-1",
                  i === puzzleIndex
                    ? "bg-ink/8 text-ink ring-line-strong"
                    : "text-stone ring-line",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
          {complete ? (
            <div className="pointer-events-auto mx-auto mt-1 flex max-w-lg items-center justify-between gap-3 rounded-full px-3 py-1 ring-1 ring-line">
              <p className="font-display text-base text-ink">Собрано</p>
              <Button size="compact" className="bg-ink text-linen" onClick={nextPuzzle}>
                Далее
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <ActionBar chromeRef={dockRef} />
    </>
  );
}
