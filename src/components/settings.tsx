import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useTheme, useEffectiveTheme, type Theme } from "../hooks/useTheme";
import { IconCheckFilled, IconChevronDownFilled, IconKeyFilled, IconPaletteFilled } from "@tabler/icons-react";
import { useClose } from "@headlessui/react";
import { Alert } from "./ui/alert";
import { Button, buttonClass } from "./ui/button";
import { DialogOverlay, DialogPanel, DialogTitle } from "./ui/dialog";
import { InlineCode } from "./ui/code";
import { Input } from "./ui/input";
import { MenuItem } from "./ui/menu";
import { NavItem } from "./ui/nav-item";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import { CODE_THEMES, setCodeTheme, useCodeTheme, type CodeThemeId } from "./code-theme";
import { ThemeEditorToggle } from "./dev/ThemeEditor";
import { listProviders, upsertProvider, deleteProvider, testProvider, type ProviderRow } from "../lib/api";


export type SettingsSection = "appearance" | "providers";

const sections: { id: SettingsSection; label: string; description: string; icon: ComponentType<{ className?: string }> }[] = [
    { id: "appearance", label: "Appearance", description: "Theme and colors", icon: IconPaletteFilled },
    { id: "providers", label: "Auth", description: "Models and API keys", icon: IconKeyFilled },
];

export function SettingsPanel({
    onProvidersChanged,
    section: controlledSection,
    onSectionChange,
}: {
    onProvidersChanged?: () => void;
    section?: SettingsSection;
    onSectionChange?: (section: SettingsSection) => void;
}) {
    const [internalSection, setInternalSection] = useState<SettingsSection>("appearance");
    const section = controlledSection ?? internalSection;
    const setSection = onSectionChange ?? setInternalSection;
    const active = sections.find((item) => item.id === section)!;

    return (
        <div className="flex min-h-0 flex-1">
            {/* Secondary sidebar — lives inside the main panel so the app sidebar never changes */}
            <aside className="flex w-[188px] shrink-0 flex-col border-r border-phi-border pb-5 pt-2 sm:w-[220px]">
                <nav aria-label="Settings sections" className="space-y-0.5 px-2">
                    {sections.map((item) => (
                        <NavItem
                            key={item.id}
                            active={item.id === section}
                            label={item.label}
                            icon={item.icon}
                            onClick={() => setSection(item.id)}
                            ariaCurrent={item.id === section ? "page" : undefined}
                        />
                    ))}
                </nav>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="shrink-0 px-6 pb-5 pt-12">
                    <div className="mx-auto w-full max-w-3xl">
                        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-phi-text-primary">{active.label}</h1>
                        <p className="mt-1 text-[12px] text-phi-text-muted">{active.description}</p>
                    </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-1">
                    <div className="mx-auto w-full max-w-3xl">
                        {section === "appearance" ? <AppearanceTab /> : <ProvidersTab onChanged={onProvidersChanged} />}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CodeThemeSection() {
    // Live effective mode (shared store) — the dropdown always reflects the
    // current app theme, and the pick is saved into that mode's slot.
    const effective = useEffectiveTheme();
    const { choice } = useCodeTheme();
    const filtered = useMemo(
        () => (Object.entries(CODE_THEMES) as [CodeThemeId, (typeof CODE_THEMES)[CodeThemeId]][]).filter(([, meta]) => meta.mode === effective),
        [effective],
    );
    const options: { id: CodeThemeId; label: string }[] = filtered.map(([id, meta]) => ({ id, label: meta.label }));
    const previewTheme: PrismTheme = CODE_THEMES[choice].theme;
    const currentLabel = CODE_THEMES[choice].label;

    return (
        <div className="overflow-hidden rounded-2xl border border-phi-border">
            <div className="relative">
                <CodeThemePreview theme={previewTheme} />
                <Popover className="absolute right-3 top-3">
                    <PopoverTrigger
                        className={buttonClass("secondary", "xs", "group")}
                        aria-label={`Code theme, currently ${currentLabel}`}
                    >
                        <span className="min-w-0 flex-1 truncate text-left">{currentLabel}</span>
                        <IconChevronDownFilled className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
                    </PopoverTrigger>
                    {/* rounded-xl panel + rounded-lg rows = identical to dropdown menus */}
                    <PopoverContent anchor={{ to: "bottom end", gap: 8 }} className="w-48 !rounded-xl p-1">
                        <CodeThemeMenu options={options} choice={choice} />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}

/** First three distinct token colors, for the dropdown swatches. */
function themeSwatches(theme: PrismTheme): string[] {
    const out: string[] = [];
    const push = (c: unknown) => {
        if (typeof c === "string" && /^(#|rgb|hsl)/.test(c) && !out.includes(c)) out.push(c);
    };
    for (const entry of theme.styles) {
        push(entry.style?.color);
        if (out.length >= 3) break;
    }
    return out;
}

function CodeThemeMenu({
    options,
    choice,
}: {
    options: { id: CodeThemeId; label: string }[];
    choice: CodeThemeId;
}) {
    const close = useClose();
    return (
        <>
            {options.map((option) => {
                const selected = option.id === choice;
                const swatches = themeSwatches(CODE_THEMES[option.id].theme);
                return (
                    <MenuItem
                        key={option.id}
                        active={selected}
                        onClick={() => {
                            setCodeTheme(option.id);
                            close();
                        }}
                    >
                        <span aria-hidden="true" className="flex shrink-0 items-center">
                            {swatches.map((color, i) => (
                                <span
                                    key={i}
                                    style={{ backgroundColor: color }}
                                    className={`size-3.5 rounded-full ring-2 ring-phi-bg-elevated ${i > 0 ? "-ml-1.5" : ""}`}
                                />
                            ))}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {selected && <IconCheckFilled className="size-3.5 shrink-0 text-phi-accent" />}
                    </MenuItem>
                );
            })}
        </>
    );
}

const CODE_THEME_SAMPLE = `import { useState } from "react";

type Status = "idle" | "loading" | "done";

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = useState<number>(initial);
  const status: Status = count > 10 ? "done" : "idle";
  return <button onClick={() => setCount(count + 1)}>count: {count} ({status})</button>;
}`;

function CodeThemePreview({ theme }: { theme: PrismTheme }) {
    return (
        <Highlight theme={theme} code={CODE_THEME_SAMPLE} language="tsx">
            {({ tokens, getLineProps, getTokenProps }) => (
                <pre className="overflow-x-auto border-b border-phi-border bg-phi-bg-app p-4 font-mono text-[12px] leading-5">
                    {tokens.map((line, i) => (
                        <span key={i} {...getLineProps({ line })} className="block whitespace-pre">
                            {line.map((token, key) => (
                                <span key={key} {...getTokenProps({ token })} />
                            ))}
                        </span>
                    ))}
                </pre>
            )}
        </Highlight>
    );
}

// Miniature app mock — inner swatches are intentionally fixed light/dark
// values (they depict each scheme, not the current theme). Only the
// selection ring uses the live accent token.
function SchemePreview({ mode }: { mode: Theme }) {
    if (mode === "system") {
        return (
            <span aria-hidden className="relative block h-[132px] w-full overflow-hidden rounded-[10px] border border-white/10">
                <span className="absolute inset-0 flex">
                    <SchemePreviewPane light />
                    <SchemePreviewPane light={false} />
                </span>
            </span>
        );
    }

    return (
        <span aria-hidden className={`relative block h-[132px] w-full overflow-hidden rounded-[10px] border ${mode === "light" ? "border-black/10 bg-white" : "border-white/10 bg-black"}`}>
            <SchemePreviewPane light={mode === "light"} />
        </span>
    );
}

function SchemePreviewPane({ light }: { light: boolean }) {
    const palette = light
        ? {
            pane: "bg-white",
            line: "bg-[#d9d9df]",
            mutedLine: "bg-[#d9d9df]",
            composer: "border-black/10 bg-white",
            composerLine: "bg-[#e9e9ed]",
            accent: "bg-[#2f7bff]",
        }
        : {
            pane: "bg-black",
            line: "bg-[#2e2e34]",
            mutedLine: "bg-[#2e2e34]",
            composer: "border-white/10 bg-[#17171c]",
            composerLine: "bg-[#2a2a30]",
            accent: "bg-[#2f7bff]",
        };

    return (
        <span className={`relative block h-full min-w-0 flex-1 overflow-hidden ${palette.pane}`}>
            <span className="absolute inset-0">
                <span className="absolute left-1/2 top-[30%] w-[62%] -translate-x-1/2 space-y-1.5">
                    <span className={`block h-1.5 rounded-full ${palette.line}`} />
                    <span className={`block h-1.5 w-4/5 rounded-full ${palette.mutedLine} opacity-70`} />
                </span>
                <span className={`absolute bottom-2 left-1/2 flex h-6 w-[72%] -translate-x-1/2 items-center rounded-full border px-1.5 ${palette.composer}`}>
                    <span className={`h-1.5 flex-1 rounded-full ${palette.composerLine}`} />
                    <span className={`ml-1 size-3 rounded-full ${palette.accent}`} />
                </span>
            </span>
        </span>
    );
}

function AppearanceTab() {
    const { theme, setTheme } = useTheme();

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-[12px] font-semibold tracking-wide text-phi-text-muted">Color scheme</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                    {(["system", "light", "dark"] as Theme[]).map((t) => {
                        const selected = theme === t;
                        const label = t === "system" ? "System" : t === "light" ? "Light" : "Dark";
                        return (
                            <span key={t} className="min-w-0">
                                <button
                                    onClick={() => setTheme(t)}
                                    aria-pressed={selected}
                                    className={`block w-full rounded-2xl border bg-phi-bg-surface p-2 transition ${selected ? "border-phi-accent ring-1 ring-phi-accent" : "border-phi-border hover:border-phi-border-strong"}`}
                                >
                                    <SchemePreview mode={t} />
                                </button>
                                <span className={`mt-2 block text-center text-[13px] ${selected ? "font-medium text-phi-text-primary" : "text-phi-text-muted"}`}>{label}</span>
                            </span>
                        );
                    })}
                </div>
            </div>

            <CodeThemeSection />

            <ThemeEditorToggle />
        </div>
    );
}

function ProvidersTab({ onChanged }: { onChanged?: () => void }) {
    const [providers, setProviders] = useState<ProviderRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({ label: "", baseUrl: "", apiKey: "" });
    const [dialogOpen, setDialogOpen] = useState(false);
    const [showKey, setShowKey] = useState<Record<string, boolean>>({});
    const [testing, setTesting] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try { const r = await listProviders(); setProviders(r.providers); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);

    const handleSave = useCallback(async () => {
        if (!form.label || !form.baseUrl || !form.apiKey) { setError("label, baseUrl and apiKey required"); return; }
        const baseId = form.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider";
        let id = baseId;
        let suffix = 2;
        while (providers.some((provider) => provider.id === id)) id = `${baseId}-${suffix++}`;
        const provider = { id, ...form };
        setSaving(true);
        setError(null);
        try {
            await testProvider(id, { baseUrl: form.baseUrl, apiKey: form.apiKey });
            await upsertProvider(provider);
            await refresh();
            onChanged?.();
            setForm({ label: "", baseUrl: "", apiKey: "" });
            setDialogOpen(false);
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
    }, [form, providers, refresh, onChanged]);

    const handleTest = useCallback(async (id: string) => {
        setTesting(id); setTestResult((p) => ({ ...p, [id]: "" }));
        try { await testProvider(id); setTestResult((p) => ({ ...p, [id]: "OK" })); } catch (e) { setTestResult((p) => ({ ...p, [id]: e instanceof Error ? e.message : String(e) })); } finally { setTesting(null); }
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        if (!confirm(`Delete provider ${id}?`)) return;
        try { await deleteProvider(id); await refresh(); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    }, [refresh, onChanged]);

    return (
        <div className="space-y-4">
            {error && <Alert variant="error">{error}</Alert>}

            {dialogOpen && (
                <DialogOverlay role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialogOpen(false); }}>
                    <DialogPanel aria-labelledby="add-provider-title">
                        <div className="flex items-center justify-between">
                            <DialogTitle id="add-provider-title">Add provider</DialogTitle>
                            <Button variant="ghost" size="xs" onClick={() => setDialogOpen(false)} className="!text-[12px]">Cancel</Button>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-2">
                            <Input autoFocus placeholder="Label (e.g. OpenAI)" value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} variant="default" />
                            <Input placeholder="Base URL https://api.openai.com/v1" value={form.baseUrl} onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))} variant="default" />
                            <Input placeholder="API key" type="password" value={form.apiKey} onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))} variant="default" />
                        </div>
                        <Button onClick={() => void handleSave()} disabled={saving} variant="primary" size="sm" className="mt-4 !w-auto">{saving ? "Saving…" : "Save (tests connection)"}</Button>
                    </DialogPanel>
                </DialogOverlay>
            )}

            <div className="space-y-2">
                <h4 className="text-[12px] font-semibold text-phi-text-primary">Providers</h4>
                {loading ? <p className="text-[12px] text-phi-text-muted">Loading…</p> : (
                    <div className="space-y-2">
                        {providers.map((p) => (
                            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-phi-border bg-phi-bg-surface px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13px] font-medium text-phi-text-primary">{p.label || p.id}</div>
                                    <div className="truncate font-mono text-[11px] text-phi-text-muted">{p.baseUrl}</div>
                                    <div className="flex items-center gap-1 text-[11px]">
                                        <span className="font-mono text-phi-text-muted">{showKey[p.id] ? (p.maskedKey ? p.maskedKey.replace(/•/g, "•") : "no key") : p.maskedKey || "••••"}</span>
                                        <button onClick={() => setShowKey((m) => ({ ...m, [p.id]: !m[p.id] }))} className="text-phi-text-tertiary hover:text-phi-text-secondary underline">{showKey[p.id] ? "Hide" : "Show"}</button>
                                    </div>
                                    {testResult[p.id] && <div className={`mt-1 text-[11px] ${testResult[p.id] === "OK" ? "text-phi-thinking-low" : "text-phi-error-text"}`}>{testResult[p.id]}</div>}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button onClick={() => void handleTest(p.id)} disabled={testing === p.id} variant="secondary" size="xs" className="!text-[11px]">{testing === p.id ? "Testing…" : "Test connection"}</Button>
                                    <Button onClick={() => void handleDelete(p.id)} variant="secondary" size="xs" className="!border-phi-error-border !bg-phi-error-bg !text-[11px] !text-phi-error-text hover:!bg-phi-error-bg">Delete</Button>
                                </div>
                            </div>
                        ))}
                        <button onClick={() => { setError(null); setForm({ label: "", baseUrl: "", apiKey: "" }); setDialogOpen(true); }} className="w-full rounded-lg border border-dashed border-phi-border px-3 py-3 text-left text-[12px] font-medium text-phi-text-muted hover:border-phi-input-border-focus hover:text-phi-text-primary">+ Add provider</button>
                    </div>
                )}
            </div>
        </div>
    );
}
