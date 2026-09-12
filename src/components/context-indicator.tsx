import { memo, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import type { SessionStatsResponse } from "../hooks/useSessionStats";

const RING_R = 8;
const RING_CIRC = 2 * Math.PI * RING_R;

function formatTokens(count: number): string {
    if (!Number.isFinite(count)) return "—";
    if (count < 1000) return `${Math.round(count)}`;
    if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
    if (count < 1000000) return `${Math.round(count / 1000)}k`;
    if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
    return `${Math.round(count / 1000000)}M`;
}

function formatCost(cost: number): string {
    if (!Number.isFinite(cost)) return "—";
    if (cost === 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
}

function ringColorFor(percent: number | null): string {
    if (percent == null) return "var(--color-phi-text-muted)";
    if (percent > 90) return "var(--color-phi-error)";
    if (percent > 70) return "var(--color-phi-warning)";
    return "var(--color-phi-text-tertiary)";
}

type ContextIndicatorProps = {
    file: string | null;
    stats: SessionStatsResponse | null;
    loading?: boolean;
    onRefresh?: () => void;
    /** Where the stats popover opens. "above" for the composer, "below" for the top bar. */
    placement?: "above" | "below";
};

export const ContextIndicator = memo(function ContextIndicator({
    file,
    stats,
    loading,
    onRefresh,
    placement = "above",
}: ContextIndicatorProps) {
    const usage = stats?.contextUsage ?? null;
    const percent = usage?.percent ?? null;
    const fraction =
        percent == null ? 0 : Math.min(Math.max(percent, 0), 100) / 100;
    const ring = ringColorFor(percent);

    const label = !file
        ? "Context and cost (open a session)"
        : percent == null
            ? "Context usage unknown — click for cost stats"
            : `Context usage ${percent.toFixed(1)}% — click for cost stats`;

    const handleOpen = useCallback(() => {
        onRefresh?.();
    }, [onRefresh]);

    const hasContext = usage != null && usage.contextWindow > 0;
    const showTokens = hasContext && usage.tokens != null;
    const tokens = stats?.tokens;
    const hasTokens = tokens != null && tokens.total > 0;
    const hasCost =
        stats != null && (stats.cost > 0 || (tokens?.total ?? 0) > 0);

    return (
        <Popover className="relative shrink-0">
            <PopoverTrigger
                onClick={handleOpen}
                aria-label={label}
                data-context-indicator="trigger"
                className="inline-flex items-center justify-center rounded-full p-1.5 text-phi-text-secondary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
            >
                <svg
                    width="22"
                    height="22"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="block"
                >
                    <circle
                        cx="10"
                        cy="10"
                        r={RING_R}
                        fill="none"
                        stroke="var(--color-phi-border-strong)"
                        strokeWidth="3"
                    />
                    {fraction > 0 && (
                        <circle
                            cx="10"
                            cy="10"
                            r={RING_R}
                            fill="none"
                            stroke={ring}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={`${(fraction * RING_CIRC).toFixed(1)} ${RING_CIRC.toFixed(1)}`}
                            transform="rotate(-90 10 10)"
                        />
                    )}
                </svg>
            </PopoverTrigger>

            <PopoverContent
                anchor={placement === "below" ? { to: "bottom end", gap: 12 } : { to: "top start", gap: 12 }}
                origin={placement === "below" ? "origin-top" : "origin-bottom"}
                className="w-[268px] p-3.5"
            >
                <div className="flex flex-col gap-3">
                    <section aria-label="Context usage">
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-semibold text-phi-text-tertiary">
                                Context
                            </span>
                            {showTokens && percent != null && (
                                <span
                                    className="font-mono text-[12px] font-semibold tabular-nums"
                                    style={{ color: ring }}
                                >
                                    {percent.toFixed(1)}%
                                </span>
                            )}
                        </div>
                        {showTokens && usage ? (
                            <>
                                <div
                                    className="h-1.5 overflow-hidden rounded-full bg-phi-overlay-strong"
                                    role="progressbar"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={Number(percent?.toFixed(1) ?? 0)}
                                >
                                    <div
                                        className="h-full rounded-full transition-[width] duration-300 ease-out"
                                        style={{
                                            width: `${Math.min(Math.max(percent ?? 0, 0), 100).toFixed(1)}%`,
                                            backgroundColor: ring,
                                        }}
                                    />
                                </div>
                                <p className="mt-1.5 font-mono text-[12px] leading-5 tabular-nums text-phi-text-secondary">
                                    {formatTokens(usage.tokens ?? 0)} /{" "}
                                    {formatTokens(usage.contextWindow)} tokens
                                </p>
                            </>
                        ) : (
                            <p className="text-[12px] leading-5 text-phi-text-muted">
                                {!file
                                    ? "Open a session to see context usage."
                                    : loading
                                        ? "Measuring…"
                                        : "Unknown until the next response."}
                            </p>
                        )}
                        {hasTokens && tokens && (
                            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-phi-border-faint pt-2 text-[12px] leading-5">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-phi-text-muted">Input ↑</span>
                                    <span className="font-mono tabular-nums text-phi-text-secondary">
                                        {formatTokens(tokens.input)}
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-phi-text-muted">Output ↓</span>
                                    <span className="font-mono tabular-nums text-phi-text-secondary">
                                        {formatTokens(tokens.output)}
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-phi-text-muted">Cache read</span>
                                    <span className="font-mono tabular-nums text-phi-text-secondary">
                                        {formatTokens(tokens.cacheRead)}
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-phi-text-muted">Cache write</span>
                                    <span className="font-mono tabular-nums text-phi-text-secondary">
                                        {formatTokens(tokens.cacheWrite)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </section>

                    <div className="h-px bg-phi-border-faint" aria-hidden="true" />

                    <section aria-label="Session cost">
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-semibold text-phi-text-tertiary">
                                Session cost
                            </span>
                            <span className="font-mono text-[12px] font-semibold tabular-nums text-phi-text-primary">
                                {formatCost(stats?.cost ?? 0)}
                            </span>
                        </div>
                        {hasCost && stats && stats.breakdown.length > 1 ? (
                            <ul className="flex flex-col gap-1">
                                {stats.breakdown.slice(0, 4).map((row) => (
                                    <li
                                        key={row.key}
                                        className="flex items-baseline justify-between gap-2 text-[12px] leading-5"
                                    >
                                        <span className="min-w-0 truncate text-phi-text-muted">
                                            {row.key}
                                        </span>
                                        <span className="shrink-0 font-mono tabular-nums text-phi-text-secondary">
                                            {formatCost(row.cost)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-[12px] leading-5 text-phi-text-muted">
                                {!file
                                    ? "Costs appear after the first turn."
                                    : "No billed usage yet."}
                            </p>
                        )}
                    </section>
                </div>
            </PopoverContent>
        </Popover>
    );
});
