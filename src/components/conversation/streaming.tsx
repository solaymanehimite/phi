import { memo, useEffect, useState } from "react";
import { Alert } from "../ui/alert";
import { WorkingBlock } from "./working-block";
import type { WorkItem } from "../../types/work";

function StreamingText({ text }: { text: string }) {
    const [shown, setShown] = useState("");

    useEffect(() => {
        let cancelled = false;
        const tick = () => {
            if (cancelled) return;
            setShown((current) => {
                if (current.length >= text.length) return text;
                return text.slice(0, current.length + 2);
            });
        };

        tick();
        const interval = window.setInterval(tick, 9);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [text]);

    const isCatchingUp = shown.length < text.length;
    return (
        <p className="max-w-full whitespace-pre-wrap break-words text-[14px] leading-[19px] text-phi-text-secondary">
            {shown}
            <span
                aria-hidden="true"
                className={`ml-0.5 inline-block h-[1.05em] w-2 align-text-bottom bg-phi-text-primary motion-reduce:animate-none ${isCatchingUp ? "" : "animate-pulse"}`}
            />
        </p>
    );
}

export const Streaming = memo(function Streaming({
    text,
    workItems,
    error,
    isStreaming,
    startedAt,
}: {
    text: string;
    workItems: WorkItem[];
    error?: string;
    isStreaming?: boolean;
    startedAt?: number | null;
}) {
    const hasWork = workItems.length > 0;
    // Keep the live working block visible even after text starts. It is distinct
    // from the final answer.
    const showWorking = hasWork || !!isStreaming;

    if (!text && !hasWork && !error) {
        return (
            <div className="space-y-3">
                <WorkingBlock items={workItems} isStreaming={isStreaming} variant="streaming" startedAt={startedAt} />
            </div>
        );
    }

    return (
        <div className="space-y-3 pb-6">
            {showWorking && (
                <WorkingBlock
                    items={workItems}
                    isStreaming={isStreaming}
                    variant="streaming"
                    startedAt={startedAt}
                />
            )}
            {text && isStreaming && <StreamingText text={text} />}
            {error && <Alert variant="error" className="text-[13px]">{error}</Alert>}
        </div>
    );
});
