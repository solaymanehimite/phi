import { memo } from "react";
import { IconRefresh, IconX } from "@tabler/icons-react";
import type { SessionStatsResponse } from "../hooks/useSessionStats";
import { Button } from "./ui/button";

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

export const SessionUsageRing = memo(function SessionUsageRing({
    percent,
    size = 22,
}: {
    percent: number | null;
    size?: number;
}) {
    const fraction = percent == null ? 0 : Math.min(Math.max(percent, 0), 100) / 100;
    const ring = ringColorFor(percent);
    return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="block">
            <circle cx="10" cy="10" r={RING_R} fill="none" stroke="var(--color-phi-border-strong)" strokeWidth="3" />
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
    );
});

export const SessionUsageButton = memo(function SessionUsageButton({
    percent,
    active,
    onClick,
}: {
    percent: number | null;
    active: boolean;
    onClick: () => void;
}) {
    const label = percent == null ? "Open session usage" : `Open session usage — ${percent.toFixed(1)}% context used`;
    return (
        <button
            type="button"
            aria-label={label}
            title="Session usage"
            aria-pressed={active}
            onClick={onClick}
            className="grid size-8 place-items-center rounded-lg text-phi-text-tertiary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 aria-pressed:bg-phi-overlay-active aria-pressed:text-phi-text-primary"
        >
            <SessionUsageRing percent={percent} />
        </button>
    );
});

export const SessionUsagePanel = memo(function SessionUsagePanel({
    file,
    stats,
    loading = false,
    onRefresh,
    onClose,
}: {
    file: string | null;
    stats: SessionStatsResponse | null;
    loading?: boolean;
    onRefresh?: () => void;
    onClose: () => void;
}) {
    const usage = stats?.contextUsage ?? null;
    const percent = usage?.percent ?? null;
    const ring = ringColorFor(percent);
    const hasContext = usage != null && usage.contextWindow > 0;
    const hasTokens = (stats?.tokens.total ?? 0) > 0;
    const counts = stats?.counts;

    return (
        <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-phi-border-faint bg-phi-bg-main" aria-label="Session usage">
            <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-4">
                <h2 className="text-[13px] font-semibold text-phi-text-primary">Session usage</h2>
                <div className="flex items-center gap-0.5">
                    <Button variant="mini" aria-label="Refresh session usage" title="Refresh" onClick={onRefresh}>
                        <IconRefresh className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button variant="mini" aria-label="Close session usage" title="Close" onClick={onClose}>
                        <IconX className="size-3.5" />
                    </Button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-2">
                {!file ? (
                    <p className="text-[12px] leading-5 text-phi-text-muted">Open a session to see its usage.</p>
                ) : (
                    <div className="space-y-6">
                        <section aria-label="Context usage">
                            <div className="flex items-center gap-3">
                                <SessionUsageRing percent={percent} size={34} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-[12px] font-medium text-phi-text-secondary">Context</span>
                                        <span className="font-mono text-[12px] font-semibold tabular-nums" style={{ color: ring }}>
                                            {percent == null ? "—" : `${percent.toFixed(1)}%`}
                                        </span>
                                    </div>
                                    {hasContext && usage?.tokens != null ? (
                                        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-phi-text-muted">
                                            {formatTokens(usage.tokens)} / {formatTokens(usage.contextWindow)} tokens
                                        </p>
                                    ) : (
                                        <p className="mt-0.5 text-[11px] text-phi-text-muted">
                                            {loading ? "Measuring…" : "Unknown until the next response."}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {hasContext && (
                                <div className="mt-3 h-1 overflow-hidden rounded-full bg-phi-overlay-strong" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent?.toFixed(1) ?? 0)}>
                                    <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${Math.min(Math.max(percent ?? 0, 0), 100).toFixed(1)}%`, backgroundColor: ring }} />
                                </div>
                            )}
                        </section>

                        <section aria-label="Token usage" className="border-t border-phi-border-faint pt-4">
                            <h3 className="text-[12px] font-medium text-phi-text-secondary">Tokens</h3>
                            {hasTokens && stats ? (
                                <dl className="mt-2 space-y-1.5 text-[12px] leading-5">
                                    {[
                                        ["Input", stats.tokens.input],
                                        ["Output", stats.tokens.output],
                                        ["Cache read", stats.tokens.cacheRead],
                                        ["Cache write", stats.tokens.cacheWrite],
                                    ].map(([label, value]) => (
                                        <div key={label} className="flex items-baseline justify-between gap-3">
                                            <dt className="text-phi-text-muted">{label}</dt>
                                            <dd className="font-mono tabular-nums text-phi-text-secondary">{formatTokens(Number(value))}</dd>
                                        </div>
                                    ))}
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="font-medium text-phi-text-secondary">Total</dt>
                                        <dd className="font-mono font-medium tabular-nums text-phi-text-primary">{formatTokens(stats.tokens.total)}</dd>
                                    </div>
                                </dl>
                            ) : (
                                <p className="mt-2 text-[12px] leading-5 text-phi-text-muted">No token usage yet.</p>
                            )}
                        </section>

                        <section aria-label="Session cost" className="border-t border-phi-border-faint pt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <h3 className="text-[12px] font-medium text-phi-text-secondary">Session cost</h3>
                                <p className="font-mono text-[12px] font-medium tabular-nums text-phi-accent">{formatCost(stats?.cost ?? 0)}</p>
                            </div>
                            {stats && stats.breakdown.length > 1 && (
                                <ul className="mt-2 space-y-1.5">
                                    {stats.breakdown.map((row) => (
                                        <li key={row.key} className="flex items-baseline justify-between gap-3 text-[12px] leading-5">
                                            <span className="min-w-0 truncate text-phi-text-muted">{row.key}</span>
                                            <span className="shrink-0 font-mono tabular-nums text-phi-text-secondary">{formatCost(row.cost)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        {counts && (
                            <section aria-label="Session activity" className="border-t border-phi-border-faint pt-4">
                                <h3 className="text-[12px] font-medium text-phi-text-secondary">Activity</h3>
                                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                                    <div><dt className="text-phi-text-muted">Messages</dt><dd className="mt-0.5 font-mono tabular-nums text-phi-text-secondary">{counts.totalMessages}</dd></div>
                                    <div><dt className="text-phi-text-muted">Tool calls</dt><dd className="mt-0.5 font-mono tabular-nums text-phi-text-secondary">{counts.toolCalls}</dd></div>
                                </dl>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
});
