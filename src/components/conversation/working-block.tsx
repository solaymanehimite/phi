import { useEffect, useState } from "react";
import type { WorkItem } from "../../types/work";
import { ChevronDownIcon } from "../ui/icons";

function getToolDisplay(name: string, args: Record<string, unknown>): { label: string; detail: string | null } {
    const a = args as Record<string, string>;
    if (name === "read" && a.path) return { label: "read", detail: a.path };
    if (name === "write" && a.path) return { label: "write", detail: a.path };
    if (name === "edit" && a.path) return { label: "edit", detail: a.path };
    if (name === "bash" && a.command) return { label: "bash", detail: String(a.command).slice(0, 80) };
    if (name === "grep" && a.pattern) return { label: "grep", detail: a.pattern + (a.path ? ` ${a.path}` : "") };
    if (name === "find" && a.pattern) return { label: "find", detail: a.pattern };
    if (name === "ls" && a.path) return { label: "ls", detail: a.path };
    const first = Object.values(args).find((v) => typeof v === "string" && v.length > 0) as string | undefined;
    return first ? { label: name, detail: first.slice(0, 80) } : { label: name, detail: null };
}

type Props = {
    items: WorkItem[];
    isStreaming?: boolean;
    variant: "streaming" | "history";
};

export function WorkingBlock({ items, isStreaming, variant }: Props) {
    const isStreamingVariant = variant === "streaming";
    const hasWork = items.length > 0;
    if (!hasWork && !(isStreamingVariant && isStreaming)) return null;

    const [open, setOpen] = useState(() => (isStreamingVariant ? Boolean(isStreaming) : false));

    useEffect(() => {
        if (!isStreamingVariant) return;
        if (isStreaming) setOpen(true);
    }, [isStreaming, isStreamingVariant]);

    let title: string;
    if (isStreamingVariant) {
        title = isStreaming ? "Working on it" : "Working";
    } else {
        title = "Show work";
    }

    return (
        <div className="w-full">
            {/* muted label — no border/background container */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="group flex items-center gap-2 py-1 text-left text-[12px] leading-none text-phi-text-muted hover:text-phi-text-tertiary transition-colors"
                aria-expanded={open}
            >
                {!isStreamingVariant ? (
                    // history variant — keep chevron on left
                    <>
                        <ChevronDownIcon
                            className={`size-3 shrink-0 text-phi-text-muted transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
                            aria-hidden
                        />
                        <span className="font-medium tracking-wide">{title}</span>
                    </>
                ) : (
                    // streaming variant — dot matrix on left, chevron right next to title on hover
                    <>
                        {isStreaming && (
                            <span className="inline-grid grid-cols-3 gap-[2px] shrink-0" aria-hidden>
                                {Array.from({ length: 9 }).map((_, i) => {
                                    const row = Math.floor(i / 3);
                                    const col = i % 3;
                                    const delay = (row + col) * 0.12;
                                    return (
                                        <span
                                            key={i}
                                            className="size-[3px] rounded-full bg-phi-streaming"
                                            style={{
                                                animation: `phi-dot-matrix 1.2s ease-in-out ${delay}s infinite both`,
                                            }}
                                        />
                                    );
                                })}
                            </span>
                        )}
                        <span className="font-medium tracking-wide">{title}</span>
                        <ChevronDownIcon
                            className={`size-3 shrink-0 text-phi-text-muted transition-all duration-200 ${open ? "rotate-0" : "-rotate-90"} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100`}
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
                    <div className="space-y-3 pb-2 pt-2">
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

                            const { label, detail } = getToolDisplay(item.name, item.args);
                            const isError = !!item.result?.isError;
                            return (
                                <div key={item.id} className="flex flex-wrap items-center gap-1.5 py-0.5">
                                    <span className={`text-xs leading-4 ${isError ? "text-phi-error" : "text-phi-text-secondary"}`}>{label}</span>
                                    {detail && (
                                        <code className="rounded border border-phi-border-faint bg-phi-bg-sunken px-1.5 py-0.5 font-mono text-[11px] leading-none text-phi-text-tertiary">
                                            {detail}
                                        </code>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
