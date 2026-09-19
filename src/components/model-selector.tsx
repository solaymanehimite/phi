import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    IconArrowDown,
    IconArrowUp,
    IconBoltFilled,
    IconChevronDownFilled,
    IconCpu,
    IconFlaskFilled,
    IconMap,
    IconSearch,
    IconSparklesFilled,
    IconStar,
    IconStarFilled,
} from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Alert } from "./ui/alert";
import { InlineCode } from "./ui/code";
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

const PROVIDER_ICONS: Record<string, typeof IconStarFilled> = {
    openai: IconFlaskFilled,
    anthropic: IconCpu,
    google: IconSparklesFilled,
    xai: IconBoltFilled,
    kimi: IconMap,
    "kimi-coding": IconMap,
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
    const Icon = PROVIDER_ICONS[provider] ?? IconStarFilled;
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

/**
 * One model row. Memoized on data (not handlers) so moving the mouse across
 * the list only re-renders the two rows whose highlight flips — the hover
 * highlight tracks instantly instead of lagging a full-list re-render.
 */
const ModelRow = memo(function ModelRow({
    model,
    isSelected,
    isActive,
    isFav,
    isDisabled,
    onHover,
    onSelect,
    onToggleFavorite,
}: {
    model: ModelInfo;
    isSelected: boolean;
    isActive: boolean;
    isFav: boolean;
    isDisabled: boolean;
    onHover: () => void;
    onSelect: () => void;
    onToggleFavorite: () => void;
}) {
    return (
        <button
            onClick={onSelect}
            onMouseEnter={onHover}
            disabled={isDisabled}
            className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left disabled:opacity-60 ${
                isSelected || isActive
                    ? "bg-phi-overlay-strong"
                    : "hover:bg-phi-overlay"
            }`}
        >
            <span title={prettyProvider(model.provider)} className="inline-flex shrink-0 items-center">
                <ProviderImg
                    provider={model.provider}
                    size={14}
                    className="shrink-0"
                />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-phi-text-primary">
                {model.name}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-phi-text-tertiary">
                <span className="inline-flex items-center gap-0.5">
                    {formatCost(
                        model.cost.input,
                    )}{" "}
                    <IconArrowDown className="size-[10px]" />
                </span>
                <span className="inline-flex items-center gap-0.5">
                    {formatCost(
                        model.cost.output,
                    )}{" "}
                    <IconArrowUp className="size-[10px]" />
                </span>
            </span>
            <span
                role="button"
                tabIndex={-1}
                aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite();
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        onToggleFavorite();
                    }
                }}
                className="grid shrink-0 place-items-center rounded p-0.5"
            >
                {isFav ? (
                    <IconStarFilled className="size-3.5 text-phi-warning" />
                ) : (
                    <IconStar className="size-3.5 text-phi-text-tertiary" />
                )}
            </span>
        </button>
    );
}, (prev, next) =>
    prev.model === next.model &&
    prev.isSelected === next.isSelected &&
    prev.isActive === next.isActive &&
    prev.isFav === next.isFav &&
    prev.isDisabled === next.isDisabled,
);

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
        // All-models view shows favourites first (stable — keeps list order otherwise).
        if (activeCategory === "all" && favorites.length > 0) {
            const fav = new Set(favorites);
            out = [...out].sort(
                (a, b) => Number(fav.has(modelKey(b))) - Number(fav.has(modelKey(a))),
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
        `grid size-9 place-items-center rounded-xl ${
            isActive
                ? "text-phi-text-primary"
                : "text-phi-text-muted hover:bg-phi-overlay hover:text-phi-text-secondary"
        }`;

    // Sliding rail indicator — a single bar that glides between the active
    // buttons via transform (compositor-thread, no library needed).
    const INDICATOR_HEIGHT = 20;
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
                        className="group inline-flex max-w-full min-w-0 items-center gap-2 rounded-md py-1 pl-2.5 pr-1.5 text-left text-phi-text-secondary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60"
                        aria-label={
                            selected
                                ? `Change model, currently ${selected.provider}/${selected.id}`
                                : "Change model"
                        }
                    >
                        {selected && !loading && (
                            <ProviderImg provider={selected.provider} size={14} className="shrink-0" />
                        )}
                        <span className="min-w-0 truncate text-[12.5px] font-medium">
                            {loading
                                ? "Loading models…"
                                : (selected?.name ??
                                    (list.length === 0 ? "No models" : "Select model"))}
                        </span>
                        <IconChevronDownFilled className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
                    </PopoverTrigger>

                    <PopoverContent
                        anchor={{ to: "top start", gap: 12 }}
                        className="h-[300px] w-[360px] overflow-hidden"
                    >
                        <div
                            className="flex h-full flex-col"
                            onKeyDown={open ? (e) => handleKeyDown(e, close) : undefined}
                            data-model-popover={open ? "open" : "closed"}
                        >
                            <div className="flex min-h-0 flex-1 items-stretch">
                                {/* left column — star + provider rail, owns the sliding indicator */}
                                <div ref={railColRef} className="relative flex w-[44px] shrink-0 flex-col border-r border-phi-border-faint">
                                    <div className="flex h-[44px] shrink-0 items-center justify-center border-b border-phi-border-faint">
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
                                            <IconStarFilled className={`size-4 ${activeCategory === "favorites" ? "text-phi-warning" : ""}`} />
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
                                            const Icon = PROVIDER_ICONS[pid] ?? IconStarFilled;
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
                                                            width={18}
                                                            height={18}
                                                            className="size-[18px] object-contain"
                                                            draggable={false}
                                                        />
                                                    ) : (
                                                        <Icon className="size-[18px]" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    </div>
                                    {indicatorY != null && (
                                        <span
                                            aria-hidden="true"
                                            className={`absolute right-0 top-0 h-5 w-[3px] rounded-full bg-phi-accent motion-safe:transition-[transform,opacity] motion-safe:duration-200 motion-safe:ease-out ${isRailActive ? "opacity-100" : "opacity-0"}`}
                                            style={{ transform: `translateY(${indicatorY}px)` }}
                                        />
                                    )}
                                </div>

                                {/* right column */}
                                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                    {/* search — same height as the star cell so separators line up */}
                                    <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-phi-border-faint px-3">
                                        <IconSearch className="size-3.5 shrink-0 text-phi-text-tertiary" />
                                        <input
                                            autoFocus
                                            value={query}
                                            onChange={handleQueryChange}
                                            placeholder="Search models..."
                                            className="h-full w-full bg-transparent text-[13px] text-phi-text-primary placeholder:text-phi-text-muted focus:outline-none"
                                        />
                                    </div>
                                    {error && (
                                        <Alert variant="error" className="mx-3.5 mb-2 mt-2 !rounded-md !text-[11.5px] !leading-snug">
                                            {error}
                                        </Alert>
                                    )}
                                    {!loading && !error && list.length === 0 && (
                                        <Alert variant="warning" className="mx-3.5 mb-2 mt-2 !rounded-md !text-[11.5px] !leading-snug">
                                            No models available — run{" "}
                                            <InlineCode>pi auth</InlineCode>
                                            {" "}in the terminal, or add an API key under Settings → Providers.
                                        </Alert>
                                    )}

                                    <div className="min-h-0 flex-1 overflow-y-auto py-2 pl-2.5 pr-1 [scrollbar-gutter:stable]">
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
                                                    return (
                                                        <ModelRow
                                                            key={k}
                                                            model={model}
                                                            isSelected={k === selectedKey}
                                                            isActive={idx === activeIdx}
                                                            isFav={favorites.includes(k)}
                                                            isDisabled={isDisabled}
                                                            onHover={() => setActiveIdx(idx)}
                                                            onSelect={() => {
                                                                close();
                                                                void handleSelect(model);
                                                            }}
                                                            onToggleFavorite={() => toggleFavorite(k)}
                                                        />
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

