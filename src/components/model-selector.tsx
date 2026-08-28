import { useMemo, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    Atom,
    Brain,
    Compass,
    Image as ImageIcon,
    Search as SearchIcon,
    Sparkles,
    Star,
    Infinity as InfinityIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

// --- mock types ---
export type MockModel = {
    id: string;
    name: string;
    provider: string;
    category: string;
    multimodal: boolean;
    inputCost: string; // e.g. "3.00$"
    outputCost: string;
};

const MOCK_MODELS: MockModel[] = [
    {
        id: "gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        provider: "openai",
        category: "openai",
        multimodal: true,
        inputCost: "6.00$",
        outputCost: "18.00$",
    },
    {
        id: "gpt-5.5",
        name: "GPT-5.5",
        provider: "openai",
        category: "openai",
        multimodal: true,
        inputCost: "5.00$",
        outputCost: "15.00$",
    },
    {
        id: "gpt-5.4",
        name: "GPT-5.4",
        provider: "openai",
        category: "openai",
        multimodal: true,
        inputCost: "3.00$",
        outputCost: "12.00$",
    },
    {
        id: "gpt-5.6-terra",
        name: "GPT-5.6 Terra",
        provider: "openai",
        category: "openai",
        multimodal: true,
        inputCost: "3.50$",
        outputCost: "10.00$",
    },
    {
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        provider: "openai",
        category: "openai",
        multimodal: false,
        inputCost: "0.50$",
        outputCost: "2.00$",
    },
    {
        id: "gpt-imagegen-2",
        name: "GPT ImageGen 2",
        provider: "openai",
        category: "image",
        multimodal: true,
        inputCost: "8.00$",
        outputCost: "8.00$",
    },
    {
        id: "gpt-5.4-mini",
        name: "GPT-5.4 mini",
        provider: "openai",
        category: "openai",
        multimodal: false,
        inputCost: "0.30$",
        outputCost: "1.20$",
    },
    {
        id: "kimi-k2-0905",
        name: "Kimi K2",
        provider: "kimi",
        category: "kimi",
        multimodal: true,
        inputCost: "0.60$",
        outputCost: "2.40$",
    },
    {
        id: "claude-4-sonnet",
        name: "Claude 4 Sonnet",
        provider: "anthropic",
        category: "anthropic",
        multimodal: true,
        inputCost: "3.00$",
        outputCost: "15.00$",
    },
    {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        provider: "google",
        category: "google",
        multimodal: true,
        inputCost: "2.50$",
        outputCost: "10.00$",
    },
];

const CATEGORIES = [
    { id: "all", label: "All", icon: Star },
    { id: "openai", label: "OpenAI", icon: Atom },
    { id: "anthropic", label: "Anthropic", icon: Brain },
    { id: "google", label: "Google", icon: Sparkles },
    { id: "xai", label: "xAI", icon: InfinityIcon },
    { id: "kimi", label: "Kimi", icon: Compass },
    { id: "image", label: "Image", icon: ImageIcon },
    { id: "favorites", label: "Favorites", icon: Star },
] as const;

const THINKING_LEVELS = ["low", "minimal", "medium", "high", "xhigh", "max"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];

const THINKING_COLORS: Record<ThinkingLevel, string> = {
    low: "var(--color-phi-thinking-low)",
    minimal: "var(--color-phi-thinking-minimal)",
    medium: "var(--color-phi-thinking-medium)",
    high: "var(--color-phi-thinking-high)",
    xhigh: "var(--color-phi-thinking-xhigh)",
    max: "var(--color-phi-thinking-max)",
};

type ModelSelectorProps = {
    value?: string;
    onChange?: (id: string) => void;
};

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
    const [internal, setInternal] = useState("kimi-k2-0905");
    const selectedId = value ?? internal;
    const selected = useMemo(() => MOCK_MODELS.find((m) => m.id === selectedId) ?? MOCK_MODELS[0], [selectedId]);

    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("all");
    const [thinkingEffort, setThinkingEffort] = useState<ThinkingLevel>("medium");

    const filtered = useMemo(() => {
        let list = MOCK_MODELS;
        if (activeCategory === "favorites") list = list.filter((m) => m.multimodal);
        else if (activeCategory !== "all") list = list.filter((m) => m.category === activeCategory);
        if (query.trim()) {
            const q = query.toLowerCase();
            list = list.filter((m) => m.name.toLowerCase().includes(q));
        }
        return list;
    }, [query, activeCategory]);

    function handleSelect(id: string) {
        if (onChange) onChange(id);
        else setInternal(id);
    }

    const thinkingIdx = THINKING_LEVELS.indexOf(thinkingEffort);
    const thinkingPct = (thinkingIdx / (THINKING_LEVELS.length - 1)) * 100;

    return (
        <Popover className="relative">
            <>
                    <PopoverTrigger className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-phi-text-primary transition-colors hover:bg-phi-overlay-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 data-open:bg-phi-overlay-active">
                        <span className="max-w-[140px] truncate">{selected.name}</span>
                        <span className="text-[11px] font-normal text-phi-text-muted/60">{thinkingEffort}</span>
                    </PopoverTrigger>

                    <PopoverContent anchor={{ to: "top start", gap: 12 }} className="h-[360px] w-[500px] overflow-hidden">
                        <div className="flex h-full flex-col">
                            {/* search header — plain, part of popover */}
                            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                                <SearchIcon size={14} className="shrink-0 text-phi-text-muted" />
                                <input
                                    autoFocus
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search models..."
                                    className="w-full bg-transparent text-[13px] text-phi-text-primary placeholder:text-phi-text-muted focus:outline-none"
                                />
                                {query && (
                                    <button
                                        onClick={() => setQuery("")}
                                        className="text-[11px] text-phi-text-muted hover:text-phi-text-secondary"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            <div className="flex min-h-0 flex-1 overflow-hidden">
                                {/* left provider nav — attached to popover edges */}
                                <div className="flex w-[56px] shrink-0 flex-col items-center gap-1 self-stretch rounded-tr-2xl bg-phi-bg-sunken px-1.5 py-3">
                                    {CATEGORIES.map((cat) => {
                                        const Icon = cat.icon;
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
                                                <Icon size={16} strokeWidth={isActive ? 2.25 : 1.9} />
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* model list */}
                                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-2 pb-20">
                                        {filtered.length === 0 ? (
                                            <p className="px-3 py-10 text-center text-[13px] text-phi-text-muted">No models found</p>
                                        ) : (
                                            <div className="space-y-0.5">
                                                {filtered.map((model) => {
                                                    const isSelected = model.id === selectedId;
                                                    return (
                                                        <button
                                                            key={model.id}
                                                            onClick={() => handleSelect(model.id)}
                                                            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                                                                isSelected ? "bg-phi-overlay-strong" : "hover:bg-phi-overlay"
                                                            }`}
                                                        >
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-[13px] font-[550] leading-none text-phi-text-primary">
                                                                    {model.name}
                                                                </span>
                                                                <span className="mt-1 flex items-center gap-1 truncate text-[11.5px] leading-none text-phi-text-muted">
                                                                    <span className="inline-flex items-center gap-0.5">
                                                                        {model.inputCost} <ArrowDown size={11} className="shrink-0" strokeWidth={2.25} />
                                                                    </span>
                                                                    <span className="opacity-60">-</span>
                                                                    <span className="inline-flex items-center gap-0.5">
                                                                        {model.outputCost} <ArrowUp size={11} className="shrink-0" strokeWidth={2.25} />
                                                                    </span>
                                                                </span>
                                                            </span>

                                                            {model.multimodal && (
                                                                <span className="shrink-0 text-phi-white">
                                                                    <ImageIcon size={14} className="text-phi-white" />
                                                                </span>
                                                            )}
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
                                                style={{ color: THINKING_COLORS[thinkingEffort] }}
                                            >
                                                {thinkingEffort}
                                            </span>
                                        </div>

                                        <div className="relative flex items-center">
                                            {/* thick track */}
                                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-phi-overlay">
                                                <div
                                                    className="h-full rounded-full transition-all duration-300 ease-out"
                                                    style={{
                                                        width: `${thinkingPct}%`,
                                                        backgroundColor: THINKING_COLORS[thinkingEffort],
                                                    }}
                                                />
                                            </div>
                                            {/* native range for interaction — invisible but functional */}
                                            <input
                                                type="range"
                                                min={0}
                                                max={THINKING_LEVELS.length - 1}
                                                step={1}
                                                value={thinkingIdx}
                                                onChange={(e) => setThinkingEffort(THINKING_LEVELS[Number(e.target.value)])}
                                                className="absolute inset-0 h-2.5 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-phi-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.4)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-110 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-phi-white"
                                                aria-label="Thinking effort"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </PopoverContent>
                </>
        </Popover>
    );
}

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
