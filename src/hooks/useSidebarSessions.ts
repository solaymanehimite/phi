import { useMemo } from "react";
import type { ProjectGroup, ProjectOption } from "../lib/projects";
import type { SessionInfo } from "../types/session";

type SidebarSessionCollections = {
    pinnedSessions: SessionInfo[];
    archivedSessions: SessionInfo[];
    projectGroups: ProjectGroup[];
    orphanCount: number;
};

const modifiedDesc = (left: SessionInfo, right: SessionInfo) =>
    new Date(right.modified).getTime() - new Date(left.modified).getTime();

export function useSidebarSessions(
    sessions: SessionInfo[],
    projects: ProjectOption[],
    pinned: ReadonlySet<string>,
    archived: ReadonlySet<string>,
): SidebarSessionCollections {
    return useMemo(() => {
        const pinnedSessions: SessionInfo[] = [];
        const archivedSessions: SessionInfo[] = [];
        const sessionsByCwd = new Map<string, SessionInfo[]>();
        let orphanCount = 0;

        for (const session of sessions) {
            if (archived.has(session.path)) {
                archivedSessions.push(session);
                continue;
            }
            if (pinned.has(session.path)) {
                pinnedSessions.push(session);
                continue;
            }
            const bucket = sessionsByCwd.get(session.cwd);
            if (bucket) bucket.push(session);
            else sessionsByCwd.set(session.cwd, [session]);
        }

        const claimedPaths = new Set(projects.map((project) => project.path));
        for (const [cwd, items] of sessionsByCwd) {
            if (!claimedPaths.has(cwd)) orphanCount += items.length;
        }

        const projectGroups = projects.flatMap((project) => {
            const items = sessionsByCwd.get(project.path);
            if (!items?.length) return [];
            return [{ project, sessions: [...items].sort(modifiedDesc) }];
        });

        pinnedSessions.sort(modifiedDesc);
        archivedSessions.sort(modifiedDesc);

        return { pinnedSessions, archivedSessions, projectGroups, orphanCount };
    }, [sessions, projects, pinned, archived]);
}
