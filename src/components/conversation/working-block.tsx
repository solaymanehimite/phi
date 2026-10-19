import { useEffect, useMemo, useState } from "react";
import type { WorkItem } from "../../types/work";
import { IconChevronDownFilled } from "@tabler/icons-react";
import { ToolGroupLine, ToolLine, groupConsecutiveTools } from "./tool-line";
import { InlineMarkdown } from "./markdown";
import { Orb } from "@aicss/react";

type Props = {
    items: WorkItem[];
    isStreaming?: boolean;
    variant: "streaming" | "history";
    animateOnMount?: boolean;
    startedAt?: number | null;
    durationMs?: number | null;
};

function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const THINKING_BLOCK_MAX_LENGTH = 180;

function isLargeThinkingBlock(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.length > THINKING_BLOCK_MAX_LENGTH || /\r?\n/.test(trimmed);
}

export function WorkingBlock({ items, isStreaming, variant, animateOnMount, startedAt, durationMs }: Props) {
    const isStreamingVariant = variant === "streaming";
    const toolItems = useMemo(() => items.filter((item) => item.kind === "tool"), [items]);
    const hasWork = toolItems.length > 0;

    // Completed work starts collapsed. The streaming block opens while work is
    // active; when it becomes history, it should not flash open again before
    // the collapse effect runs.
    const [open, setOpen] = useState(() =>
        isStreamingVariant ? Boolean(isStreaming) : false,
    );
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (isStreamingVariant) {
            if (isStreaming) setOpen(true);
            return;
        }
        if (!animateOnMount) return;
        const frame = requestAnimationFrame(() => setOpen(false));
        return () => cancelAnimationFrame(frame);
    }, [animateOnMount, isStreaming, isStreamingVariant]);

    const showLiveElapsed = Boolean(isStreamingVariant && isStreaming && startedAt);
    useEffect(() => {
        if (!showLiveElapsed) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [showLiveElapsed, startedAt]);

    // Thinking is status text only. The expandable work section is reserved
    // for actual tool calls.
    const liveReasoning = useMemo(() => {
        if (!isStreamingVariant) return null;
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (item.kind === "thinking" && !isLargeThinkingBlock(item.text)) return item;
        }
        return null;
    }, [isStreamingVariant, items]);
    const visibleItems = toolItems;

    // Consecutive runs of the same groupable tool collapse to one line
    // ("Read 4 files" + chips). Command tools stay separate.
    const entries = useMemo(() => groupConsecutiveTools(visibleItems), [visibleItems]);

    if (!hasWork && !(isStreamingVariant && isStreaming)) return null;

    const liveElapsedMs = showLiveElapsed && startedAt ? Math.max(0, now - startedAt) : null;

    let title: React.ReactNode;
    if (isStreamingVariant) {
        title = (
            <span className="inline-flex min-w-0 items-baseline gap-1.5 overflow-hidden leading-none">
                <span
                    key={liveReasoning?.id ?? "working"}
                    className="phi-reasoning-swap min-w-0 max-w-[min(70vw,32rem)] truncate font-medium tracking-wide"
                    aria-live="polite"
                >
                    {isStreaming && liveReasoning ? <InlineMarkdown text={liveReasoning.text} /> : isStreaming ? "Working on it" : "Working"}
                </span>
                {liveElapsedMs !== null && (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums leading-none text-phi-text-muted">{formatDuration(liveElapsedMs)}</span>
                )}
            </span>
        );
    } else if (durationMs !== null && durationMs !== undefined) {
        title = (
            <span className="inline-flex items-baseline gap-1.5 leading-none">
                <span className="font-medium tracking-wide">Worked for</span>
                <span className="font-mono text-[11px] tabular-nums leading-none">{formatDuration(durationMs)}</span>
            </span>
        );
    } else {
        title = <span className="font-medium tracking-wide">Show work</span>;
    }

    return (
        <div className={`mt-0 w-full ${open ? "pb-2" : "pb-0"}`}>
            {/* muted label — no border/background container */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="group flex min-h-6 items-center gap-2 text-left text-[12px] leading-none text-phi-text-muted hover:text-phi-text-tertiary transition-colors"
                aria-expanded={open}
            >
                {!isStreamingVariant ? (
                    // history variant — chevron right next to the label
                    <>
                        {title}
                        <IconChevronDownFilled
                            className={`size-4 shrink-0 -translate-y-px text-phi-text-muted transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
                            aria-hidden
                        />
                    </>
                ) : (
                    <>
                        {isStreaming && <Orb variant="S3" size={24} className="-translate-y-px shrink-0" />}
                        {title}
                        <IconChevronDownFilled
                            className={`size-4 shrink-0 -translate-y-px text-phi-text-muted transition-all duration-200 ${open ? "rotate-0" : "-rotate-90"} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100`}
                            aria-hidden
                        />
                    </>
                )}
            </button>

            {/* animated reveal — no border/background */}
            <div
                className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
            >
                <div className="overflow-hidden">
                    <div
                        className={`${isStreaming && isStreamingVariant ? "phi-work-stagger " : ""}space-y-3 pb-1 pt-1`}
                    >
                        {entries.map((entry) => {
                            if (Array.isArray(entry)) {
                                return <ToolGroupLine key={entry.map((t) => t.id).join("|")} items={entry} />;
                            }
                            const item = entry;
                            return <ToolLine key={item.id} item={item as Extract<WorkItem, { kind: "tool" }>} />;
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
