import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { CircleHelp, PencilLine, Pin, RotateCcw, Undo2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { THREAD_COLORS } from "./palettes";
import { jiwariPhaseHint } from "./jiwari";
import { kagariPhaseHint, kikuMarksReady, kikuPinHint, kikuSpec, kikuWorkingPins, stitchPoleIndex } from "./patterns";
import { useTemari } from "./store";
import { CRAFT_ACTIONS, dispatchCommand, getCraftState } from "./actions";
import { IconHishi, IconHoshi, IconKiku, IconNeedle, IconObi } from "./icons";
import { MarkingDiagram } from "./MarkingDiagram";

type Stage = "jiwari" | "kagari";
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
  { id: "motif-hoshi", name: "Хоси", detail: "Позже", icon: <IconHoshi /> },
  { id: "motif-hishi", name: "Хиси", detail: "Позже", icon: <IconHishi /> },
  { id: "motif-obi", name: "Оби", detail: "Позже", icon: <IconObi /> },
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
        «Отменить» снимает <b>целую группу</b> лепестков, а не один стежок: нить не режут
        посреди круга. «Дошить» доводит этот полюс до экватора одним шагом — это для проверки,
        в настоящей работе каждый ряд кладут руками.
      </p>
    </div>
  );
}

export function ActionBar({ chromeRef }: { chromeRef?: Ref<HTMLDivElement> }) {
  const s = useTemari(useShallow((s) => ({
    division: s.division, motif: s.motif, craft: s.craft, pins: s.pins,
    facingPole: s.facingPole, jiwariOn: s.jiwariOn, jiwariPhase: s.jiwariPhase,
    jiwariLaid: s.jiwariLaid, kagariPlan: s.kagariPlan, kagariLaid: s.kagariLaid,
    kagariKept: s.kagariKept, kagariColors: s.kagariColors,
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
  const [stage, setStage] = useState<Stage>(motif === "none" ? "jiwari" : "kagari");
  const [sewHow, setSewHow] = useState<1 | 2 | 3 | "all">(1);
  const help = useRef<HTMLDialogElement>(null);
  const sewing = stage === "kagari";
  const helpTitle = sewing ? "Как шьётся кику" : "Как читать разметку";

  useEffect(() => { if (motif !== "none") setStage("kagari"); }, [motif]);
  useEffect(() => { setTip(null); }, [division, motif, craft, pins, jiwariOn, kagariPlan, s.pinNote]);

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
              "min-h-9 min-w-9 rounded-xl px-2 text-xs tabular-nums",
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
    const available = action.canExecute(state) && !(primary && kagariPlaying);
    const active = action.isActive?.(state) ?? false;
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={primary ? undefined : active}
        aria-disabled={!available}
        onClick={() => (onClick ? onClick() : run(id))}
        title={action.getDisabledReason(state) ?? label}
        className={cn(
          "flex items-center gap-2 rounded-2xl text-sm transition-[background-color,color,transform] duration-150 active:scale-[0.98]",
          focusStyle,
          primary
            ? cn("min-h-12 pl-4 pr-3", available ? "bg-cinnabar text-linen" : "bg-ink/10 text-ink/55")
            : cn(
                "min-h-11 bg-linen/95 pl-3 pr-2.5 ring-1 ring-line",
                active ? "font-medium ring-ink/40" : "hover:bg-ink/5",
                !available && "text-ink/45",
              ),
        )}
      >
        <span className="hidden max-w-[9rem] truncate md:inline">{label}</span>
        <span className="flex size-8 shrink-0 items-center justify-center [&>svg]:size-4">{icon}</span>
      </button>
    );
  }

  const sewVerb = () =>
    motif === "none"
      ? verb("stitch", "Линии", <PencilLine className="size-4" />)
      : verb(sewId, sewLabel, <IconNeedle className="size-4" />, true, runSew);
  const arc = [
    { key: "sew", node: sewVerb(), mobile: false },
    { key: "pin", node: verb("pin", "Булавки", <Pin className="size-4" />), mobile: true },
    { key: "undo", node: verb("undo", "Распустить", <Undo2 className="size-4" />), mobile: true },
    { key: "reset", node: verb("reset", "Сброс", <RotateCcw className="size-4" />), mobile: true },
  ];

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
        className="pointer-events-none absolute inset-x-0 top-[calc(var(--temari-chrome-top,3.5rem)+0.25rem)] bottom-[var(--temari-chrome-bottom,12rem)] z-20 flex flex-col gap-2"
      >
        <p
          role="status"
          aria-live="polite"
          className="shrink-0 px-16 text-center text-[13px] leading-[18px] text-ink/80 md:px-40"
        >
          {hint}
        </p>

        <aside
          aria-label="Рабочие нити"
          className="ml-3 flex min-h-0 flex-1 items-center self-start md:ml-6"
        >
          <div className="pointer-events-auto flex max-h-full flex-col gap-2 overflow-y-auto overscroll-contain rounded-3xl border border-line bg-linen/90 p-2 shadow-[0_4px_24px_#0c0b0908]">
            <div role="group" aria-label="Цвет основы" className="flex shrink-0 flex-col gap-1 pb-1">
              <p className="px-1 text-[10px] tracking-wide text-ink/55">Основа</p>
              <div className="flex flex-wrap gap-0.5">
                {THREAD_COLORS.map((color, i) => (
                  <button
                    key={`wrap-${i}-${color}`}
                    type="button"
                    aria-label={`Цвет основы ${i + 1}`}
                    aria-pressed={s.wrapColor === i}
                    title={`${COLOR_NAMES[i]} основа`}
                    onClick={() => s.setWrapColor(i)}
                    className={cn("flex size-8 items-center justify-center rounded-lg", focusStyle)}
                  >
                    <span
                      className={cn(
                        "size-4 rounded-full ring-1 ring-line",
                        s.wrapColor === i && "ring-2 ring-ink ring-offset-1 ring-offset-linen",
                      )}
                      style={{ backgroundColor: color }}
                    />
                  </button>
                ))}
              </div>
            </div>
            {motif === "kiku" ? (
              <div role="group" aria-label="Две нити кику" className="flex shrink-0 flex-col gap-1">
                {([0, 1] as const).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={editing === slot}
                    aria-label={`Нить ${slot + 1}, ${slot === 0 ? "первая" : "вторая"} четвёрка: ${COLOR_NAMES[kagariColors[slot]]?.toLowerCase() ?? ""}`}
                    onClick={() => s.editThread(slot)}
                    className={cn(
                      "flex h-10 items-center gap-2 rounded-2xl px-2 text-sm",
                      focusStyle,
                      editing === slot ? "bg-ink/8 font-medium ring-1 ring-ink/40" : "text-ink/70 hover:bg-ink/5",
                    )}
                  >
                    <span aria-hidden className="w-4 text-center text-xs tabular-nums">{slot + 1}</span>
                    <span
                      aria-hidden
                      className="size-5 rounded-full ring-1 ring-line"
                      style={{ backgroundColor: THREAD_COLORS[kagariColors[slot]] }}
                    />
                    <span className="hidden pr-1 lg:inline">Нить</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex shrink-0 flex-col gap-1" aria-label="Цвет нити">
              {THREAD_COLORS.map((color, i) => (
                <button
                  key={`thread-${i}-${color}`}
                  type="button"
                  aria-label={threadName(i)}
                  aria-pressed={s.selectedColor === i}
                  title={threadName(i)}
                  onClick={() => s.setColor(i)}
                  className={cn("flex size-10 items-center justify-center rounded-xl", focusStyle)}
                >
                  <span
                    className={cn(
                      "size-6 rounded-full ring-1 ring-line",
                      otherThread === i && s.selectedColor !== i && "ring-2 ring-ink/35",
                      s.selectedColor === i && "ring-2 ring-ink ring-offset-2 ring-offset-linen",
                    )}
                    style={{ backgroundColor: color }}
                  />
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <nav
        aria-label="Действия на мари"
        className="pointer-events-none absolute top-1/2 right-0 z-20 h-[min(22rem,48dvh)] w-[min(11rem,38vw)] -translate-y-1/2 md:w-52"
      >
        {rowPicker("absolute -top-12 right-4 hidden md:flex")}
        <div className="relative size-full">
          {arc.map((item, i, list) => {
            const shown = list.filter((entry) => entry.mobile).length;
            const mobileIndex = list.slice(0, i).filter((entry) => entry.mobile).length;
            const t = (n: number, k: number) => (n <= 1 ? 0.5 : k / (n - 1));
            const place = (k: number, n: number) => {
              const ang = (-50 + t(n, k) * 100) * (Math.PI / 180);
              return {
                left: `${18 + Math.cos(ang) * 62}%`,
                top: `${50 + Math.sin(ang) * 44}%`,
              };
            };
            const desk = place(i, list.length);
            const mob = place(item.mobile ? mobileIndex : i, item.mobile ? shown : list.length);
            return (
              <div
                key={item.key}
                className={cn(
                  "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 left-[var(--arc-mx)] top-[var(--arc-my)] md:left-[var(--arc-dx)] md:top-[var(--arc-dy)]",
                  item.mobile ? "max-md:block" : "hidden md:block",
                )}
                style={{
                  ["--arc-dx" as string]: desk.left,
                  ["--arc-dy" as string]: desk.top,
                  ["--arc-mx" as string]: mob.left,
                  ["--arc-my" as string]: mob.top,
                }}
              >
                {item.node}
              </div>
            );
          })}
        </div>
      </nav>

      <div
        ref={chromeRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.6rem,calc(env(safe-area-inset-bottom)+0.35rem))]"
      >
        <div className="pointer-events-auto mx-auto w-full max-w-lg">
          <div className="mb-2 flex flex-col items-center gap-2 md:hidden">
            {rowPicker()}
            <div className="[&>button]:min-w-48 [&>button]:justify-center">{sewVerb()}</div>
          </div>
          <div className="rounded-3xl border border-line bg-linen/95 p-2 shadow-[0_4px_24px_#0c0b0906]">
            <div className="mb-1 flex items-center gap-1">
              <div className="flex flex-1 gap-1" aria-label="Этап работы">
                {([["jiwari", "Разметка"], ["kagari", "Вышивка"]] as const).map(([id, label], i) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={label}
                    aria-pressed={stage === id}
                    onClick={() => {
                      setTip(null);
                      setStage(id);
                    }}
                    className={cn(
                      "flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm",
                      focusStyle,
                      stage === id ? "bg-ink text-linen" : "text-ink/65 hover:bg-ink/5",
                    )}
                  >
                    <span aria-hidden className="text-xs opacity-60">{i + 1}</span>
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label={helpTitle}
                title={helpTitle}
                onClick={() => help.current?.showModal()}
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full text-ink/65 hover:bg-ink/5",
                  focusStyle,
                )}
              >
                <CircleHelp className="size-5" />
              </button>
            </div>

            {stage === "jiwari" ? (
              <>
                <div className="grid grid-cols-4 gap-1" aria-label="Вид разметки">
                  {MARKINGS.map((item) => {
                    const active = selected.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={item.name}
                        aria-describedby={`${item.id}-detail`}
                        aria-pressed={active}
                        onClick={() => {
                          if (!active) run(item.id);
                        }}
                        className={cn(
                          "flex min-w-0 flex-col items-center rounded-xl py-1.5",
                          focusStyle,
                          active ? "bg-ink/7 ring-1 ring-inset ring-ink/30" : "hover:bg-ink/5",
                        )}
                      >
                        <MarkingDiagram division={item.division} className="mb-0.5 size-10" />
                        <span className="whitespace-nowrap text-[11px] font-medium sm:text-xs">{item.name}</span>
                        <span id={`${item.id}-detail`} className="text-[10px] text-ink/65 sm:text-[11px]">
                          {item.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="min-h-9 px-2 py-1.5 text-center text-xs leading-4 text-ink/70">{selected.note}</p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-5 gap-1" aria-label="Узор вышивки">
                  {MOTIFS.map((item) => {
                    const action = actionById(item.id);
                    const available = action.canExecute(state);
                    const active = action.isActive?.(state);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={item.name}
                        aria-disabled={!available}
                        aria-pressed={active}
                        onClick={() => run(item.id)}
                        className={cn(
                          "flex min-w-0 flex-col items-center rounded-xl py-2",
                          focusStyle,
                          !available ? "text-ink/45" : active ? "bg-ink/7 ring-1 ring-inset ring-ink/30" : "hover:bg-ink/5",
                        )}
                      >
                        <span className="mb-1 flex size-8 items-center justify-center [&>svg]:size-6">{item.icon}</span>
                        <span className="text-xs font-medium">{item.name}</span>
                        <span className="mt-0.5 text-[9px] sm:text-[11px]">
                          {item.id === "motif-kiku" && (!jiwariOn || division !== "simple")
                            ? "Нужна S8"
                            : item.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="min-h-9 px-2 py-1.5 text-center text-xs leading-4 text-ink/70">
                  {motif === "kiku"
                    ? sewingThread
                      ? "Цвет слева — для выбранной нити. Пришитое не меняется."
                      : "Слева нити 1 и 2. Выберите нить, затем цвет."
                    : division !== "simple" && jiwariOn
                      ? `Для кику выберите S8 в «Разметке». Рецепта ${division.toUpperCase()} ещё нет.`
                      : "Начните с кику на S8. Эскиз — свободные линии между метками."}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <dialog
        ref={help}
        aria-labelledby="marking-help-title"
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-line bg-linen p-5 text-ink shadow-xl backdrop:bg-ink/30"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="marking-help-title" className="font-display text-2xl">{helpTitle}</h2>
          <button
            type="button"
            aria-label="Закрыть подсказку"
            onClick={() => help.current?.close()}
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-ink/5", focusStyle)}
          >
            <X className="size-5" />
          </button>
        </div>
        {sewing ? <KikuHelp /> : null}
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
          Чтобы повернуть шар, потяните его. «Линии эскиза» соединяют две булавки; это рисунок на сфере, без подхватов и натяжения нити.
        </p>
        <a href="./design.html#jiwari" className="mt-4 inline-block py-2 text-sm underline underline-offset-4">
          Подробнее о разметке и вышивке →
        </a>
      </dialog>
    </>
  );
}
