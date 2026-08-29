import { memo, useMemo } from "react";
import { Markdown } from "./markdown";
import { WorkingBlock } from "./working-block";

type Props = {
    messages: unknown[];
    hideLastWork?: boolean;
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

function getUserImages(content: unknown): Array<{ data: string; mimeType: string }> {
    if (!Array.isArray(content)) return [];
    const out: Array<{ data: string; mimeType: string }> = [];
    for (const c of content) {
        if (!c || typeof c !== "object") continue;
        const r = c as Record<string, unknown>;
        if (r.type === "image") {
            const data = typeof r.data === "string" ? r.data : typeof (r as Record<string, unknown>).base64 === "string" ? String((r as Record<string, unknown>).base64) : "";
            // support both {data,mimeType} and {source:{data,mediaType}}
            let mimeType = typeof r.mimeType === "string" ? r.mimeType : "image/png";
            if (!r.mimeType && r.source && typeof r.source === "object") {
                const s = r.source as Record<string, unknown>;
                if (typeof s.mediaType === "string") mimeType = s.mediaType;
                else if (typeof s.mimeType === "string") mimeType = s.mimeType;
            }
            // alternate shape: source.data
            let d = data;
            if (!d && r.source && typeof r.source === "object") {
                const s = r.source as Record<string, unknown>;
                if (typeof s.data === "string") d = s.data;
            }
            if (d) out.push({ data: d, mimeType });
        }
    }
    return out;
}

type Turn = {
    user: Record<string, unknown> | null;
    thinking: string;
    text: string;
    toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
};

const TurnRow = memo(function TurnRow({
    turn,
    toolResults,
    hideWork,
}: {
    turn: Turn;
    toolResults: Map<string, { text: string; isError: boolean }>;
    hideWork?: boolean;
}) {
    const userText = turn.user ? renderUser(turn.user.content) : "";
    const userImages = turn.user ? getUserImages(turn.user.content) : [];
    const hasUser = Boolean(userText.trim() || userImages.length > 0);
    const thinking = turn.thinking.trim();
    const text = turn.text.trim();
    const toolCalls = turn.toolCalls;

    const hasWork = Boolean(thinking || toolCalls.length > 0);
    const workTools = toolCalls.map((tc) => {
        let result = toolResults.get(tc.id);
        if (!result) {
            for (const [k, v] of toolResults.entries()) {
                if (k.startsWith(tc.id) || tc.id.startsWith(k)) {
                    result = v;
                    break;
                }
            }
        }
        return { id: tc.id, name: tc.name, args: tc.args, result };
    });

    const showWork = hasWork && !hideWork;

    // empty turn
    if (!hasUser && !thinking && !text && toolCalls.length === 0) return null;

    return (
        <div className="py-2">
            {hasUser && (
                <div className="flex justify-end py-2">
                    <div className="max-w-[80%] space-y-2 rounded-2xl rounded-br-md border border-phi-border bg-phi-bg-elevated px-3 py-2.5 text-[14px] leading-6 text-phi-text-primary">
                        {userImages.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {userImages.map((img, i) => (
                                    <img
                                        key={i}
                                        src={`data:${img.mimeType};base64,${img.data}`}
                                        alt="attached image"
                                        className="max-h-[180px] max-w-[220px] rounded-xl border border-phi-border object-cover"
                                    />
                                ))}
                            </div>
                        )}
                        {userText.trim() && (
                            <div className="whitespace-pre-wrap px-1">{userText}</div>
                        )}
                    </div>
                </div>
            )}
            {(showWork || text) && (
                <div className="space-y-3 py-1">
                    {showWork && (
                        <WorkingBlock
                            thinking={thinking}
                            tools={workTools}
                            variant="history"
                        />
                    )}
                    {text && <Markdown text={text} />}
                </div>
            )}
        </div>
    );
});

export const Conversation = memo(function Conversation({
    messages,
    hideLastWork,
}: Props) {
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

    const turns = useMemo(() => {
        const out: Turn[] = [];
        let cur: Turn | null = null;

        const flush = () => {
            if (
                cur &&
                (cur.user || cur.thinking || cur.text || cur.toolCalls.length > 0)
            ) {
                out.push(cur);
            }
            cur = null;
        };

        for (const m of msgs) {
            const role = String(m.role ?? "");
            if (role === "user") {
                flush();
                cur = { user: m, thinking: "", text: "", toolCalls: [] };
            } else if (role === "assistant") {
                if (!cur) cur = { user: null, thinking: "", text: "", toolCalls: [] };
                const content = Array.isArray(m.content) ? m.content : [];
                for (const block of content) {
                    const th = getThinking(block);
                    if (th) cur.thinking += (cur.thinking ? "\n\n" : "") + th;
                    const tx = getTextContent(block);
                    if (tx) cur.text += (cur.text ? "\n\n" : "") + tx;
                    const tc = getToolCall(block);
                    if (tc) cur.toolCalls.push(tc);
                }
            } else if (role === "toolResult") {
                // tool results are resolved via map, no separate turn
                continue;
            } else {
                // fallback/other roles: treat as separate turn with raw text
                const fallback =
                    typeof m.content === "string"
                        ? m.content
                        : JSON.stringify(m, null, 2).slice(0, 800);
                if (!fallback.trim()) continue;
                if (!cur) cur = { user: null, thinking: "", text: "", toolCalls: [] };
                cur.text += (cur.text ? "\n\n" : "") + fallback;
            }
        }
        flush();
        return out;
    }, [msgs]);

    const lastTurnWithWork = useMemo(() => {
        for (let i = turns.length - 1; i >= 0; i--) {
            if (turns[i].thinking.trim() || turns[i].toolCalls.length > 0) return i;
        }
        return -1;
    }, [turns]);

    return (
        <div className="w-full min-w-0 space-y-0 pb-8 pt-3">
            {turns.map((turn, idx) => (
                <TurnRow
                    key={idx}
                    turn={turn}
                    toolResults={toolResults}
                    hideWork={
                        hideLastWork &&
                        idx === lastTurnWithWork &&
                        lastTurnWithWork === turns.length - 1
                    }
                />
            ))}
        </div>
    );
});
