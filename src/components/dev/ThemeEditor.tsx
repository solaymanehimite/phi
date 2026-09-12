import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button, buttonClass } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import {
    IconBrush,
    IconCheckFilled,
    IconChevronLeft,
    IconCopyFilled,
    IconPencil,
    IconPlusFilled,
} from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCustomThemes, setActiveCustomThemeId } from "../../hooks/useCustomThemes";
import { useEffectiveTheme, useTheme } from "../../hooks/useTheme";
import { formatThemeForAppCss, readLiveTokens } from "../../lib/custom-themes";

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
    if (Number.isNaN(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) =>
        clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const rp = r / 255;
    const gp = g / 255;
    const bp = b / 255;
    const max = Math.max(rp, gp, bp);
    const min = Math.min(rp, gp, bp);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rp) h = ((gp - bp) / d) % 6;
        else if (max === gp) h = (bp - rp) / d + 2;
        else h = (rp - gp) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;
    return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const hh = ((h % 360) + 360) % 360;
    const ss = clamp(s, 0, 100) / 100;
    const vv = clamp(v, 0, 100) / 100;
    const c = vv * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = vv - c;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (hh < 60) [rp, gp, bp] = [c, x, 0];
    else if (hh < 120) [rp, gp, bp] = [x, c, 0];
    else if (hh < 180) [rp, gp, bp] = [0, c, x];
    else if (hh < 240) [rp, gp, bp] = [0, x, c];
    else if (hh < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    return [
        Math.round((rp + m) * 255),
        Math.round((gp + m) * 255),
        Math.round((bp + m) * 255),
    ];
}

function hsvToHex(h: number, s: number, v: number): string {
    const [r, g, b] = hsvToRgb(h, s, v);
    return rgbToHex(r, g, b);
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

function ChannelSlider(props: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    precision?: number;
    gradient: string;
    ariaLabel: string;
    suffix?: string;
    onChange: (next: number) => void;
}) {
    const { label, value, min, max, step = 0.1, precision = 1, gradient, ariaLabel, suffix, onChange } = props;
    const [draft, setDraft] = useState<string | null>(null);
    const [focused, setFocused] = useState(false);

    const format = (n: number): string => {
        if (precision === 0) return String(Math.round(n));
        const fixed = n.toFixed(precision);
        // trim trailing zeros: "42.0" -> "42"
        return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
    };

    // Clear a stale draft once the committed value catches up from outside
    // (e.g. another control changed the same channel).
    useEffect(() => {
        if (!focused) setDraft(null);
    }, [value, focused]);

    const commit = (raw: string) => {
        if (raw.trim() === "") {
            setDraft(null);
            return;
        }
        const n = Number(raw);
        if (Number.isNaN(n)) {
            setDraft(null);
            return;
        }
        onChange(clamp(n, min, max));
        setDraft(null);
    };

    return (
        <div className="flex items-center gap-2">
            <span
                aria-hidden
                className="w-3 shrink-0 text-center font-mono text-[10px] font-semibold text-phi-text-tertiary"
            >
                {label}
            </span>
            <input
                type="range"
                aria-label={ariaLabel}
                min={min}
                max={max}
                step={step}
                value={clamp(value, min, max)}
                onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
                className="phi-color-slider min-w-0 flex-1"
                style={{ backgroundImage: gradient }}
            />
            <span className="flex w-[52px] shrink-0 items-center gap-0.5 rounded-md border border-phi-border bg-phi-bg-sunken px-1 py-0.5 focus-within:border-phi-accent/40">
                <input
                    type="number"
                    aria-label={`${ariaLabel} value`}
                    min={min}
                    max={max}
                    step={step}
                    value={draft ?? format(clamp(value, min, max))}
                    onChange={(e) => {
                        // Buffer while typing; only commit on Enter/blur so
                        // intermediate values like "2" (of "255") don't snap.
                        setDraft(e.target.value);
                    }}
                    onFocus={() => {
                        setFocused(true);
                        setDraft(format(clamp(value, min, max)));
                    }}
                    onBlur={(e) => {
                        setFocused(false);
                        commit(e.target.value);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commit((e.target as HTMLInputElement).value);
                            (e.target as HTMLInputElement).blur();
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            setDraft(null);
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-right font-mono text-[10px] text-phi-text-secondary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                {suffix && (
                    <span className="font-mono text-[9px] text-phi-text-faint">{suffix}</span>
                )}
            </span>
        </div>
    );
}

function HexField(props: { hex: string; onCommit: (nextHex: string) => void }) {
    const { hex, onCommit } = props;
    const [draft, setDraft] = useState<string | null>(null);
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) setDraft(null);
    }, [hex, focused]);

    const isValidHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v);

    const commit = (raw: string) => {
        const v = raw.trim();
        if (v === "") {
            setDraft(null);
            return;
        }
        const normalized = v.startsWith("#") ? v : `#${v}`;
        if (isValidHex(normalized)) onCommit(normalized.slice(0, 7));
        setDraft(null);
    };

    return (
        <input
            aria-label="Hex color value"
            spellCheck={false}
            value={draft ?? hex}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => {
                setFocused(true);
                setDraft(hex);
            }}
            onBlur={(e) => {
                setFocused(false);
                commit(e.target.value);
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    commit((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft(null);
                    (e.target as HTMLInputElement).blur();
                }
            }}
            className="w-[88px] rounded-md border border-phi-border bg-phi-bg-sunken px-1.5 py-1 text-center font-mono text-[11px] text-phi-text-secondary outline-none focus:border-phi-accent/40"
        />
    );
}

function HsvRgbSliders(props: { hex: string; onChange: (nextHex: string) => void }) {
    const { hex, onChange } = props;
    const [r, g, b] = useMemo(() => hexToRgb(hex), [hex]);
    const [h, s, v] = useMemo(() => rgbToHsv(r, g, b), [r, g, b]);

    const setRgb = (nr: number, ng: number, nb: number) => {
        onChange(rgbToHex(Math.round(nr), Math.round(ng), Math.round(nb)));
    };
    const setHsv = (nh: number, ns: number, nv: number) => {
        onChange(hsvToHex(nh, ns, nv));
    };

    const sStart = hsvToHex(h, 0, v);
    const sEnd = hsvToHex(h, 100, v);
    const vEnd = hsvToHex(h, s === 0 ? 0 : s, 100);

    return (
        <div className="space-y-3 px-0.5 pt-2.5">
            <div className="space-y-1.5">
                <p className="font-mono text-[9px] font-semibold tracking-[0.12em] text-phi-text-faint uppercase">
                    HSV
                </p>
                <ChannelSlider
                    label="H"
                    value={h}
                    min={0}
                    max={360}
                    step={0.1}
                    precision={1}
                    ariaLabel="Hue"
                    suffix="°"
                    gradient="linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)"
                    onChange={(nh) => setHsv(nh, s, v)}
                />
                <ChannelSlider
                    label="S"
                    value={s}
                    min={0}
                    max={100}
                    step={0.1}
                    precision={1}
                    ariaLabel="Saturation"
                    suffix="%"
                    gradient={`linear-gradient(to right, ${sStart}, ${sEnd})`}
                    onChange={(ns) => setHsv(h, ns, v)}
                />
                <ChannelSlider
                    label="V"
                    value={v}
                    min={0}
                    max={100}
                    step={0.1}
                    precision={1}
                    ariaLabel="Value (brightness)"
                    suffix="%"
                    gradient={`linear-gradient(to right, #000000, ${vEnd})`}
                    onChange={(nv) => setHsv(h, s, nv)}
                />
            </div>
            <div className="space-y-1.5">
                <p className="font-mono text-[9px] font-semibold tracking-[0.12em] text-phi-text-faint uppercase">
                    RGB
                </p>
                <ChannelSlider
                    label="R"
                    value={r}
                    min={0}
                    max={255}
                    step={1}
                    precision={0}
                    ariaLabel="Red"
                    gradient={`linear-gradient(to right, rgb(0 ${g} ${b}), rgb(255 ${g} ${b}))`}
                    onChange={(nr) => setRgb(nr, g, b)}
                />
                <ChannelSlider
                    label="G"
                    value={g}
                    min={0}
                    max={255}
                    step={1}
                    precision={0}
                    ariaLabel="Green"
                    gradient={`linear-gradient(to right, rgb(${r} 0 ${b}), rgb(${r} 255 ${b}))`}
                    onChange={(ng) => setRgb(r, ng, b)}
                />
                <ChannelSlider
                    label="B"
                    value={b}
                    min={0}
                    max={255}
                    step={1}
                    precision={0}
                    ariaLabel="Blue"
                    gradient={`linear-gradient(to right, rgb(${r} ${g} 0), rgb(${r} ${g} 255))`}
                    onChange={(nb) => setRgb(r, g, nb)}
                />
            </div>
        </div>
    );
}

const COLOR_SLIDER_CSS = `
.phi-color-slider { -webkit-appearance: none; appearance: none; height: 10px; border-radius: 9999px; outline: none; cursor: pointer; border: 1px solid var(--color-phi-border); }
.phi-color-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 9999px; background: #fff; border: 2px solid rgba(0,0,0,0.55); box-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: ew-resize; }
.phi-color-slider::-moz-range-thumb { width: 12px; height: 12px; border-radius: 9999px; background: #fff; border: 2px solid rgba(0,0,0,0.55); box-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: ew-resize; }
.phi-color-slider:focus-visible { outline: 2px solid color-mix(in srgb, var(--color-phi-accent) 60%, transparent); outline-offset: 2px; }
`;

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
    const [mode, setMode] = useState<"edit" | "save">("edit");
    const [values, setValues] = useState<Record<string, string>>({});
    const [active, setActive] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [themeName, setThemeName] = useState("");
    const { appliedTheme, createTheme, updateThemeTokens, renameTheme } = useCustomThemes();
    const { theme: storedTheme } = useTheme();
    const effective = useEffectiveTheme();
    // What the sliders are editing right now: the applied custom theme, or
    // the bundled base underneath. Switch themes elsewhere (e.g. Settings)
    // to change the target — the editor just follows. Saving pins
    // (or updates) exactly this.
    const stockBase = storedTheme === "system" ? effective : storedTheme;
    const customTarget = appliedTheme;
    const targetBase = customTarget?.base ?? stockBase;

    const editRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLDivElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const createButtonRef = useRef<HTMLButtonElement>(null);
    const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

    // Morph the popover height to fit the active view, like the directory picker.
    useLayoutEffect(() => {
        const el = mode === "edit" ? editRef.current : formRef.current;
        if (!el) return;
        const update = () => setContentHeight(el.offsetHeight);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [mode]);

    // Keep focus on the active view's control across the morph.
    useEffect(() => {
        if (mode === "save") nameInputRef.current?.focus();
        else createButtonRef.current?.focus();
    }, [mode]);

    // hydrate from computed styles
    useEffect(() => {
        const initial: Record<string, string> = {};
        for (const t of TOKENS) {
            const v = getComputedVar(t.name);
            if (v) initial[t.name] = v;
        }
        setValues(initial);
    }, []);

    const refreshFromLive = () => {
        const live = readLiveTokens();
        setValues(live);
    };

    // When the theme changes elsewhere (e.g. Settings) re-read so the
    // sliders match the screen.
    useEffect(() => {
        const onThemeChange = () => refreshFromLive();
        const observer = new MutationObserver((mutations) => {
            if (mutations.some((m) => m.attributeName === "data-theme")) onThemeChange();
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        window.addEventListener("phi:custom-theme-applied", onThemeChange);
        return () => {
            observer.disconnect();
            window.removeEventListener("phi:custom-theme-applied", onThemeChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const copyAppCss = async () => {
        const live = readLiveTokens();
        const draft = {
            id: customTarget?.id ?? "draft",
            name: customTarget?.name ?? "Custom",
            base: targetBase,
            tokens: live,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        await navigator.clipboard.writeText(formatThemeForAppCss(draft));
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const flashSaved = () => {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1200);
    };

    const handleSave = () => {
        const name = themeName.trim();
        if (!name) return;
        const live = readLiveTokens();
        if (customTarget) {
            updateThemeTokens(customTarget.id, live);
            if (name !== customTarget.name) renameTheme(customTarget.id, name);
        } else {
            const created = createTheme(name, targetBase, live);
            setActiveCustomThemeId(created.id);
        }
        setThemeName("");
        setMode("edit");
        flashSaved();
    };

    const enterSaveMode = () => {
        setThemeName(customTarget?.name ?? "");
        setMode("save");
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

    const editing = mode === "edit";

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
                className="w-[360px] overflow-hidden p-0 [--anchor-gap:12px]"
            >
                <style>{COLOR_SLIDER_CSS}</style>
                <div
                    className="relative w-full overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
                    style={contentHeight !== undefined ? { height: contentHeight } : undefined}
                >
                    <div
                        ref={editRef}
                        inert={!editing}
                        aria-hidden={!editing}
                        className={`w-full transition-opacity duration-150 motion-reduce:transition-none ${editing ? "relative opacity-100" : "pointer-events-none absolute inset-x-0 top-0 opacity-0"}`}
                    >
                        <div className="flex max-h-[500px] flex-col">
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
                                                            <HexField
                                                                hex={hex}
                                                                onCommit={(nextHex) => setToken(t.name, nextHex)}
                                                            />
                                                        </div>
                                                        {isActive && (
                                                            <div className="pt-1">
                                                                <HsvRgbSliders
                                                                    hex={hex}
                                                                    onChange={(nextHex) => setToken(t.name, nextHex)}
                                                                />
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
                                <div className="flex gap-1.5">
                                    <Button
                                        onClick={() => void copyAppCss()}
                                        variant="secondary"
                                        size="sm"
                                        className="flex-1 !rounded-xl !py-2 !text-[12px]"
                                        title="Copy a block ready to paste into App.css"
                                    >
                                        {copied ? (
                                            <IconCheckFilled className="size-3.5" />
                                        ) : (
                                            <IconCopyFilled className="size-3.5" />
                                        )}
                                        {copied ? "Copied!" : "Copy"}
                                    </Button>
                                    <button
                                        ref={createButtonRef}
                                        onClick={enterSaveMode}
                                        className={buttonClass("primary", "sm", "flex-1 !rounded-xl !py-2 !text-[12px]")}
                                    >
                                        {savedFlash ? (
                                            <IconCheckFilled className="size-3.5" />
                                        ) : customTarget ? (
                                            <IconPencil className="size-3.5" />
                                        ) : (
                                            <IconPlusFilled className="size-3.5" />
                                        )}
                                        {savedFlash ? "Saved!" : customTarget ? "Update theme" : "Create theme"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div
                        ref={formRef}
                        inert={editing}
                        aria-hidden={editing}
                        className={`w-full transition-opacity duration-150 motion-reduce:transition-none ${editing ? "pointer-events-none absolute inset-x-0 top-0 opacity-0" : "relative opacity-100"}`}
                    >
                        <ThemeSaveForm
                            title={customTarget ? `Update "${customTarget.name}"` : "New theme"}
                            name={themeName}
                            onNameChange={setThemeName}
                            nameInputRef={nameInputRef}
                            note={
                                customTarget
                                    ? `Updates "${customTarget.name}" in place (${customTarget.base} base).`
                                    : `Saves as a new custom theme on its ${targetBase} base.`
                            }
                            saveLabel={customTarget ? "Save changes" : "Save theme"}
                            onBack={() => setMode("edit")}
                            onSave={handleSave}
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function ThemeSaveForm({
    title,
    name,
    onNameChange,
    nameInputRef,
    note,
    saveLabel,
    onBack,
    onSave,
}: {
    title: string;
    name: string;
    onNameChange: (v: string) => void;
    nameInputRef: React.RefObject<HTMLInputElement | null>;
    note: string;
    saveLabel: string;
    onBack: () => void;
    onSave: () => void;
}) {
    const canSubmit = name.trim().length > 0;

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) onSave();
            }}
            className="w-full"
        >
            <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                <Button variant="icon" size="icon" onClick={onBack} aria-label="Back to colors" className="!size-7">
                    <IconChevronLeft className="size-5 shrink-0" />
                </Button>
                <p className="min-w-0 flex-1 truncate text-[13px] text-phi-text-primary">
                    {title}
                </p>
            </div>

            <div className="px-3 py-3">
                <label
                    htmlFor="new-theme-name"
                    className="mb-1.5 block text-[13px] font-medium text-phi-text-primary"
                >
                    Name
                </label>
                <Input
                    id="new-theme-name"
                    ref={nameInputRef}
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="My theme"
                    aria-label="Theme name"
                    spellCheck={false}
                    autoComplete="off"
                    variant="default"
                    className="w-full !border-0 !bg-phi-overlay-strong !px-3 !text-[13px] placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                />
                <p className="mt-2 text-[11px] leading-4 text-phi-text-muted">
                    {note}
                </p>
            </div>

            <div className="flex items-center justify-end gap-1.5 px-2 pb-2 pt-2">
                <Button variant="ghost" size="xs" onClick={onBack} className="!text-[12.5px]">
                    Cancel
                </Button>
                <Button
                    type="submit"
                    variant="primary"
                    size="xs"
                    disabled={!canSubmit}
                    className="!rounded-md !text-[12.5px]"
                >
                    {saveLabel}
                </Button>
            </div>
        </form>
    );
}
