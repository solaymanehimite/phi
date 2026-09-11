import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  applyCustomTokens,
  buildCustomTheme,
  clearCustomTokens,
  loadActiveCustomThemeId,
  loadCustomThemes,
  persistActiveCustomThemeId,
  persistCustomThemes,
  type CustomTheme,
  type CustomThemeBase,
} from "../lib/custom-themes";
import { getStoredTheme } from "./useTheme";

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === "phi:custom-themes-v1" || e.key === "phi:active-custom-theme-v1" || e.key === "phi:theme") {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.attributeName === "data-theme")) listener();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    observer.disconnect();
  };
}

function snapshot(): { themes: CustomTheme[]; activeId: string | null; stock: string } {
  const themes = loadCustomThemes();
  const activeId = loadActiveCustomThemeId();
  const stock = getStoredTheme();
  return { themes, activeId, stock };
}

// String snapshot keeps the store referentially stable.
function getSnapshot(): string {
  const s = snapshot();
  return JSON.stringify({
    t: s.themes.map((t) => `${t.id}:${t.updatedAt}:${t.name}:${t.base}`),
    a: s.activeId,
    s: s.stock,
  });
}

function getServerSnapshot(): string {
  return JSON.stringify({ t: [], a: null, s: "system" });
}

function currentState() {
  return snapshot();
}

export function getActiveCustomTheme(): CustomTheme | null {
  const { themes, activeId, stock } = currentState();
  if (!activeId) return null;
  const found = themes.find((t) => t.id === activeId) ?? null;
  // A custom theme only applies on its own base. Picking stock System/Light/Dark
  // with a different base reveals the bundled theme instead.
  if (found && stock !== found.base) return null;
  return found;
}

/** Re-apply the active theme (or clear overrides when none applies). Idempotent. */
export function refreshCustomThemeApplication(): void {
  const { themes, activeId, stock } = currentState();
  const found = activeId ? themes.find((t) => t.id === activeId) ?? null : null;
  if (found && stock === found.base) {
    applyCustomTokens(found.tokens);
  } else {
    clearCustomTokens();
  }
  try {
    window.dispatchEvent(new CustomEvent("phi:custom-theme-applied"));
  } catch {}
}

export function useCustomThemes() {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { themes, activeId, stock } = currentState();
  const activeTheme = activeId ? themes.find((t) => t.id === activeId) ?? null : null;
  // Applied means visible right now (base matches the stored stock theme).
  const appliedTheme = activeTheme && stock === activeTheme.base ? activeTheme : null;

  // Keep the DOM in sync: boot, theme switch, save, cross-tab.
  useEffect(() => {
    refreshCustomThemeApplication();
  }, [activeId, stock, themes.length]);

  const createTheme = useCallback((name: string, base: CustomThemeBase, tokens: Record<string, string>) => {
    const next = buildCustomTheme(name, base, tokens);
    const all = [...loadCustomThemes(), next];
    persistCustomThemes(all);
    persistActiveCustomThemeId(next.id);
    emit();
    refreshCustomThemeApplication();
    return next;
  }, []);

  const updateThemeTokens = useCallback((id: string, tokens: Record<string, string>) => {
    const all = loadCustomThemes().map((t) => (t.id === id ? { ...t, tokens: { ...tokens }, updatedAt: Date.now() } : t));
    persistCustomThemes(all);
    emit();
    refreshCustomThemeApplication();
  }, []);

  const renameTheme = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const all = loadCustomThemes().map((t) => (t.id === id ? { ...t, name: trimmed, updatedAt: Date.now() } : t));
    persistCustomThemes(all);
    emit();
  }, []);

  const deleteTheme = useCallback((id: string) => {
    const all = loadCustomThemes().filter((t) => t.id !== id);
    persistCustomThemes(all);
    if (loadActiveCustomThemeId() === id) {
      persistActiveCustomThemeId(null);
      clearCustomTokens();
    }
    emit();
    refreshCustomThemeApplication();
  }, []);

  const importTheme = useCallback((theme: CustomTheme) => {
    const all = [...loadCustomThemes(), theme];
    persistCustomThemes(all);
    emit();
    return theme;
  }, []);

  return { themes, activeId, activeTheme, appliedTheme, stock, createTheme, updateThemeTokens, renameTheme, deleteTheme, importTheme };
}

export function setActiveCustomThemeId(id: string | null): void {
  persistActiveCustomThemeId(id);
  emit();
  refreshCustomThemeApplication();
}

export function clearActiveCustomTheme(): void {
  persistActiveCustomThemeId(null);
  clearCustomTokens();
  emit();
}
