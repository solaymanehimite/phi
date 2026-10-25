import { Switch } from "../ui/switch";
import { setThemeEditorEnabled, useThemeEditorEnabled } from "./theme-editor-state";

export function ThemeEditorToggle() {
    const enabled = useThemeEditorEnabled();

    return (
        <label className="flex min-h-[60px] w-full cursor-pointer items-center justify-between gap-4 rounded-lg bg-phi-bg-surface px-4 py-3 text-left hover:bg-phi-overlay-hover">
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-phi-text-primary">Advanced Settings</span>
                <span className="mt-0.5 block truncate text-[12px] text-phi-text-muted">Show the floating color editor in chats</span>
            </span>
            <Switch checked={enabled} label="Enable advanced settings" onClick={() => setThemeEditorEnabled(!enabled)} />
        </label>
    );
}
