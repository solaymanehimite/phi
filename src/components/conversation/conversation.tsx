import { memo, useEffect, useMemo, useRef, useState } from "react";
import { IconArrowBackUp, IconCheckFilled, IconCopyFilled } from "@tabler/icons-react";
import type { WorkItem } from "../../types/work";
import { Markdown } from "./markdown";
import { WorkingBlock } from "./working-block";
import { CompactionSummary } from "./compaction-summary";

type Props = {
    messages: unknown[];
    hideLastWork?: boolean;
    isStreaming?: boolean;
    onUndo?: () => void;
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
    text: string;
    workItems: WorkItem[];
    durationMs?: number | null;
    /** First message timestamp of the turn, for the action-row date. */
    timestamp: number | null;
    __compactionMeta?: { summary: string; timestamp?: string; tokensBefore?: number; fromHook?: boolean };
};

function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 24 * 60 * 60_000) {
        const mins = Math.floor(diff / 60_000);
        if (mins < 60) return `${mins}m ago`;
        return `${Math.floor(mins / 60)}h ago`;
    }
    const d = new Date(ts);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const date = d.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `${date}, ${time}`;
}

function TurnActions({ text, timestamp, showUndo, undoDisabled, onUndo }: {
    text: string;
    timestamp: number | null;
    showUndo: boolean;
    undoDisabled?: boolean;
    onUndo?: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* clipboard permissions are optional */ }
    };
    const actionClass =
        "grid size-6 place-items-center rounded-md text-phi-text-muted hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-phi-accent/60 disabled:pointer-events-none disabled:opacity-40";
    return (
        <div className="flex items-center gap-0.5 pt-1">
            {text && (
                <button type="button" onClick={() => void copy()} aria-label="Copy response" title={copied ? "Copied" : "Copy response"} className={actionClass}>
                    {copied ? <IconCheckFilled className="size-3.5" /> : <IconCopyFilled className="size-3.5" />}
                </button>
            )}
            {showUndo && onUndo && (
                <button type="button" onClick={() => onUndo()} disabled={undoDisabled} aria-label="Undo last turn" title="Undo last turn (restores files)" className={actionClass}>
                    <IconArrowBackUp className="size-3.5" />
                </button>
            )}
            {timestamp != null && (
                <span title={new Date(timestamp).toLocaleString()} className="ml-1 text-[11px] text-phi-text-faint">
                    {relativeTime(timestamp)}
                </span>
            )}
        </div>
    );
}

function getMessageTimestamp(m: Record<string, unknown>): number | null {
    const t = m.timestamp;
    if (typeof t === "number" && Number.isFinite(t)) return t;
    if (typeof t === "string") {
        const parsed = Date.parse(t);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return null;
}

const TurnRow = memo(function TurnRow({
    turn,
    toolResults,
    hideWork,
    animateWorkCollapse,
    isLatestAssistant,
    onUndo,
    undoDisabled,
}: {
    turn: Turn;
    toolResults: Map<string, { text: string; isError: boolean; diff?: string }>;
    hideWork?: boolean;
    animateWorkCollapse?: boolean;
    isLatestAssistant?: boolean;
    onUndo?: () => void;
    undoDisabled?: boolean;
}) {
    const userText = turn.user ? renderUser(turn.user.content) : "";
    const userImages = turn.user ? getUserImages(turn.user.content) : [];
    const hasUser = Boolean(userText.trim() || userImages.length > 0);
    const text = turn.text.trim();
    const workItems = turn.workItems.map((item) => {
        if (item.kind !== "tool") return item;

        let result = toolResults.get(item.id);
        if (!result) {
            for (const [k, v] of toolResults.entries()) {
                if (k.startsWith(item.id) || item.id.startsWith(k)) {
                    result = v;
                    break;
                }
            }
        }
        return result ? { ...item, result } : item;
    });

    const hasWork = workItems.length > 0;
    const showWork = hasWork && !hideWork;
    const showUndo = Boolean(isLatestAssistant && onUndo);

    // empty turn
    if (!hasUser && !text && !hasWork) return null;

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
                            items={workItems}
                            variant="history"
                            animateOnMount={animateWorkCollapse}
                            durationMs={turn.durationMs}
                        />
                    )}
                    {text && <Markdown text={text} />}
                    {(text || showUndo) && (
                        <TurnActions text={text} timestamp={turn.timestamp} showUndo={showUndo} undoDisabled={undoDisabled} onUndo={onUndo} />
                    )}
                </div>
            )}
        </div>
    );
});

export const Conversation = memo(function Conversation({
    messages,
    hideLastWork,
    isStreaming = false,
    onUndo,
}: Props) {
    const wasStreaming = useRef(false);
    const justFinishedStreaming = wasStreaming.current && !isStreaming;
    useEffect(() => {
        wasStreaming.current = isStreaming;
    }, [isStreaming]);
    const msgs = useMemo(() => asMessages(messages), [messages]);

    const toolResults = useMemo(() => {
        const map = new Map<string, { text: string; isError: boolean; diff?: string }>();
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
                const details = m.details && typeof m.details === "object" ? m.details as Record<string, unknown> : null;
                map.set(id, { text, isError: Boolean(m.isError), diff: typeof details?.diff === "string" ? details.diff : undefined });
            }
        }
        return map;
    }, [msgs]);

    const turns = useMemo(() => {
        const out: Turn[] = [];
        let cur: Turn | null = null;
        let assistantMessageIndex = 0;
        let curStart: number | null = null;
        let curEnd: number | null = null;

        const stamp = (m: Record<string, unknown>, isStart = false) => {
            const ts = getMessageTimestamp(m);
            if (ts === null) return;
            if (isStart || curStart === null) curStart = ts;
            curEnd = curEnd === null ? ts : Math.max(curEnd, ts);
        };

        const flush = () => {
            if (cur && (cur.user || cur.text || cur.workItems.length > 0)) {
                cur.durationMs = curStart !== null && curEnd !== null && curEnd >= curStart
                    ? curEnd - curStart
                    : null;
                cur.timestamp = curStart;
                out.push(cur);
            }
            cur = null;
            curStart = null;
            curEnd = null;
        };

        for (const m of msgs) {
            const role = String(m.role ?? "");
            if (role === "user") {
                flush();
                cur = { user: m, text: "", workItems: [], timestamp: null };
                stamp(m, true);
            } else if (role === "assistant") {
                if (!cur) cur = { user: null, text: "", workItems: [], timestamp: null };
                stamp(m);
                const content = Array.isArray(m.content) ? m.content : [];
                const messageIndex = assistantMessageIndex++;
                for (const [contentIndex, block] of content.entries()) {
                    const th = getThinking(block);
                    if (th) {
                        const previous = cur.workItems[cur.workItems.length - 1];
                        if (previous?.kind === "thinking") {
                            previous.text += (previous.text ? "\n\n" : "") + th;
                        } else {
                            cur.workItems.push({
                                kind: "thinking",
                                id: `thinking:${messageIndex}:${contentIndex}`,
                                text: th,
                                order: { message: messageIndex, content: contentIndex },
                            });
                        }
                    }
                    const tx = getTextContent(block);
                    if (tx) cur.text += (cur.text ? "\n\n" : "") + tx;
                    const tc = getToolCall(block);
                    if (tc) {
                        cur.workItems.push({
                            kind: "tool",
                            id: tc.id,
                            name: tc.name,
                            args: tc.args,
                            order: { message: messageIndex, content: contentIndex },
                        });
                    }
                }
            } else if (role === "toolResult") {
                // tool results are resolved via map, no separate turn — still bound the turn
                if (cur) stamp(m);
                continue;
            } else if (role === "custom") {
                // extension custom messages — respect display flag, render plain text only
                if ((m as Record<string, unknown>).display === false) continue;
                let text = "";
                const content = (m as Record<string, unknown>).content;
                if (typeof content === "string") text = content;
                else if (Array.isArray(content)) {
                    text = (content as unknown[])
                        .map((c) =>
                            c && typeof c === "object" && "text" in (c as Record<string, unknown>)
                                ? String((c as Record<string, unknown>).text ?? "")
                                : typeof c === "string"
                                    ? c
                                    : "",
                        )
                        .filter(Boolean)
                        .join("\n");
                }
                if (!text.trim() && typeof (m as Record<string, unknown>).text === "string") {
                    text = String((m as Record<string, unknown>).text);
                }
                if (!text.trim()) continue;
                if (!cur) cur = { user: null, text: "", workItems: [], timestamp: null };
                stamp(m);
                cur.text += (cur.text ? "\n\n" : "") + text;
            } else if (role === "compactionSummary" || String((m as Record<string, unknown>).type ?? "") === "compaction") {
                flush();
                // compactionSummary messages contain the compaction summary
                let summary = "";
                const content = (m as Record<string, unknown>).content;
                if (typeof content === "string") summary = content;
                else if (Array.isArray(content)) {
                    summary = (content as unknown[])
                        .map((c) =>
                            c && typeof c === "object" && "text" in (c as Record<string, unknown>)
                                ? String((c as Record<string, unknown>).text ?? "")
                                : typeof c === "string"
                                    ? c
                                    : "",
                        )
                        .filter(Boolean)
                        .join("\n");
                } else if (typeof (m as Record<string, unknown>).summary === "string") summary = String((m as Record<string, unknown>).summary);
                else if (typeof (m as Record<string, unknown>).text === "string") summary = String((m as Record<string, unknown>).text);
                if (summary.trim()) {
                    out.push({ user: null, text: `__compaction__:${summary}`, workItems: [], __compactionMeta: { summary, timestamp: String((m as Record<string, unknown>).timestamp ?? ""), tokensBefore: typeof (m as Record<string, unknown>).tokensBefore === "number" ? Number((m as Record<string, unknown>).tokensBefore) : undefined } } as unknown as Turn);
                }
                continue;
            } else {
                // other unknown roles (branchSummary, bashExecution, etc.)
                // try to extract text safely, never JSON-stringify the whole envelope
                let text = "";
                const content = (m as Record<string, unknown>).content;
                if (typeof content === "string") text = content;
                else if (Array.isArray(content)) {
                    text = (content as unknown[])
                        .map((c) =>
                            c && typeof c === "object" && "text" in (c as Record<string, unknown>)
                                ? String((c as Record<string, unknown>).text ?? "")
                                : typeof c === "string"
                                    ? c
                                    : "",
                        )
                        .filter(Boolean)
                        .join("\n");
                } else if (typeof (m as Record<string, unknown>).text === "string") {
                    text = String((m as Record<string, unknown>).text);
                }
                if (!text.trim()) continue;
                if (!cur) cur = { user: null, text: "", workItems: [], timestamp: null };
                stamp(m);
                cur.text += (cur.text ? "\n\n" : "") + text;
            }
        }
        flush();
        return out;
    }, [msgs]);

    const lastTurnWithWork = useMemo(() => {
        for (let i = turns.length - 1; i >= 0; i--) {
            if (turns[i].workItems.length > 0) return i;
        }
        return -1;
    }, [turns]);

    const lastAssistantIndex = useMemo(() => {
        for (let i = turns.length - 1; i >= 0; i--) {
            if (turns[i].text.trim()) return i;
        }
        return -1;
    }, [turns]);

    return (
        <div className="w-full min-w-0 space-y-0 pb-8 pt-3">
            {turns.map((turn, idx) => {
                if ((turn as unknown as { __compactionMeta?: unknown }).__compactionMeta) {
                    const meta = (turn as unknown as { __compactionMeta: { summary: string; timestamp?: string; tokensBefore?: number; fromHook?: boolean } }).__compactionMeta;
                    return (
                        <div key={`c-${idx}`} className="phi-compaction-appear">
                            <div className="min-h-0 overflow-hidden py-2">
                                <CompactionSummary summary={meta.summary} tokensBefore={meta.tokensBefore} timestamp={meta.timestamp} fromHook={meta.fromHook} />
                            </div>
                        </div>
                    );
                }
                return (
                    <TurnRow
                        key={idx}
                        turn={turn}
                        toolResults={toolResults}
                        hideWork={
                            hideLastWork &&
                            idx === lastTurnWithWork &&
                            lastTurnWithWork === turns.length - 1
                        }
                        animateWorkCollapse={justFinishedStreaming && idx === lastTurnWithWork}
                        isLatestAssistant={idx === lastAssistantIndex}
                        onUndo={onUndo}
                        undoDisabled={isStreaming}
                    />
                );
            })}
        </div>
    );
});
