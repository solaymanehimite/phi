import { memo } from "react";
import { Alert } from "../ui/alert";
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
            {text && isStreaming && <Markdown text={text} />}
            {error && <Alert variant="error" className="text-[13px]">{error}</Alert>}
        </div>
    );
});
