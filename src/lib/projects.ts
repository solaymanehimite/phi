import type { SessionInfo } from "../types/session";

/** A user-curated project bound to one local workspace path. */
export type Project = {
    id: string;
    name: string;
    path: string;
    createdAt: number;
};

/** Explicit user projects plus implicit entries derived from local Sessions. */
export type ProjectOption = Project & { implicit: boolean };

export type ProjectGroup = {
    project: ProjectOption;
    sessions: SessionInfo[];
};

export function toProjectOption(project: Project): ProjectOption {
    return { ...project, implicit: false };
}

/** Read persisted local Projects. */
export function sanitizeProjects(value: unknown): Project[] {
    if (!Array.isArray(value)) return [];
    const out: Project[] = [];
    const seenIds = new Set<string>();
    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const raw = item as { id?: unknown; name?: unknown; path?: unknown; createdAt?: unknown; targets?: { local?: unknown } };
        const id = typeof raw.id === "string" && raw.id ? raw.id : createProjectId();
        if (seenIds.has(id)) continue;
        const legacyLocalPath = raw.targets?.local;
        const path = typeof raw.path === "string" && raw.path.trim()
            ? raw.path.trim()
            : typeof legacyLocalPath === "string" && legacyLocalPath.trim()
                ? legacyLocalPath.trim()
                : undefined;
        if (!path) continue;
        seenIds.add(id);
        out.push({
            id,
            name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : path,
            path,
            createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
        });
    }
    return out;
}

export function implicitProjectName(cwd: string, homeCwd?: string): string {
    if (homeCwd && cwd === homeCwd) return "~";
    return basenameOfPath(cwd) || cwd;
}

/** Merge explicit projects with unclaimed local Session workspaces. */
export function resolveProjectOptions(explicit: Project[], cwds: string[], homeCwd?: string): ProjectOption[] {
    const covered = new Set(explicit.map((project) => project.path));
    const out = explicit.map(toProjectOption);
    for (const cwd of cwds) {
        if (!cwd.startsWith("/") || covered.has(cwd)) continue;
        covered.add(cwd);
        out.push({
            id: `implicit:${cwd}`,
            name: implicitProjectName(cwd, homeCwd),
            path: cwd,
            createdAt: 0,
            implicit: true,
        });
    }
    return out;
}

export function createProjectId(): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    } catch {
        // Fall through to the portable id below.
    }
    return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeProjectPath(path: string, homeCwd?: string): string {
    let next = path.trim();
    if (!next) return "";
    if (next === "~" && homeCwd) return homeCwd;
    if (next.startsWith("~/") && homeCwd) next = `${homeCwd}/${next.slice(2)}`;
    while (next.length > 1 && next.endsWith("/")) next = next.slice(0, -1);
    return next;
}

export function basenameOfPath(path: string): string {
    if (!path) return "";
    const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    return trimmed.split("/").filter(Boolean).pop() || trimmed;
}

export function formatProjectPath(path: string): string {
    if (!path) return "";
    const match = path.match(/^\/home\/[^/]+/);
    return match ? path.replace(match[0], "~") : path;
}

/** Sessions belonging to a local project, newest first. */
export function sessionsForProject(sessions: SessionInfo[], option: ProjectOption): SessionInfo[] {
    return sessions
        .filter((session) => session.cwd === option.path)
        .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
}
