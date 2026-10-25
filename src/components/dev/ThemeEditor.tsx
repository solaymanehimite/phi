import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button, buttonClass } from "../ui/button";
import { Input } from "../ui/input";
import {
    IconBrush,
    IconCheckFilled,
    IconChevronLeft,
    IconCopyFilled,
    IconPencil,
    IconPlusFilled,
} from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCustomThemes, setActiveCustomThemeId } from "../../hooks/useCustomThemes";
import { useEffectiveTheme, useTheme } from "../../hooks/useTheme";
import { applyCustomTokens, formatThemeForAppCss, readLiveTokens } from "../../lib/custom-themes";
import { THEME_TOKENS, type ThemeToken } from "../../lib/theme-tokens";
import { COLOR_SLIDER_CSS, HexField, HsvRgbSliders, colorToHex, getAlpha, hexToRgb } from "./theme-editor-controls";

export { useThemeEditorEnabled, setThemeEditorEnabled } from "./theme-editor-state";
export { ThemeEditorToggle } from "./theme-editor-toggle";

function getComputedVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

type ThemeEditorProps = {
    className?: string;
};

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
        for (const t of THEME_TOKENS) {
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
        applyCustomTokens({ [name]: cssValue });
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
        const map = new Map<string, ThemeToken[]>();
        for (const t of THEME_TOKENS) {
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
                <IconBrush className="size-4" fill="currentColor" />
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
