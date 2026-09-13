import type { WorkItem, WorkOrder } from "../types/work";

// Pure stream-event helpers, extracted verbatim from `src/hooks/useChat.ts`.
// `useChat` imports these; both the prompt and continuation paths share them.
// No React state here — safe to unit test without mocking fetch or SSE.

export function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

export function compareWorkOrder(a: WorkOrder, b: WorkOrder): number {
    return a.message - b.message || a.content - b.content;
}

export function insertWorkItem(items: WorkItem[], item: WorkItem): WorkItem[] {
    const existingIndex = items.findIndex((current) => current.id === item.id);
    const next = [...items];
    if (existingIndex >= 0) {
        next[existingIndex] = {
            ...next[existingIndex],
            ...item,
            order: next[existingIndex].order,
        } as WorkItem;
    } else {
        next.push(item);
    }
    next.sort((a, b) => compareWorkOrder(a.order, b.order));
    return next;
}

export function patchWorkItem(items: WorkItem[], id: string, patch: Record<string, unknown>): WorkItem[] {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return items;
    const next = [...items];
    next[index] = { ...next[index], ...patch } as WorkItem;
    return next;
}

export function toolCallFromAssistantEvent(event: Record<string, unknown>): {
    id: string;
    name: string;
    args: Record<string, unknown>;
} | null {
    const direct = asRecord(event.toolCall);
    const partial = asRecord(event.partial);
    const content = Array.isArray(partial.content) ? partial.content : [];
    const contentIndex = typeof event.contentIndex === "number" ? event.contentIndex : -1;
    const block = contentIndex >= 0 ? asRecord(content[contentIndex]) : {};
    const call = Object.keys(direct).length > 0 ? direct : block;
    const id = typeof call.id === "string" ? call.id : "";
    const name = typeof call.name === "string" ? call.name : "";
    if (!id || !name) return null;
    return {
        id,
        name,
        args: asRecord(call.arguments ?? call.args),
    };
}

/**
 * Custom notice text carried by a message_start/message_end event message.
 * Returns the trimmed notice, or "" when the message is not a visible
 * custom notice (wrong role, display === false, empty content).
 */
export function extractCustomNotice(message: unknown): string {
    const record = asRecord(message);
    if (record.role !== "custom" || record.display === false) return "";
    const messageContent = record.content;
    const notice =
        typeof messageContent === "string"
            ? messageContent
            : Array.isArray(messageContent)
              ? messageContent
                    .map((part) =>
                        part && typeof part === "object" && "text" in (part as Record<string, unknown>)
                            ? String((part as Record<string, unknown>).text ?? "")
                            : typeof part === "string"
                              ? part
                              : "",
                    )
                    .filter(Boolean)
                    .join("\n")
              : "";
    return notice.trim();
}

/**
 * Flatten a tool_execution_end `result` payload into display text.
 * String results pass through; `{ content: [{ text }] }` joins part texts;
 * anything else is JSON-truncated; nullish results yield "".
 */
export function extractToolResultText(result: unknown): string {
    if (typeof result === "string") return result;
    const resultRecord = asRecord(result);
    if (Array.isArray(resultRecord.content)) {
        return resultRecord.content.map((part) => String(asRecord(part).text ?? "")).join("\n");
    }
    if (result) return JSON.stringify(result).slice(0, 4000);
    return "";
}
