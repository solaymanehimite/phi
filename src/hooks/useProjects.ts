import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { createProjectId, normalizeProjectPath, sanitizeProjects, type Project } from "../lib/projects";

export type NewProjectInput = { name: string; path: string };

export function useProjects() {
    const [stored, setStored] = useLocalStorage<Project[]>("phi:projects", [], {
        serialize: JSON.stringify,
        deserialize: (value) => {
            try { return sanitizeProjects(JSON.parse(value)); } catch { return []; }
        },
    });
    const projects = useMemo(() => sanitizeProjects(stored), [stored]);
    const persist = useCallback((updater: (projects: Project[]) => Project[]) => {
        setStored((current) => updater(sanitizeProjects(current)));
    }, [setStored]);

    const addProject = useCallback((input: NewProjectInput, homeCwd?: string): Project => {
        const path = normalizeProjectPath(input.path, homeCwd);
        if (!path) throw new Error("Project path is required");
        const name = input.name.trim() || path;
        const existing = projects.find((project) => project.path === path);
        const result = existing ? { ...existing, name } : { id: createProjectId(), name, path, createdAt: Date.now() };
        persist((current) => current.some((project) => project.path === path)
            ? current.map((project) => project.path === path ? { ...project, name } : project)
            : [...current, result]);
        return result;
    }, [persist, projects]);

    const removeProject = useCallback((id: string) => {
        persist((projects) => projects.filter((project) => project.id !== id));
    }, [persist]);

    const renameProject = useCallback((id: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        persist((projects) => projects.map((project) => project.id === id ? { ...project, name: trimmed } : project));
    }, [persist]);

    return { projects, addProject, removeProject, renameProject };
}
