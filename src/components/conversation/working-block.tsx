import { useEffect, useState } from "react";
import type { WorkItem } from "../../types/work";
import { ChevronDownIcon } from "../ui/icons";
import { ToolLine } from "./tool-line";
import { Orb } from "@aicss/react";

type Props = {
    items: WorkItem[];
    isStreaming?: boolean;
    variant: "streaming" | "history";
    animateOnMount?: boolean;
};

export function WorkingBlock({ items, isStreaming, variant, animateOnMount }: Props) {
    const isStreamingVariant = variant === "streaming";
    const hasWork = items.length > 0;
    if (!hasWork && !(isStreamingVariant && isStreaming)) return null;

    const [open, setOpen] = useState(() =>
        isStreamingVariant ? Boolean(isStreaming) : Boolean(animateOnMount),
    );

    useEffect(() => {
        if (isStreamingVariant) {
            if (isStreaming) setOpen(true);
            return;
        }
        if (!animateOnMount) return;
        const frame = requestAnimationFrame(() => setOpen(false));
        return () => cancelAnimationFrame(frame);
    }, [animateOnMount, isStreaming, isStreamingVariant]);

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
                className="group flex items-center gap-2 h-4.5 text-left text-[12px] leading-none text-phi-text-muted hover:text-phi-text-tertiary transition-colors"
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
                    <>
                        {isStreaming && <Orb variant="S3" />}
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
                    <div
                        className={`${isStreaming && isStreamingVariant ? "phi-work-stagger " : ""}space-y-3 pb-2 pt-2`}
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
