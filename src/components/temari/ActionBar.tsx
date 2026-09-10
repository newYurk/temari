import { useMemo, useState } from "react";
import { RotateCcw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PALETTE_LIST, PALETTES } from "./palettes";
import { kikuCapacity, KAGARI_SPACING_META } from "./patterns";
import { useTemari } from "./store";
import {
  GAME_ACTIONS,
  dispatchCommand,
  snapshotFromStore,
  type GameAction,
  type WorldSnapshot,
} from "./actions";

function byCategory(category: GameAction["category"]) {
  return GAME_ACTIONS.filter((action) => action.category === category);
}

function ActionBtn({
  action,
  snapshot,
  onBlocked,
  wide,
}: {
  action: GameAction;
  snapshot: WorldSnapshot;
  onBlocked: (reason: string) => void;
  wide?: boolean;
}) {
  const available = action.isAvailable(snapshot);
  const active = action.isActive?.(snapshot) ?? false;
  const busy = action.isBusy?.(snapshot) ?? false;
  const reason = action.getDisabledReason(snapshot);

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
        dispatchCommand(action.command);
      }}
      className={cn(
        "min-h-8 rounded-full px-2 text-[0.68rem] tracking-wide ring-1 transition-opacity duration-150",
        wide ? "flex-[1.3]" : "flex-1",
        busy && "opacity-70",
        !available && "cursor-not-allowed opacity-35",
        available && active && "bg-ink/8 text-ink ring-line-strong",
        available && !active && "text-stone ring-line hover:text-ink",
      )}
    >
      {action.label}
    </button>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-0.5">{children}</div>;
}

function markBlocked(s: WorldSnapshot) {
  if (!(s.mode === "studio" && s.layerDone)) return "Сначала намотайте базу";
  if (s.craft !== "stitch") return "Сначала кагари";
  return null;
}

export function ActionBar() {
  const mode = useTemari((s) => s.mode);
  const paletteId = useTemari((s) => s.paletteId);
  const selectedColor = useTemari((s) => s.selectedColor);
  const wrapHex = useTemari((s) => s.wrapHex);
  const layerDone = useTemari((s) => s.layerDone);
  const pins = useTemari((s) => s.pins);
  const threadWidth = useTemari((s) => s.threadWidth);
  const kikuLayers = useTemari((s) => s.kikuLayers);
  const kagariSpacing = useTemari((s) => s.kagariSpacing);
  const wrapProgress = useTemari((s) => s.wrapProgress);
  const wrapCount = useTemari((s) => s.wrapCount);
  const craft = useTemari((s) => s.craft);
  const history = useTemari((s) => s.history);
  const sewnHistory = useTemari((s) => s.sewnHistory);
  const pinHistory = useTemari((s) => s.pinHistory);
  const jiwariOn = useTemari((s) => s.jiwariOn);
  const division = useTemari((s) => s.division);
  const motif = useTemari((s) => s.motif);
  const kagariDir = useTemari((s) => s.kagariDir);
  const setPalette = useTemari((s) => s.setPalette);
  const setColor = useTemari((s) => s.setColor);
  const setKikuLayers = useTemari((s) => s.setKikuLayers);

  const [tip, setTip] = useState<string | null>(null);

  const snapshot = useMemo(
    () => snapshotFromStore(),
    [
      mode,
      layerDone,
      wrapProgress,
      wrapCount,
      craft,
      jiwariOn,
      division,
      motif,
      pins,
      history,
      sewnHistory,
      pinHistory,
      kagariDir,
      kagariSpacing,
    ],
  );

  const palette = PALETTES[paletteId];
  const cap = kikuCapacity(
    pins.map((pin) => pin.p),
    threadWidth,
    KAGARI_SPACING_META[kagariSpacing].density,
  );
  const rowsLocked = Boolean(markBlocked(snapshot) || !snapshot.closedContour);

  const wrapActs = byCategory("wrap");
  const mark = byCategory("mark");
  const stitchMotif = byCategory("stitch").filter((a) => a.id.startsWith("motif-"));
  const stitchFill = byCategory("stitch").filter(
    (a) => a.id === "fill" || a.id.startsWith("kagari-"),
  );
  const stitchSpace = byCategory("stitch").filter((a) => a.id.startsWith("space-"));
  const edit = byCategory("edit");

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-linen from-35% via-linen/75 to-transparent" />
      <div className="pointer-events-auto relative px-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] md:px-8">
        <div className="mx-auto flex max-w-lg flex-col gap-1">
          <p className="min-h-4 px-1 text-[0.65rem] tracking-wide text-stone" aria-live="polite">
            {tip ?? ""}
          </p>
          <Row>
            {mark.map((action) => (
              <ActionBtn key={action.id} action={action} snapshot={snapshot} onBlocked={setTip} />
            ))}
          </Row>
          <Row>
            {stitchMotif.map((action) => (
              <ActionBtn key={action.id} action={action} snapshot={snapshot} onBlocked={setTip} />
            ))}
          </Row>
          <Row>
            {stitchFill.map((action) => (
              <ActionBtn
                key={action.id}
                action={action}
                snapshot={snapshot}
                onBlocked={setTip}
                wide={action.id === "fill"}
              />
            ))}
            <button
              type="button"
              aria-label="Меньше рядов"
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-stone ring-1 ring-line",
                rowsLocked && "cursor-not-allowed opacity-35",
              )}
              onClick={() => {
                const blocked = markBlocked(snapshot);
                if (blocked || !snapshot.closedContour) {
                  setTip(blocked ?? "Залить можно, только если контур замкнут");
                  return;
                }
                setKikuLayers(kikuLayers - 1);
              }}
            >
              −
            </button>
            <span className="min-w-8 self-center text-center text-[0.65rem] tabular-nums text-ink">
              {Math.min(kikuLayers, cap.max)}/{cap.max}
            </span>
            <button
              type="button"
              aria-label="Больше рядов"
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-stone ring-1 ring-line",
                rowsLocked && "cursor-not-allowed opacity-35",
              )}
              onClick={() => {
                const blocked = markBlocked(snapshot);
                if (blocked || !snapshot.closedContour) {
                  setTip(blocked ?? "Залить можно, только если контур замкнут");
                  return;
                }
                setKikuLayers(kikuLayers + 1);
              }}
            >
              +
            </button>
            {stitchSpace.map((action) => (
              <ActionBtn key={action.id} action={action} snapshot={snapshot} onBlocked={setTip} />
            ))}
          </Row>
          <div className="flex items-center gap-1.5">
            <div className="flex min-w-0 flex-1 gap-1">
              {PALETTE_LIST.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPalette(item.id)}
                  className={cn(
                    "min-h-8 flex-1 rounded-full px-1 text-[0.65rem] tracking-wide",
                    paletteId === item.id ? "text-ink" : "text-stone",
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            {wrapActs.map((action) => (
              <ActionBtn
                key={action.id}
                action={action}
                snapshot={snapshot}
                onBlocked={setTip}
              />
            ))}
            {edit.map((action) =>
              action.id === "undo" ? (
                <IconAction
                  key={action.id}
                  label={action.label}
                  disabled={!action.isAvailable(snapshot)}
                  reason={action.getDisabledReason(snapshot)}
                  onBlocked={setTip}
                  onClick={() => dispatchCommand(action.command)}
                >
                  <Undo2 className="size-3.5" />
                </IconAction>
              ) : action.id === "reset" ? (
                <IconAction
                  key={action.id}
                  label={action.label}
                  onClick={() => dispatchCommand(action.command)}
                >
                  <RotateCcw className="size-3.5" />
                </IconAction>
              ) : (
                <ActionBtn
                  key={action.id}
                  action={action}
                  snapshot={snapshot}
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
        "flex size-8 items-center justify-center rounded-full text-ink ring-1 ring-line",
        disabled && "cursor-not-allowed opacity-35",
      )}
    >
      {children}
    </button>
  );
}
