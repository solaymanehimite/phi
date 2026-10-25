import { useSyncExternalStore } from "react";

const THEME_EDITOR_ENABLED_KEY = "phi:theme-editor-enabled";
const listeners = new Set<() => void>();

function readEnabled(): boolean {
    try {
        return localStorage.getItem(THEME_EDITOR_ENABLED_KEY) === "true";
    } catch {
        return false;
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === THEME_EDITOR_ENABLED_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

export function useThemeEditorEnabled(): boolean {
    return useSyncExternalStore(subscribe, readEnabled, () => false);
}

export function setThemeEditorEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(THEME_EDITOR_ENABLED_KEY, String(enabled));
    } catch {
        // Keep the current window in sync when storage is unavailable.
    }
    for (const listener of listeners) listener();
}
