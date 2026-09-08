import { useEffect, useState } from "react";
import { Overlay } from "./overlay";
import { TemariScene } from "./scene";

export function TemariApp() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(true);
  }, []);

  return (
    <main className="relative h-dvh overflow-hidden bg-ink text-linen">
      {on ? (
        <TemariScene />
      ) : (
        <canvas className="absolute inset-0 z-0 size-full bg-ink" aria-hidden />
      )}
      <Overlay />
    </main>
  );
}
