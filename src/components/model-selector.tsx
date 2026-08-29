import { memo, useCallback, useMemo, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    Atom,
    Brain,
    Compass,
    Eye,
    List,
    Search as SearchIcon,
    Sparkles,
    Star,
    Infinity as InfinityIcon,
} from "lucide-react";
import opencodeUrl from "../assets/opencode.svg";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import type { ModelInfo, ThinkingLevel } from "../types/session";

// Canonical order — matches pi-ai ThinkingLevel union, used for the slider
const CANONICAL_LEVELS: ThinkingLevel[] = ["minimal", "low", "medium", "high", "xhigh", "max"];
// Keep legacy order for compat but we render canonical; helper normalizes
export const THINKING_LEVELS = CANONICAL_LEVELS;

const THINKING_COLORS: Record<ThinkingLevel, string> = {
    minimal: "var(--color-phi-thinking-minimal)",
    low: "var(--color-phi-thinking-low)",
    medium: "var(--color-phi-thinking-medium)",
    high: "var(--color-phi-thinking-high)",
    xhigh: "var(--color-phi-thinking-xhigh)",
    max: "var(--color-phi-thinking-max)",
};

const PROVIDER_ICONS: Record<string, typeof Star> = {
    openai: Atom,
    anthropic: Brain,
    google: Sparkles,
    xai: InfinityIcon,
    kimi: Compass,
    "kimi-coding": Compass,
};

const PROVIDER_ICON_URLS: Record<string, string> = {
    opencode: opencodeUrl,
};

function prettyProvider(id: string): string {
    if (id === "openai") return "OpenAI";
    if (id === "anthropic") return "Anthropic";
    if (id === "google" || id === "google-vertex") return "Google";
    if (id === "xai") return "xAI";
    if (id === "kimi" || id === "kimi-coding") return "Kimi";
    if (id === "opencode") return "Opencode";
    return id.charAt(0).toUpperCase() + id.slice(1);
}

function ProviderImg({ provider, size = 16, className = "" }: { provider: string; size?: number; className?: string }) {
    const url = PROVIDER_ICON_URLS[provider];
    const Icon = PROVIDER_ICONS[provider] ?? Star;
    if (url) {
        return <img src={url} alt="" width={size} height={size} className={`object-contain ${className}`} style={{ width: size, height: size }} draggable={false} />;
    }
    return <Icon size={size} strokeWidth={1.9} className={className} />;
}

function modelKey(m: Pick<ModelInfo, "provider" | "id">): string {
    return `${m.provider}/${m.id}`;
}

function parseModelKey(key: string): { provider: string; id: string } | null {
    const slash = key.indexOf("/");
    if (slash === -1) return null;
    return { provider: key.slice(0, slash), id: key.slice(slash + 1) };
}

function formatCost(n: number | undefined): string {
    if (n == null || Number.isNaN(n)) return "—";
    // n is $/M tokens asset as per pi-ai ModelCost; keep 2 decimals for composer list
    return `${Number(n).toFixed(2)}$`;
}

function availableLevelsFor(model: ModelInfo | undefined): ThinkingLevel[] {
    if (!model) return CANONICAL_LEVELS;
    const map = model.thinkingLevelMap as Record<string, string | null> | null | undefined;
    if (!map || typeof map !== "object" || Object.keys(map).length === 0) {
        // No map → assume model supports the canonical reasoning ladder if reasoning=true, else still show all
        // For non-reasoning models pi still accepts but maps to null — show all so user isn't blocked before server validates
        return CANONICAL_LEVELS;
    }
    const levels = CANONICAL_LEVELS.filter((lvl) => map[lvl] !== null);
    // Always exclude "off" from slider (it's a separate concept); keep at least 1 entry so slider renders
    // If filter empties (e.g. only "off" supported) fall back to canonical to avoid empty slider
    return levels.length ? levels : CANONICAL_LEVELS;
}

type ModelSelectorProps = {
    models?: ModelInfo[];
    value?: string; // "provider/id" — e.g. "anthropic/claude-sonnet-4-20250514" or bare id for legacy
    thinkingLevel?: string; // ThinkingLevel | "off"
    onSelect?: (provider: string, id: string) => void | Promise<void>;
    onThinkingChange?: (level: ThinkingLevel) => void | Promise<void>;
    disabled?: boolean;
    loading?: boolean;
    error?: string | null;
    isStreaming?: boolean;
};

export const ModelSelector = memo(function ModelSelector({
    models,
    value,
    thinkingLevel,
    onSelect,
    onThinkingChange,
    disabled,
    loading,
    error,
    isStreaming,
}: ModelSelectorProps) {
    const list = models ?? [];
    // Derive selected model from value — support both "provider/id" and bare "id"
    // If value refers to a model not in the available list (e.g. legacy/unavailable), keep a synthetic
    // so the pill still shows the actual active model instead of falling back to list[0].
    const selected = useMemo(() => {
        if (!value) return list[0] ?? null;
        const parsed = parseModelKey(value);
        if (parsed) {
            const found = list.find((m) => m.provider === parsed.provider && m.id === parsed.id);
            if (found) return found;
            // synthetic for unavailable/legacy model
            return {
                provider: parsed.provider,
                id: parsed.id,
                name: parsed.id,
                api: "unknown",
                reasoning: true,
                input: ["text" as const],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 0,
                maxTokens: 0,
                thinkingLevelMap: null,
            } as ModelInfo;
        }
        // legacy: bare id
        const byId = list.find((m) => m.id === value);
        if (byId) return byId;
        if (value) {
            return {
                provider: "unknown",
                id: value,
                name: value,
                api: "unknown",
                reasoning: true,
                input: ["text" as const],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 0,
                maxTokens: 0,
                thinkingLevelMap: null,
            } as ModelInfo;
        }
        return list[0] ?? null;
    }, [list, value]);

    const selectedKey = selected ? modelKey(selected) : value ?? "";
    // Thinking effort is controlled by parent when provided, else local fallback only for unauthed/loading state
    const [localEffort, setLocalEffort] = useState<ThinkingLevel>("medium");
    const effortRaw = (thinkingLevel as ThinkingLevel | undefined) ?? localEffort;
    // Normalize to canonical — if server sends "off" treat as minimal for slider position but keep label
    const effortForSlider = (CANONICAL_LEVELS.includes(effortRaw as ThinkingLevel) ? effortRaw : "medium") as ThinkingLevel;

    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("all");

    const providerIds = useMemo(() => [...new Set(list.map((m) => m.provider))].sort(), [list]);

    const categories = useMemo(() => {
        const cats: Array<{ id: string; label: string; icon?: typeof Star; iconUrl?: string }> = [
            { id: "all", label: "All", icon: List },
        ];
        for (const pid of providerIds) {
            const url = PROVIDER_ICON_URLS[pid];
            if (url) cats.push({ id: pid, label: prettyProvider(pid), iconUrl: url });
            else cats.push({ id: pid, label: prettyProvider(pid), icon: PROVIDER_ICONS[pid] ?? Star });
        }
        return cats;
    }, [providerIds]);

    const filtered = useMemo(() => {
        let out = list;
        if (activeCategory !== "all") {
            out = out.filter((m) => m.provider === activeCategory);
        }
        if (query.trim()) {
            const q = query.toLowerCase();
            out = out.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q));
        }
        return out;
    }, [list, query, activeCategory]);

    // Gap B: only levels supported by the CURRENT model are shown in the slider
    const availableLevels = useMemo(() => availableLevelsFor(selected ?? undefined), [selected]);
    const effortIdx = Math.max(0, availableLevels.indexOf(effortForSlider as ThinkingLevel));
    // If current effort not in available, clamp to nearest (fallback to middle)
    const clampedIdx = availableLevels.includes(effortForSlider as ThinkingLevel) ? effortIdx : Math.floor(availableLevels.length / 2);
    const clampedEffort = availableLevels[clampedIdx] ?? "medium";
    const pct = availableLevels.length <= 1 ? 100 : (clampedIdx / (availableLevels.length - 1)) * 100;

    const handleSelect = useCallback(async (m: ModelInfo) => {
        if (disabled || isStreaming) return;
        if (!onSelect) return;
        await onSelect(m.provider, m.id);
    }, [disabled, isStreaming, onSelect]);

    const handleThinkingChange = useCallback(async (level: ThinkingLevel) => {
        if (disabled || isStreaming) return;
        if (onThinkingChange) await onThinkingChange(level);
        else setLocalEffort(level);
    }, [disabled, isStreaming, onThinkingChange]);
    const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value), []);
    const handleClearQuery = useCallback(() => setQuery(""), []);

    const isDisabled = !!disabled || !!isStreaming;

    return (
        <Popover className="relative">
            <>
                <PopoverTrigger
                    disabled={isDisabled}
                    className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-phi-text-primary transition-colors hover:bg-phi-overlay-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 data-open:bg-phi-overlay-active disabled:opacity-60 disabled:pointer-events-none"
                    aria-label={selected ? `${selected.provider}/${selected.id}` : undefined}
                >
                    {!loading && selected && <ProviderImg provider={selected.provider} size={14} className="shrink-0 text-phi-text-muted" />}
                    <span className="max-w-[140px] truncate">{loading ? "Loading models…" : selected?.name ?? (list.length === 0 ? "No models" : "Select model")}</span>
                    <span className="text-[11px] font-normal text-phi-text-muted/60">{clampedEffort}</span>
                </PopoverTrigger>

                <PopoverContent anchor={{ to: "top start", gap: 12 }} className="h-[360px] w-[500px] overflow-hidden">
                    <div className="flex h-full flex-col">
                        {/* search header — plain, part of popover */}
                        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                            <SearchIcon size={14} className="shrink-0 text-phi-text-muted" />
                            <input
                                autoFocus
                                value={query}
                                onChange={handleQueryChange}
                                placeholder="Search models..."
                                className="w-full bg-transparent text-[13px] text-phi-text-primary placeholder:text-phi-text-muted focus:outline-none"
                            />
                            {query && (
                                <button
                                    onClick={handleClearQuery}
                                    className="text-[11px] text-phi-text-muted hover:text-phi-text-secondary"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {error && (
                            <div className="mx-3 mb-2 rounded-md border border-phi-error-border bg-phi-error-bg px-2.5 py-1.5 text-[11.5px] leading-snug text-phi-error-text">
                                {error}
                            </div>
                        )}
                        {!loading && !error && list.length === 0 && (
                            <div className="mx-3 mb-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[11.5px] leading-snug text-amber-200/90">
                                No models available — check auth (run <code className="rounded bg-black/20 px-1 py-0.5">pi auth</code>) or add an API key for your provider. The selector will populate after auth.
                            </div>
                        )}

                        <div className="flex min-h-0 flex-1 overflow-hidden">
                            {/* left provider nav — attached to popover edges */}
                            <div className="flex w-[56px] shrink-0 flex-col items-center gap-1 self-stretch rounded-tr-2xl bg-phi-bg-sunken px-1.5 py-3">
                                {categories.map((cat) => {
                                    const isActive = activeCategory === cat.id;
                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => setActiveCategory(cat.id)}
                                            aria-label={cat.label}
                                            title={cat.label}
                                            className={`group relative grid size-8 place-items-center rounded-xl ${
                                                isActive
                                                    ? "bg-phi-overlay-strong text-phi-text-primary"
                                                    : "text-phi-text-muted hover:bg-phi-overlay hover:text-phi-text-secondary"
                                            }`}
                                        >
                                            {isActive && <span className="absolute -right-1.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-phi-accent" />}
                                            {cat.iconUrl ? (
                                                <img
                                                    src={cat.iconUrl}
                                                    alt=""
                                                    width={16}
                                                    height={16}
                                                    className={`size-4 object-contain ${isActive ? "" : "opacity-80"}`}
                                                    draggable={false}
                                                />
                                            ) : cat.icon ? (
                                                <cat.icon size={16} strokeWidth={isActive ? 2.25 : 1.9} />
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* model list */}
                            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                                <div className="flex-1 overflow-y-auto p-2 pb-20">
                                    {loading ? (
                                        <p className="px-3 py-10 text-center text-[13px] text-phi-text-muted">Loading models…</p>
                                    ) : filtered.length === 0 ? (
                                        <p className="px-3 py-10 text-center text-[13px] text-phi-text-muted">No models found</p>
                                    ) : (
                                        <div className="space-y-0.5">
                                            {filtered.map((model) => {
                                                const k = modelKey(model);
                                                const isSelected = k === selectedKey;
                                                const isMulti = model.input.includes("image");
                                                return (
                                                    <button
                                                        key={k}
                                                        onClick={() => handleSelect(model)}
                                                        disabled={isDisabled}
                                                        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                                                            isSelected ? "bg-phi-overlay-strong" : "hover:bg-phi-overlay"
                                                        } disabled:opacity-60`}
                                                    >
                                                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-phi-overlay text-phi-text-muted group-[.bg-phi-overlay-strong]:bg-phi-bg-surface">
                                                            <ProviderImg provider={model.provider} size={14} className="" />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-[13px] font-[550] leading-none text-phi-text-primary">
                                                                {model.name}
                                                            </span>
                                                            <span className="mt-1 flex items-center gap-1 truncate text-[11.5px] leading-none text-phi-text-muted">
                                                                <span className="inline-flex items-center gap-0.5">
                                                                    {formatCost(model.cost.input)} <ArrowDown size={11} className="shrink-0" strokeWidth={2.25} />
                                                                </span>
                                                                <span className="opacity-60">-</span>
                                                                <span className="inline-flex items-center gap-0.5">
                                                                    {formatCost(model.cost.output)} <ArrowUp size={11} className="shrink-0" strokeWidth={2.25} />
                                                                </span>
                                                                {isMulti && <Eye size={11} className="shrink-0" strokeWidth={2} aria-label="Multimodal" />}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* sticky thinking effort — bottom right, attached like provider rail */}
                                <div className="pointer-events-auto absolute bottom-0 right-0 w-[210px] rounded-tl-2xl bg-phi-bg-sunken px-3 pb-3 pr-4 pt-2.5">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[11px] font-medium tracking-wide text-phi-text-muted">Thinking effort</span>
                                        <span
                                            className="text-[11px] font-medium transition-colors duration-300"
                                            style={{ color: THINKING_COLORS[clampedEffort as ThinkingLevel] ?? "var(--color-phi-text-muted)" }}
                                        >
                                            {clampedEffort}
                                        </span>
                                    </div>

                                    <div className="relative flex items-center">
                                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-phi-overlay">
                                            <div
                                                className="h-full rounded-full transition-all duration-300 ease-out"
                                                style={{
                                                    width: `${pct}%`,
                                                    backgroundColor: THINKING_COLORS[clampedEffort as ThinkingLevel] ?? "var(--color-phi-text-muted)",
                                                }}
                                            />
                                        </div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={Math.max(0, availableLevels.length - 1)}
                                            step={1}
                                            value={clampedIdx}
                                            onChange={(e) => handleThinkingChange(availableLevels[Number(e.target.value)])}
                                            disabled={isDisabled || availableLevels.length <= 1}
                                            className="absolute inset-0 h-2.5 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-30 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-phi-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.4)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-110 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-phi-white"
                                            aria-label="Thinking effort"
                                        />
                                    </div>
                                    {availableLevels.length <= 1 && (
                                        <p className="mt-1.5 text-[10px] leading-none text-phi-text-muted/70">Single effort — model default</p>
                                    )}
                                    {isStreaming && <p className="mt-1.5 text-[10px] leading-none text-phi-text-muted/70">Locked while streaming</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                </PopoverContent>
            </>
        </Popover>
    );
})

// kept for potential reuse — not used in composer after remarks
export function ComposerPill({
    children,
    active,
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
    return (
        <button
            type="button"
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/30 ${
                active
                    ? "border-phi-accent/20 bg-phi-accent/10 text-phi-accent"
                    : "border-phi-border-faint bg-phi-bg-sunken text-phi-text-tertiary hover:bg-phi-overlay-strong hover:text-phi-text-secondary"
            } ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
