"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./theme-boot";

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function currentTheme(): Theme {
  return document.documentElement.dataset["theme"] === "light"
    ? "light"
    : "dark";
}

function serverTheme(): Theme {
  return "dark";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset["theme"] = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  for (const listener of listeners) {
    listener();
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, serverTheme);
}
