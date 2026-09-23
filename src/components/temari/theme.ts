import { useSyncExternalStore } from "react";

/**
 * Page theme. The light linen page is too bright at night, so the workshop
 * has a dark one. The choice is remembered per browser; with no choice it
 * follows the system. `index.html` applies it before first paint.
 */
export type Theme = "light" | "dark";

const KEY = "temari-theme";

function current(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

const listeners = new Set<() => void>();

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private windows may refuse storage; the page still switches.
  }
  for (const fn of listeners) fn();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    current,
    () => "light",
  );
}
