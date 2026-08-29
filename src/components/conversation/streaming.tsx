import { memo } from "react";
import { Markdown } from "./markdown";
import { WorkingBlock } from "./working-block";

type StreamingTool = {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    partial?: string;
    result?: string;
    isError?: boolean;
    done?: boolean;
};

export const Streaming = memo(function Streaming({
    text,
    thinking,
    tools,
    error,
    isStreaming,
}: {
    text: string;
    thinking: string;
    tools: StreamingTool[];
    error?: string;
    isStreaming?: boolean;
}) {
    const hasWork = Boolean((thinking && thinking.trim()) || tools.length > 0);
    // keep live working block visible even after text starts — distinct from final answer
    const showWorking = hasWork || !!isStreaming;

    if (!text && !hasWork && !error) {
        return (
            <div className="space-y-3">
                <WorkingBlock thinking={thinking} tools={tools.map((t) => ({ id: t.toolCallId, name: t.toolName, args: t.args, partial: t.partial, result: t.result ? { text: t.result, isError: !!t.isError } : undefined }))} isStreaming={isStreaming} variant="streaming" />
            </div>
        );
    }

    return (
        <div className="space-y-3 pb-6">
            {showWorking && (
                <WorkingBlock
                    thinking={thinking}
                    tools={tools.map((t) => ({ id: t.toolCallId, name: t.toolName, args: t.args, partial: t.partial, result: t.result ? { text: t.result, isError: !!t.isError } : undefined }))}
                    isStreaming={isStreaming}
                    variant="streaming"
                />
            )}
            {text && isStreaming && <Markdown text={text} />}
            {error && (
                <div className="rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[13px] text-phi-error-text">
                    {error}
                </div>
            )}
        </div>
    );
})
