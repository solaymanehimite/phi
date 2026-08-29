import { useCallback, useMemo, useState } from "react";
import { useClose } from "@headlessui/react";
import {
    CheckIcon,
    ChevronDownIcon,
    FolderIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    XMarkIcon,
} from "@heroicons/react/24/solid";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { isTauriRuntime, pickDirectory } from "../lib/directories";
import { formatCwd } from "../lib/paths";

export type ProjectDirectory = {
    cwd: string;
    displayCwd: string;
};

type DirectoryPickerProps = {
    cwd: string | null;
    homeCwd?: string;
    projects: ProjectDirectory[];
    onChange: (cwd: string | null) => void;
    disabled?: boolean;
};

function DirectoryPanel({
    cwd,
    homeCwd,
    projects,
    onChange,
}: Omit<DirectoryPickerProps, "disabled">) {
    const close = useClose();
    const [query, setQuery] = useState("");
    const [newProjectPath, setNewProjectPath] = useState("");
    const [showNewProject, setShowNewProject] = useState(false);
    const [browseError, setBrowseError] = useState<string | null>(null);

    const availableProjects = useMemo(() => {
        const entries = homeCwd
            ? [{ cwd: homeCwd, displayCwd: "~" }, ...projects]
            : projects;
        const seen = new Set<string>();
        return entries.filter((project) => {
            if (seen.has(project.cwd)) return false;
            seen.add(project.cwd);
            return true;
        });
    }, [homeCwd, projects]);

    const filteredProjects = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return availableProjects;
        return availableProjects.filter(
            (project) =>
                project.displayCwd.toLowerCase().includes(term) ||
                project.cwd.toLowerCase().includes(term),
        );
    }, [availableProjects, query]);

    const selectProject = useCallback(
        (projectCwd: string | null) => {
            onChange(projectCwd);
            close();
        },
        [close, onChange],
    );

    const openNewProject = useCallback(async () => {
        setBrowseError(null);
        if (!isTauriRuntime()) {
            setShowNewProject(true);
            return;
        }
        try {
            const selected = await pickDirectory(homeCwd);
            if (selected) selectProject(selected);
        } catch (error) {
            setBrowseError(error instanceof Error ? error.message : String(error));
        }
    }, [homeCwd, selectProject]);

    const useTypedProject = useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const next = newProjectPath.trim();
            if (next) selectProject(next);
        },
        [newProjectPath, selectProject],
    );

    return (
        <div className="w-full">
            <div className="-mx-2 flex items-center gap-2 border-b border-phi-border-faint px-3 pb-3 pt-1">
                <MagnifyingGlassIcon className="size-3.5 shrink-0 text-phi-text-muted" />
                <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search projects"
                    aria-label="Search projects"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-sm text-phi-text-primary outline-none placeholder:text-phi-text-muted"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="text-phi-text-muted hover:text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                        aria-label="Clear search"
                    >
                        <XMarkIcon className="size-3.5" />
                    </button>
                )}
            </div>

            <div className="max-h-56 overflow-y-auto py-1.5">
                {filteredProjects.length > 0 ? (
                    filteredProjects.map((project) => {
                        const selected = project.cwd === cwd;
                        return (
                            <button
                                key={project.cwd}
                                type="button"
                                onClick={() => selectProject(project.cwd)}
                                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 ${selected
                                        ? "bg-phi-overlay-strong text-phi-text-primary"
                                        : "text-phi-text-secondary hover:bg-phi-overlay-strong hover:text-phi-text-primary"
                                    }`}
                            >
                                <span
                                    className={`shrink-0 ${selected ? "text-phi-text-secondary" : "text-phi-text-tertiary group-hover:text-phi-text-secondary"}`}
                                >
                                    <FolderIcon className="size-4" />
                                </span>
                                <span className="min-w-0 flex-1 truncate">
                                    {project.displayCwd}
                                </span>
                                {selected && (
                                    <CheckIcon className="size-4 shrink-0 text-phi-text-secondary" />
                                )}
                            </button>
                        );
                    })
                ) : (
                    <p className="px-2.5 py-4 text-center text-[12px] text-phi-text-muted">
                        {availableProjects.length
                            ? "No matching projects"
                            : "No projects yet"}
                    </p>
                )}
            </div>

            <div className="-mx-2 border-t border-phi-border-faint px-2 pt-1.5">
                <button
                    type="button"
                    onClick={openNewProject}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-phi-text-secondary hover:bg-phi-overlay-strong hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                >
                    <span className="shrink-0 text-phi-text-tertiary group-hover:text-phi-text-secondary">
                        <PlusIcon className="size-4" />
                    </span>
                    New project
                </button>
            </div>

            {showNewProject && (
                <form
                    onSubmit={useTypedProject}
                    className="-mx-2 mt-2 flex gap-1.5 border-t border-phi-border-faint px-2 pt-2"
                >
                    <input
                        autoFocus
                        value={newProjectPath}
                        onChange={(event) => setNewProjectPath(event.target.value)}
                        placeholder="/path/to/project"
                        aria-label="Project path"
                        spellCheck={false}
                        className="min-w-0 flex-1 rounded-md border border-phi-input-border bg-phi-input-bg px-2 py-1.5 text-[12px] text-phi-text-primary outline-none placeholder:text-phi-text-muted focus:border-phi-input-border-focus"
                    />
                    <button
                        type="submit"
                        disabled={!newProjectPath.trim()}
                        className="rounded-md bg-phi-bg-inverse px-2 text-[11.5px] font-medium text-phi-text-inverse hover:bg-phi-white disabled:cursor-default disabled:bg-phi-bg-disabled disabled:text-phi-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-white/40"
                    >
                        Use
                    </button>
                </form>
            )}
            {browseError && (
                <p className="mt-1.5 px-2 text-[11px] leading-4 text-phi-error-text">
                    {browseError}
                </p>
            )}
        </div>
    );
}

export function DirectoryPicker({
    cwd,
    homeCwd,
    projects,
    onChange,
    disabled,
}: DirectoryPickerProps) {
    const label = cwd ? formatCwd(cwd) : "No project selected (~)";

    return (
        <Popover className="relative min-w-0">
            <PopoverTrigger
                disabled={disabled}
                className="group inline-flex max-w-full min-w-0 ml-4 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-phi-text-secondary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60"
                aria-label={`Change project${cwd ? `, currently ${cwd}` : ", no project selected"}`}
            >
                <FolderIcon className="size-4 shrink-0 text-phi-text-secondary" />
                <span className="min-w-0 truncate text-[12.5px] font-medium">
                    {label}
                </span>
                <ChevronDownIcon className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
            </PopoverTrigger>
            <PopoverContent
                anchor={{ to: "bottom start", gap: 8 }}
                className="w-[min(300px,calc(100vw-32px))] p-2"
            >
                <DirectoryPanel
                    cwd={cwd}
                    homeCwd={homeCwd}
                    projects={projects}
                    onChange={onChange}
                />
            </PopoverContent>
        </Popover>
    );
}
