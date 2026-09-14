import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import {
    createProjectId,
    normalizeProjectPath,
    sanitizeProjects,
    type Project,
} from "../lib/projects";

export type NewProjectInput = {
    name: string;
    path: string;
    /** Run target the path lives on. Defaults to the local host. */
    hostId?: string;
};

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

    const persist = useCallback(
        (updater: (list: Project[]) => Project[]) => {
            setStored((prev) => updater(sanitizeProjects(prev)));
        },
        [setStored],
    );

    const addProject = useCallback(
        (input: NewProjectInput, homeCwd?: string): Project => {
            const path = normalizeProjectPath(input.path, homeCwd);
            if (!path) throw new Error("Project path is required");
            const hostId = input.hostId || "local";
            const name = input.name.trim() || path;
            const existing = projects.find((p) => p.targets[hostId] === path);
            const result: Project = existing
                ? { ...existing, name, targets: { ...existing.targets } }
                : { id: createProjectId(), name, targets: { [hostId]: path }, createdAt: Date.now() };
            persist((list) => {
                if (list.some((p) => p.targets[hostId] === path)) {
                    return list.map((p) => (p.targets[hostId] === path ? { ...p, name } : p));
                }
                return [...list, result];
            });
            return result;
        },
        [projects, persist],
    );

    const removeProject = useCallback(
        (id: string) => {
            persist((list) => list.filter((p) => p.id !== id));
        },
        [persist],
    );

    const renameProject = useCallback(
        (id: string, name: string) => {
            const trimmed = name.trim();
            if (!trimmed) return;
            persist((list) => list.map((p) => (p.id !== id ? p : { ...p, name: trimmed })));
        },
        [persist],
    );

    /** Bind a host's workspace path as an additional run target. */
    const setProjectTarget = useCallback(
        (id: string, hostId: string, path: string, homeCwd?: string) => {
            const normalized = normalizeProjectPath(path, homeCwd);
            if (!normalized) throw new Error("Project path is required");
            persist((list) =>
                list.map((p) =>
                    p.id !== id ? p : { ...p, targets: { ...p.targets, [hostId]: normalized } },
                ),
            );
        },
        [persist],
    );

    const removeProjectTarget = useCallback(
        (id: string, hostId: string) => {
            persist((list) =>
                list
                    .map((p) => {
                        if (p.id !== id) return p;
                        const { [hostId]: _, ...rest } = p.targets;
                        return { ...p, targets: rest };
                    })
                    // A project with no targets left is gone.
                    .filter((p) => Object.keys(p.targets).length > 0),
            );
        },
        [persist],
    );

    const findByTarget = useCallback(
        (hostId: string, path: string | null | undefined): Project | undefined => {
            if (!path) return undefined;
            return projects.find((p) => p.targets[hostId] === path);
        },
        [projects],
    );

    return { projects, addProject, removeProject, renameProject, setProjectTarget, removeProjectTarget, findByTarget };
}
