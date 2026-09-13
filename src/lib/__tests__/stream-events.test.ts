// Characterization tests: stream event reduction.
// Covers the pure core in `src/lib/stream-events.ts` shared by the prompt
// and continuation paths in `useChat`: text deltas, thinking blocks, tool
// start/update/end, custom notices, error events.

import { describe, expect, test } from "bun:test";
import {
    extractCustomNotice,
    extractToolResultText,
    insertWorkItem,
    patchWorkItem,
    toolCallFromAssistantEvent,
} from "../stream-events";
import type { WorkItem } from "../../types/work";

function thinking(id: string, message: number, content: number, text = ""): WorkItem {
    return { kind: "thinking", id, text, order: { message, content } };
}

function tool(id: string, message: number, content: number, name = "read"): WorkItem {
    return { kind: "tool", id, name, args: {}, order: { message, content } };
}

describe("insertWorkItem", () => {
    test("inserts out of order and sorts by (message, content)", () => {
        let items: WorkItem[] = [];
        items = insertWorkItem(items, tool("b", 0, 2));
        items = insertWorkItem(items, thinking("a", 0, 0, "hmm"));
        items = insertWorkItem(items, tool("c", 1, 0));
        expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    });

    test("re-inserting an id merges but preserves the original order", () => {
        let items = [tool("t1", 0, 5)];
        const renamed: WorkItem = { kind: "tool", id: "t1", name: "write", args: {}, order: { message: 9, content: 9 } };
        items = insertWorkItem(items, renamed);
        expect(items).toHaveLength(1);
        expect(items[0].order).toEqual({ message: 0, content: 5 });
        expect((items[0] as Extract<WorkItem, { kind: "tool" }>).name).toBe("write");
    });
});

describe("patchWorkItem", () => {
    test("patches the matching item", () => {
        const items = [tool("t1", 0, 1)];
        const next = patchWorkItem(items, "t1", { done: true });
        expect((next[0] as Extract<WorkItem, { kind: "tool" }>).done).toBe(true);
    });

    test("unknown id returns the same array", () => {
        const items = [tool("t1", 0, 1)];
        expect(patchWorkItem(items, "missing", { done: true })).toBe(items);
    });
});

describe("toolCallFromAssistantEvent", () => {
    test("reads a direct toolCall payload", () => {
        const call = toolCallFromAssistantEvent({
            toolCall: { id: "c1", name: "bash", arguments: { cmd: "ls" } },
        });
        expect(call).toEqual({ id: "c1", name: "bash", args: { cmd: "ls" } });
    });

    test("falls back to partial.content[contentIndex]", () => {
        const call = toolCallFromAssistantEvent({
            contentIndex: 1,
            partial: { content: [{ id: "x", name: "no" }, { id: "c2", name: "read", args: { f: "a" } }] },
        });
        expect(call?.id).toBe("c2");
        expect(call?.args).toEqual({ f: "a" });
    });

    test("returns null when id or name is missing", () => {
        expect(toolCallFromAssistantEvent({})).toBeNull();
        expect(toolCallFromAssistantEvent({ toolCall: { id: "c1" } })).toBeNull();
    });
});

describe("extractCustomNotice", () => {
    test("passes through string content", () => {
        expect(extractCustomNotice({ role: "custom", content: "  hi  " })).toBe("hi");
    });

    test("joins text parts with newlines", () => {
        expect(
            extractCustomNotice({ role: "custom", content: [{ text: "a" }, { text: "b" }, 42] }),
        ).toBe("a\nb");
    });

    test("hidden or non-custom messages yield empty string", () => {
        expect(extractCustomNotice({ role: "custom", display: false, content: "hi" })).toBe("");
        expect(extractCustomNotice({ role: "assistant", content: "hi" })).toBe("");
        expect(extractCustomNotice({ role: "custom", content: "   " })).toBe("");
    });
});

describe("extractToolResultText", () => {
    test("string results pass through", () => {
        expect(extractToolResultText("done")).toBe("done");
    });

    test("content arrays join part texts", () => {
        expect(extractToolResultText({ content: [{ text: "a" }, { text: "b" }] })).toBe("a\nb");
    });

    test("objects are JSON-truncated", () => {
        expect(extractToolResultText({ ok: true })).toBe('{"ok":true}');
    });

    test("nullish results yield empty string", () => {
        expect(extractToolResultText(null)).toBe("");
        expect(extractToolResultText(undefined)).toBe("");
    });
});
