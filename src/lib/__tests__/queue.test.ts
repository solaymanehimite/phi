// Characterization tests: per-session message queue ordering.
// Covers the pure core in `src/lib/queue.ts` used by `useMessageQueue`:
// enqueue, head-first drain, edit, remove, sendability.

import { describe, expect, test } from "bun:test";
import {
    appendQueuedMessage,
    createQueuedMessage,
    removeQueuedMessage,
    sanitizeQueuedItems,
    shiftQueuedMessage,
    updateQueuedMessageText,
    type QueuedMessage,
} from "../queue";

function item(id: string, text: string): QueuedMessage {
    return { id, text, createdAt: 1 };
}

describe("createQueuedMessage", () => {
    test("builds a trimmed item", () => {
        const msg = createQueuedMessage("  hello  ");
        expect(msg?.text).toBe("hello");
        expect(typeof msg?.id).toBe("string");
    });

    test("blank text without images yields null", () => {
        expect(createQueuedMessage("   ")).toBeNull();
    });

    test("blank text with an image is sendable", () => {
        const msg = createQueuedMessage("  ", [{ type: "image", data: "abc", mimeType: "image/png" }]);
        expect(msg?.text).toBe("");
        expect(msg?.images).toHaveLength(1);
    });
});

describe("queue ordering", () => {
    test("enqueue appends; shift drains head first (FIFO)", () => {
        let q: QueuedMessage[] = [];
        q = appendQueuedMessage(q, item("a", "first"));
        q = appendQueuedMessage(q, item("b", "second"));
        q = appendQueuedMessage(q, item("c", "third"));
        const first = shiftQueuedMessage(q);
        expect(first.head?.id).toBe("a");
        const second = shiftQueuedMessage(first.rest);
        expect(second.head?.id).toBe("b");
        expect(second.rest.map((m) => m.id)).toEqual(["c"]);
    });

    test("shifting an empty queue yields null head", () => {
        const { head, rest } = shiftQueuedMessage([]);
        expect(head).toBeNull();
        expect(rest).toEqual([]);
    });

    test("update edits text in place, preserving order", () => {
        const q = [item("a", "first"), item("b", "second")];
        const next = updateQueuedMessageText(q, "a", "  edited  ");
        expect(next.map((m) => m.id)).toEqual(["a", "b"]);
        expect(next[0].text).toBe("edited");
    });

    test("blank update text is ignored", () => {
        const q = [item("a", "first")];
        expect(updateQueuedMessageText(q, "a", "   ")).toEqual(q);
    });

    test("remove drops the item by id", () => {
        const q = [item("a", "first"), item("b", "second")];
        expect(removeQueuedMessage(q, "a").map((m) => m.id)).toEqual(["b"]);
        expect(removeQueuedMessage(q, "missing")).toHaveLength(2);
    });

    test("sanitize keeps only sendable persisted items", () => {
        const out = sanitizeQueuedItems([
            { id: "a", text: "ok", createdAt: 1 },
            { id: "b", text: "   ", createdAt: 1 },
            { id: "c", text: "", images: [{ type: "image", data: "x", mimeType: "image/png" }], createdAt: 1 },
            null,
            { id: "d", createdAt: 1 },
        ]);
        expect(out.map((m) => (m as QueuedMessage).id)).toEqual(["a", "c"]);
    });
});
