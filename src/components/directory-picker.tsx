import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useClose } from "@headlessui/react";
import {
    IconCheckFilled,
    IconChevronDownFilled,
    IconChevronLeft,
    IconFolderFilled,
    IconFolderOpen,
    IconPencilFilled,
    IconPlusFilled,
    IconSearch,
    IconTrashFilled,
    IconXFilled,
} from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { NewProjectInput } from "../hooks/useProjects";
import { basenameOfPath, formatProjectPath, type Project, type ProjectOption } from "../lib/projects";
import { formatCwd } from "../lib/paths";
import { isTauriRuntime, pickDirectory } from "../lib/directories";

type DirectoryPickerProps = {
    /** Currently selected project path (new-chat cwd). */
    cwd: string | null;
    projects: ProjectOption[];
    onChange: (path: string | null) => void;
    onCreateProject: (input: NewProjectInput) => Project;
    onUpdateProject: (id: string, input: NewProjectInput) => void;
    onRemoveProject?: (id: string) => void;
    /** Only used as the browse dialog's starting directory — never listed. */
    homeCwd?: string;
    disabled?: boolean;
};

function ProjectForm({
    homeCwd,
    nameInputRef,
    title,
    submitLabel,
    initialName = "",
    initialPath = "",
    onBack,
    onSubmit,
}: {
    homeCwd?: string;
    nameInputRef: React.RefObject<HTMLInputElement | null>;
    title: string;
    submitLabel: string;
    initialName?: string;
    initialPath?: string;
    onBack: () => void;
    onSubmit: (input: NewProjectInput) => void;
}) {
    const [name, setName] = useState(initialName);
    const [path, setPath] = useState(initialPath);
    const [browseError, setBrowseError] = useState<string | null>(null);
    const canBrowse = isTauriRuntime();

    const browse = useCallback(async () => {
        setBrowseError(null);
        try {
            const selected = await pickDirectory(path.trim() || homeCwd);
            if (selected) {
                setPath(selected);
                setName((current) => current.trim() || basenameOfPath(selected));
            }
        } catch (error) {
            setBrowseError(error instanceof Error ? error.message : String(error));
        }
    }, [homeCwd, path]);

    const handleSubmit = useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!name.trim() || !path.trim()) return;
            onSubmit({ name: name.trim(), path: path.trim() });
        },
        [name, onSubmit, path],
    );

    const canSubmit = name.trim().length > 0 && path.trim().length > 0;

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <div className="-mx-2 flex items-center gap-1 border-b border-phi-border-faint px-2 pb-2 pt-1">
                <Button variant="icon" size="sm" onClick={onBack} aria-label="Back to projects" className="!size-7">
                    <IconChevronLeft className="size-4" />
                </Button>
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-phi-text-primary">
                    {title}
                </p>
            </div>

            <div className="py-3">
                <label
                    htmlFor="new-project-name"
                    className="mb-1.5 block px-1 text-[11px] font-medium tracking-wide text-phi-text-muted"
                >
                    Name
                </label>
                <Input
                    id="new-project-name"
                    ref={nameInputRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="My project"
                    aria-label="Project name"
                    spellCheck={false}
                    autoComplete="off"
                    variant="default"
                    className="mx-1 w-[calc(100%-8px)] !text-[13px]"
                />

                <span
                    id="new-project-path-label"
                    className="mb-1.5 mt-3 block px-1 text-[11px] font-medium tracking-wide text-phi-text-muted"
                >
                    Path
                </span>
                {canBrowse ? (
                    <div className="mx-1 flex gap-1.5">
                        <button
                            type="button"
                            onClick={() => void browse()}
                            aria-labelledby="new-project-path-label new-project-path-value"
                            title={path || "Choose a directory"}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-phi-input-border bg-phi-input-bg px-2 py-1.5 text-left focus:border-phi-input-border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                        >
                            <IconFolderOpen className="size-3.5 shrink-0 text-phi-text-tertiary" />
                            <span
                                id="new-project-path-value"
                                className={`min-w-0 flex-1 truncate text-[12px] ${path ? "text-phi-text-primary" : "text-phi-text-muted"}`}
                            >
                                {path ? formatProjectPath(path) : "Choose a directory…"}
                            </span>
                        </button>
                        {path && (
                            <button
                                type="button"
                                onClick={() => setPath("")}
                                title="Clear directory"
                                aria-label="Clear directory"
                                className="inline-flex shrink-0 items-center justify-center rounded-md border border-phi-input-border bg-phi-input-bg px-2 text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                            >
                                <IconXFilled className="size-3.5" />
                            </button>
                        )}
                    </div>
                ) : (
                    <Input
                        id="new-project-path"
                        value={path}
                        onChange={(event) => setPath(event.target.value)}
                        placeholder="/path/to/project"
                        aria-label="Project path"
                        spellCheck={false}
                        autoComplete="off"
                        variant="default"
                        className="mx-1 w-[calc(100%-8px)]"
                    />
                )}
                {browseError && (
                    <p className="mt-1.5 px-1 text-[11px] leading-4 text-phi-error-text">
                        {browseError}
                    </p>
                )}
            </div>

            <div className="-mx-2 flex items-center justify-end gap-1.5 border-t border-phi-border-faint px-2 pt-2">
                <Button variant="ghost" size="xs" onClick={onBack} className="!text-[12.5px]">
                    Cancel
                </Button>
                <Button
                    type="submit"
                    variant="primary"
                    size="xs"
                    disabled={!canSubmit}
                    className="!rounded-md !text-[12.5px]"
                >
                    {submitLabel}
                </Button>
            </div>
        </form>
    );
}

type PanelMode = "list" | "create" | "edit";

type DirectoryPanelProps = Omit<DirectoryPickerProps, "disabled"> & {
    mode: PanelMode;
    onModeChange: (mode: PanelMode) => void;
    editingProject: ProjectOption | null;
    onEditProject: (project: ProjectOption) => void;
};

function DirectoryPanel({
    cwd,
    projects,
    homeCwd,
    onChange,
    onCreateProject,
    onUpdateProject,
    onRemoveProject,
    mode,
    onModeChange,
    editingProject,
    onEditProject,
}: DirectoryPanelProps) {
    const close = useClose();
    const [query, setQuery] = useState("");
    const listRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

    // Morph the popover height to fit the active view.
    useLayoutEffect(() => {
        const el = mode === "list" ? listRef.current : formRef.current;
        if (!el) return;
        const update = () => setContentHeight(el.offsetHeight);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, editingProject?.id]);

    // Keep focus on the active view's input across the morph.
    useEffect(() => {
        if (mode === "list") searchInputRef.current?.focus();
        else nameInputRef.current?.focus();
    }, [mode]);

    const filteredProjects = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return projects;
        return projects.filter(
            (project) =>
                project.name.toLowerCase().includes(term) ||
                project.path.toLowerCase().includes(term) ||
                formatProjectPath(project.path).toLowerCase().includes(term),
        );
    }, [projects, query]);

    const selectProject = useCallback(
        (projectPath: string | null) => {
            onChange(projectPath);
            close();
        },
        [close, onChange],
    );

    const handleCreate = useCallback(
        (input: NewProjectInput) => {
            const project = onCreateProject(input);
            selectProject(project.path);
        },
        [onCreateProject, selectProject],
    );

    const handleFormSubmit = useCallback(
        (input: NewProjectInput) => {
            if (mode === "edit" && editingProject) {
                onUpdateProject(editingProject.id, input);
                onModeChange("list");
                return;
            }
            handleCreate(input);
        },
        [editingProject, handleCreate, mode, onModeChange, onUpdateProject],
    );

    const handleSearchKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                event.preventDefault();
                if (filteredProjects.length > 0) {
                    selectProject(filteredProjects[0].path);
                }
            }
        },
        [filteredProjects, selectProject],
    );

    const listActive = mode === "list";
    return (
        <div
            className={`relative max-w-full overflow-hidden transition-[height,width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${listActive ? "w-[304px]" : "w-[344px]"}`}
            style={contentHeight !== undefined ? { height: contentHeight } : undefined}
        >
            <div
                ref={listRef}
                inert={!listActive}
                aria-hidden={!listActive}
                className={`w-full transition-opacity duration-150 motion-reduce:transition-none ${listActive ? "relative opacity-100" : "pointer-events-none absolute inset-x-0 top-0 opacity-0"}`}
            >
            <div className="-mx-2 flex items-center gap-2 border-b border-phi-border-faint px-3 pb-3 pt-1">
                <IconSearch className="size-3.5 shrink-0 text-phi-text-muted" />
                <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
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
                        <IconXFilled className="size-3.5" />
                    </button>
                )}
            </div>

            <div className="max-h-56 overflow-y-auto py-1.5">
                {filteredProjects.length > 0 ? (
                    filteredProjects.map((project) => {
                        const selected = project.path === cwd;
                        return (
                            <div
                                key={project.id}
                                className={`group flex w-full items-center gap-1 rounded-lg pr-1 hover:bg-phi-overlay-strong focus-within:bg-phi-overlay-strong ${selected ? "bg-phi-overlay-muted" : ""}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => selectProject(project.path)}
                                    title={`${project.name} — ${formatProjectPath(project.path)}`}
                                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 ${selected
                                            ? "text-phi-text-primary"
                                            : "text-phi-text-secondary"
                                        }`}
                                >
                                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                                        <span className="max-w-[55%] shrink-0 truncate font-medium">
                                            {project.name}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-[11px] text-phi-text-muted">
                                            {formatProjectPath(project.path)}
                                        </span>
                                    </span>
                                    {selected && (
                                        <IconCheckFilled className="size-4 shrink-0 text-phi-text-secondary" />
                                    )}
                                </button>
                                {!project.implicit && (
                                    <button
                                        type="button"
                                        onClick={() => onEditProject(project)}
                                        title={`Edit ${project.name}`}
                                        aria-label={`Edit ${project.name}`}
                                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-phi-text-muted opacity-0 hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 group-hover:opacity-100"
                                    >
                                        <IconPencilFilled className="size-3.5" />
                                    </button>
                                )}
                                {onRemoveProject && !project.implicit && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveProject(project.id)}
                                        title={`Remove ${project.name}`}
                                        aria-label={`Remove ${project.name}`}
                                        className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-phi-text-muted opacity-0 hover:bg-phi-overlay-hover hover:text-phi-error-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 group-hover:opacity-100"
                                    >
                                        <IconTrashFilled className="size-3.5" />
                                    </button>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="px-2.5 py-6 text-center">
                        <p className="text-[12.5px] font-medium text-phi-text-secondary">
                            {projects.length ? "No matching projects" : "No projects yet"}
                        </p>
                        {!projects.length && !query && (
                            <p className="mt-1 text-[11.5px] leading-4 text-phi-text-muted">
                                Create one to start chatting in a directory.
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="-mx-2 border-t border-phi-border-faint px-2 pt-1.5">
                <button
                    type="button"
                    onClick={() => onModeChange("create")}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-phi-text-secondary hover:bg-phi-overlay-strong hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                >
                    <span className="shrink-0 text-phi-text-tertiary group-hover:text-phi-text-secondary">
                        <IconPlusFilled className="size-4" />
                    </span>
                    New project
                </button>
            </div>
            </div>
            <div
                ref={formRef}
                inert={listActive}
                aria-hidden={listActive}
                className={`w-full transition-opacity duration-150 motion-reduce:transition-none ${listActive ? "pointer-events-none absolute inset-x-0 top-0 opacity-0" : "relative opacity-100"}`}
            >
                <ProjectForm
                    key={mode === "edit" ? (editingProject?.id ?? "edit") : "create"}
                    homeCwd={homeCwd}
                    nameInputRef={nameInputRef}
                    title={mode === "edit" ? "Edit project" : "New project"}
                    submitLabel={mode === "edit" ? "Save changes" : "Create project"}
                    initialName={mode === "edit" ? (editingProject?.name ?? "") : ""}
                    initialPath={mode === "edit" ? (editingProject?.path ?? "") : ""}
                    onBack={() => onModeChange("list")}
                    onSubmit={handleFormSubmit}
                />
            </div>
        </div>
    );
}

export function DirectoryPicker({
    cwd,
    projects,
    onChange,
    onCreateProject,
    onUpdateProject,
    onRemoveProject,
    homeCwd,
    disabled,
}: DirectoryPickerProps) {
    const [mode, setMode] = useState<PanelMode>("list");
    const [editingId, setEditingId] = useState<string | null>(null);
    const editingProject = editingId ? (projects.find((p) => p.id === editingId) ?? null) : null;
    const active = cwd ? projects.find((p) => p.path === cwd) : undefined;

    const handleModeChange = useCallback((next: PanelMode) => {
        if (next === "list") setEditingId(null);
        setMode(next);
    }, []);

    const handleEditProject = useCallback((project: ProjectOption) => {
        setEditingId(project.id);
        setMode("edit");
    }, []);
    const label = active?.name ?? (cwd ? formatCwd(cwd) : "Select project");

    return (
        <Popover className="relative min-w-0">
            <PopoverTrigger
                disabled={disabled}
                data-project-picker-trigger
                className="group inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-phi-text-secondary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60"
                aria-label={`Change project${active ? `, currently ${active.name}` : cwd ? `, currently ${cwd}` : ", no project selected"}`}
            >
                <IconFolderFilled className="size-4 shrink-0 text-phi-text-secondary" />
                <span className="min-w-0 truncate text-[12.5px] font-medium">
                    {label}
                </span>
                <IconChevronDownFilled className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
            </PopoverTrigger>
            <PopoverContent
                anchor={{ to: "bottom start", gap: 8 }}
                className="w-max max-w-[min(360px,calc(100vw-32px))] p-2"
            >
                <DirectoryPanel
                    cwd={cwd}
                    projects={projects}
                    homeCwd={homeCwd}
                    onChange={onChange}
                    onCreateProject={onCreateProject}
                    onUpdateProject={onUpdateProject}
                    onRemoveProject={onRemoveProject}
                    mode={mode}
                    onModeChange={handleModeChange}
                    editingProject={editingProject}
                    onEditProject={handleEditProject}
                />
            </PopoverContent>
        </Popover>
    );
}
