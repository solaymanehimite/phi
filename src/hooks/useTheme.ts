import { useCallback, useEffect, useSyncExternalStore } from "react";
import { syncFavicon } from "../lib/themed-assets";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "phi:theme";

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

export function getEffectiveTheme(theme: Theme): "light" | "dark" {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  const eff = getEffectiveTheme(theme);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) {
    m.setAttribute("content", eff === "light" ? "#ffffff" : "#08080a");
  }
  syncFavicon(eff);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
}

// --- shared stored-theme subscription ---------------------------------------
// useTheme used to keep per-component useState, so two components calling
// useTheme() (e.g. AppearanceTab + CodeThemeSection) drifted apart: changing
// the app theme in one left the other's `effective` stale. A module-level
// external store keeps every caller in sync.

type Listener = () => void;
const storedListeners = new Set<Listener>();
function emitStored() {
  for (const listener of storedListeners) listener();
}

function subscribeToStoredTheme(listener: Listener) {
  storedListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    storedListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getStoredSnapshot(): Theme {
  return getStoredTheme();
}

function subscribeToEffectiveTheme(listener: () => void) {
  if (typeof document !== "undefined") {
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.attributeName === "data-theme")) listener();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    const onMedia = () => listener();
    media?.addEventListener?.("change", onMedia);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
      media?.removeEventListener?.("change", onMedia);
    };
  }
  return () => {};
}

function getEffectiveSnapshot(): "light" | "dark" {
  return getEffectiveTheme(getStoredTheme());
}

/** Re-renders the caller whenever the resolved light/dark theme changes. */
export function useEffectiveTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeToEffectiveTheme,
    getEffectiveSnapshot,
    () => "dark" as const,
  );
}

export function setStoredTheme(t: Theme) {
  applyTheme(t);
  emitStored();
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribeToStoredTheme,
    getStoredSnapshot,
    () => "system" as const,
  );
  // Live effective value (tracks OS changes while in "system" mode).
  const effective = useEffectiveTheme();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      // re-apply to update meta color
      applyTheme("system");
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setStoredTheme(t);
  }, []);

  return { theme, effective, setTheme };
}
