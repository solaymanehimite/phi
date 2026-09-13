// Pure undo/redo turn-selection helpers, extracted verbatim from
// `server/index.ts`. Conversation nav is pointer moves on the append-only
// session tree; these pick the target without touching the runtime.

export type TurnRecord = {
    id: string;
    kind: "prompt" | "continue" | "compact";
    beforeLeaf: string | null;
    afterLeaf: string | null;
    beforeTree: string | null;
    afterTree: string | null;
    head: string | null;
    repoRoot: string | null;
    ts: number;
};

/**
 * Latest turn whose end is on the visible branch (root→leaf). Exact match is
 * the common case; ancestor match tolerates metadata entries appended between
 * turns (model/thinking changes, renames), which move the leaf without
 * touching files. Walks newest-first so chains resolve to the latest turn.
 */
export function findUndoTurn(turns: TurnRecord[], branchIds: Set<string>): TurnRecord | undefined {
    for (let i = turns.length - 1; i >= 0; i--) {
        const afterLeaf = turns[i]?.afterLeaf;
        if (afterLeaf && branchIds.has(afterLeaf)) return turns[i];
    }
    return undefined;
}

/** Restart/eviction fallback: undo target is the parent of the last user message on the visible branch. */
export function undoFallbackTarget(sm: any): string | null | undefined {
    let path: any[] = [];
    try {
        path = sm.getBranch();
    } catch {
        return undefined;
    }
    for (let i = path.length - 1; i >= 0; i--) {
        const e = path[i];
        if (e?.type === "message" && (e as any).message?.role === "user") {
            return (e.parentId ?? null) as string | null;
        }
    }
    return undefined;
}
