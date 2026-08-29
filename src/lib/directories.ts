export function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI__" in window;
}

export async function pickDirectory(defaultPath?: string): Promise<string | null> {
    if (!isTauriRuntime()) return null;

    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose project",
        defaultPath: defaultPath || undefined,
    });

    return typeof selected === "string" ? selected : null;
}
