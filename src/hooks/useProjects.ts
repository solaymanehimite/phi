import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import {
    createProjectId,
    normalizeProjectPath,
    type Project,
} from "../lib/projects";

export type NewProjectInput = {
    name: string;
    path: string;
};

function sanitizeProjects(value: unknown): Project[] {
    if (!Array.isArray(value)) return [];
    const out: Project[] = [];
    const seenPaths = new Set<string>();
    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const p = item as Partial<Project>;
        if (typeof p.path !== "string" || !p.path.trim()) continue;
        const path = p.path.trim();
        if (seenPaths.has(path)) continue;
        seenPaths.add(path);
        out.push({
            id: typeof p.id === "string" && p.id ? p.id : createProjectId(),
            name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : path,
            path,
            createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
        });
    }
    return out;
}

export function useProjects() {
    const [stored, setStored] = useLocalStorage<Project[]>("phi:projects", [], {
        serialize: (v) => JSON.stringify(v),
        deserialize: (s) => {
            try {
                return sanitizeProjects(JSON.parse(s));
            } catch {
                return [];
            }
        },
    });

    const projects = useMemo(() => sanitizeProjects(stored), [stored]);

    const addProject = useCallback(
        (input: NewProjectInput, homeCwd?: string): Project => {
            const path = normalizeProjectPath(input.path, homeCwd);
            if (!path) throw new Error("Project path is required");
            const name = input.name.trim() || path;
            // Compute the result from current state first, then store it.
            // The old code read the id back out of the state updater, which
            // React is free to run later, so the fallback could return an id
            // that was never stored.
            const existing = projects.find((p) => p.path === path);
            const result: Project = existing
                ? { ...existing, name }
                : { id: createProjectId(), name, path, createdAt: Date.now() };
            setStored((prev) => {
                const list = sanitizeProjects(prev);
                if (list.some((p) => p.path === path)) {
                    return list.map((p) => (p.path === path ? { ...p, name } : p));
                }
                return [...list, result];
            });
            return result;
        },
        [projects, setStored],
    );

    const removeProject = useCallback(
        (id: string) => {
            setStored((prev) => sanitizeProjects(prev).filter((p) => p.id !== id));
        },
        [setStored],
    );

    const updateProject = useCallback(
        (id: string, patch: Partial<Pick<Project, "name" | "path">>, homeCwd?: string) => {
            setStored((prev) =>
                sanitizeProjects(prev).map((p) => {
                    if (p.id !== id) return p;
                    const nextPath =
                        patch.path !== undefined ? normalizeProjectPath(patch.path, homeCwd) || p.path : p.path;
                    return {
                        ...p,
                        name: patch.name !== undefined ? patch.name.trim() || p.name : p.name,
                        path: nextPath,
                    };
                }),
            );
        },
        [setStored],
    );

    const findByPath = useCallback(
        (path: string | null | undefined): Project | undefined => {
            if (!path) return undefined;
            return projects.find((p) => p.path === path);
        },
        [projects],
    );

    return { projects, addProject, removeProject, updateProject, findByPath };
}
