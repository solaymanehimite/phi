import { memo } from "react";
import { Alert } from "../ui/alert";
import { WorkingBlock } from "./working-block";
import type { WorkItem } from "../../types/work";

function StreamingText({ text }: { text: string }) {
    return (
        <p className="max-w-full whitespace-pre-wrap break-words text-[14px] leading-[19px] text-phi-text-secondary">
            {text}
            <span
                aria-hidden="true"
                className="ml-0.5 inline-block h-[1.05em] w-2 align-text-bottom animate-pulse bg-phi-text-primary motion-reduce:animate-none"
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
