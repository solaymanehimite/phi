import { memo, useCallback, useMemo } from "react";
import { IconChevronDownFilled } from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import type { ModelInfo, ThinkingLevel } from "../types/session";
import { THINKING_LEVELS } from "./model-selector";

const THINKING_COLORS: Record<ThinkingLevel, string> = {
    minimal: "var(--color-phi-thinking-minimal)",
    low: "var(--color-phi-thinking-low)",
    medium: "var(--color-phi-thinking-medium)",
    high: "var(--color-phi-thinking-high)",
    xhigh: "var(--color-phi-thinking-xhigh)",
    max: "var(--color-phi-thinking-max)",
};

function availableLevelsFor(model: ModelInfo | null | undefined): ThinkingLevel[] {
    if (!model) return THINKING_LEVELS;
    const map = model.thinkingLevelMap as
        Record<string, string | null> | null | undefined;
    if (!map || typeof map !== "object" || Object.keys(map).length === 0) {
        return THINKING_LEVELS;
    }
    const levels = THINKING_LEVELS.filter((lvl) => map[lvl] !== null);
    return levels.length ? levels : THINKING_LEVELS;
}

type ThinkingEffortSelectorProps = {
    models?: ModelInfo[];
    modelKey?: string;
    value?: string;
    onChange?: (level: ThinkingLevel) => void | Promise<void>;
    disabled?: boolean;
};

export const ThinkingEffortSelector = memo(function ThinkingEffortSelector({
    models,
    modelKey,
    value,
    onChange,
    disabled,
}: ThinkingEffortSelectorProps) {
    const list = models ?? [];

    const model = useMemo(() => {
        if (!modelKey) return list[0] ?? null;
        const slash = modelKey.indexOf("/");
        if (slash !== -1) {
            const provider = modelKey.slice(0, slash);
            const id = modelKey.slice(slash + 1);
            return list.find((m) => m.provider === provider && m.id === id) ?? null;
        }
        return list.find((m) => m.id === modelKey) ?? null;
    }, [list, modelKey]);

    const availableLevels = useMemo(() => availableLevelsFor(model), [model]);

    const current: ThinkingLevel = useMemo(() => {
        if (value && (availableLevels as string[]).includes(value)) {
            return value as ThinkingLevel;
        }
        return availableLevels[Math.floor(availableLevels.length / 2)] ?? "medium";
    }, [value, availableLevels]);

    const idx = Math.max(0, availableLevels.indexOf(current));
    const isMax = current === "max";
    const isXhigh = current === "xhigh";
    const pct =
        availableLevels.length <= 1
            ? 100
            : (idx / (availableLevels.length - 1)) * 100;

    const sparkles = useMemo(
        () =>
            [0, 1, 2, 3, 4, 5].map((i) => ({
                size: 6 + Math.random() * 7,
                rotate: Math.random() * 90,
                y: [-3, 2, -1, 4, 0, -4][i] ?? 0,
                delay: i * 0.45,
            })),
        [],
    );

    const handleChange = useCallback(
        async (level: ThinkingLevel) => {
            if (disabled || !onChange) return;
            await onChange(level);
        },
        [disabled, onChange],
    );

    return (
        <Popover className="relative">
            <PopoverTrigger
                disabled={disabled}
                className="group inline-flex max-w-full min-w-0 items-center gap-2 rounded-md py-1 pl-2.5 pr-1.5 text-left text-phi-text-secondary hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60"
                aria-label={`Change thinking effort, currently ${current}`}
            >
                <span className="grid min-w-0 flex-1">
                    <span aria-hidden="true" className="invisible col-start-1 row-start-1 text-[12.5px] font-medium capitalize">minimal</span>
                    <span className="col-start-1 row-start-1 truncate text-[12.5px] font-medium capitalize">
                        {current}
                    </span>
                </span>
                <IconChevronDownFilled className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
            </PopoverTrigger>

            <PopoverContent
                anchor={{ to: "top start", gap: 12 }}
                className="w-[240px] px-4 py-3"
            >
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium tracking-wide text-phi-text-tertiary">
                        Reasoning
                    </span>
                    <span
                        className="text-sm font-medium"
                        style={{ color: THINKING_COLORS[current] ?? "var(--color-phi-text-muted)" }}
                    >
                        {current}
                    </span>
                </div>

                <div className="flex flex-col gap-1">
                    <div className="relative flex h-[26px] w-full items-center">
                    <div className="relative h-[14px] w-full rounded-full bg-phi-overlay-strong">
                        <div
                            className="absolute left-0 top-1/2 h-[20px] -translate-y-1/2 rounded-full transition-[width] duration-200 ease-out"
                            style={{ width: `calc(${pct}% + ${9 - pct * 0.18}px)` }}
                        >
                            <div
                                className="absolute inset-0 rounded-full transition-[background-color] duration-1000 ease-out"
                                style={{
                                    backgroundColor:
                                        THINKING_COLORS[current] ?? "var(--color-phi-text-muted)",
                                }}
                            />
                            <div
                                aria-hidden="true"
                                className={`phi-max-fill absolute inset-0 rounded-full transition-opacity duration-1000 ease-out ${isMax ? "opacity-100" : "opacity-0"}`}
                            />
                            <div
                                aria-hidden="true"
                                className={`pointer-events-none absolute right-[8px] top-1/2 z-[6] grid -translate-y-1/2 grid-rows-4 grid-flow-col gap-[2px] ${isXhigh ? "opacity-100 transition-opacity duration-200 ease-out" : "opacity-0"}`}
                            >
                                {Array.from({ length: 32 }, (_, i) => {
                                    const col = Math.floor(i / 4);
                                    const maxOp = 0.15 + (col / 7) * 0.8;
                                    return (
                                        <span
                                            key={i}
                                            className="phi-pixel block size-[3px] rounded-[2px] bg-phi-white"
                                            style={
                                                {
                                                    "--phi-px-min": (maxOp * 0.15).toFixed(2),
                                                    "--phi-px-max": maxOp.toFixed(2),
                                                    animationDuration: `${(0.9 + ((i * 53) % 70) / 100).toFixed(2)}s`,
                                                    animationDelay: `${(((i * 29) % 50) / 100).toFixed(2)}s`,
                                                } as React.CSSProperties
                                            }
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    {availableLevels.length > 1 && (
                        <div className="pointer-events-none absolute inset-y-0 left-[9px] right-[9px] z-[5] flex items-center justify-between">
                            {availableLevels.map((lvl) => (
                                <span
                                    key={lvl}
                                    className="h-[8px] w-[3px] rounded-full bg-phi-bg-inverse/40"
                                />
                            ))}
                        </div>
                    )}
                    {isMax && (
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 z-[6] h-0 w-0"
                            style={{ left: `calc(${pct}% + ${9 - pct * 0.18}px)` }}
                        >
                            {sparkles.map((s, i) => (
                                <span
                                    key={i}
                                    className="phi-max-dot absolute"
                                    style={{ marginTop: s.y, animationDelay: `${s.delay}s` }}
                                >
                                    <svg
                                        width={s.size}
                                        height={s.size}
                                        viewBox="0 0 24 24"
                                        fill="white"
                                        aria-hidden="true"
                                        style={{ transform: `rotate(${s.rotate}deg)` }}
                                        className="drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]"
                                    >
                                        <path d="M12 0c.7 6.6 5.4 11.3 12 12-6.6.7-11.3 5.4-12 12-.7-6.6-5.4-11.3-12-12C6.6 11.3 11.3 6.6 12 0z" />
                                    </svg>
                                </span>
                            ))}
                        </div>
                    )}
                    <input
                        type="range"
                        min={0}
                        max={Math.max(0, availableLevels.length - 1)}
                        step={1}
                        value={idx}
                        onChange={(e) => handleChange(availableLevels[Number(e.target.value)])}
                        disabled={disabled || availableLevels.length <= 1}
                        className="absolute inset-x-[2px] top-1/2 z-10 h-[26px] w-auto -translate-y-1/2 cursor-grab active:cursor-grabbing appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-30 [&::-webkit-slider-thumb]:h-[26px] [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-transparent [&::-moz-range-thumb]:h-[26px] [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent"
                        aria-label="Thinking effort"
                    />
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 z-[6] h-[26px] w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-phi-border-strong bg-phi-white shadow-[0_1px_2px_var(--color-phi-shadow)] transition-[left] duration-200 ease-out"
                        style={{ left: `calc(${pct}% + ${9 - pct * 0.18}px)` }}
                    />
                    </div>
                    <div className="flex justify-between text-xs font-medium text-phi-text-muted">
                        <span
                            className="transition-opacity duration-200"
                            style={{ opacity: 1 - pct / 160 }}
                        >
                            Faster
                        </span>
                        <span
                            className="transition-opacity duration-200"
                            style={{ opacity: 0.375 + pct / 160 }}
                        >
                            Smarter
                        </span>
                    </div>
                </div>
                {availableLevels.length <= 1 && (
                    <p className="mt-1.5 text-[10px] leading-none text-phi-text-muted">
                        Single effort — model default
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
});
