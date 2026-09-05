import { memo, useCallback, useMemo } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/solid";
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
    const pct =
        availableLevels.length <= 1
            ? 100
            : (idx / (availableLevels.length - 1)) * 100;

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
                className="group inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-phi-text-secondary hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60"
                aria-label={`Change thinking effort, currently ${current}`}
            >
                <span className="min-w-0 truncate text-[12.5px] font-medium">
                    Thinking
                </span>
                <span
                    className="shrink-0 text-[11px] font-medium"
                    style={{ color: THINKING_COLORS[current] ?? "var(--color-phi-text-muted)" }}
                >
                    {current}
                </span>
                <ChevronDownIcon className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
            </PopoverTrigger>

            <PopoverContent
                anchor={{ to: "top start", gap: 12 }}
                className="w-[240px] p-3"
            >
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium tracking-wide text-phi-text-tertiary">
                        Reasoning
                    </span>
                    <span
                        className="text-sm font-medium capitalize"
                        style={{ color: THINKING_COLORS[current] ?? "var(--color-phi-text-muted)" }}
                    >
                        {current}
                    </span>
                </div>

                <div className="relative flex h-[26px] items-center">
                    <div className="relative h-[14px] w-full rounded bg-phi-overlay">
                        <div
                            className="absolute left-0 top-1/2 h-[20px] -translate-y-1/2 rounded transition-[width,background-color] duration-200 ease-out"
                            style={{
                                width: `calc(${pct}% + ${9 - pct * 0.18}px)`,
                                backgroundColor:
                                    THINKING_COLORS[current] ?? "var(--color-phi-text-muted)",
                            }}
                        />
                    </div>
                    {availableLevels.length > 1 && (
                        <div className="pointer-events-none absolute inset-y-0 left-[9px] right-[9px] z-[5] flex items-center justify-between">
                            {availableLevels.map((lvl) => (
                                <span
                                    key={lvl}
                                    className="h-[8px] w-[3px] rounded-full bg-white/40"
                                />
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
                        className="pointer-events-none absolute top-1/2 z-0 h-[26px] w-3.5 -translate-x-1/2 -translate-y-1/2 rounded bg-phi-white transition-[left] duration-200 ease-out"
                        style={{ left: `calc(${pct}% + ${9 - pct * 0.18}px)` }}
                    />
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
