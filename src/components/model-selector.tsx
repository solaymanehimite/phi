import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    ArrowDownIcon,
    ArrowUpIcon,
    BeakerIcon,
    BoltIcon,
    ChevronDownIcon,
    MapIcon,
    CpuChipIcon,
    MagnifyingGlassIcon,
    SparklesIcon,
    StarIcon,
} from "@heroicons/react/24/solid";
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import type { ModelInfo, ThinkingLevel } from "../types/session";
import { useEffectiveTheme } from "../hooks/useTheme";
import { providerIconUrl } from "../lib/themed-assets";

// Canonical order — matches pi-ai ThinkingLevel union.
// Thinking slider UI is hidden for now; kept so re-enabling is trivial.
const CANONICAL_LEVELS: ThinkingLevel[] = [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
];
export const THINKING_LEVELS = CANONICAL_LEVELS;

const FAVORITES_KEY = "phi-favorite-models";

const PROVIDER_ICONS: Record<string, typeof StarIcon> = {
    openai: BeakerIcon,
    anthropic: CpuChipIcon,
    google: SparklesIcon,
    xai: BoltIcon,
    kimi: MapIcon,
    "kimi-coding": MapIcon,
};

function prettyProvider(id: string): string {
    const normalized = id.toLowerCase();
    if (normalized === "openai") return "OpenAI";
    if (normalized === "openai-codex") return "OpenAI Codex";
    if (normalized === "anthropic") return "Anthropic";
    if (normalized === "google" || normalized === "google-vertex")
        return "Google";
    if (normalized === "xai") return "xAI";
    if (normalized === "kimi" || normalized === "kimi-coding") return "Kimi";
    if (normalized === "opencode") return "Opencode Zen";
    return id.charAt(0).toUpperCase() + id.slice(1);
}

function ProviderImg({
    provider,
    size = 16,
    className = "",
}: {
    provider: string;
    size?: number;
    className?: string;
}) {
    const theme = useEffectiveTheme();
    const url = providerIconUrl(provider, theme);
    const Icon = PROVIDER_ICONS[provider] ?? StarIcon;
    if (url) {
        return (
            <img
                src={url}
                alt=""
                width={size}
                height={size}
                className={`object-contain ${className}`}
                style={{ width: size, height: size }}
                draggable={false}
            />
        );
    }
    return <Icon className={className} style={{ width: size, height: size }} />;
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
    return `${Number(n).toFixed(2)}$`;
}

function loadFavorites(): string[] {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
        return [];
    }
}

type ModelSelectorProps = {
    models?: ModelInfo[];
    value?: string;
    thinkingLevel?: string;
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
    onSelect,
    disabled,
    loading,
    error,
    isStreaming,
}: ModelSelectorProps) {
    const list = models ?? [];

    const selected = useMemo(() => {
        if (!value) return list[0] ?? null;
        const parsed = parseModelKey(value);
        if (parsed) {
            const found = list.find(
                (m) => m.provider === parsed.provider && m.id === parsed.id,
            );
            if (found) return found;
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

    const selectedKey = selected ? modelKey(selected) : (value ?? "");

    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("all");
    const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
    const [activeIdx, setActiveIdx] = useState(0);

    useEffect(() => {
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        } catch {}
    }, [favorites]);

    const toggleFavorite = useCallback((key: string) => {
        setFavorites((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
        );
    }, []);

    const theme = useEffectiveTheme();

    const providerIds = useMemo(
        () => [...new Set(list.map((m) => m.provider))].sort(),
        [list],
    );

    const filtered = useMemo(() => {
        let out = list;
        if (activeCategory === "favorites") {
            const fav = new Set(favorites);
            out = out.filter((m) => fav.has(modelKey(m)));
        } else if (activeCategory !== "all") {
            out = out.filter((m) => m.provider === activeCategory);
        }
        if (query.trim()) {
            const q = query.toLowerCase();
            out = out.filter(
                (m) =>
                    m.name.toLowerCase().includes(q) ||
                    m.id.toLowerCase().includes(q) ||
                    m.provider.toLowerCase().includes(q),
            );
        }
        return out;
    }, [list, query, activeCategory, favorites]);

    useEffect(() => {
        setActiveIdx(0);
    }, [query, activeCategory]);

    const handleSelect = useCallback(
        async (m: ModelInfo) => {
            if (disabled || isStreaming) return;
            if (!onSelect) return;
            await onSelect(m.provider, m.id);
        },
        [disabled, isStreaming, onSelect],
    );

    const handleQueryChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
        [],
    );

    // Arrow / Enter navigation while the popover is open
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent, close?: () => void) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
                const target = filtered[activeIdx];
                if (target) {
                    e.preventDefault();
                    close?.();
                    void handleSelect(target);
                }
            }
        },
        [filtered, activeIdx, handleSelect],
    );

    const isDisabled = !!disabled || !!isStreaming;

    const railBtn = (isActive: boolean) =>
        `grid size-11 place-items-center rounded-lg ${
            isActive
                ? "text-phi-text-primary"
                : "text-phi-text-muted hover:bg-phi-overlay hover:text-phi-text-secondary"
        }`;

    // Sliding rail indicator — a single bar that glides between the active
    // buttons via transform (compositor-thread, no library needed).
    const INDICATOR_HEIGHT = 24;
    const railColRef = useRef<HTMLDivElement>(null);
    const railBtnRefs = useRef(new Map<string, HTMLButtonElement>());
    const [indicatorY, setIndicatorY] = useState<number | null>(null);
    const isRailActive = activeCategory !== "all";

    const registerRailBtn = useCallback(
        (key: string) => (el: HTMLButtonElement | null) => {
            if (el) railBtnRefs.current.set(key, el);
            else railBtnRefs.current.delete(key);
        },
        [],
    );

    const updateIndicator = useCallback(() => {
        const col = railColRef.current;
        const btn = railBtnRefs.current.get(activeCategory);
        if (!col || !btn) return;
        const colRect = col.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        setIndicatorY(btnRect.top - colRect.top + btnRect.height / 2 - INDICATOR_HEIGHT / 2);
    }, [activeCategory]);

    useLayoutEffect(() => {
        updateIndicator();
    }, [updateIndicator, providerIds]);

    return (
        <Popover className="relative">
            {({ open, close }: { open: boolean; close: () => void }) => (
                <>
                    <PopoverTrigger
                        disabled={isDisabled}
                        className="group inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-phi-text-secondary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60"
                        aria-label={
                            selected
                                ? `Change model, currently ${selected.provider}/${selected.id}`
                                : "Change model"
                        }
                    >
                        {!loading && selected && (
                            <ProviderImg
                                provider={selected.provider}
                                size={14}
                                className="shrink-0 text-phi-text-secondary"
                            />
                        )}
                        <span className="min-w-0 truncate text-[12.5px] font-medium">
                            {loading
                                ? "Loading models…"
                                : (selected?.name ??
                                    (list.length === 0 ? "No models" : "Select model"))}
                        </span>
                        <ChevronDownIcon className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
                    </PopoverTrigger>

                    <PopoverContent
                        anchor={{ to: "top start", gap: 12 }}
                        className="h-[360px] w-[420px] overflow-hidden"
                    >
                        <div
                            className="flex h-full flex-col"
                            onKeyDown={open ? (e) => handleKeyDown(e, close) : undefined}
                            data-model-popover={open ? "open" : "closed"}
                        >
                            <div className="flex min-h-0 flex-1 items-stretch">
                                {/* left column — star + provider rail, owns the sliding indicator */}
                                <div ref={railColRef} className="relative flex w-[54px] shrink-0 flex-col border-r border-phi-border-faint">
                                    <div className="flex h-[52px] shrink-0 items-center justify-center border-b border-phi-border-faint">
                                        <button
                                            ref={registerRailBtn("favorites")}
                                            onClick={() =>
                                                setActiveCategory((c) =>
                                                    c === "favorites" ? "all" : "favorites",
                                                )
                                            }
                                            aria-label="Favorite models"
                                            title="Favorites"
                                            className={railBtn(activeCategory === "favorites")}
                                        >
                                            <StarIcon className={`size-5 ${activeCategory === "favorites" ? "text-[#f0b429]" : ""}`} />
                                        </button>
                                    </div>
                                    <div
                                        className="flex min-h-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto py-2"
                                        onScroll={updateIndicator}
                                    >
                                    <div className="flex flex-col items-center gap-1">
                                        {providerIds.map((pid) => {
                                            const isActive = activeCategory === pid;
                                            const url = providerIconUrl(pid, theme);
                                            const Icon = PROVIDER_ICONS[pid] ?? StarIcon;
                                            return (
                                                <button
                                                    key={pid}
                                                    ref={registerRailBtn(pid)}
                                                    onClick={() =>
                                                        setActiveCategory((c) =>
                                                            c === pid ? "all" : pid,
                                                        )
                                                    }
                                                    aria-label={prettyProvider(pid)}
                                                    title={prettyProvider(pid)}
                                                    className={railBtn(isActive)}
                                                >
                                                    {url ? (
                                                        <img
                                                            src={url}
                                                            alt=""
                                                            width={22}
                                                            height={22}
                                                            className="size-[22px] object-contain"
                                                            draggable={false}
                                                        />
                                                    ) : (
                                                        <Icon className="size-[22px]" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    </div>
                                    {indicatorY != null && (
                                        <span
                                            aria-hidden="true"
                                            className={`absolute right-0 top-0 h-6 w-[3px] rounded-full bg-[#2f81f7] motion-safe:transition-[transform,opacity] motion-safe:duration-200 motion-safe:ease-out ${isRailActive ? "opacity-100" : "opacity-0"}`}
                                            style={{ transform: `translateY(${indicatorY}px)` }}
                                        />
                                    )}
                                </div>

                                {/* right column */}
                                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                    {/* search — same height as the star cell so separators line up */}
                                    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-phi-border-faint px-3.5">
                                        <MagnifyingGlassIcon className="size-4 shrink-0 text-phi-text-tertiary" />
                                        <input
                                            autoFocus
                                            value={query}
                                            onChange={handleQueryChange}
                                            placeholder="Search models..."
                                            className="h-full w-full bg-transparent text-[14px] text-phi-text-primary placeholder:text-phi-text-muted focus:outline-none"
                                        />
                                    </div>
                                    {error && (
                                        <div className="mx-3.5 mb-2 mt-2 rounded-md border border-phi-error-border bg-phi-error-bg px-2.5 py-1.5 text-[11.5px] leading-snug text-phi-error-text">
                                            {error}
                                        </div>
                                    )}
                                    {!loading && !error && list.length === 0 && (
                                        <div className="mx-3.5 mb-2 mt-2 rounded-md border border-phi-warning-border bg-phi-warning-bg px-2.5 py-2 text-[11.5px] leading-snug text-phi-warning-text">
                                            No models available — check auth (run{" "}
                                            <code className="rounded bg-phi-overlay px-1 py-0.5">
                                                pi auth
                                            </code>
                                            ) or add an API key for your provider.
                                        </div>
                                    )}

                                    <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
                                        {loading ? (
                                            <p className="px-3 py-10 text-center text-[13px] text-phi-text-muted">
                                                Loading models…
                                            </p>
                                        ) : filtered.length === 0 ? (
                                            <p className="px-3 py-10 text-center text-[13px] text-phi-text-muted">
                                                {activeCategory === "favorites"
                                                    ? "No favorites yet."
                                                    : "No models found"}
                                            </p>
                                        ) : (
                                            <div className="space-y-1">
                                                {filtered.map((model, idx) => {
                                                    const k = modelKey(model);
                                                    const isSelected = k === selectedKey;
                                                    const isActive = idx === activeIdx;
                                                    const isFav = favorites.includes(k);
                                                    return (
                                                        <button
                                                            key={k}
                                                            onClick={() => {
                                                                close();
                                                                void handleSelect(model);
                                                            }}
                                                            onMouseEnter={() => setActiveIdx(idx)}
                                                            disabled={isDisabled}
                                                            className={`group flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left disabled:opacity-60 ${
                                                                isSelected || isActive
                                                                    ? "bg-phi-overlay-strong"
                                                                    : "hover:bg-phi-overlay"
                                                            }`}
                                                        >
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-[15px] font-semibold leading-tight text-phi-text-primary">
                                                                    {model.name}
                                                                </span>
                                                                <span className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-[12.5px] leading-none text-phi-text-tertiary">
                                                                    <ProviderImg
                                                                        provider={model.provider}
                                                                        size={13}
                                                                        className="shrink-0"
                                                                    />
                                                                    <span className="truncate">
                                                                        {prettyProvider(
                                                                            model.provider,
                                                                        )}
                                                                    </span>
                                                                    <span>
                                                                        ·
                                                                    </span>
                                                                    <span className="inline-flex shrink-0 items-center gap-0.5">
                                                                        {formatCost(
                                                                            model.cost.input,
                                                                        )}{" "}
                                                                        <ArrowDownIcon className="size-[11px]" />
                                                                    </span>
                                                                    <span>
                                                                        ·
                                                                    </span>
                                                                    <span className="inline-flex shrink-0 items-center gap-0.5">
                                                                        {formatCost(
                                                                            model.cost.output,
                                                                        )}{" "}
                                                                        <ArrowUpIcon className="size-[11px]" />
                                                                    </span>
                                                                </span>
                                                            </span>
                                                            <span className="flex shrink-0 items-center">
                                                                <span
                                                                    role="button"
                                                                    tabIndex={-1}
                                                                    aria-label={
                                                                        isFav
                                                                            ? "Remove from favorites"
                                                                            : "Add to favorites"
                                                                    }
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleFavorite(k);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (
                                                                            e.key === "Enter" ||
                                                                            e.key === " "
                                                                        ) {
                                                                            e.stopPropagation();
                                                                            e.preventDefault();
                                                                            toggleFavorite(k);
                                                                        }
                                                                    }}
                                                                    className="grid shrink-0 place-items-center rounded p-0.5"
                                                                >
                                                                    {isFav ? (
                                                                        <StarIcon className="size-4 text-[#f0b429]" />
                                                                    ) : (
                                                                        <StarOutlineIcon className="size-4 text-phi-text-tertiary" />
                                                                    )}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </PopoverContent>
                </>
            )}
        </Popover>
    );
});

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
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/30 ${active
                    ? "border-phi-accent/20 bg-phi-accent/10 text-phi-accent"
                    : "border-phi-border-faint bg-phi-bg-sunken text-phi-text-tertiary hover:bg-phi-overlay-strong hover:text-phi-text-secondary"
                } ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
