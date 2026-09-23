import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { CircleHelp, Moon, MoreHorizontal, Palette, PencilLine, Pin, RotateCcw, Sun, Undo2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { THREAD_COLORS } from "./palettes";
import { jiwariPhaseHint } from "./jiwari";
import { kagariPhaseHint, kikuMarksReady, kikuPinHint, kikuSpec, kikuWorkingPins, stitchPoleIndex } from "./patterns";
import { useTemari } from "./store";
import { CRAFT_ACTIONS, dispatchCommand, getCraftState } from "./actions";
import { IconKiku, IconNeedle } from "./icons";
import { MarkingDiagram } from "./MarkingDiagram";
import { setTheme, useTheme } from "./theme";

type Stage = "jiwari" | "kagari";
type Panel = "pattern" | "threads" | "more" | "help";
const MARKINGS = [
  { id: "jiwari-off", division: "none", name: "Без сетки", detail: "Свои метки", note: "Булавки можно ставить в любом месте шара." },
  { id: "jiwari-simple", division: "simple", name: "S8 · простая", detail: "8 долей", note: "S8: восемь долей между двумя полюсами. Для первой кику." },
  { id: "jiwari-c8", division: "c8", name: "C8", detail: "6 центров", note: "C8: шесть основных центров. Узоры позже — кику шьётся на S8.",
    help: "C8: шесть основных центров, по восемь лучей в каждом. Узоры для неё — позже; кику шьётся на S8." },
  { id: "jiwari-c10", division: "c10", name: "C10", detail: "12 центров", note: "C10: двенадцать основных центров. Узоры позже — кику на S8.",
    help: "C10: двенадцать основных центров, по десять лучей в каждом. Узоры для неё — позже; кику шьётся на S8." },
] as const;
const MOTIFS = [
  { id: "motif-kiku", name: "Кику", detail: "Хризантема", icon: <IconKiku /> },
  { id: "motif-none", name: "Эскиз", detail: "Свои линии", icon: <PencilLine /> },
];
const COLOR_NAMES = ["Красная", "Золотая", "Светлая", "Тёмная", "Синяя"];
const actionById = (id: string) => CRAFT_ACTIONS.find((action) => action.id === id)!;
const focusStyle = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * What a chrysanthemum is made of, for the step where it is sewn. Source is the
 * control pattern GT14 (Ginny T., TemariKai): two working threads alternate by
 * rounds, each round of one set lying over the other.
 */
function KikuHelp() {
  return (
    <div className="mb-4 space-y-3 text-sm leading-relaxed">
      <p>
        Кику — хризантема. Её шьют <b>двумя нитями по четыре лепестка</b>: сначала первая
        четвёрка, потом вторая — она ложится поверх первой там, где они встречаются.
        Дальше каждый круг добавляет по ряду обеим: ряды идут от полюса к экватору, пока
        остаётся место. Сколько уже лежит и сколько поместится, написано в подсказке над
        кнопками.
      </p>
      <p>
        Стежок — <b>увагакэ тидори</b>: у метки игла берёт маленький подхват намотки, и нить
        идёт дальше поверх ранее уложенных. Метки ставятся на полюсе и на трети пути от
        экватора к нему; булавки — временные, их вынимают по ходу работы, и в дошитом цветке
        их не остаётся.
      </p>
      <p className="text-ink/75">
        «Отменить» возвращает последнее действие: при вышивании — <b>целую группу</b>
        или выбранный пакет рядов, не один стежок. В «Узор → Узоры» можно выбрать число
        следующих рядов; «всё» меняет основное действие на «До экватора».
        Это ускорение стенда, не описание ручной работы мастера.
      </p>
    </div>
  );
}

export function ActionBar({ chromeRef }: { chromeRef?: Ref<HTMLDivElement> }) {
  const theme = useTheme();
  const s = useTemari(useShallow((s) => ({
    division: s.division, motif: s.motif, craft: s.craft, pins: s.pins,
    facingPole: s.facingPole, jiwariOn: s.jiwariOn, jiwariPhase: s.jiwariPhase,
    jiwariLaid: s.jiwariLaid, kagariPlan: s.kagariPlan, kagariLaid: s.kagariLaid,
    kagariKept: s.kagariKept, kagariColors: s.kagariColors, kagariHistory: s.kagariHistory,
    kagariPlaying: s.kagariPlaying, kagariSet: s.kagariSet, kikuLayers: s.kikuLayers,
    kagariDir: s.kagariDir, kagariSpacing: s.kagariSpacing, mode: s.mode,
    layerDone: s.layerDone, history: s.history, sewnHistory: s.sewnHistory,
    pinHistory: s.pinHistory, pinNote: s.pinNote, selectedColor: s.selectedColor,
    paletteId: s.paletteId, setColor: s.setColor, kagariEdit: s.kagariEdit, editThread: s.editThread,
    wrapColor: s.wrapColor, setWrapColor: s.setWrapColor,
  })));
  const { division, motif, craft, pins, facingPole, jiwariOn, jiwariPhase, jiwariLaid,
    kagariPlan, kagariLaid, kagariKept, kagariColors, kagariPlaying, kagariSet, kikuLayers,
    kagariDir, kagariSpacing } = s;
  const state = useMemo(() => getCraftState(), [s]);
  const [tip, setTip] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("kagari");
  const [sewHow, setSewHow] = useState<1 | 2 | 3 | "all">(1);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [colorTarget, setColorTarget] = useState<"base" | "thread">("thread");
  const [confirmReset, setConfirmReset] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const sewing = stage === "kagari";
  const helpTitle = sewing ? motif === "kiku" ? "Как шьётся кику" : "Как рисовать эскиз" : "Как читать разметку";
  const panelTitle = panel === "pattern" ? "Узор и разметка" :
    panel === "threads" ? "Нити и основа" : panel === "more" ? "Действия" : helpTitle;

  useEffect(() => { if (motif !== "none") setStage("kagari"); }, [motif]);
  useEffect(() => { setTip(null); }, [division, motif, craft, pins, jiwariOn, kagariPlan, s.pinNote]);
  useEffect(() => {
    if (panel && !sheet.current?.open) sheet.current?.showModal();
    if (!panel && sheet.current?.open) sheet.current.close();
  }, [panel]);

  function openPanel(next: Panel) {
    setConfirmReset(false);
    if (next === "threads") setColorTarget("thread");
    setPanel(next);
  }

  function closePanel() {
    sheet.current?.close();
    setPanel(null);
    setConfirmReset(false);
  }

  function run(id: string) {
    const action = actionById(id);
    if (!action.canExecute(getCraftState())) {
      setTip(action.getDisabledReason(getCraftState()));
      return;
    }
    setTip(null);
    dispatchCommand(id);
  }

  const selected = MARKINGS.find((item) => item.division === (jiwariOn ? division : "none"))!;
  const requiredPins = motif === "kiku" ? kikuWorkingPins(division, facingPole) : [];
  const placed = requiredPins.filter((m) => pins.some((p) =>
    p.p[0] * m.p[0] + p.p[1] * m.p[1] + p.p[2] * m.p[2] > 0.995)).length;
  const marksReady = motif === "kiku" && kikuMarksReady(pins, division, facingPole);
  const complete = kagariPlan.length > 0 && kagariLaid >= kagariPlan.length;
  const secondGroup = complete && kagariSet === 0;
  const kikuFit = kikuSpec(division, kagariSpacing, "fit").capacity;
  const canPickRows = motif === "kiku" && complete && kagariSet === 1 && kikuLayers < kikuFit && !kagariPlaying;
  const remaining = Math.max(0, kikuFit - kikuLayers);
  useEffect(() => {
    if (sewHow !== "all" && sewHow > Math.max(1, remaining)) setSewHow(1);
  }, [remaining, sewHow]);
  const sewId = secondGroup ? "motif-kiku" : "fill";
  const sewLabel = kagariPlaying ? "Вышиваем…" : secondGroup ? "Вторая группа" :
    canPickRows && sewHow === "all" ? "До экватора" :
    canPickRows && sewHow !== "all" && sewHow > 1 ? `${sewHow} ряда` :
    complete ? "Следующий ряд" : kagariPlan.length ? "Продолжить" : "Начать кику";
  function runSew() {
    if (secondGroup) {
      run("motif-kiku");
      return;
    }
    if (canPickRows && sewHow !== 1) {
      const action = actionById("kiku-rows");
      if (!action.canExecute(getCraftState())) {
        setTip(action.getDisabledReason(getCraftState()));
        return;
      }
      setTip(null);
      dispatchCommand("kiku-rows", sewHow);
      return;
    }
    run(sewId);
  }
  function rowPicker(className = "") {
    if (!canPickRows) return null;
    const choices: Array<1 | 2 | 3 | "all"> =
      remaining >= 3 ? [1, 2, 3, "all"] : remaining === 2 ? [1, 2, "all"] : [1, "all"];
    return (
      <div
        role="group"
        aria-label="Сколько рядов вышить"
        className={cn(
          "pointer-events-auto flex items-center gap-0.5 rounded-2xl border border-line bg-linen/95 p-1",
          className,
        )}
      >
        {choices.map((n) => (
          <button
            key={String(n)}
            type="button"
            aria-pressed={sewHow === n}
            onClick={() => setSewHow(n)}
            className={cn(
              "min-h-11 min-w-11 rounded-xl px-3 text-sm tabular-nums",
              focusStyle,
              sewHow === n ? "bg-ink text-linen" : "text-ink/70 hover:bg-ink/5",
            )}
          >
            {n === "all" ? "всё" : n}
          </button>
        ))}
      </div>
    );
  }

  // A kiku is sewn with two working threads that alternate by rounds (GT14 asks
  // for two colours): «1» for the first four petals, «2» for the second four.
  // The palette paints the one chosen there; by default the one in hand, which
  // after the first group is already the second, as the store does.
  const groupLaidOut = kagariPlan.length > 0 && kagariLaid >= kagariPlan.length;
  const inHand: 0 | 1 = kagariSet === 0 && groupLaidOut ? 1 : kagariSet;
  const sewingThread = motif === "kiku" && (kagariPlan.length > 0 || kagariKept.length > 0);
  const editing: 0 | 1 = s.kagariEdit ?? inHand;
  const otherThread = motif === "kiku" ? kagariColors[editing === 0 ? 1 : 0] : -1;
  const threadName = (i: number) => {
    const name = `${COLOR_NAMES[i]} нить`;
    if (motif !== "kiku") return name;
    if (i === kagariColors[editing]) return `${name} — нить ${editing + 1}`;
    if (i === otherThread) return `${name} — нить ${editing === 0 ? 2 : 1}`;
    return name;
  };

  let instruction: string;
  // A pole that already carries a flower: say so instead of asking for marks again.
  const sewnHere = motif === "kiku" && kagariKept.some((stitch) =>
    stitchPoleIndex(stitch, division, motif) === facingPole);
  if (motif === "kiku" && !marksReady) {
    instruction = sewnHere
      ? "Здесь цветок уже вышит. Поверните шар к другому полюсу — или поставьте метки, чтобы начать этот заново."
      : kikuPinHint(placed, requiredPins.length);
  } else if (motif === "kiku" && kagariPlan.length) {
    instruction = kagariPhaseHint(motif, division, kagariDir, kagariLaid, kagariPlan.length,
      kagariPlaying, Math.max(0, stitchPoleIndex(kagariPlan[0]!, division, motif)), kagariSet,
      kagariSet === 1 && kikuLayers < kikuSpec(division, kagariSpacing, "fit").capacity,
      kikuLayers, kikuSpec(division, kagariSpacing, "fit").capacity);
  } else if (motif === "kiku") {
    instruction = "Метки готовы. Нажмите «Начать кику».";
  } else if (jiwariOn && jiwariPhase !== "done") {
    instruction = jiwariPhaseHint(jiwariPhase, jiwariLaid);
  } else if (craft === "stitch") {
    instruction = "Нажмите две булавки — соединить линией эскиза.";
  } else {
    instruction = "Нажмите на шар — поставить булавку. На булавку — снять.";
  }
  const hint = tip ?? s.pinNote ?? instruction;

  function verb(id: string, label: string, icon: ReactNode, primary = false, onClick?: () => void) {
    const action = actionById(id);
    const available = action.canExecute(state) && !kagariPlaying;
    const active = action.isActive?.(state) ?? false;
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={primary ? undefined : action.isActive?.(state)}
        disabled={!available}
        aria-disabled={!available}
        onClick={() => (onClick ? onClick() : run(id))}
        title={action.getDisabledReason(state) ?? label}
        className={cn(
          "flex min-h-11 items-center justify-center gap-2 rounded-2xl text-sm transition-colors disabled:cursor-not-allowed",
          focusStyle,
          primary
            ? cn("min-w-0 flex-1 px-3", available ? "bg-cinnabar text-linen hover:bg-cinnabar/90" : "bg-ink/8 text-ink/50")
            : cn(
                "size-11 shrink-0 ring-1 ring-line",
                active ? "font-medium ring-ink/40" : "hover:bg-ink/5",
                !available && "text-ink/45",
              ),
        )}
      >
        <span className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-5">{icon}</span>
        {primary ? <span className="truncate">{label}</span> : null}
      </button>
    );
  }

  const emptySketch = motif === "none" && pins.length === 0;
  const sewVerb = () =>
    emptySketch ? (
      <button type="button" aria-haspopup="dialog" onClick={() => openPanel("pattern")}
        className={cn("flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-cinnabar px-3 text-sm text-linen hover:bg-cinnabar/90", focusStyle)}>
        <IconKiku className="size-5" />Выбрать узор
      </button>
    ) : motif === "none"
      ? verb("stitch", "Линии", <PencilLine />, true)
      : verb(sewId, sewLabel, <IconNeedle className="size-4" />, true, runSew);
  const primaryReason = actionById(motif === "none" ? "stitch" : sewId).getDisabledReason(state);
  const visibleHint = tip ?? s.pinNote ?? (emptySketch
    ? "Выберите узор или поставьте булавки для эскиза."
    : motif === "none" && primaryReason ? primaryReason : hint);
  const tabStyle = "min-h-11 flex-1 rounded-xl px-3 text-sm";

  if (!s.layerDone) {
    return (
      <div ref={chromeRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        <p className="text-center text-sm text-ink/70">Намотка — большой круг</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={chromeRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto w-full max-w-md">
          <p role="status" aria-live="polite" className="mb-2 px-2 text-center text-xs leading-4 text-ink/75">
            {visibleHint}
          </p>
          <nav aria-label="Действия на мари" className="pointer-events-auto rounded-3xl border border-line bg-linen/95 p-2 shadow-[0_4px_24px_#0c0b0908]">
            <div className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2 border-b border-line pb-2">
              <button type="button" aria-label="Узор" aria-haspopup="dialog"
                onClick={() => openPanel("pattern")}
                className={cn("flex min-h-11 items-center gap-2 rounded-xl px-2 text-left hover:bg-ink/5", focusStyle)}>
                <span className="flex size-6 shrink-0 items-center justify-center [&>svg]:size-5"><IconKiku /></span>
                <span className="min-w-0 text-sm">Узор
                  <span className="block truncate text-[11px] text-ink/60">{motif === "kiku" ? "Кику · S8" : `Эскиз · ${selected.name}`}</span>
                </span>
              </button>
              <button type="button" aria-label="Нити" aria-haspopup="dialog"
                onClick={() => openPanel("threads")}
                className={cn("flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm hover:bg-ink/5", focusStyle)}>
                <span aria-hidden className="flex -space-x-1">
                  {(motif === "kiku" ? kagariColors : [s.selectedColor]).map((color, slot) => (
                    <span key={slot} className="size-5 rounded-full border-2 border-linen ring-1 ring-line"
                      style={{ backgroundColor: THREAD_COLORS[color] }} />
                  ))}
                </span>
                Нити
              </button>
              <button type="button" aria-label="Ещё" aria-haspopup="dialog" title="Ещё"
                onClick={() => openPanel("more")}
                className={cn("flex size-11 items-center justify-center rounded-xl hover:bg-ink/5", focusStyle)}>
                <MoreHorizontal className="size-5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {verb("pin", "Булавки", <Pin />)}
              {sewVerb()}
              {verb("undo", "Отменить", <Undo2 />)}
            </div>
          </nav>
        </div>
      </div>

      <dialog
        ref={sheet}
        aria-labelledby="workbench-panel-title"
        onCancel={(event) => {
          // A queued native `close` may belong to a previous opening.
          event.preventDefault();
          closePanel();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
        }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl border border-line bg-linen text-ink shadow-xl backdrop:bg-ink/30 sm:inset-0 sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-linen px-4 py-3">
          <h2 id="workbench-panel-title" className="font-display text-2xl">{panelTitle}</h2>
          <button type="button" aria-label="Закрыть панель" onClick={closePanel}
            className={cn("flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-ink/5", focusStyle)}>
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {panel === "pattern" ? (
            <>
              <div className="flex gap-1 rounded-2xl bg-ink/5 p-1" aria-label="Настройка узора">
                {([["kagari", "Узоры"], ["jiwari", "Разметка"]] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={stage === id}
                    onClick={() => { setTip(null); setStage(id); }}
                    className={cn(tabStyle, focusStyle, stage === id ? "bg-linen font-medium shadow-sm" : "text-ink/65")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {stage === "jiwari" ? (
              <>
                <div className="grid grid-cols-2 gap-2" aria-label="Вид разметки">
                  {MARKINGS.map((item) => {
                    const active = selected.id === item.id;
                    const available = actionById(item.id).canExecute(state) && !kagariPlaying;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={item.name}
                        aria-describedby={`${item.id}-detail`}
                        aria-pressed={active}
                        disabled={!available}
                        onClick={() => { if (!active) run(item.id); }}
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-2xl border border-line p-3 text-left disabled:opacity-40",
                          focusStyle,
                          active ? "bg-ink/5 ring-1 ring-ink/30" : "hover:bg-ink/5",
                        )}
                      >
                        <MarkingDiagram division={item.division} className="size-8 shrink-0" />
                        <span className="text-xs font-medium">{item.name}
                          <span id={`${item.id}-detail`} className="mt-1 block text-[11px] font-normal text-ink/65">{item.detail}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-sm leading-relaxed text-ink/70">{selected.note}</p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2" aria-label="Узор вышивки">
                  {MOTIFS.map((item) => {
                    const action = actionById(item.id);
                    const available = action.canExecute(state) && !kagariPlaying;
                    const active = action.isActive?.(state);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={item.name}
                        disabled={!available}
                        aria-disabled={!available}
                        aria-pressed={active}
                        onClick={() => { if (!active) run(item.id); }}
                        className={cn(
                          "flex min-w-0 flex-col items-center rounded-2xl border border-line p-3",
                          focusStyle,
                          !available ? "text-ink/45" : active ? "bg-ink/7 ring-1 ring-inset ring-ink/30" : "hover:bg-ink/5",
                        )}
                      >
                        <span className="mb-1 flex size-8 items-center justify-center [&>svg]:size-6">{item.icon}</span>
                        <span className="text-xs font-medium">{item.name}</span>
                        <span className="mt-1 text-[11px]">
                          {item.id === "motif-kiku" && (!jiwariOn || division !== "simple")
                            ? "Нужна S8"
                            : item.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-2xl bg-ink/5 p-3">
                  <p className="mb-3 text-sm leading-relaxed text-ink/75">
                    {sewnHere || kagariLaid > 0
                      ? "«Кику здесь» заново разметит текущий полюс и снимет его цветок. Другой полюс останется; действие можно отменить."
                      : "Начать без ручной разметки: подготовить S8 и метки кику на обращённом к вам полюсе."}
                  </p>
                  <button type="button" disabled={!actionById("quick-kiku").canExecute(state) || kagariPlaying}
                    onClick={() => { run("quick-kiku"); closePanel(); }}
                    className={cn("flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cinnabar px-3 text-sm text-linen disabled:opacity-40", focusStyle)}>
                    <IconKiku className="size-5" />Кику здесь
                  </button>
                </div>
                {canPickRows ? (
                  <div>
                    <p className="mb-2 text-sm">Сколько рядов в следующем действии</p>
                    {rowPicker()}
                  </div>
                ) : null}
                <p className="text-xs leading-relaxed text-ink/60">
                  Хоси, хиси, оби и собственные рецепты — позже. Сейчас доступны кику на S8
                  и эскиз линиями между булавками; эскиз не является физической вышивкой.
                </p>
              </>
            )}
              <button type="button" onClick={() => openPanel("help")}
                className={cn("flex min-h-11 items-center gap-2 text-sm underline underline-offset-4", focusStyle)}>
                <CircleHelp className="size-4" />{helpTitle}
              </button>
            </>
          ) : null}
          {panel === "threads" ? (
            <>
              <div role="group" aria-label="Что перекрасить" className="flex gap-1 rounded-2xl bg-ink/5 p-1">
                <button type="button" aria-pressed={colorTarget === "base"} onClick={() => setColorTarget("base")}
                  className={cn(tabStyle, focusStyle, colorTarget === "base" && "bg-linen font-medium shadow-sm")}>Основа</button>
                {(motif === "kiku" ? [0, 1] as const : [0] as const).map((slot) => (
                  <button key={slot} type="button" aria-label={motif === "kiku" ? `Нить ${slot + 1}` : "Нить"}
                    aria-pressed={colorTarget === "thread" && (motif !== "kiku" || editing === slot)}
                    onClick={() => { setColorTarget("thread"); s.editThread(slot); }}
                    className={cn(tabStyle, focusStyle,
                      colorTarget === "thread" && (motif !== "kiku" || editing === slot) && "bg-linen font-medium shadow-sm")}>
                    {motif === "kiku" ? `Нить ${slot + 1}` : "Нить"}
                  </button>
                ))}
              </div>
              <div role="group" aria-label={colorTarget === "base" ? "Цвет основы" : "Цвет нити"}
                className="flex justify-center gap-2 py-2">
                {THREAD_COLORS.map((color, i) => {
                  const active = (colorTarget === "base" ? s.wrapColor : s.selectedColor) === i;
                  const label = colorTarget === "base" ? `Цвет основы ${i + 1}` : threadName(i);
                  return (
                    <button key={color} type="button" aria-label={label} aria-pressed={active}
                      title={colorTarget === "base" ? `${COLOR_NAMES[i]} основа` : threadName(i)}
                      onClick={() => colorTarget === "base" ? s.setWrapColor(i) : s.setColor(i)}
                      className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", focusStyle)}>
                      <span className={cn("size-7 rounded-full ring-1 ring-line",
                        active && "ring-2 ring-ink ring-offset-3 ring-offset-linen")}
                        style={{ backgroundColor: color }} />
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-sm">{COLOR_NAMES[colorTarget === "base" ? s.wrapColor : s.selectedColor]} {colorTarget === "base" ? "основа" : "нить"}</p>
              <p className="text-sm leading-relaxed text-ink/70">
                {colorTarget === "base" ? "Цвет основы меняется сразу. Рабочие нити сохраняют контраст с основой." :
                  sewingThread ? "Меняется цвет следующих стежков выбранной нити. Уже пришитое не перекрашивается." :
                    motif === "kiku" ? "Нить 1 — первая четвёрка лепестков, нить 2 — вторая. Цвета выбираются отдельно." :
                      "Цвет следующих линий эскиза. Уже нарисованные линии не перекрашиваются."}
              </p>
            </>
          ) : null}
          {panel === "more" ? (
            <>
              <button type="button" onClick={() => openPanel("help")}
                className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm hover:bg-ink/5", focusStyle)}>
                <CircleHelp className="size-5" />Справка
              </button>
              <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-pressed={theme === "dark"}
                className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm hover:bg-ink/5", focusStyle)}>
                {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
                {theme === "dark" ? "Светлый фон" : "Тёмный фон"}
              </button>
              <a href="./design.html#interface" className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-ink/5", focusStyle)}>
                <Palette className="size-5" />О стенде и ограничениях
              </a>
              {confirmReset ? (
                <div role="alert" className="rounded-2xl border border-cinnabar/30 p-3">
                  <p className="mb-3 text-sm">{s.mode === "kata" ? "Очистить заполнение текущей задачи?" :
                    "Убрать вышивку, булавки и разметку с обоих полюсов? Цвет основы сохранится."}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmReset(false)}
                      className={cn("min-h-11 flex-1 rounded-xl px-2 text-sm ring-1 ring-line", focusStyle)}>Отмена</button>
                    <button type="button" onClick={() => { run("reset"); closePanel(); }}
                      className={cn("min-h-11 flex-1 rounded-xl bg-cinnabar px-2 text-sm text-linen", focusStyle)}>Сбросить работу</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmReset(true)}
                  className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-cinnabar hover:bg-cinnabar/5", focusStyle)}>
                  <RotateCcw className="size-5" />Сброс
                </button>
              )}
            </>
          ) : null}
          {panel === "help" ? (
            <>
              {sewing && motif === "kiku" ? <KikuHelp /> : null}
              <p className="mb-4 text-sm leading-relaxed">
                Разметка, или дзивари, — нити, которые делят поверхность шара и помогают расположить узор.
              </p>
              <div className="space-y-3">
                {MARKINGS.slice(1).map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <MarkingDiagram division={item.division} className="size-20 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink/75">
                        {"help" in item ? item.help : item.note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink/75">
                Точки на схемах — основные центры пересечения линий, в том числе на обратной стороне шара. Число лучей не равно числу лепестков.
              </p>
              <div className="my-4 flex gap-3 rounded-xl bg-ink/5 p-3">
                <Pin className="mt-0.5 size-5 shrink-0" />
                <p className="text-sm leading-relaxed">
                  <b>Булавки — временные метки.</b> Помогают отметить расстояния и места будущих стежков. Выберите «Булавки», нажмите на шар, чтобы поставить, и на головку, чтобы снять. Нить от этого не появляется.
                </p>
              </div>
              <p className="text-xs leading-relaxed text-ink/75">
                Чтобы повернуть шар, потяните его. «Линии» соединяют две булавки; это рисунок на сфере, без подхватов и натяжения нити.
              </p>
              <a href="./design.html#jiwari" className="mt-4 inline-block py-2 text-sm underline underline-offset-4">
                Подробнее о разметке и вышивке →
              </a>
            </>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
