import { useEffect, useState } from "react";
import { Overlay } from "./overlay";
import { TemariScene } from "./scene";
import { useTemari } from "./store";
import { cn } from "@/lib/utils";
import { unlock } from "./feel";

export function TemariApp() {
  const [on, setOn] = useState(false);
  const mode = useTemari((s) => s.mode);

  useEffect(() => {
    setOn(true);
  }, []);

  const stage = mode !== "title";

  return (
    <main
      className={cn(
        "relative h-dvh overflow-hidden bg-linen text-ink",
        stage && "flex flex-col",
      )}
      onPointerDownCapture={() => unlock()}
    >
      <div
        className={
          stage ? "relative min-h-0 flex-1 pt-16 md:pt-10" : "absolute inset-0"
        }
      >
        {on ? (
          <TemariScene />
        ) : (
          <canvas className="absolute inset-0 z-0 size-full bg-linen" aria-hidden />
        )}
      </div>
      <Overlay />
    </main>
  );
}