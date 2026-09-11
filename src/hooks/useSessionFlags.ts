import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";

function sanitizePaths(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
        if (typeof item !== "string" || !item) continue;
        if (seen.has(item)) continue;
        seen.add(item);
        out.push(item);
    }
    return out;
}

function deserializePaths(s: string): string[] {
    try {
        return sanitizePaths(JSON.parse(s));
    } catch {
        return [];
    }
}

/**
 * App-local pinned / archived session flags, stored as session-path lists in
 * localStorage. Pinned sessions move to the Pinned group above Projects;
 * archived sessions move to the Archived group in the sidebar footer. The two
 * flags are mutually exclusive — archiving unpins, pinning unarchives.
 * Stale paths (deleted sessions) are simply never matched and pruned on remove.
 */
export function useSessionFlags() {
    const [pinnedList, setPinnedList] = useLocalStorage<string[]>(
        "phi:sessions:pinned-v1",
        [],
        {
            serialize: (v) => JSON.stringify(v),
            deserialize: deserializePaths,
        },
    );
    const [archivedList, setArchivedList] = useLocalStorage<string[]>(
        "phi:sessions:archived-v1",
        [],
        {
            serialize: (v) => JSON.stringify(v),
            deserialize: deserializePaths,
        },
    );

    const pinned = useMemo(() => new Set(pinnedList), [pinnedList]);
    const archived = useMemo(() => new Set(archivedList), [archivedList]);

    const togglePin = useCallback(
        (file: string) => {
            setArchivedList((prev) => sanitizePaths(prev).filter((f) => f !== file));
            setPinnedList((prev) => {
                const list = sanitizePaths(prev);
                return list.includes(file)
                    ? list.filter((f) => f !== file)
                    : [...list, file];
            });
        },
        [setPinnedList, setArchivedList],
    );

    const toggleArchive = useCallback(
        (file: string) => {
            setPinnedList((prev) => sanitizePaths(prev).filter((f) => f !== file));
            setArchivedList((prev) => {
                const list = sanitizePaths(prev);
                return list.includes(file)
                    ? list.filter((f) => f !== file)
                    : [...list, file];
            });
        },
        [setPinnedList, setArchivedList],
    );

    const removeFile = useCallback(
        (file: string) => {
            setPinnedList((prev) => sanitizePaths(prev).filter((f) => f !== file));
            setArchivedList((prev) => sanitizePaths(prev).filter((f) => f !== file));
        },
        [setPinnedList, setArchivedList],
    );

    return { pinned, archived, togglePin, toggleArchive, removeFile };
}
