import { memo, useMemo } from "react";
import { Markdown } from "./markdown";
import { ThinkingBlock } from "./thinking";
import { ToolLine } from "./tool-line";

type Props = {
    messages: unknown[];
};

function asMessages(messages: unknown[]): Array<Record<string, unknown>> {
    return (messages ?? []) as Array<Record<string, unknown>>;
}

function getTextContent(block: unknown): string {
    if (!block || typeof block !== "object") return "";
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") return b.text;
    return "";
}

function getThinking(block: unknown): string {
    if (!block || typeof block !== "object") return "";
    const b = block as Record<string, unknown>;
    if (b.type === "thinking" && typeof b.thinking === "string")
        return b.thinking;
    return "";
}

function getToolCall(
    block: unknown,
): { id: string; name: string; args: Record<string, unknown> } | null {
    if (!block || typeof block !== "object") return null;
    const b = block as Record<string, unknown>;
    if (
        b.type === "toolCall" &&
        typeof b.id === "string" &&
        typeof b.name === "string"
    ) {
        return {
            id: b.id,
            name: b.name,
            args: (b.arguments as Record<string, unknown>) ?? {},
        };
    }
    return null;
}

function renderUser(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((c) => {
                if (
                    c &&
                    typeof c === "object" &&
                    "text" in (c as Record<string, unknown>)
                ) {
                    return String((c as Record<string, unknown>).text ?? "");
                }
                if (typeof c === "string") return c;
                return "";
            })
            .join("");
    }
    return "";
}

const MessageRow = memo(function MessageRow({
    m,
    toolResults,
}: {
    m: Record<string, unknown>;
    toolResults: Map<string, { text: string; isError: boolean }>;
}) {
    const role = String(m.role ?? "");

    if (role === "user") {
        const text = renderUser(m.content);
        if (!text.trim()) return null;
        return (
            <div className="flex justify-end py-2">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-phi-border bg-phi-bg-elevated px-4 py-2.5 text-[14px] leading-6 text-phi-text-primary">
                    {text}
                </div>
            </div>
        );
    }

    if (role === "assistant") {
        const content = Array.isArray(m.content) ? m.content : [];
        const thinkingParts: string[] = [];
        const textParts: string[] = [];
        const toolCalls: Array<{
            id: string;
            name: string;
            args: Record<string, unknown>;
        }> = [];

        for (const block of content) {
            const th = getThinking(block);
            if (th) thinkingParts.push(th);
            const tx = getTextContent(block);
            if (tx) textParts.push(tx);
            const tc = getToolCall(block);
            if (tc) toolCalls.push(tc);
        }

        const thinking = thinkingParts.join("\n\n").trim();
        const text = textParts.join("\n\n").trim();

        if (!thinking && !text && toolCalls.length === 0) return null;

        return (
            <div className="space-y-3 py-2">
                {thinking && <ThinkingBlock text={thinking} />}
                {text && <Markdown text={text} />}
                {toolCalls.length > 0 && (
                    <div className="space-y-1.5">
                        {toolCalls.map((tc) => {
                            let result = toolResults.get(tc.id);
                            if (!result) {
                                for (const [k, v] of toolResults.entries()) {
                                    if (k.startsWith(tc.id) || tc.id.startsWith(k)) {
                                        result = v;
                                        break;
                                    }
                                }
                            }
                            return (
                                <ToolLine
                                    key={tc.id}
                                    name={tc.name}
                                    args={tc.args}
                                    result={result}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    if (role === "toolResult") {
        return null;
    }

    const fallback =
        typeof m.content === "string"
            ? m.content
            : JSON.stringify(m, null, 2).slice(0, 800);
    if (!fallback.trim()) return null;
    return (
        <div className="rounded-lg border border-phi-border-faint bg-phi-overlay-muted px-3 py-2 text-[12px] leading-5 text-phi-text-tertiary">
            <span className="font-medium text-phi-text-faint">{role}</span>:{" "}
            <span className="whitespace-pre-wrap">{fallback}</span>
        </div>
    );
});

export const Conversation = memo(function Conversation({ messages }: Props) {
    const msgs = useMemo(() => asMessages(messages), [messages]);

    const toolResults = useMemo(() => {
        const map = new Map<string, { text: string; isError: boolean }>();
        for (const m of msgs) {
            if (m.role === "toolResult") {
                const id = String(m.toolCallId ?? "");
                const content = m.content;
                let text = "";
                if (Array.isArray(content)) {
                    text = content
                        .map((c: unknown) =>
                            c &&
                            typeof c === "object" &&
                            "text" in (c as Record<string, unknown>)
                                ? String((c as Record<string, unknown>).text ?? "")
                                : "",
                        )
                        .join("\n");
                } else if (typeof content === "string") text = content;
                map.set(id, { text, isError: Boolean(m.isError) });
            }
        }
        return map;
    }, [msgs]);

    return (
        <div className="w-full max-w-2xl min-w-0 space-y-0 pb-8 pt-3">
            {msgs.map((m, idx) => (
                <MessageRow key={idx} m={m} toolResults={toolResults} />
            ))}
        </div>
    );
});
