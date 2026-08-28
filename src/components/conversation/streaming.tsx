import { Markdown } from "./markdown";
import { ThinkingBlock } from "./thinking";
import { ToolLine } from "./tool-line";

type StreamingTool = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  partial?: string;
  result?: string;
  isError?: boolean;
  done?: boolean;
};

export function Streaming({
  text,
  thinking,
  tools,
  error,
}: {
  text: string;
  thinking: string;
  tools: StreamingTool[];
  error?: string;
}) {
  if (!text && !thinking && tools.length === 0 && !error) {
    return (
      <div className="flex items-center gap-2 py-2 text-[13px] text-[#5e5e63]">
        <span className="size-2 animate-pulse rounded-full bg-amber-400" />
        Thinking…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {thinking && <ThinkingBlock text={thinking} />}
      {tools.length > 0 && (
        <div className="space-y-1.5">
          {tools.map((t) => (
            <ToolLine
              key={t.toolCallId}
              name={t.toolName}
              args={t.args}
              result={t.result ? { text: t.result, isError: !!t.isError } : t.partial ? { text: t.partial, isError: false } : undefined}
            />
          ))}
        </div>
      )}
      {text && <Markdown text={text} />}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
