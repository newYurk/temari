import { LocateFixed } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { THREAD_COLORS } from "./palettes";
import { PUZZLES } from "./puzzles";
import { fillsMatch } from "./division";
import { useTemari } from "./store";
import { unlock } from "./feel";
import { ActionBar } from "./ActionBar";

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
    if (new URLSearchParams(window.location.search).get("kiku") !== "1") return;
    useTemari.getState().showExample();
  }, []);

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
        "pointer-events-auto flex size-9 items-center justify-center rounded-full bg-linen/80 text-ink ring-1 ring-line",
        className,
      )}
    >
      <LocateFixed className="size-4" />
    </button>
  );
}

function TitleLayer() {
  const enterStudio = useTemari((s) => s.enterStudio);
  const wrapColor = useTemari((s) => s.wrapColor);
  const setWrapColor = useTemari((s) => s.setWrapColor);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  useChromeVar("--temari-chrome-top", topRef);
  useChromeVar("--temari-chrome-bottom", bottomRef);

  return (
    <div className="flex h-full flex-col px-5 py-6 md:px-10 md:py-10">
      <div ref={topRef} className="flex items-start justify-between gap-4 pt-[env(safe-area-inset-top)]">
        <div className="max-w-md">
          <h1 className="temari-rise font-display text-4xl font-medium tracking-tight text-ink md:text-5xl">
            Темари
          </h1>
          <p className="temari-rise temari-rise-2 mt-2 max-w-sm text-sm leading-relaxed text-stone">
            Сначала тонкая намотка. Потом кагари: увагакэ тидори от полюса,
            ряд за рядом. Булавки только метят углы.
          </p>
        </div>
        <RecenterButton />
      </div>
      <div className="min-h-0 flex-1" aria-hidden />
      <div ref={bottomRef} className="temari-rise temari-rise-3 pointer-events-auto max-w-md pb-[env(safe-area-inset-bottom)]">
        <div className="mb-3 flex items-center gap-2">
          {THREAD_COLORS.map((color, i) => (
            <button
              key={color}
              type="button"
              aria-label={`Цвет ${i + 1}`}
              onClick={() => setWrapColor(i)}
              className={cn(
                "size-8 rounded-full",
                wrapColor === i ? "ring-2 ring-ink ring-offset-2 ring-offset-linen" : "ring-1 ring-line",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            onPointerDown={() => unlock()}
            onClick={enterStudio}
            className="bg-ink text-linen"
          >
            Намотать базу
          </Button>
          <a
            href="./design.html"
            className="inline-flex h-9 items-center px-2 text-xs tracking-wide text-stone underline-offset-4 hover:text-ink hover:underline"
          >
            схема нити
          </a>
        </div>
      </div>
    </div>
  );
}

function Workbench() {
  const mode = useTemari((s) => s.mode);
  const toTitle = useTemari((s) => s.toTitle);
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
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-4 pt-4 md:px-8 md:pt-8"
      >
        <div className="pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={toTitle}
            className="pointer-events-auto relative z-20 font-display text-xl font-medium tracking-tight text-ink"
          >
            Темари
          </button>
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
