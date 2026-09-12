import { useEffect } from "react";

const STORAGE_KEY = "phi:zoom-v1";
const MIN = 0.5;
const MAX = 2;
const STEP = 0.1;

function clamp(value: number): number {
    return Math.min(MAX, Math.max(MIN, Math.round(value * 10) / 10));
}

function readSaved(): number | null {
    try {
        const raw = Number(localStorage.getItem(STORAGE_KEY));
        if (Number.isFinite(raw) && raw >= MIN && raw <= MAX) return clamp(raw);
    } catch {
        /* storage unavailable — fall through */
    }
    return null;
}

function persist(factor: number): void {
    try {
        if (factor === 1) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, String(factor));
    } catch {
        /* ignore quota / private-mode failures */
    }
}

/**
 * Ctrl/Cmd + +/- to zoom, Ctrl/Cmd+0 to reset. Persists in localStorage.
 *
 * Uses Electron's native zoom factor (real Chromium zoom, so 100vh layout
 * keeps filling the screen). In a plain browser the hook stays out of the
 * way and lets the browser's own zoom do the same job.
 */
export function useZoom(): void {
    useEffect(() => {
        // Clear any stale CSS zoom from the previous implementation — it
        // scales layout boxes but not viewport units, which broke 100vh.
        document.documentElement.style.zoom = "";

        const bridge = window.phi;
        if (!bridge) return;
        let factor = 1;
        let touched = false;

        const set = (next: number) => {
            touched = true;
            factor = clamp(next);
            persist(factor);
            void bridge.setZoomFactor(factor).catch(() => {});
        };

        // Restore the saved factor on boot. Guarded by `touched` so a slow
        // IPC reply can't clobber a zoom the user already changed.
        const saved = readSaved();
        if (saved != null) {
            factor = saved;
            touched = true;
            void bridge.setZoomFactor(saved).catch(() => {});
        } else {
            void bridge
                .getZoomFactor()
                .then((live) => {
                    if (!touched && Number.isFinite(live)) factor = clamp(live);
                })
                .catch(() => {});
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            const zoomIn = e.key === "+" || e.key === "=" || e.code === "NumpadAdd" || e.code === "Equal";
            const zoomOut = e.key === "-" || e.key === "_" || e.code === "NumpadSubtract" || e.code === "Minus";
            const reset = e.key === "0" || e.code === "Numpad0" || e.code === "Digit0";
            if (!zoomIn && !zoomOut && !reset) return;
            e.preventDefault();
            if (reset) set(1);
            else if (zoomIn) set(factor + STEP);
            else set(factor - STEP);
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}
