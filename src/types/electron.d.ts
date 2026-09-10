// Typings for the Electron preload bridge (window.phi).
// In a plain browser / Tauri WebView this is undefined — all call sites must
// null-check so `vite dev` keeps working without Electron.

export type PhiWindowControl = "minimize" | "maximize" | "close";

export interface PhiBridge {
    readonly isElectron: true;
    getServerPort(): Promise<number>;
    pickDirectory(defaultPath?: string): Promise<string | null>;
    showConfirm(message: string, title?: string): Promise<boolean>;
    setStreamingCount(n: number): void;
    onAbortAll(cb: () => void): () => void;
    windowControl(action: PhiWindowControl): void;
    openExternal(url: string): void;
}

declare global {
    interface Window {
        phi?: PhiBridge;
    }
}

export {};
