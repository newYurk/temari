import { useEffect, useMemo, useState, type ReactNode, type Ref } from "react";
import { RotateCcw, Undo2, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { THREAD_COLORS } from "./palettes";
import { jiwariPhaseHint } from "./jiwari";
import { kagariPhaseHint, stitchPoleIndex } from "./patterns";
import { useTemari } from "./store";
import {
  CRAFT_ACTIONS,
  dispatchCommand,
  getCraftState,
  type CraftAction,
  type TemariCraftState,
} from "./actions";
import {
  IconC10,
  IconC8,
  IconDensity,
  IconDirIn,
  IconDirOut,
  IconHishi,
  IconHoshi,
  IconKiku,
  IconNeedle,
  IconNone,
  IconObi,
  IconRow,
  IconSimple,
} from "./icons";

type Stage = "jiwari" | "kagari";

const JIWARI_IDS = ["jiwari-off", "jiwari-simple", "jiwari-c8", "jiwari-c10", "pin"] as const;
const KAGARI_IDS = ["motif-kiku", "motif-hoshi", "motif-hishi", "motif-obi", "motif-none"] as const;

const ICONS: Record<string, ReactNode> = {
  "jiwari-off": <IconNone className="size-5" />,
  "jiwari-simple": <IconSimple className="size-5" />,
  "jiwari-c8": <IconC8 className="size-5" />,
  "jiwari-c10": <IconC10 className="size-5" />,
  pin: <Pin className="size-4" />,
  "motif-kiku": <IconKiku className="size-5" />,
  "motif-hoshi": <IconHoshi className="size-5" />,
  "motif-hishi": <IconHishi className="size-5" />,
  "motif-obi": <IconObi className="size-5" />,
  "motif-none": <IconRow className="size-5" />,
};

function actionById(id: string) {
  return CRAFT_ACTIONS.find((action) => action.id === id);
}

function Slot({
  action,
  state,
  onBlocked,
}: {
  action: CraftAction;
  state: TemariCraftState;
  onBlocked: (reason: string) => void;
}) {
  const available = action.canExecute(state);
  const active = action.isActive?.(state) ?? false;
  const reason = action.getDisabledReason(state);

  return (
    <button
      type="button"
      aria-label={action.label}
      aria-disabled={!available}
      aria-pressed={active}
      title={available ? action.label : undefined}
      onClick={() => {
        if (!available) {
          if (reason) onBlocked(reason);
          return;
        }
        dispatchCommand(action.id);
      }}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
        !available && "cursor-not-allowed text-stone/50",
        available && active && "bg-ink/8 text-ink ring-1 ring-ink",
        available && !active && "text-ink hover:bg-ink/6",
      )}
    >
      {ICONS[action.id]}
    </button>
  );
}

export function ActionBar({ chromeRef }: { chromeRef?: Ref<HTMLDivElement> }) {
  const paletteId = useTemari((s) => s.paletteId);
  const selectedColor = useTemari((s) => s.selectedColor);
  const wrapHex = useTemari((s) => s.wrapHex);
  const layerDone = useTemari((s) => s.layerDone);
  const craft = useTemari((s) => s.craft);
  const jiwariOn = useTemari((s) => s.jiwariOn);
  const jiwariPhase = useTemari((s) => s.jiwariPhase);
  const jiwariLaid = useTemari((s) => s.jiwariLaid);
  const division = useTemari((s) => s.division);
  const motif = useTemari((s) => s.motif);
  const pins = useTemari((s) => s.pins);
  const kagariDir = useTemari((s) => s.kagariDir);
  const kagariSpacing = useTemari((s) => s.kagariSpacing);
  const kagariPlaying = useTemari((s) => s.kagariPlaying);
  const kagariLaid = useTemari((s) => s.kagariLaid);
  const kagariPlan = useTemari((s) => s.kagariPlan);
  const kagariSet = useTemari((s) => s.kagariSet);
  const history = useTemari((s) => s.history);
  const sewnHistory = useTemari((s) => s.sewnHistory);
  const pinHistory = useTemari((s) => s.pinHistory);
  const mode = useTemari((s) => s.mode);
  const setColor = useTemari((s) => s.setColor);

  const [tip, setTip] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(motif === "none" ? "jiwari" : "kagari");

  useEffect(() => {
    if (motif !== "none") setStage("kagari");
  }, [motif]);

  const state = useMemo(
    () => getCraftState(),
    [
      mode,
      layerDone,
      craft,
      jiwariOn,
      jiwariPhase,
      jiwariLaid,
      division,
      motif,
      pins,
      kagariDir,
      kagariSpacing,
      kagariPlaying,
      kagariLaid,
      kagariPlan.length,
      history,
      sewnHistory,
      pinHistory,
      selectedColor,
      paletteId,
    ],
  );

  const undo = actionById("undo");
  const reset = actionById("reset");
  const fill = actionById("fill");
  const dirAction = actionById(kagariDir === "out" ? "kagari-in" : "kagari-out");
  const nextSpace =
    kagariSpacing === "open" ? "space-even" : kagariSpacing === "even" ? "space-tight" : "space-open";
  const spaceAction = actionById(nextSpace);

  const hint =
    tip ??
    (stage === "kagari" && motif !== "none" && kagariPlan.length > 0
      ? kagariPhaseHint(
          motif,
          division,
          kagariDir,
          kagariLaid,
          kagariPlan.length,
          kagariPlaying,
          Math.max(0, stitchPoleIndex(kagariPlan[0]!, division, motif)),
          kagariSet,
        )
      : jiwariOn
        ? jiwariPhaseHint(jiwariPhase, jiwariLaid)
        : layerDone
          ? "Выберите разметку"
          : "Намотка — большой круг");

  const toolIds = stage === "jiwari" ? JIWARI_IDS : KAGARI_IDS;
  const fillReady = fill ? fill.canExecute(state) : false;
  const fillReason = fill?.getDisabledReason(state);

  if (!layerDone) {
    return (
      <div
        ref={chromeRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(0.8rem,calc(env(safe-area-inset-bottom)+0.5rem))]"
      >
        <p className="mx-auto max-w-sm text-center font-display text-sm text-stone">{hint}</p>
      </div>
    );
  }

  return (
    <div
      ref={chromeRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.6rem,calc(env(safe-area-inset-bottom)+0.35rem))] md:px-8"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-md">
        <p
          className="mb-1.5 min-h-4 px-3 text-center font-display text-sm text-stone"
          aria-live="polite"
        >
          {hint}
        </p>
        <div className="rounded-3xl bg-linen/90 p-1.5 ring-1 ring-line">
          <div className="flex justify-center gap-1 p-0.5">
            {(
              [
                ["jiwari", "Разметка"],
                ["kagari", "Вышивка"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTip(null);
                  setStage(id);
                }}
                className={cn(
                  "h-8 min-w-24 rounded-full px-4 text-xs tracking-wide",
                  stage === id ? "bg-ink text-linen" : "text-stone hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-0.5 py-0.5">
            {toolIds.map((id) => {
              const action = actionById(id);
              if (!action) return null;
              return (
                <Slot
                  key={id}
                  action={action}
                  state={state}
                  onBlocked={setTip}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 px-1 pb-0.5 pt-1">
            {undo ? (
              <button
                type="button"
                aria-label={undo.label}
                aria-disabled={!undo.canExecute(state)}
                title={undo.getDisabledReason(state) ?? undo.label}
                onClick={() => {
                  if (!undo.canExecute(state)) {
                    const reason = undo.getDisabledReason(state);
                    if (reason) setTip(reason);
                    return;
                  }
                  dispatchCommand("undo");
                }}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full text-ink",
                  !undo.canExecute(state) && "cursor-not-allowed text-stone/50",
                )}
              >
                <Undo2 className="size-4" />
              </button>
            ) : null}

            {stage === "kagari" && dirAction ? (
              <button
                type="button"
                aria-label={kagariDir === "out" ? "Наружу" : "Внутрь"}
                title={kagariDir === "out" ? "Наружу — переключить внутрь" : "Внутрь — переключить наружу"}
                onClick={() => {
                  if (!dirAction.canExecute(state)) {
                    const reason = dirAction.getDisabledReason(state);
                    if (reason) setTip(reason);
                    return;
                  }
                  dispatchCommand(dirAction.id);
                }}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink"
              >
                {kagariDir === "out" ? (
                  <IconDirOut className="size-5" />
                ) : (
                  <IconDirIn className="size-5" />
                )}
              </button>
            ) : null}

            {stage === "kagari" && spaceAction ? (
              <button
                type="button"
                aria-label={`Плотность: ${kagariSpacing}`}
                title="Реже / так / плотнее"
                onClick={() => {
                  if (!spaceAction.canExecute(state)) {
                    const reason = spaceAction.getDisabledReason(state);
                    if (reason) setTip(reason);
                    return;
                  }
                  dispatchCommand(spaceAction.id);
                }}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink"
              >
                <IconDensity className="size-5" level={kagariSpacing} />
              </button>
            ) : (
              <span
                className="size-7 shrink-0 rounded-full ring-1 ring-line"
                style={{ backgroundColor: wrapHex }}
                title="Цвет базы"
              />
            )}

            <div className="flex flex-1 items-center justify-center gap-2">
              {THREAD_COLORS.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Нить ${i + 1}`}
                  onClick={() => setColor(i)}
                  className={cn(
                    "size-7 rounded-full",
                    selectedColor === i
                      ? "ring-2 ring-ink ring-offset-2 ring-offset-linen"
                      : "ring-1 ring-line",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            {reset ? (
              <button
                type="button"
                aria-label={reset.label}
                title={reset.label}
                onClick={() => dispatchCommand("reset")}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone hover:text-ink"
              >
                <RotateCcw className="size-4" />
              </button>
            ) : null}

            {stage === "kagari" && fill ? (
              <button
                type="button"
                aria-label={fill.label}
                aria-disabled={!fillReady}
                title={fillReason ?? fill.label}
                onClick={() => {
                  if (!fillReady) {
                    if (fillReason) setTip(fillReason);
                    return;
                  }
                  setTip(null);
                  dispatchCommand("fill");
                }}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full",
                  fillReady ? "bg-ink text-linen" : "cursor-not-allowed bg-ink/15 text-stone",
                )}
              >
                <IconNeedle className="size-5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
