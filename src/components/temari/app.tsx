import { lazy, Suspense, useEffect, useState } from "react";
import { Overlay } from "./overlay";
import { TemariScene } from "./scene";
import { unlock } from "./feel";

const UpperKikuControl = lazy(() => import("./UpperKikuControl"));
const UpperBundleControl = lazy(() => import("./UpperBundleControl"));

export function TemariApp() {
  const [on, setOn] = useState(false);
  const [upperControl] = useState(() => typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("upper-kiku") === "1");
  const [bundleControl] = useState(() => typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("upper-bundle") === "1");

  useEffect(() => {
    setOn(true);
  }, []);

  return (
    <main
      className="relative h-dvh overflow-hidden bg-linen text-ink"
      onPointerDownCapture={() => unlock()}
    >
      {bundleControl ? <Suspense fallback={<p role="status">Загрузка трёх подхватов…</p>}><UpperBundleControl /></Suspense>
      : upperControl ? <Suspense fallback={<p role="status">Загрузка контроля…</p>}><UpperKikuControl /></Suspense> : <>
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
      </>}
    </main>
  );
}
