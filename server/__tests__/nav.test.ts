// Characterization tests: undo turn selection.
// Covers `server/nav.ts` (used by /api/undo): latest turn on the visible
// branch, ancestor match, and the restart/eviction fallback to the parent
// of the last user message.

import { describe, expect, test } from "bun:test";
import { findUndoTurn, undoFallbackTarget, type TurnRecord } from "../nav";

function turn(id: string, afterLeaf: string | null): TurnRecord {
    return {
        id,
        kind: "prompt",
        beforeLeaf: null,
        afterLeaf,
        beforeTree: null,
        afterTree: null,
        head: null,
        repoRoot: null,
        ts: 1,
    };
}

describe("findUndoTurn", () => {
    test("picks the latest turn whose end is on the visible branch", () => {
        const turns = [turn("t1", "a"), turn("t2", "b"), turn("t3", "c")];
        expect(findUndoTurn(turns, new Set(["a", "b", "c"]))?.id).toBe("t3");
    });

    test("skips turns whose end left the visible branch", () => {
        const turns = [turn("t1", "a"), turn("t2", "forked")];
        expect(findUndoTurn(turns, new Set(["a", "leaf"]))?.id).toBe("t1");
    });

    test("matches an ancestor leaf (metadata moved the leaf)", () => {
        const turns = [turn("t1", "ancestor")];
        expect(findUndoTurn(turns, new Set(["ancestor", "meta1", "leaf"]))?.id).toBe("t1");
    });

    test("yields undefined when nothing is on the branch", () => {
        expect(findUndoTurn([turn("t1", "x")], new Set(["y"]))).toBeUndefined();
        expect(findUndoTurn([], new Set(["y"]))).toBeUndefined();
    });
});

describe("undoFallbackTarget", () => {
    test("returns the parent of the last user message on the branch", () => {
        const sm = {
            getBranch: () => [
                { type: "message", id: "u1", parentId: "root", message: { role: "user" } },
                { type: "message", id: "a1", parentId: "u1", message: { role: "assistant" } },
                { type: "message", id: "u2", parentId: "a1", message: { role: "user" } },
            ],
        };
        expect(undoFallbackTarget(sm)).toBe("a1");
    });

    test("yields undefined when no user message is on the branch", () => {
        const sm = { getBranch: () => [{ type: "message", id: "a1", parentId: "r", message: { role: "assistant" } }] };
        expect(undoFallbackTarget(sm)).toBeUndefined();
    });

    test("yields undefined when the branch cannot be read", () => {
        const sm = {
            getBranch: () => {
                throw new Error("evicted");
            },
        };
        expect(undoFallbackTarget(sm)).toBeUndefined();
    });
});
