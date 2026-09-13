// Pure per-session queue operations. `useMessageQueue` owns persistence
// (localStorage envelope, expiry) and React state; everything list-shaped
// lives here so ordering is unit testable without rendering hooks.

export type QueuedImage = {
    type: "image";
    data: string;
    mimeType: string;
};

export type QueuedMessage = {
    id: string;
    text: string;
    images?: QueuedImage[];
    createdAt: number;
};

/** Build a queue item, or null when there is nothing to send. */
export function createQueuedMessage(text: string, images?: QueuedImage[]): QueuedMessage | null {
    const trimmed = text.trim();
    if (!trimmed && (!images || images.length === 0)) return null;
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        images: images?.length ? [...images] : undefined,
        createdAt: Date.now(),
    };
}

/** Append to the tail; draining is always head-first (FIFO). */
export function appendQueuedMessage(items: QueuedMessage[], item: QueuedMessage): QueuedMessage[] {
    return [...items, item];
}

/** Remove and return the head of the queue. Empty queue yields null head. */
export function shiftQueuedMessage(items: QueuedMessage[]): {
    head: QueuedMessage | null;
    rest: QueuedMessage[];
} {
    if (items.length === 0) return { head: null, rest: items };
    const [head, ...rest] = items;
    return { head, rest };
}

export function removeQueuedMessage(items: QueuedMessage[], id: string): QueuedMessage[] {
    return items.filter((item) => item.id !== id);
}

/** Edit an item's text. Blank edits are ignored (item returned unchanged). */
export function updateQueuedMessageText(items: QueuedMessage[], id: string, text: string): QueuedMessage[] {
    const trimmed = text.trim();
    if (!trimmed) return items;
    return items.map((item) => (item.id === id ? { ...item, text: trimmed } : item));
}

/** Keep only sendable items from a persisted payload (mirrors readQueue). */
export function sanitizeQueuedItems(value: unknown): QueuedMessage[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (item) =>
            item &&
            typeof item === "object" &&
            typeof (item as QueuedMessage).text === "string" &&
            ((item as QueuedMessage).text.trim() || ((item as QueuedMessage).images?.length ?? 0) > 0),
    ) as QueuedMessage[];
}
