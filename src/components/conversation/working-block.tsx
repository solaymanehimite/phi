import { useEffect, useState } from "react";
import type { WorkItem } from "../../types/work";
import { IconChevronDownFilled } from "@tabler/icons-react";
import { ToolLine } from "./tool-line";
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

export function WorkingBlock({ items, isStreaming, variant, animateOnMount, startedAt, durationMs }: Props) {
    const isStreamingVariant = variant === "streaming";
    const hasWork = items.length > 0;

    const [open, setOpen] = useState(() =>
        isStreamingVariant ? Boolean(isStreaming) : Boolean(animateOnMount),
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

    if (!hasWork && !(isStreamingVariant && isStreaming)) return null;

    const liveElapsedMs = showLiveElapsed && startedAt ? Math.max(0, now - startedAt) : null;

    let title: React.ReactNode;
    if (isStreamingVariant) {
        title = (
            <span className="inline-flex items-baseline gap-1.5 leading-none">
                <span className="font-medium tracking-wide">{isStreaming ? "Working on it" : "Working"}</span>
                {liveElapsedMs !== null && (
                    <span className="font-mono text-[11px] tabular-nums leading-none text-phi-text-muted">{formatDuration(liveElapsedMs)}</span>
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
        <div className="mt-2 w-full pb-2">
            {/* muted label — no border/background container */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="group flex min-h-6 items-center gap-2 text-left text-[12px] leading-none text-phi-text-muted hover:text-phi-text-tertiary transition-colors"
                aria-expanded={open}
            >
                {!isStreamingVariant ? (
                    // history variant — keep chevron on left
                    <>
                        <IconChevronDownFilled
                            className={`size-4 shrink-0 text-phi-text-muted transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
                            aria-hidden
                        />
                        {title}
                    </>
                ) : (
                    <>
                        {isStreaming && <Orb variant="S3" size={24} className="shrink-0" />}
                        {title}
                        <IconChevronDownFilled
                            className={`size-4 shrink-0 text-phi-text-muted transition-all duration-200 ${open ? "rotate-0" : "-rotate-90"} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100`}
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
                        {items.map((item) => {
                            if (item.kind === "thinking") {
                                return (
                                    <div
                                        key={item.id}
                                        className="whitespace-pre-wrap break-words text-[13px] leading-6 text-phi-text-tertiary"
                                    >
                                        {item.text}
                                    </div>
                                );
                            }

                            return <ToolLine key={item.id} item={item} />;
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
