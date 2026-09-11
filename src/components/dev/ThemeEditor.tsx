import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
    IconBrush,
    IconCheckFilled,
    IconCopyFilled,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";

const THEME_EDITOR_ENABLED_KEY = "phi:theme-editor-enabled";
const themeEditorEnabledListeners = new Set<() => void>();

function readThemeEditorEnabled(): boolean {
    try {
        return localStorage.getItem(THEME_EDITOR_ENABLED_KEY) === "true";
    } catch {
        return false;
    }
}

function subscribeThemeEditorEnabled(listener: () => void) {
    themeEditorEnabledListeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === THEME_EDITOR_ENABLED_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        themeEditorEnabledListeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

export function useThemeEditorEnabled(): boolean {
    return useSyncExternalStore(subscribeThemeEditorEnabled, readThemeEditorEnabled, () => false);
}

export function setThemeEditorEnabled(enabled: boolean) {
    try {
        localStorage.setItem(THEME_EDITOR_ENABLED_KEY, String(enabled));
    } catch {
        // The setting still applies to the current session when storage is unavailable.
    }
    for (const listener of themeEditorEnabledListeners) listener();
}

type Token = {
    name: string;
    label: string;
    group: string;
};

const TOKENS: Token[] = [
    // Backgrounds
    { name: "--color-phi-bg-app", label: "bg-app", group: "Background" },
    { name: "--color-phi-bg-main", label: "bg-main", group: "Background" },
    { name: "--color-phi-bg-sidebar", label: "bg-sidebar", group: "Background" },
    { name: "--color-phi-bg-surface", label: "bg-surface", group: "Background" },
    {
        name: "--color-phi-bg-elevated",
        label: "bg-elevated",
        group: "Background",
    },
    { name: "--color-phi-bg-sunken", label: "bg-sunken", group: "Background" },
    { name: "--color-phi-bg-inverse", label: "bg-inverse", group: "Background" },
    {
        name: "--color-phi-bg-disabled",
        label: "bg-disabled",
        group: "Background",
    },
    // Text
    { name: "--color-phi-text-primary", label: "text-primary", group: "Text" },
    {
        name: "--color-phi-text-secondary",
        label: "text-secondary",
        group: "Text",
    },
    { name: "--color-phi-text-tertiary", label: "text-tertiary", group: "Text" },
    { name: "--color-phi-text-muted", label: "text-muted", group: "Text" },
    { name: "--color-phi-text-faint", label: "text-faint", group: "Text" },
    { name: "--color-phi-text-inverse", label: "text-inverse", group: "Text" },
    { name: "--color-phi-text-disabled", label: "text-disabled", group: "Text" },
    { name: "--color-phi-text-brand", label: "text-brand", group: "Text" },
    { name: "--color-phi-icon", label: "icon", group: "Text" },
    { name: "--color-phi-icon-active", label: "icon-active", group: "Text" },
    // Accent / Brand
    { name: "--color-phi-accent", label: "accent", group: "Accent" },
    { name: "--color-phi-white", label: "white", group: "Accent" },
    { name: "--color-phi-white-muted", label: "white-muted", group: "Accent" },
    // Borders
    { name: "--color-phi-border", label: "border", group: "Border" },
    {
        name: "--color-phi-border-strong",
        label: "border-strong",
        group: "Border",
    },
    { name: "--color-phi-border-faint", label: "border-faint", group: "Border" },
    {
        name: "--color-phi-border-subtle",
        label: "border-subtle",
        group: "Border",
    },
    { name: "--color-phi-separator", label: "separator", group: "Border" },
    // Overlays
    { name: "--color-phi-overlay", label: "overlay", group: "Overlay" },
    {
        name: "--color-phi-overlay-hover",
        label: "overlay-hover",
        group: "Overlay",
    },
    {
        name: "--color-phi-overlay-active",
        label: "overlay-active",
        group: "Overlay",
    },
    {
        name: "--color-phi-overlay-strong",
        label: "overlay-strong",
        group: "Overlay",
    },
    {
        name: "--color-phi-overlay-muted",
        label: "overlay-muted",
        group: "Overlay",
    },
    { name: "--color-phi-overlay-code", label: "overlay-code", group: "Overlay" },
    {
        name: "--color-phi-overlay-focus",
        label: "overlay-focus",
        group: "Overlay",
    },
    // Inputs
    { name: "--color-phi-input-border", label: "input-border", group: "Input" },
    {
        name: "--color-phi-input-border-focus",
        label: "input-border-focus",
        group: "Input",
    },
    { name: "--color-phi-input-bg", label: "input-bg", group: "Input" },
    {
        name: "--color-phi-input-bg-focus",
        label: "input-bg-focus",
        group: "Input",
    },
    // Status
    { name: "--color-phi-error", label: "error", group: "Status" },
    { name: "--color-phi-error-bg", label: "error-bg", group: "Status" },
    { name: "--color-phi-error-border", label: "error-border", group: "Status" },
    { name: "--color-phi-error-text", label: "error-text", group: "Status" },
    { name: "--color-phi-streaming", label: "streaming", group: "Status" },
    // Thinking effort
    {
        name: "--color-phi-thinking-low",
        label: "thinking-low",
        group: "Thinking",
    },
    {
        name: "--color-phi-thinking-minimal",
        label: "thinking-minimal",
        group: "Thinking",
    },
    {
        name: "--color-phi-thinking-medium",
        label: "thinking-medium",
        group: "Thinking",
    },
    {
        name: "--color-phi-thinking-high",
        label: "thinking-high",
        group: "Thinking",
    },
    {
        name: "--color-phi-thinking-xhigh",
        label: "thinking-xhigh",
        group: "Thinking",
    },
    {
        name: "--color-phi-thinking-max",
        label: "thinking-max",
        group: "Thinking",
    },
];

function getComputedVar(name: string): string {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
}

function colorToHex(color: string): string {
    const v = color.trim();
    if (v.startsWith("#")) {
        // normalize 3-char hex
        if (v.length === 4) {
            const r = v[1],
                g = v[2],
                b = v[3];
            return `#${r}${r}${g}${g}${b}${b}`;
        }
        return v.slice(0, 7);
    }
    // color with alpha like 255 255 255 / 0.06 or comma separated
    const nums = v.match(/\d+/g);
    if (!nums || nums.length < 3) return "#000000";
    const [r, g, b] = nums.slice(0, 3).map(Number);
    const toHex = (n: number) =>
        Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    const full =
        h.length === 3
            ? h
                .split("")
                .map((c) => c + c)
                .join("")
            : h;
    const n = parseInt(full.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function getAlpha(original: string): string | null {
    // extracts alpha from color with slash or comma syntax
    const m =
        original.match(/\/\s*([0-9.]+)\s*\)/) ||
        original.match(/,\s*([0-9.]+)\s*\)/);
    if (!m) return null;
    const a = m[1];
    if (a === "1" || a === "1.0") return null;
    // only treat as alpha if original had 4 numbers
    const nums = original.match(/\d+/g);
    if (nums && nums.length >= 4) return a;
    // for rgb(... / alpha) pattern, return if slash present
    if (original.includes("/")) return a;
    return null;
}

type ThemeEditorProps = {
    className?: string;
};

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

export function ThemeEditor({ className = "" }: ThemeEditorProps) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [active, setActive] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // hydrate from computed styles
    useEffect(() => {
        const initial: Record<string, string> = {};
        for (const t of TOKENS) {
            const v = getComputedVar(t.name);
            if (v) initial[t.name] = v;
        }
        setValues(initial);
    }, []);

    const setToken = (name: string, hex: string) => {
        const original = values[name] ?? getComputedVar(name) ?? hex;
        const alpha = getAlpha(original);
        let cssValue = hex;
        if (alpha !== null) {
            const [r, g, b] = hexToRgb(hex);
            // preserve original alpha syntax: r g b / alpha
            cssValue = `rgb(${r} ${g} ${b} / ${alpha})`;
        }
        document.documentElement.style.setProperty(name, cssValue);
        setValues((prev) => ({ ...prev, [name]: cssValue }));
    };

    const cssCode = useMemo(() => {
        const lines = TOKENS.map((t) => {
            const v = values[t.name] ?? getComputedVar(t.name);
            return `  ${t.name}: ${v};`;
        }).join("\n");
        return `:root {\n${lines}\n}`;
    }, [values]);

    const copyCss = async () => {
        await navigator.clipboard.writeText(cssCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const groups = useMemo(() => {
        const map = new Map<string, Token[]>();
        for (const t of TOKENS) {
            const arr = map.get(t.group) ?? [];
            arr.push(t);
            map.set(t.group, arr);
        }
        return Array.from(map.entries());
    }, []);

    return (
        <Popover className={`relative z-50 ${className}`}>
            <PopoverTrigger
                aria-label="Open advanced color settings"
                className="inline-grid size-8 shrink-0 place-items-center rounded-lg text-phi-text-tertiary transition-colors hover:bg-phi-overlay hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
            >
                <IconBrush className="size-4" />
            </PopoverTrigger>

            <PopoverContent
                anchor={{ to: "top end", gap: 12 }}
                className="relative flex !max-h-[500px] w-[360px] flex-col overflow-hidden [--anchor-gap:12px]"
            >
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 space-y-4">
                    {groups.map(([group, tokens]) => (
                        <div key={group}>
                            <p className="px-2 pb-1.5 text-sm font-medium text-phi-text-primary">
                                {group}
                            </p>
                            <div className="space-y-1">
                                {tokens.map((t) => {
                                    const val = values[t.name] ?? "";
                                    const hex = val ? colorToHex(val) : "#000000";
                                    const isActive = active === t.name;
                                    return (
                                        <div
                                            key={t.name}
                                            className={`rounded-lg border ${isActive ? "border-phi-accent/30 bg-phi-overlay" : "border-transparent hover:bg-phi-overlay-muted"} px-2 py-1.5`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <button
                                                    onClick={() => setActive(isActive ? null : t.name)}
                                                    aria-label={`Pick color for ${t.label}`}
                                                    className="size-7 shrink-0 rounded-md border border-phi-border shadow-[inset_0_0_0_1px_var(--color-phi-border)]"
                                                    style={{ background: val || hex }}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[12.5px] leading-none text-phi-text-secondary">
                                                        {t.label}
                                                    </p>
                                                </div>
                                                <HexColorInput
                                                    prefixed
                                                    alpha={false}
                                                    className="w-[88px] rounded-md border border-phi-border bg-phi-bg-sunken px-1.5 py-1 text-center font-mono text-[11px] text-phi-text-secondary outline-none focus:border-phi-accent/40"
                                                    color={hex}
                                                    onChange={(nextHex) => setToken(t.name, nextHex)}
                                                />
                                            </div>
                                            {isActive && (
                                                <div className="pt-2">
                                                    <HexColorPicker
                                                        color={hex}
                                                        onChange={(nextHex) => setToken(t.name, nextHex)}
                                                        className="!w-full"
                                                    />
                                                    <style>{`.react-colorful { width: 100% !important } .react-colorful__saturation { border-radius: 10px 10px 0 0 } .react-colorful__hue, .react-colorful__alpha { height: 14px; border-radius: 0 0 10px 10px }`}</style>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="border-t border-phi-border-faint p-2">
                    <Button
                        onClick={copyCss}
                        variant="primary"
                        size="sm"
                        className="w-full !rounded-xl !py-2"
                    >
                        {copied ? (
                            <IconCheckFilled className="size-3.5" />
                        ) : (
                            <IconCopyFilled className="size-3.5" />
                        )}
                        {copied ? "Copied!" : "Copy CSS"}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
