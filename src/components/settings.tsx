import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useTheme, useEffectiveTheme, type Theme } from "../hooks/useTheme";
import { useCustomThemes, setActiveCustomThemeId, clearActiveCustomTheme } from "../hooks/useCustomThemes";
import { formatThemeForAppCss } from "../lib/custom-themes";
import type { CustomTheme } from "../lib/custom-themes";
import { IconBox, IconCheckFilled, IconChevronDownFilled, IconCloudFilled, IconCode, IconDotsFilled, IconKeyFilled, IconPaletteFilled, IconPencil, IconPencilFilled, IconPlus, IconTrash, IconTrashFilled } from "@tabler/icons-react";
import { useClose } from "@headlessui/react";
import { Alert } from "./ui/alert";
import { Button, buttonClass } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { MenuItem } from "./ui/menu";
import { NavItem } from "./ui/nav-item";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import { CODE_THEMES, setCodeTheme, useCodeTheme, type CodeThemeId } from "./code-theme";
import { ThemeEditorToggle } from "./dev/ThemeEditor";
import { LocalHomeIcon, RemoteCloudIcon } from "./target-picker";
import { ProviderLogo } from "./provider-logo";
import { Switch } from "./ui/switch";
import { listProviders, deleteProvider, testProvider, listPiAuth, listSkills, toggleSkill, type ProviderRow, type PiAuthRow, type SkillRow } from "../lib/api";
import { LOCAL_HOST_ID, useHosts, type NewHostInput } from "../hooks/useHosts";


export type SettingsSection = "appearance" | "providers" | "hosts" | "skills";

const sections: { id: SettingsSection; label: string; description: string; icon: ComponentType<{ className?: string }> }[] = [
    { id: "appearance", label: "Appearance", description: "Theme and colors", icon: IconPaletteFilled },
    { id: "skills", label: "Skills", description: "Agent skills", icon: IconBox },
    { id: "providers", label: "Providers", description: "Providers, models, and API keys", icon: IconKeyFilled },
    { id: "hosts", label: "Run targets", description: "Local and remote sidecars", icon: IconCloudFilled },
];

export function SettingsPanel({
    onProvidersChanged,
    onAddProvider,
    providersVersion,
    section: controlledSection,
    onSectionChange,
    cwd,
}: {
    onProvidersChanged?: () => void;
    onAddProvider: () => void;
    providersVersion: number;
    section?: SettingsSection;
    onSectionChange?: (section: SettingsSection) => void;
    /** Active workspace — project-scoped skills resolve against it. */
    cwd?: string;
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

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl px-6 pb-6">
                    <header className="pb-5 pt-12">
                        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-phi-text-primary">{active.label}</h1>
                        <p className="mt-1 text-[12px] text-phi-text-muted">{active.description}</p>
                    </header>
                    {section === "appearance" ? <AppearanceTab /> : section === "skills" ? <SkillsTab cwd={cwd} /> : section === "hosts" ? <HostsTab /> : <ProvidersTab onChanged={onProvidersChanged} onAddProvider={onAddProvider} providersVersion={providersVersion} />}
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
                        className={buttonClass("secondary", "sm", "group")}
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
            <span aria-hidden className="relative block h-[132px] w-full overflow-hidden rounded-[20px] border border-white/10">
                <span className="absolute inset-0 flex">
                    <SchemePreviewPane light />
                    <SchemePreviewPane light={false} />
                </span>
            </span>
        );
    }

    return (
        <span aria-hidden className={`relative block h-[132px] w-full overflow-hidden rounded-[20px] border ${mode === "light" ? "border-black/10 bg-white" : "border-white/10 bg-black"}`}>
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

// Miniature app mock painted with a custom theme's own tokens, so it sits
// in the same grid as the bundled schemes and previews what it will apply.
function CustomThemePreview({ theme }: { theme: CustomTheme }) {
    const t = theme.tokens;
    const light = theme.base === "light";
    const pane = t["--color-phi-bg-app"] ?? (light ? "#ffffff" : "#000000");
    const border = t["--color-phi-border"] ?? (light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)");
    const line = t["--color-phi-text-muted"] ?? (light ? "#d9d9df" : "#2e2e34");
    const composer = t["--color-phi-bg-surface"] ?? (light ? "#ffffff" : "#17171c");
    const composerLine = t["--color-phi-border-strong"] ?? (light ? "#e9e9ed" : "#2a2a30");
    const accent = t["--color-phi-accent"] ?? "#2f7bff";

    return (
        <span aria-hidden className="relative block h-[132px] w-full overflow-hidden rounded-[20px] border" style={{ background: pane, borderColor: border }}>
            <span className="absolute inset-0">
                <span className="absolute left-1/2 top-[30%] w-[62%] -translate-x-1/2 space-y-1.5">
                    <span className="block h-1.5 rounded-full" style={{ background: line }} />
                    <span className="block h-1.5 w-4/5 rounded-full opacity-70" style={{ background: line }} />
                </span>
                <span className="absolute bottom-2 left-1/2 flex h-6 w-[72%] -translate-x-1/2 items-center rounded-full border px-1.5" style={{ background: composer, borderColor: border }}>
                    <span className="h-1.5 flex-1 rounded-full" style={{ background: composerLine }} />
                    <span className="ml-1 size-3 rounded-full" style={{ background: accent }} />
                </span>
            </span>
        </span>
    );
}

function CustomThemeCard({
    theme,
    selected,
    renaming,
    renameDraft,
    onRenameChange,
    onRenameCommit,
    onRenameCancel,
    onRenameStart,
    onApply,
    onDelete,
}: {
    theme: CustomTheme;
    selected: boolean;
    renaming: boolean;
    renameDraft: string;
    onRenameChange: (v: string) => void;
    onRenameCommit: () => void;
    onRenameCancel: () => void;
    onRenameStart: () => void;
    onApply: () => void;
    onDelete: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const handleCopyAppCss = async () => {
        try {
            await navigator.clipboard.writeText(formatThemeForAppCss(theme));
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {
            // Clipboard unavailable — no feedback to show in the icon.
        }
    };
    const actionClass =
        "inline-grid size-6 place-items-center rounded-md text-phi-text-tertiary transition-colors hover:bg-phi-overlay hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40";
    return (
        <span className="min-w-0">
            <span className={`group relative block w-full rounded-2xl border bg-phi-bg-surface p-2 transition ${selected ? "border-phi-accent ring-1 ring-phi-accent" : "border-phi-border hover:border-phi-border-strong"}`}>
                <button
                    onClick={onApply}
                    aria-pressed={selected}
                    aria-label={`Apply theme ${theme.name}`}
                    title={`Apply ${theme.name} (${theme.base} base)`}
                    className="block w-full rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                >
                    <CustomThemePreview theme={theme} />
                </button>
                <span className={`absolute right-3.5 top-3.5 flex gap-0.5 rounded-lg border border-phi-border bg-phi-bg-elevated/90 p-0.5 shadow-sm backdrop-blur transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
                    <button onClick={onRenameStart} title="Rename" aria-label={`Rename ${theme.name}`} className={actionClass}>
                        <IconPencil className="size-3.5" />
                    </button>
                    <button onClick={() => void handleCopyAppCss()} title="Copy for App.css" aria-label={`Copy ${theme.name} for App.css`} className={actionClass}>
                        {copied ? <IconCheckFilled className="size-3.5 text-phi-accent" /> : <IconCode className="size-3.5" />}
                    </button>
                    <button
                        onClick={onDelete}
                        title="Delete"
                        aria-label={`Delete ${theme.name}`}
                        className="inline-grid size-6 place-items-center rounded-md text-phi-text-tertiary transition-colors hover:bg-phi-error-bg hover:text-phi-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                    >
                        <IconTrash className="size-3.5" />
                    </button>
                </span>
            </span>
            {renaming ? (
                <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => onRenameChange(e.target.value)}
                    onBlur={onRenameCommit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") onRenameCommit();
                        if (e.key === "Escape") onRenameCancel();
                    }}
                    aria-label="Theme name"
                    className="mx-auto mt-2 block w-full rounded-md border border-phi-accent/40 bg-phi-bg-sunken px-1.5 py-0.5 text-center text-[13px] text-phi-text-primary outline-none"
                />
            ) : (
                <span className={`mt-2 block truncate text-center text-[13px] ${selected ? "font-medium text-phi-text-primary" : "text-phi-text-muted"}`}>{theme.name}</span>
            )}
        </span>
    );
}

function AppearanceTab() {
    const { theme, setTheme } = useTheme();
    const { themes, appliedTheme, renameTheme, deleteTheme } = useCustomThemes();
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState("");

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-[12px] font-semibold tracking-wide text-phi-text-muted">Color scheme</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                    {(["system", "light", "dark"] as Theme[]).map((t) => {
                        const selected = theme === t && !appliedTheme;
                        const label = t === "system" ? "System" : t === "light" ? "Light" : "Dark";
                        return (
                            <span key={t} className="min-w-0">
                                <button
                                    onClick={() => { setTheme(t); clearActiveCustomTheme(); }}
                                    aria-pressed={selected}
                                    className={`block w-full rounded-2xl border bg-phi-bg-surface p-2 transition ${selected ? "border-phi-accent ring-1 ring-phi-accent" : "border-phi-border hover:border-phi-border-strong"}`}
                                >
                                    <SchemePreview mode={t} />
                                </button>
                                <span className={`mt-2 block text-center text-[13px] ${selected ? "font-medium text-phi-text-primary" : "text-phi-text-muted"}`}>{label}</span>
                            </span>
                        );
                    })}
                    {themes.map((t) => (
                        <CustomThemeCard
                            key={t.id}
                            theme={t}
                            selected={appliedTheme?.id === t.id}
                            renaming={renamingId === t.id}
                            renameDraft={renameDraft}
                            onRenameChange={setRenameDraft}
                            onRenameCommit={() => { renameTheme(t.id, renameDraft); setRenamingId(null); }}
                            onRenameCancel={() => setRenamingId(null)}
                            onRenameStart={() => { setRenamingId(t.id); setRenameDraft(t.name); }}
                            onApply={() => { setTheme(t.base); setActiveCustomThemeId(t.id); }}
                            onDelete={() => { if (confirm(`Delete "${t.name}"?`)) deleteTheme(t.id); }}
                        />
                    ))}
                </div>
            </div>

            <CodeThemeSection />

            <ThemeEditorToggle />
        </div>
    );
}


/** Attached settings rows — one rounded object, same sizing as the Advanced Settings toggle row. */
function ListGroup({ children }: { children: ReactNode }) {
    return (
        <div className="overflow-hidden rounded-2xl bg-phi-bg-surface">{children}</div>
    );
}

const LIST_ROW_CLASS = "group relative flex min-h-[60px] w-full items-center gap-4 px-4 py-3 text-left hover:bg-phi-overlay-hover";

function ListRow({ children }: { children: ReactNode }) {
    return <div className={LIST_ROW_CLASS}>{children}</div>;
}

function SkillsTab({ cwd }: { cwd?: string }) {
    const [skills, setSkills] = useState<SkillRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toggling, setToggling] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const r = await listSkills(cwd || undefined);
            setSkills(r.skills);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [cwd]);
    useEffect(() => { void refresh(); }, [refresh]);

    const handleToggle = useCallback(async (skill: SkillRow) => {
        const next = !skill.enabled;
        setToggling(skill.filePath);
        setSkills((prev) => prev.map((s) => (s.filePath === skill.filePath ? { ...s, enabled: next } : s)));
        try {
            await toggleSkill(skill.filePath, next, cwd || undefined);
        } catch (e) {
            setSkills((prev) => prev.map((s) => (s.filePath === skill.filePath ? { ...s, enabled: !next } : s)));
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setToggling(null);
        }
    }, [cwd]);

    if (loading) return <p className="text-[12px] text-phi-text-muted">Loading…</p>;

    return (
        <div>
            {error && <Alert variant="error">{error}</Alert>}
            {skills.length === 0 ? (
                <p className="rounded-lg border border-dashed border-phi-border px-3 py-3 text-[12px] text-phi-text-muted">No skills found — add SKILL.md files under <span className="font-mono">~/.pi/agent/skills</span>.</p>
            ) : (
                <ListGroup>
                    {skills.map((skill) => (
                        <label key={skill.filePath} className={`${LIST_ROW_CLASS} cursor-pointer`}>
                            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center text-phi-text-tertiary"><IconBox className="size-5" /></span>
                            <div className="min-w-0 flex-1" title={skill.filePath}>
                                <div className="truncate text-[13px] font-medium text-phi-text-primary">{skill.name}</div>
                                {skill.description && <div className="mt-0.5 truncate text-[12px] text-phi-text-muted">{skill.description}</div>}
                            </div>
                            <span className="shrink-0 text-[13px] text-phi-text-muted">{skill.scope === "project" ? "Project" : "Personal"}</span>
                            <Switch checked={skill.enabled} disabled={toggling === skill.filePath} label={`${skill.enabled ? "Disable" : "Enable"} skill ${skill.name}`} onClick={() => void handleToggle(skill)} />
                        </label>
                    ))}
                </ListGroup>
            )}
        </div>
    );
}

function HostName({ name, isCurrent }: { name: string; isCurrent: boolean }) {
    return (
        <div className={`flex min-w-0 items-center transition-all duration-200 ease-out motion-reduce:transition-none ${isCurrent ? "gap-1.5" : "gap-0"}`}>
            <span className={`shrink-0 overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none ${isCurrent ? "w-3.5 opacity-100" : "w-0 opacity-0"}`}>
                <IconCheckFilled className="size-3.5 text-phi-thinking-low" />
            </span>
            <span className={`min-w-0 flex-1 truncate text-[13px] font-medium transition-colors duration-200 motion-reduce:transition-none ${isCurrent ? "text-phi-thinking-low" : "text-phi-text-primary"}`}>
                {name}
            </span>
        </div>
    );
}

function HostFormBody({ form, setForm, saveLabel, onCancel, onSave }: {
    form: NewHostInput;
    setForm: (next: (prev: NewHostInput) => NewHostInput) => void;
    saveLabel: string;
    onCancel: () => void;
    onSave: () => void;
}) {
    const canSubmit = form.name.trim().length > 0 && form.url.trim().length > 0;
    // Same treatment as the popover forms (host creator, project creator).
    const inputClass =
        "w-full !border-0 !bg-phi-overlay-strong !px-3 !text-[13px] placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40";
    return (
        <div className="min-w-0 flex-1 space-y-2">
            <Input autoFocus placeholder="Name" aria-label="Run target name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} variant="default" className={inputClass} />
            <Input placeholder="URL https://192.168.1.10:3001" aria-label="Run target URL" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} variant="default" className={inputClass} />
            <Input placeholder="Token (optional)" aria-label="Run target token" type="password" value={form.token ?? ""} onChange={(e) => setForm((p) => ({ ...p, token: e.target.value }))} variant="default" className={inputClass} />
            <div className="flex items-center justify-end gap-1.5 pt-1">
                <Button onClick={onCancel} variant="ghost" size="xs" className="!text-[12px]">Cancel</Button>
                <Button onClick={onSave} disabled={!canSubmit} variant="primary" size="xs" className="!text-[12px]">{saveLabel}</Button>
            </div>
        </div>
    );
}

function HostsTab() {
    const { hosts, activeHostId, setActiveHostId, addHost, updateHost, removeHost } = useHosts();
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<NewHostInput>({ name: "", url: "", token: "" });
    const [showForm, setShowForm] = useState(false);

    const startAdd = useCallback(() => {
        setError(null);
        setEditingId(null);
        setForm({ name: "", url: "", token: "" });
        setShowForm(true);
    }, []);

    const startEdit = useCallback((id: string, current: { name: string; url: string; token: string }) => {
        setError(null);
        setEditingId(id);
        setForm({ ...current });
        setShowForm(true);
    }, []);

    const handleCancel = useCallback(() => {
        setShowForm(false);
        setEditingId(null);
        setError(null);
    }, []);

    const handleSave = useCallback(() => {
        if (!form.name.trim() || !form.url.trim()) {
            setError("Name and URL are required");
            return;
        }
        try {
            if (editingId) updateHost(editingId, form);
            else addHost(form);
            setError(null);
            setShowForm(false);
            setEditingId(null);
            setForm({ name: "", url: "", token: "" });
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [addHost, editingId, form, updateHost]);

    const handleDelete = useCallback((id: string, name: string) => {
        if (!confirm(`Remove run target "${name}"?`)) return;
        removeHost(id);
    }, [removeHost]);

    return (
        <div className="space-y-4">
            {error && <Alert variant="error">{error}</Alert>}

            <ListGroup>
                <ListRow>
                        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center text-phi-text-tertiary"><LocalHomeIcon className="size-5 shrink-0" /></span>
                        <button type="button" onClick={() => setActiveHostId(LOCAL_HOST_ID)} title="Switch to the local sidecar" className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40">
                            <HostName name="Local" isCurrent={activeHostId === LOCAL_HOST_ID} />
                            <div className="mt-0.5 truncate text-[12px] text-phi-text-muted">Local sidecar</div>
                        </button>
                        <span className="shrink-0 text-[13px] text-phi-text-muted">{activeHostId === LOCAL_HOST_ID ? "Active" : ""}</span>
                </ListRow>
                    {hosts.map((host) => (
                        editingId === host.id && showForm ? (
                            <ListRow key={host.id}>
                                <HostFormBody form={form} setForm={setForm} saveLabel="Save changes" onCancel={handleCancel} onSave={handleSave} />
                            </ListRow>
                        ) : (
                        <ListRow key={host.id}>
                            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center text-phi-text-tertiary"><RemoteCloudIcon className="size-5 shrink-0" /></span>
                            <button type="button" onClick={() => setActiveHostId(host.id)} title={`Switch to ${host.name}`} className="min-w-0 flex-1 rounded pr-8 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40">
                                <HostName name={host.name} isCurrent={activeHostId === host.id} />
                                <div className="mt-0.5 truncate font-mono text-[12px] text-phi-text-muted">{host.url}</div>
                            </button>
                            <DropdownMenu className="absolute right-2 top-2 shrink-0">
                                <DropdownMenuTrigger aria-label={`Actions for ${host.name}`}>
                                    <IconDotsFilled className="size-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem icon={<IconPencilFilled className="size-[15px]" />} onClick={() => startEdit(host.id, { name: host.name, url: host.url, token: host.token })}>Edit</DropdownMenuItem>
                                    <DropdownMenuItem icon={<IconTrashFilled className="size-[15px]" />} onClick={() => handleDelete(host.id, host.name)}>Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </ListRow>
                        )
                    ))}
                    {!showForm && (
                        <button
                            onClick={startAdd}
                            className="flex min-h-[60px] w-full items-center gap-3 border-t border-phi-border px-6 py-3 text-left text-[13px] font-medium text-phi-text-muted hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-phi-accent/40"
                        >
                            <IconPlus className="size-4 shrink-0" />
                            Add run target
                        </button>
                    )}
                </ListGroup>

            {showForm && !editingId && (
                <div className="space-y-2 rounded-lg border border-phi-border bg-phi-bg-surface p-3">
                    <h4 className="text-[12px] font-semibold text-phi-text-primary">New run target</h4>
                    <HostFormBody form={form} setForm={setForm} saveLabel="Add run target" onCancel={handleCancel} onSave={handleSave} />
                </div>
            )}
        </div>
    );
}

function ProvidersTab({ onChanged, onAddProvider, providersVersion }: { onChanged?: () => void; onAddProvider: () => void; providersVersion: number }) {
    const [providers, setProviders] = useState<ProviderRow[]>([]);
    const [piProviders, setPiProviders] = useState<PiAuthRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [piLoading, setPiLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<Record<string, string>>({});

    const refresh = useCallback(async () => {
        setLoading(true);
        setPiLoading(true);
        try { const r = await listProviders(); setProviders(r.providers); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
        try { const r = await listPiAuth(); setPiProviders(r.providers); } catch { setPiProviders([]); } finally { setPiLoading(false); }
    }, []);
    // Refresh on mount and whenever a provider is saved via the shared menu.
    useEffect(() => { void refresh(); }, [refresh, providersVersion]);

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

            <ListGroup>
                {piProviders.map((p) => (
                    <ListRow key={`pi-${p.id}`}>
                        <ProviderLogo id={p.id} name={p.name} />
                        <div className="min-w-0 flex-1" title={p.source ? `${p.type} · ${p.source}` : p.type}>
                            <div className="truncate text-[13px] font-medium text-phi-text-primary">{p.name}</div>
                            <div className="mt-0.5 truncate text-[12px] text-phi-text-muted">{p.source ? `${p.type} · ${p.source}` : p.type}</div>
                        </div>
                    </ListRow>
                ))}
                {loading ? (
                    <ListRow>
                        <div className="min-w-0 flex-1">
                            <div className="text-[12px] text-phi-text-muted">Loading…</div>
                        </div>
                    </ListRow>
                ) : (
                    providers.map((p) => (
                        <ListRow key={`custom-${p.id}`}>
                            <ProviderLogo id={p.id} name={p.label || p.id} />
                            <div className="min-w-0 flex-1" title={p.baseUrl}>
                                <div className="truncate text-[13px] font-medium text-phi-text-primary">{p.label || p.id}</div>
                                <div className="mt-0.5 truncate font-mono text-[12px] text-phi-text-muted">{p.baseUrl}</div>
                                <div className="mt-0.5 flex items-center gap-1 text-[11px]">
                                    <span className="font-mono text-phi-text-muted" title="The full key stays on the sidecar. This masked value is all the UI ever sees.">{p.maskedKey || (p.hasKey ? "••••" : "no key saved")}</span>
                                </div>
                                {testResult[p.id] && <div className={`mt-1 text-[11px] ${testResult[p.id] === "OK" ? "text-phi-thinking-low" : "text-phi-error-text"}`}>{testResult[p.id]}</div>}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Button onClick={() => void handleTest(p.id)} disabled={testing === p.id} variant="secondary" size="xs" className="!text-[11px]">{testing === p.id ? "Testing…" : "Test connection"}</Button>
                                <Button onClick={() => void handleDelete(p.id)} variant="secondary" size="xs" className="!border-phi-error-border !bg-phi-error-bg !text-[11px] !text-phi-error-text hover:!bg-phi-error-bg">Delete</Button>
                            </div>
                        </ListRow>
                    ))
                )}
                {!piLoading && !loading && piProviders.length === 0 && providers.length === 0 && (
                    <ListRow>
                        <div className="min-w-0 flex-1">
                            <div className="text-[12px] text-phi-text-muted">No providers yet — run <span className="font-mono">pi login</span> in the terminal.</div>
                        </div>
                    </ListRow>
                )}
                <button
                    onClick={onAddProvider}
                    className="flex min-h-[60px] w-full items-center gap-3 border-t border-phi-border px-6 py-3 text-left text-[13px] font-medium text-phi-text-muted hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-phi-accent/40"
                >
                    <IconPlus className="size-4 shrink-0" />
                    Add provider
                </button>
            </ListGroup>
        </div>
    );
}
