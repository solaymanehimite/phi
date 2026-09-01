import { memo } from "react";
import { Markdown } from "./markdown";
import { WorkingBlock } from "./working-block";
import type { WorkItem } from "../../types/work";

export const Streaming = memo(function Streaming({
    text,
    workItems,
    error,
    isStreaming,
}: {
    text: string;
    workItems: WorkItem[];
    error?: string;
    isStreaming?: boolean;
}) {
    const hasWork = workItems.length > 0;
    // Keep the live working block visible even after text starts. It is distinct
    // from the final answer.
    const showWorking = hasWork || !!isStreaming;

    if (!text && !hasWork && !error) {
        return (
            <div className="space-y-3">
                <WorkingBlock items={workItems} isStreaming={isStreaming} variant="streaming" />
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
                />
            )}
            {text && isStreaming && <div className="phi-streaming-cursor"><Markdown text={text} /></div>}
            {error && (
                <div className="rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[13px] text-phi-error-text">
                    {error}
                </div>
            )}
        </div>
    );
});
