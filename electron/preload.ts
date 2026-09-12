import { contextBridge, ipcRenderer } from "electron";

// ---------------------------------------------------------------------------
// Phi — preload bridge (replaces @tauri-apps/api + plugin-dialog in renderer).
// Only this narrow, reviewed surface is visible to the React app as window.phi.
// ---------------------------------------------------------------------------

export type PhiWindowControl = "minimize" | "maximize" | "close";

const phi = {
    isElectron: true as const,

    /** Port the sidecar Express server listens on (picked by main at launch). */
    getServerPort: (): Promise<number> => ipcRenderer.invoke("phi:get-server-port"),

    /** Native Chromium zoom factor. Real zoom keeps vh-based layout intact. */
    getZoomFactor: (): Promise<number> => ipcRenderer.invoke("phi:get-zoom-factor"),
    setZoomFactor: (factor: number): Promise<void> =>
        ipcRenderer.invoke("phi:set-zoom-factor", factor),

    /** Native folder picker. Returns an absolute path or null when cancelled. */
    pickDirectory: (defaultPath?: string): Promise<string | null> =>
        ipcRenderer.invoke("phi:pick-directory", defaultPath),

    /** Native confirm dialog. Resolves true when the user confirms. */
    showConfirm: (message: string, title?: string): Promise<boolean> =>
        ipcRenderer.invoke("phi:show-confirm", { message, title }),

    /** Lets main show the quit guard only while streams are in flight. */
    setStreamingCount: (n: number): void => ipcRenderer.send("phi:set-streaming-count", n),

    /** Fired by main when the user confirmed quit with streams running. */
    onAbortAll: (cb: () => void): (() => void) => {
        const listener = () => cb();
        ipcRenderer.on("phi:abort-all", listener);
        return () => ipcRenderer.removeListener("phi:abort-all", listener);
    },

    /** Frameless window controls for the custom titlebar. */
    windowControl: (action: PhiWindowControl): void => ipcRenderer.send("phi:window-control", action),

    /** Open https URLs in the OS browser (never inside the app). */
    openExternal: (url: string): void => ipcRenderer.send("phi:open-external", url),
};

export type PhiBridge = typeof phi;

contextBridge.exposeInMainWorld("phi", phi);
