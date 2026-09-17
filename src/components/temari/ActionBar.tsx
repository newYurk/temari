import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { CircleHelp, PencilLine, Pin, RotateCcw, Undo2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { THREAD_COLORS } from "./palettes";
import { jiwariPhaseHint } from "./jiwari";
import { kagariPhaseHint, kikuMarksReady, kikuSpec, kikuWorkingPins, stitchPoleIndex } from "./patterns";
import { useTemari } from "./store";
import { CRAFT_ACTIONS, dispatchCommand, getCraftState } from "./actions";
import { IconHishi, IconHoshi, IconKiku, IconNeedle, IconObi } from "./icons";
import { MarkingDiagram } from "./MarkingDiagram";

type Stage = "jiwari" | "kagari";
const MARKINGS = [
  { id: "jiwari-off", division: "none", name: "Без сетки", detail: "Свои метки", note: "Булавки можно ставить в любом месте шара." },
  { id: "jiwari-simple", division: "simple", name: "S8 · простая", detail: "8 долей", note: "S8: восемь долей между двумя полюсами. Для первой кику." },
  { id: "jiwari-c8", division: "c8", name: "C8", detail: "6 центров", note: "C8: шесть основных центров, по восемь лучей в каждом. Узоры на ней — позже; кику шьётся на S8." },
  { id: "jiwari-c10", division: "c10", name: "C10", detail: "12 центров", note: "C10: двенадцать основных центров, по десять лучей в каждом. Узоры на ней — позже; кику шьётся на S8." },
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

export function ActionBar({ chromeRef }: { chromeRef?: Ref<HTMLDivElement> }) {
  const s = useTemari(useShallow((s) => ({
    division: s.division, motif: s.motif, craft: s.craft, pins: s.pins,
    facingPole: s.facingPole, jiwariOn: s.jiwariOn, jiwariPhase: s.jiwariPhase,
    jiwariLaid: s.jiwariLaid, kagariPlan: s.kagariPlan, kagariLaid: s.kagariLaid,
    kagariPlaying: s.kagariPlaying, kagariSet: s.kagariSet, kikuLayers: s.kikuLayers,
    kagariDir: s.kagariDir, kagariSpacing: s.kagariSpacing, mode: s.mode,
    layerDone: s.layerDone, history: s.history, sewnHistory: s.sewnHistory,
    pinHistory: s.pinHistory, pinNote: s.pinNote, selectedColor: s.selectedColor,
    paletteId: s.paletteId, setColor: s.setColor,
  })));
  const { division, motif, craft, pins, facingPole, jiwariOn, jiwariPhase, jiwariLaid,
    kagariPlan, kagariLaid, kagariPlaying, kagariSet, kikuLayers, kagariDir, kagariSpacing } = s;
  const state = useMemo(() => getCraftState(), [s]);
  const [tip, setTip] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(motif === "none" ? "jiwari" : "kagari");
  const help = useRef<HTMLDialogElement>(null);

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
  const sewId = secondGroup ? "motif-kiku" : "fill";
  const sewLabel = kagariPlaying ? "Вышиваем…" : secondGroup ? "Вторая группа" :
    complete ? "Следующий ряд" : kagariPlan.length ? "Продолжить" : "Начать кику";

  let instruction: string;
  if (motif === "kiku" && !marksReady) {
    instruction = `Булавки: ${placed} из ${requiredPins.length}. Нажимайте на подсвеченные места шара.`;
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

  function tool(id: string, label: string, icon: ReactNode, primary = false) {
    const action = actionById(id);
    const available = action.canExecute(state) && !(primary && kagariPlaying);
    const active = action.isActive?.(state) ?? false;
    return <button type="button" aria-label={label} aria-pressed={primary ? undefined : active}
      aria-disabled={!available} onClick={() => run(id)}
      title={action.getDisabledReason(state) ?? label}
      className={cn("flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] sm:text-xs", focusStyle,
        primary ? (available ? "bg-ink text-linen" : "bg-ink/10 text-ink/55") :
        active ? "bg-ink/8 font-medium ring-1 ring-ink/30" : "hover:bg-ink/5",
        !available && "text-ink/45")}>{icon}<span>{id === "stitch" ? "Линии" : label}</span></button>;
  }

  if (!s.layerDone) return <div ref={chromeRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
    <p className="text-center text-sm text-ink/70">Намотка — большой круг</p>
  </div>;

  return <>
    <div ref={chromeRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.6rem,calc(env(safe-area-inset-bottom)+0.35rem))]">
      <div className="pointer-events-auto mx-auto w-full max-w-lg">
        <p role="status" aria-live="polite" className="mb-2 min-h-9 px-2 text-center text-[13px] leading-[18px] text-ink/80">{hint}</p>
        <div className="rounded-3xl border border-line bg-linen/95 p-2 shadow-[0_4px_24px_#0c0b0906]">
          <div className="mb-1 flex items-center gap-1">
            <div className="flex flex-1 gap-1" aria-label="Этап работы">
              {([["jiwari", "Разметка"], ["kagari", "Вышивка"]] as const).map(([id, label], i) =>
                <button key={id} type="button" aria-label={label} aria-pressed={stage === id}
                  onClick={() => { setTip(null); setStage(id); }}
                  className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm", focusStyle,
                    stage === id ? "bg-ink text-linen" : "text-ink/65 hover:bg-ink/5")}>
                  <span aria-hidden className="text-xs opacity-60">{i + 1}</span>{label}
                </button>)}
            </div>
            <button type="button" aria-label="Как читать разметку" title="Как читать разметку"
              onClick={() => help.current?.showModal()}
              className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-ink/65 hover:bg-ink/5", focusStyle)}>
              <CircleHelp className="size-5" />
            </button>
          </div>

          {stage === "jiwari" ? <>
            <div className="grid grid-cols-4 gap-1" aria-label="Вид разметки">
              {MARKINGS.map((item) => {
                const active = selected.id === item.id;
                return <button key={item.id} type="button" aria-label={item.name} aria-describedby={`${item.id}-detail`} aria-pressed={active}
                  onClick={() => { if (!active) run(item.id); }}
                  className={cn("flex min-w-0 flex-col items-center rounded-xl py-1.5", focusStyle,
                    active ? "bg-ink/7 ring-1 ring-inset ring-ink/30" : "hover:bg-ink/5")}>
                  <MarkingDiagram division={item.division} className="mb-0.5 size-10" />
                  <span className="whitespace-nowrap text-[11px] font-medium sm:text-xs">{item.name}</span>
                  <span id={`${item.id}-detail`} className="text-[10px] text-ink/65 sm:text-[11px]">{item.detail}</span>
                </button>;
              })}
            </div>
            <p className="min-h-9 px-2 py-1.5 text-center text-xs leading-4 text-ink/70">{selected.note}</p>
          </> : <>
            <div className="grid grid-cols-5 gap-1" aria-label="Узор вышивки">
              {MOTIFS.map((item) => {
                const action = actionById(item.id);
                const available = action.canExecute(state);
                const active = action.isActive?.(state);
                return <button key={item.id} type="button" aria-label={item.name} aria-disabled={!available}
                  aria-pressed={active} onClick={() => run(item.id)}
                  className={cn("flex min-w-0 flex-col items-center rounded-xl py-2", focusStyle,
                    !available ? "text-ink/45" : active ? "bg-ink/7 ring-1 ring-inset ring-ink/30" : "hover:bg-ink/5")}>
                  <span className="mb-1 flex size-8 items-center justify-center [&>svg]:size-6">{item.icon}</span>
                  <span className="text-xs font-medium">{item.name}</span>
                  <span className="mt-0.5 text-[9px] sm:text-[11px]">{item.id === "motif-kiku" && (!jiwariOn || division !== "simple") ? "Нужна S8" : item.detail}</span>
                </button>;
              })}
            </div>
            <p className="min-h-9 px-2 py-1.5 text-center text-xs leading-4 text-ink/70">
              {motif === "kiku" ? "Кику — хризантема. Метки: полюс и треть пути от экватора к нему." :
                division !== "simple" && jiwariOn ? `Для кику выберите S8 в «Разметке». Рецепта ${division.toUpperCase()} ещё нет.` :
                "Начните с кику на S8. Эскиз — свободные линии между метками."}
            </p>
          </>}

          <div className="flex items-center justify-between gap-1 border-t border-line pt-1">
            {tool("pin", "Булавки", <Pin className="size-4" />)}
            {motif === "none" ? tool("stitch", "Линии эскиза", <PencilLine className="size-4" />) :
              tool(sewId, sewLabel, <IconNeedle className="size-4" />, true)}
            {tool("undo", "Отменить", <Undo2 className="size-4" />)}
          </div>
          <div className="mt-1 flex items-center gap-1 border-t border-line px-1 pt-1">
            {motif === "kiku" ? <select aria-label="Плотность стежков" title="Плотность стежков" value={kagariSpacing}
              onChange={(e) => run(`space-${e.target.value}`)}
              className={cn("h-10 w-16 rounded-lg bg-transparent text-[11px] text-ink/75", focusStyle)}>
              <option value="open">Реже</option><option value="even">Средне</option><option value="tight">Плотнее</option>
            </select> : <span className="mr-1 text-[11px] text-ink/65">Цвет</span>}
            <div className="flex flex-1 items-center gap-0.5 sm:gap-1" aria-label="Цвет нити">
              {THREAD_COLORS.map((color, i) => <button key={color} type="button" aria-label={`${COLOR_NAMES[i]} нить`}
                aria-pressed={s.selectedColor === i} title={`${COLOR_NAMES[i]} нить`}
                onClick={() => s.setColor(i)} className={cn("flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg", focusStyle)}>
                <span className={cn("size-6 rounded-full ring-1 ring-line", s.selectedColor === i && "ring-2 ring-ink ring-offset-2 ring-offset-linen")}
                  style={{ backgroundColor: color }} />
              </button>)}
            </div>
            <button type="button" aria-label="Сброс слоя" title="Начать слой заново" onClick={() => run("reset")}
              className={cn("ml-1 flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-1 text-[11px] text-ink/65 hover:bg-ink/5", focusStyle)}>
              <RotateCcw className="size-3.5" />Сброс
            </button>
          </div>
        </div>
      </div>
    </div>

    <dialog ref={help} aria-labelledby="marking-help-title"
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-line bg-linen p-5 text-ink shadow-xl backdrop:bg-ink/30">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="marking-help-title" className="font-display text-2xl">Как читать разметку</h2>
        <button type="button" aria-label="Закрыть подсказку" onClick={() => help.current?.close()}
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-ink/5", focusStyle)}><X className="size-5" /></button>
      </div>
      <p className="mb-4 text-sm leading-relaxed">Разметка, или дзивари, — нити, которые делят поверхность шара и помогают расположить узор.</p>
      <div className="space-y-3">
        {MARKINGS.slice(1).map((item) => <div key={item.id} className="flex items-center gap-3">
          <MarkingDiagram division={item.division} className="size-20 shrink-0" />
          <div><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs leading-relaxed text-ink/75">{item.note}</p></div>
        </div>)}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink/75">Точки на схемах — основные центры пересечения линий, в том числе на обратной стороне шара. Число лучей не равно числу лепестков.</p>
      <div className="my-4 flex gap-3 rounded-xl bg-ink/5 p-3">
        <Pin className="mt-0.5 size-5 shrink-0" />
        <p className="text-sm leading-relaxed"><b>Булавки — временные метки.</b> Помогают отметить расстояния и места будущих стежков. Выберите «Булавки», нажмите на шар, чтобы поставить, и на головку, чтобы снять. Нить от этого не появляется.</p>
      </div>
      <p className="text-xs leading-relaxed text-ink/75">Чтобы повернуть шар, потяните его. «Линии эскиза» соединяют две булавки; это рисунок на сфере, без подхватов и натяжения нити.</p>
      <a href="./design.html#jiwari" className="mt-4 inline-block py-2 text-sm underline underline-offset-4">Подробнее о разметке и вышивке →</a>
    </dialog>
  </>;
}
