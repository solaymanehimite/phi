export function isElectronRuntime(): boolean {
    return typeof window !== "undefined" && !!window.phi?.isElectron;
}

export function canBrowseDirectories(): boolean {
    // Native folder picker needs the Electron bridge. Plain `vite dev` in a
    // browser has no bridge, so projects are typed by hand there.
    return isElectronRuntime();
}

export async function pickDirectory(defaultPath?: string): Promise<string | null> {
    if (!isElectronRuntime()) return null;
    return (await window.phi!.pickDirectory(defaultPath)) ?? null;
}
