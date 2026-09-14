import { LOCAL_HOST_ID } from "../hooks/useHosts";
import type { SessionInfo } from "../types/session";
import { hostOfSession } from "./hosts";

/**
 * A user-curated project: a name with one workspace path per run target.
 * The same project can be set up on many machines; each binding maps a
 * host id to that host's absolute workspace path. Sessions join a project
 * when their (host, cwd) matches one of its bindings.
 */
export type Project = {
    id: string;
    name: string;
    /** Run-target bindings: host id -> absolute workspace path on that host. */
    targets: Record<string, string>;
    createdAt: number;
};

/** Legacy shape (pre targets): a single local path. Migrated on load. */
type LegacyProject = {
    id?: string;
    name?: string;
    path: string;
    createdAt?: number;
};

/**
 * A project as displayed: either an explicit user-curated entry or an
 * implicit one derived from a single (host, session directory) pair with
 * no explicit binding. Implicit projects take the folder name as their name.
 */
export type ProjectOption =
    | { id: string; name: string; implicit: false; targets: Record<string, string> }
    | { id: string; name: string; implicit: true; hostId: string; path: string };

export type ProjectGroup = {
    project: ProjectOption;
    sessions: SessionInfo[];
};

export function toProjectOption(project: Project): ProjectOption {
    return {
        id: project.id,
        name: project.name,
        implicit: false,
        targets: { ...project.targets },
    };
}

/** Migrate stored projects (including the legacy single-path shape). */
export function sanitizeProjects(value: unknown): Project[] {
    if (!Array.isArray(value)) return [];
    const out: Project[] = [];
    const seenIds = new Set<string>();
    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const p = item as Partial<Project> & LegacyProject;
        const id = typeof p.id === "string" && p.id ? p.id : createProjectId();
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const targets: Record<string, string> = {};
        if (p.targets && typeof p.targets === "object") {
            for (const [hostId, path] of Object.entries(p.targets)) {
                if (typeof path === "string" && path.trim()) targets[hostId] = path.trim();
            }
        }
        // Legacy single-path projects bind to the local host.
        if (Object.keys(targets).length === 0 && typeof p.path === "string" && p.path.trim()) {
            targets[LOCAL_HOST_ID] = p.path.trim();
        }
        if (Object.keys(targets).length === 0) continue;
        const firstPath = Object.values(targets)[0];
        out.push({
            id,
            name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : firstPath,
            targets,
            createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
        });
    }
    return out;
}

export function implicitProjectName(cwd: string, homeCwd?: string): string {
    if (homeCwd && cwd === homeCwd) return "~";
    return basenameOfPath(cwd) || cwd;
}

/**
 * Merge explicit projects with implicit entries for (host, directory) pairs
 * that have no explicit binding. Explicit projects keep their stored order
 * first; implicit entries follow in session-recency order. Non-absolute cwds
 * (e.g. "(unknown)") are skipped — those sessions stay reachable via search.
 */
export function resolveProjectOptions(
    explicit: Project[],
    bindings: Array<{ hostId: string; cwd: string }>,
    homeCwd?: string,
): ProjectOption[] {
    const covered = new Set<string>();
    const out: ProjectOption[] = [];
    for (const project of explicit) {
        for (const [hostId, path] of Object.entries(project.targets)) {
            covered.add(`${hostId}\n${path}`);
        }
        out.push(toProjectOption(project));
    }
    for (const { hostId, cwd } of bindings) {
        if (covered.has(`${hostId}\n${cwd}`)) continue;
        covered.add(`${hostId}\n${cwd}`);
        if (!cwd.startsWith("/")) continue;
        out.push({
            id: `implicit:${hostId}:${cwd}`,
            name: implicitProjectName(cwd, homeCwd),
            implicit: true,
            hostId,
            path: cwd,
        });
    }
    return out;
}

/** Workspace path of a project option on a given host, if bound. */
export function projectPathFor(option: ProjectOption, hostId: string): string | null {
    if (option.implicit) return option.hostId === hostId ? option.path : null;
    return option.targets[hostId] ?? null;
}

/** Host ids a project option can run on. */
export function boundHostIds(option: ProjectOption): string[] {
    if (option.implicit) return [option.hostId];
    return Object.keys(option.targets);
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

/** Sessions belonging to a project option, newest first. */
export function sessionsForProject(sessions: SessionInfo[], option: ProjectOption): SessionInfo[] {
    const list = sessions.filter((s) => {
        const hostId = hostOfSession(s);
        if (option.implicit) return hostId === option.hostId && s.cwd === option.path;
        return option.targets[hostId] === s.cwd;
    });
    return list.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
}
