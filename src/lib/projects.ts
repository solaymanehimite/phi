import type { SessionInfo } from "../types/session";

/** A user-curated project: a name pointing at a workspace directory. */
export type Project = {
    id: string;
    name: string;
    /** Absolute workspace path. Sessions join a project via exact cwd match. */
    path: string;
    createdAt: number;
};

/**
 * A project as displayed: either an explicit user-curated entry or an
 * implicit one derived from a session directory with no explicit entry.
 * Implicit projects take the folder name as their name.
 */
export type ProjectOption = {
    id: string;
    name: string;
    path: string;
    implicit: boolean;
};

export type ProjectGroup = {
    project: ProjectOption;
    sessions: SessionInfo[];
};

export function toProjectOption(project: Project): ProjectOption {
    return {
        id: project.id,
        name: project.name,
        path: project.path,
        implicit: false,
    };
}

export function implicitProjectName(cwd: string, homeCwd?: string): string {
    if (homeCwd && cwd === homeCwd) return "~";
    return basenameOfPath(cwd) || cwd;
}

/**
 * Merge explicit projects with implicit entries for session directories that
 * have no explicit entry. Explicit projects keep their stored order first;
 * implicit entries follow in session-recency order. Non-absolute cwds
 * (e.g. "(unknown)") are skipped — those sessions stay reachable via search.
 */
export function resolveProjectOptions(
    explicit: Project[],
    groupCwds: string[],
    homeCwd?: string,
): ProjectOption[] {
    const seen = new Set<string>();
    const out: ProjectOption[] = [];
    for (const project of explicit) {
        if (seen.has(project.path)) continue;
        seen.add(project.path);
        out.push(toProjectOption(project));
    }
    for (const cwd of groupCwds) {
        if (seen.has(cwd)) continue;
        if (!cwd.startsWith("/")) continue;
        seen.add(cwd);
        out.push({
            id: `implicit:${cwd}`,
            name: implicitProjectName(cwd, homeCwd),
            path: cwd,
            implicit: true,
        });
    }
    return out;
}

export function createProjectId(): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return crypto.randomUUID();
        }
    } catch {
        // fall through to manual id
    }
    return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeProjectPath(path: string, homeCwd?: string): string {
    let next = path.trim();
    if (!next) return "";
    if (next === "~" && homeCwd) return homeCwd;
    if (next.startsWith("~/") && homeCwd) {
        next = `${homeCwd}/${next.slice(2)}`;
    }
    // strip trailing slashes (keep root)
    while (next.length > 1 && next.endsWith("/")) {
        next = next.slice(0, -1);
    }
    return next;
}

export function basenameOfPath(path: string): string {
    if (!path) return "";
    const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    const parts = trimmed.split("/").filter(Boolean);
    return parts.pop() || trimmed;
}

export function formatProjectPath(path: string): string {
    if (!path) return "";
    const m = path.match(/^\/home\/[^/]+/);
    return m ? path.replace(m[0], "~") : path;
}

/** Sessions belonging to a project, newest first. */
export function sessionsForProject(sessions: SessionInfo[], projectPath: string): SessionInfo[] {
    return sessions
        .filter((s) => s.cwd === projectPath)
        .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
}
