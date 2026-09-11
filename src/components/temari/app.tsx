import { useEffect, useState } from "react";
import { Overlay } from "./overlay";
import { TemariScene } from "./scene";
import { unlock } from "./feel";

export function TemariApp() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(true);
  }, []);

  return (
    <main
      className="relative h-dvh overflow-hidden bg-linen text-ink"
      onPointerDownCapture={() => unlock()}
    >
      <div
        className="absolute inset-x-0 z-0"
        style={{
          top: "var(--temari-chrome-top, 0px)",
          bottom: "var(--temari-chrome-bottom, 0px)",
        }}
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