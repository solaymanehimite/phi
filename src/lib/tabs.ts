// Pure tab-list transitions, extracted from `src/App.tsx`.
// The draft predicate is injected so this module stays UI-free:
// the app passes `isNewTabId`, tests pass a prefix check.
// Callers still own side effects (draft state, cwd maps, selection).

/**
 * A sent draft tab becomes its session tab in place, preserving tab order.
 * When the session is already open, or there is no active draft, the list
 * is extended (or left alone) exactly as `promoteNewChatTab` does.
 */
export function promoteDraftTab(
    openIds: string[],
    activeDraftId: string | null,
    file: string,
): { ids: string[]; retiredDraftId: string | null } {
    if (openIds.includes(file)) return { ids: openIds, retiredDraftId: null };
    const next = [...openIds];
    const draftIndex = activeDraftId ? next.indexOf(activeDraftId) : -1;
    if (draftIndex >= 0) {
        const retiredDraftId = next[draftIndex];
        next[draftIndex] = file;
        return { ids: next, retiredDraftId };
    }
    return { ids: [...next, file], retiredDraftId: null };
}

/**
 * Remove one tab. When no chat tab would remain, append a fresh draft tab
 * so there is always at least one chat tab. Special tabs (settings, demo)
 * are classified by the caller's `isChatTab` predicate.
 */
export function closeTab(
    openIds: string[],
    closedId: string,
    opts: { isChatTab: (id: string) => boolean; makeFreshId: () => string },
): { ids: string[]; removedIndex: number } {
    const index = openIds.indexOf(closedId);
    if (index < 0) return { ids: openIds, removedIndex: -1 };
    const filtered = openIds.filter((tabId) => tabId !== closedId);
    if (!filtered.some((tabId) => opts.isChatTab(tabId))) {
        return { ids: [...filtered, opts.makeFreshId()], removedIndex: index };
    }
    return { ids: filtered, removedIndex: index };
}

/**
 * Tab to activate after a close: prefer the tab that slid into the removed
 * slot, otherwise the previous one, otherwise none.
 */
export function nextTabAfterClose(remainingIds: string[], removedIndex: number): string | undefined {
    return remainingIds[removedIndex] ?? remainingIds[removedIndex - 1];
}
