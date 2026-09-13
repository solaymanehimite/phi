// Characterization tests: tab promotion and closure.
// Covers the pure core in `src/lib/tabs.ts` used by `src/App.tsx`:
// a draft tab becomes its session tab in place, and closing the last
// chat tab swaps in a fresh draft (always-one-chat-tab invariant).

import { describe, expect, test } from "bun:test";
import { closeTab, nextTabAfterClose, promoteDraftTab } from "../tabs";

const isDraft = (id: string) => id.startsWith("phi:new:");
const isChatTab = (id: string) => id !== "phi:settings" && id !== "phi:ui-demo";

describe("promoteDraftTab", () => {
    test("draft becomes the session tab in place, preserving order", () => {
        const { ids, retiredDraftId } = promoteDraftTab(
            ["s1", "phi:new:1", "s2"],
            "phi:new:1",
            "/sessions/abc.jsonl",
        );
        expect(ids).toEqual(["s1", "/sessions/abc.jsonl", "s2"]);
        expect(retiredDraftId).toBe("phi:new:1");
    });

    test("promoting an already-open session leaves the list alone", () => {
        const open = ["s1", "phi:new:1"];
        const { ids, retiredDraftId } = promoteDraftTab(open, "phi:new:1", "s1");
        expect(ids).toBe(open);
        expect(retiredDraftId).toBeNull();
    });

    test("no active draft appends the session tab", () => {
        const { ids, retiredDraftId } = promoteDraftTab(["s1"], null, "s2");
        expect(ids).toEqual(["s1", "s2"]);
        expect(retiredDraftId).toBeNull();
    });
});

describe("closeTab", () => {
    test("closing a middle tab activates the next tab", () => {
        const { ids, removedIndex } = closeTab(["s1", "s2", "s3"], "s2", {
            isChatTab,
            makeFreshId: () => "phi:new:9",
        });
        expect(ids).toEqual(["s1", "s3"]);
        expect(nextTabAfterClose(ids, removedIndex)).toBe("s3");
    });

    test("closing the last tab activates the previous one", () => {
        const { ids, removedIndex } = closeTab(["s1", "s2"], "s2", {
            isChatTab,
            makeFreshId: () => "phi:new:9",
        });
        expect(ids).toEqual(["s1"]);
        expect(nextTabAfterClose(ids, removedIndex)).toBe("s1");
    });

    test("closing the last chat tab swaps in a fresh draft", () => {
        const { ids, removedIndex } = closeTab(["phi:new:1"], "phi:new:1", {
            isChatTab,
            makeFreshId: () => "phi:new:2",
        });
        expect(ids).toEqual(["phi:new:2"]);
        expect(nextTabAfterClose(ids, removedIndex)).toBe("phi:new:2");
    });

    test("special tabs do not satisfy the chat-tab invariant", () => {
        const { ids } = closeTab(["phi:settings", "s1"], "s1", {
            isChatTab,
            makeFreshId: () => "phi:new:7",
        });
        expect(ids).toEqual(["phi:settings", "phi:new:7"]);
    });

    test("closing an unknown tab is a no-op", () => {
        const open = ["s1"];
        const { ids, removedIndex } = closeTab(open, "nope", {
            isChatTab,
            makeFreshId: () => "phi:new:7",
        });
        expect(ids).toBe(open);
        expect(removedIndex).toBe(-1);
    });

    test("draft predicate matches the app prefix", () => {
        expect(isDraft("phi:new:3")).toBe(true);
        expect(isDraft("/sessions/a.jsonl")).toBe(false);
    });
});
