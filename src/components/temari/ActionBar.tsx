import { useMemo, useState } from "react";
import { RotateCcw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PALETTE_LIST, PALETTES } from "./palettes";
import { useTemari } from "./store";
import {
  CRAFT_ACTIONS,
  dispatchCommand,
  getCraftState,
  type CraftAction,
  type TemariCraftState,
} from "./actions";

function clusterOf(cluster: CraftAction["cluster"]) {
  return CRAFT_ACTIONS.filter((action) => action.cluster === cluster);
}

function ActionBtn({
  action,
  state,
  onBlocked,
  wide,
}: {
  action: CraftAction;
  state: TemariCraftState;
  onBlocked: (reason: string) => void;
  wide?: boolean;
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
      title={reason ?? action.label}
      onClick={() => {
        if (!available) {
          if (reason) onBlocked(reason);
          return;
        }
        dispatchCommand(action.id);
      }}
      className={cn(
        "min-h-8 flex-1 rounded-full px-2 text-[0.68rem] tracking-wide ring-1 transition-opacity duration-150",
        wide && "flex-[1.4]",
        !available && "cursor-not-allowed opacity-40",
        available && active && "bg-ink/8 text-ink ring-line-strong",
        available && !active && "text-stone ring-line hover:text-ink",
      )}
    >
      {action.label}
    </button>
  );
}

export function ActionBar() {
  const paletteId = useTemari((s) => s.paletteId);
  const selectedColor = useTemari((s) => s.selectedColor);
  const wrapHex = useTemari((s) => s.wrapHex);
  const layerDone = useTemari((s) => s.layerDone);
  const craft = useTemari((s) => s.craft);
  const jiwariOn = useTemari((s) => s.jiwariOn);
  const division = useTemari((s) => s.division);
  const motif = useTemari((s) => s.motif);
  const pins = useTemari((s) => s.pins);
  const kagariDir = useTemari((s) => s.kagariDir);
  const kagariSpacing = useTemari((s) => s.kagariSpacing);
  const history = useTemari((s) => s.history);
  const sewnHistory = useTemari((s) => s.sewnHistory);
  const pinHistory = useTemari((s) => s.pinHistory);
  const mode = useTemari((s) => s.mode);
  const setPalette = useTemari((s) => s.setPalette);
  const setColor = useTemari((s) => s.setColor);

  const [tip, setTip] = useState<string | null>(null);

  const state = useMemo(
    () => getCraftState(),
    [
      mode,
      layerDone,
      craft,
      jiwariOn,
      division,
      motif,
      pins,
      kagariDir,
      kagariSpacing,
      history,
      sewnHistory,
      pinHistory,
      selectedColor,
      paletteId,
    ],
  );

  const palette = PALETTES[paletteId];
  const jiwari = clusterOf("jiwari");
  const kagariMain = clusterOf("kagari").filter(
    (a) => a.id === "stitch" || a.id.startsWith("motif-"),
  );
  const kagariFill = clusterOf("kagari").filter(
    (a) => a.id === "fill" || a.id.startsWith("kagari-") || a.id.startsWith("space-"),
  );
  const correction = clusterOf("correction");

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-linen from-30% via-linen/70 to-transparent" />
      <div className="pointer-events-auto relative px-3 pb-[max(0.7rem,calc(env(safe-area-inset-bottom)+0.45rem))] md:px-8">
        <div className="mx-auto flex max-w-lg flex-col gap-1">
          <p
            className="min-h-4 px-1 text-[0.65rem] tracking-wide text-stone"
            aria-live="polite"
          >
            {tip ?? ""}
          </p>
          <div className="flex gap-0.5">
            {jiwari.map((action) => (
              <ActionBtn key={action.id} action={action} state={state} onBlocked={setTip} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {kagariMain.map((action) => (
              <ActionBtn key={action.id} action={action} state={state} onBlocked={setTip} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {kagariFill.map((action) => (
              <ActionBtn
                key={action.id}
                action={action}
                state={state}
                onBlocked={setTip}
                wide={action.id === "fill"}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="size-7 shrink-0 rounded-full ring-1 ring-line"
              style={{ backgroundColor: wrapHex }}
              title="Цвет базы"
              aria-label="Цвет намотанной базы"
            />
            <div className="flex flex-1 gap-1.5">
              {palette.colors.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Нить ${i + 1}`}
                  onClick={() => setColor(i)}
                  className={cn(
                    "size-7 rounded-full",
                    selectedColor === i
                      ? "ring-2 ring-ink ring-offset-1 ring-offset-linen"
                      : "ring-1 ring-line",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex min-w-0 gap-0.5">
              {PALETTE_LIST.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPalette(item.id)}
                  className={cn(
                    "min-h-8 rounded-full px-2 text-[0.65rem] tracking-wide",
                    paletteId === item.id ? "text-ink" : "text-stone",
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
            {correction.map((action) =>
              action.id === "undo" ? (
                <IconAction
                  key={action.id}
                  label={action.label}
                  disabled={!action.canExecute(state)}
                  reason={action.getDisabledReason(state)}
                  onBlocked={setTip}
                  onClick={() => dispatchCommand(action.id)}
                >
                  <Undo2 className="size-3.5" />
                </IconAction>
              ) : action.id === "reset" ? (
                <IconAction
                  key={action.id}
                  label={action.label}
                  onClick={() => dispatchCommand(action.id)}
                >
                  <RotateCcw className="size-3.5" />
                </IconAction>
              ) : (
                <ActionBtn
                  key={action.id}
                  action={action}
                  state={state}
                  onBlocked={setTip}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconAction({
  label,
  disabled,
  reason,
  onBlocked,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  reason?: string | null;
  onBlocked?: (reason: string) => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      title={reason ?? label}
      onClick={() => {
        if (disabled) {
          if (reason && onBlocked) onBlocked(reason);
          return;
        }
        onClick();
      }}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-ink ring-1 ring-line",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {children}
    </button>
  );
}
