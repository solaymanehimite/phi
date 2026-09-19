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
import { Select } from "./ui/select";
import type { NewProjectInput } from "../hooks/useProjects";
import { LOCAL_HOST_ID, type Host } from "../hooks/useHosts";
import { basenameOfPath, boundHostIds, formatProjectPath, type Project, type ProjectOption } from "../lib/projects";
import { canBrowseDirectories, pickDirectory } from "../lib/directories";
import { TargetIcon } from "./target-picker";

type DirectoryPickerProps = {
    /** Selected project id (explicit or implicit). */
    selectedProjectId: string | null;
    projects: ProjectOption[];
    /** All remote hosts, for the creation form. Local is always listed first. */
    hosts: Host[];
    /** Run target new sessions start on. Creation binds to this host. */
    activeHostId: string;
    hostNameById: Record<string, string>;
    onSelectProject: (id: string) => void;
    onCreateProject: (input: NewProjectInput) => Project;
    onRenameProject: (id: string, name: string) => void;
    onRemoveProject?: (id: string) => void;
    onSetTarget: (id: string, hostId: string, path: string) => void;
    onRemoveTarget: (id: string, hostId: string) => void;
    /** Only used as the browse dialog's starting directory — never listed. */
    homeCwd?: string;
    disabled?: boolean;
};

function ProjectForm({
    homeCwd,
    hosts,
    initialHostId,
    nameInputRef,
    title,
    submitLabel,
    initialName = "",
    initialPath = "",
    onBack,
    onSubmit,
}: {
    homeCwd?: string;
    hosts: Host[];
    initialHostId: string;
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
    const [hostId, setHostId] = useState(initialHostId);
    const [browseError, setBrowseError] = useState<string | null>(null);
    // The folder picker only sees this machine, so remote paths are typed.
    const remote = hostId !== LOCAL_HOST_ID;
    const remoteHostName = hostId === LOCAL_HOST_ID ? undefined : (hosts.find((h) => h.id === hostId)?.name ?? hostId);
    const canBrowse = canBrowseDirectories() && !remote;

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
            onSubmit({ name: name.trim(), path: path.trim(), hostId });
        },
        [name, onSubmit, path, hostId],
    );

    const canSubmit = name.trim().length > 0 && path.trim().length > 0;

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                <Button variant="icon" size="icon" onClick={onBack} aria-label="Back to projects" className="!size-7">
                    <IconChevronLeft className="size-5 shrink-0" />
                </Button>
                <p className="min-w-0 flex-1 truncate text-[13px] text-phi-text-primary">
                    {title}
                </p>
            </div>

            <div className="px-3 py-3">
                <label
                    htmlFor="new-project-name"
                    className="mb-1.5 block text-[13px] font-medium text-phi-text-primary"
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
                    className="w-full !border-0 !bg-phi-overlay-strong !px-3 !text-[13px] placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                />

                <span
                    className="mb-1.5 mt-3 block text-[13px] font-medium text-phi-text-primary"
                >
                    Run target
                </span>
                <Select
                    ariaLabel="Run target"
                    value={hostId}
                    onChange={setHostId}
                    options={[{ value: LOCAL_HOST_ID, label: "Local", icon: <TargetIcon hostId={LOCAL_HOST_ID} className="size-4 shrink-0 text-phi-text-tertiary" /> }, ...hosts.map((h) => ({ value: h.id, label: h.name, icon: <TargetIcon hostId={h.id} className="size-4 shrink-0 text-phi-text-tertiary" /> }))]} 
                    className="w-full"
                />

                <span
                    id="new-project-path-label"
                    className="mb-1.5 mt-3 block text-[13px] font-medium text-phi-text-primary"
                >
                    Path{remote && remoteHostName ? ` on ${remoteHostName}` : ""}
                </span>
                {canBrowse ? (
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            onClick={() => void browse()}
                            aria-labelledby="new-project-path-label new-project-path-value"
                            title={path || "Choose a directory"}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-phi-overlay-strong px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
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
                                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-phi-overlay-strong px-2 text-phi-text-tertiary hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                            >
                                <IconXFilled className="size-3.5" />
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <Input
                            id="new-project-path"
                            value={path}
                            onChange={(event) => setPath(event.target.value)}
                            placeholder="/home/you/code/project"
                            aria-label="Project path"
                            spellCheck={false}
                            autoComplete="off"
                            variant="default"
                            className="w-full !border-0 !bg-phi-overlay-strong !px-3 placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                        />
                    </>
                )}
                {browseError && (
                    <p className="mt-1.5 text-[11px] leading-4 text-phi-error-text">
                        {browseError}
                    </p>
                )}
            </div>

            <div className="flex items-center justify-end gap-1.5 px-2 pb-2 pt-2">
                <Button variant="ghost" size="xs" onClick={onBack} className="rounded-lg !text-[12.5px]">
                    Cancel
                </Button>
                <Button
                    type="submit"
                    variant="primary"
                    size="xs"
                    disabled={!canSubmit}
                    className="!rounded-lg !text-[12.5px]"
                >
                    {submitLabel}
                </Button>
            </div>
        </form>
    );
}

function EditProjectForm({
    project,
    activeHostId,
    hostNameById,
    nameInputRef,
    onBack,
    onRename,
    onRemoveTarget,
    onAddTarget,
}: {
    project: ProjectOption & { implicit: false };
    activeHostId: string;
    hostNameById: Record<string, string>;
    nameInputRef: React.RefObject<HTMLInputElement | null>;
    onBack: () => void;
    onRename: (name: string) => void;
    onRemoveTarget: (hostId: string) => void;
    onAddTarget: (path: string) => void;
}) {
    const [name, setName] = useState(project.name);
    const [newPath, setNewPath] = useState("");
    const [targetError, setTargetError] = useState<string | null>(null);
    const bound = boundHostIds(project);
    const activeBound = project.targets[activeHostId] !== undefined;

    const submitRename = useCallback(() => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== project.name) onRename(trimmed);
    }, [name, onRename, project.name]);

    const submitAddTarget = useCallback(() => {
        const path = newPath.trim();
        if (!path) return;
        try {
            onAddTarget(path);
            setNewPath("");
            setTargetError(null);
        } catch (e) {
            setTargetError(e instanceof Error ? e.message : String(e));
        }
    }, [newPath, onAddTarget]);

    return (
        <div className="w-full">
            <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                <Button variant="icon" size="icon" onClick={() => { submitRename(); onBack(); }} aria-label="Back to projects" className="!size-7">
                    <IconChevronLeft className="size-5 shrink-0" />
                </Button>
                <p className="min-w-0 flex-1 truncate text-[13px] text-phi-text-primary">
                    Edit project
                </p>
            </div>

            <div className="px-3 py-3">
                <label
                    htmlFor="edit-project-name"
                    className="mb-1.5 block text-[13px] font-medium text-phi-text-primary"
                >
                    Name
                </label>
                <Input
                    id="edit-project-name"
                    ref={nameInputRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={submitRename}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            submitRename();
                            onBack();
                        }
                    }}
                    placeholder="My project"
                    aria-label="Project name"
                    spellCheck={false}
                    autoComplete="off"
                    variant="default"
                    className="w-full !border-0 !bg-phi-overlay-strong !px-3 !text-[13px] placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                />

                <span className="mb-1.5 mt-3 block text-[13px] font-medium text-phi-text-primary">
                    Run targets
                </span>
                <div className="space-y-1">
                    {bound.map((hostId) => (
                        <div
                            key={hostId}
                            className="group flex w-full items-center gap-2 rounded-lg bg-phi-overlay-strong px-2.5 py-1.5"
                        >
                            <TargetIcon hostId={hostId} className="size-3.5 shrink-0 text-phi-text-tertiary" />
                            <span className="shrink-0 text-[12px] font-medium text-phi-text-secondary">
                                {hostNameById[hostId] ?? hostId}
                            </span>
                            <span
                                title={project.targets[hostId]}
                                className="min-w-0 flex-1 truncate text-[11.5px] text-phi-text-muted"
                            >
                                {formatProjectPath(project.targets[hostId])}
                            </span>
                            <button
                                type="button"
                                onClick={() => onRemoveTarget(hostId)}
                                title={bound.length === 1 ? "Remove this target (deletes the project)" : `Remove ${hostNameById[hostId] ?? hostId} target`}
                                aria-label={bound.length === 1 ? "Remove this target (deletes the project)" : `Remove ${hostNameById[hostId] ?? hostId} target`}
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-phi-text-muted hover:bg-phi-overlay-hover hover:text-phi-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                            >
                                <IconTrashFilled className="size-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
                {!activeBound && (
                    <div className="mt-2">
                        <div className="flex gap-1.5">
                            <Input
                                value={newPath}
                                onChange={(event) => setNewPath(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        submitAddTarget();
                                    }
                                }}
                                placeholder={`Path on ${hostNameById[activeHostId] ?? activeHostId}…`}
                                aria-label={`Workspace path on ${hostNameById[activeHostId] ?? activeHostId}`}
                                spellCheck={false}
                                autoComplete="off"
                                variant="default"
                                className="min-w-0 flex-1 !border-0 !bg-phi-overlay-strong !px-3 !text-[12px] placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                            />
                            <Button
                                type="button"
                                variant="primary"
                                size="xs"
                                onClick={submitAddTarget}
                                disabled={!newPath.trim()}
                                className="!rounded-md !text-[12.5px]"
                            >
                                Add
                            </Button>
                        </div>
                        {targetError && (
                            <p className="mt-1.5 text-[11px] leading-4 text-phi-error-text">{targetError}</p>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-end gap-1.5 px-2 pb-2 pt-2">
                <Button variant="ghost" size="xs" onClick={() => { submitRename(); onBack(); }} className="rounded-lg !text-[12.5px]">
                    Done
                </Button>
            </div>
        </div>
    );
}

type PanelMode = "list" | "create" | "edit";

type DirectoryPanelProps = Omit<DirectoryPickerProps, "disabled" | "selectedProjectId"> & {
    selectedProjectId: string | null;    mode: PanelMode;
    onModeChange: (mode: PanelMode) => void;
    editingProject: ProjectOption | null;
    onEditProject: (project: ProjectOption) => void;
};

function DirectoryPanel({
    selectedProjectId,
    projects,
    hosts,
    activeHostId,
    hostNameById,
    homeCwd,
    onSelectProject,
    onCreateProject,
    onRenameProject,
    onRemoveProject,
    onSetTarget,
    onRemoveTarget,
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

    const matchQuery = useCallback((project: ProjectOption, term: string): boolean => {
        if (!term) return true;
        if (project.name.toLowerCase().includes(term)) return true;
        const paths = project.implicit ? [project.path] : Object.values(project.targets);
        return paths.some(
            (p) => p.toLowerCase().includes(term) || formatProjectPath(p).toLowerCase().includes(term),
        );
    }, []);

    const { hereProjects, elsewhereProjects } = useMemo(() => {
        const term = query.trim().toLowerCase();
        const here: ProjectOption[] = [];
        const elsewhere: ProjectOption[] = [];
        for (const project of projects) {
            if (!matchQuery(project, term)) continue;
            if (project.implicit) {
                // Implicit entries belong to one host. Only the active host's
                // are listed; the rest stay reachable via search-all (Cmd+K).
                if (project.hostId === activeHostId) here.push(project);
                continue;
            }
            if (project.targets[activeHostId] !== undefined) here.push(project);
            else elsewhere.push(project);
        }
        return { hereProjects: here, elsewhereProjects: elsewhere };
    }, [activeHostId, matchQuery, projects, query]);

    const selectProject = useCallback(
        (id: string) => {
            onSelectProject(id);
            close();
        },
        [close, onSelectProject],
    );

    const handleCreate = useCallback(
        (input: NewProjectInput) => {
            const project = onCreateProject({ ...input, hostId: input.hostId ?? activeHostId });
            selectProject(project.id);
        },
        [activeHostId, onCreateProject, selectProject],
    );

    const handleSearchKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                event.preventDefault();
                const first = hereProjects[0] ?? elsewhereProjects[0];
                if (first) selectProject(first.id);
            }
        },
        [elsewhereProjects, hereProjects, selectProject],
    );

    const renderRow = (project: ProjectOption) => {
        const selected = project.id === selectedProjectId;
        const detail = project.implicit
            ? (hostNameById[project.hostId] ?? project.hostId)
            : Object.keys(project.targets)
                .map((id) => hostNameById[id] ?? id)
                .join(", ");
        return (
            <div
                key={project.id}
                className="group flex w-full items-center gap-1 rounded-lg pr-1 hover:bg-phi-overlay-strong focus-within:bg-phi-overlay-strong"
            >
                <button
                    type="button"
                    onClick={() => selectProject(project.id)}
                    title={project.implicit ? `${project.name} — ${formatProjectPath(project.path)}` : `${project.name} — runs on ${detail}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pl-3 pr-2 text-left text-[13px] text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                >
                    {selected ? (
                        <IconCheckFilled className="size-4 shrink-0 text-phi-text-secondary" />
                    ) : (
                        <span aria-hidden="true" className="size-4 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">
                        {project.name}
                        <span className="ml-1.5 truncate text-[11px] font-normal text-phi-text-faint">
                            {detail}
                        </span>
                    </span>
                </button>
                {!project.implicit && (
                    <button
                        type="button"
                        onClick={() => onEditProject(project)}
                        title={`Edit ${project.name}`}
                        aria-label={`Edit ${project.name}`}
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-phi-text-muted opacity-0 hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 group-hover:opacity-100"
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
                        className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-phi-text-muted opacity-0 hover:bg-phi-overlay-hover hover:text-phi-error-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 group-hover:opacity-100"
                    >
                        <IconTrashFilled className="size-3.5" />
                    </button>
                )}
            </div>
        );
    };

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
            <div className="flex items-center gap-2 border-b border-phi-border-faint px-3 pb-3 pt-3">
                <IconSearch className="size-3.5 shrink-0 text-phi-text-muted" />
                <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search projects"
                    aria-label="Search projects"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-sm text-phi-text-primary outline-none placeholder:text-phi-text-tertiary"
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

            <div className="max-h-56 overflow-y-auto px-1.5 pt-1.5">
                {hereProjects.length === 0 && elsewhereProjects.length === 0 ? (
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
                ) : (
                    <>
                        {hereProjects.map(renderRow)}
                        {elsewhereProjects.length > 0 && (
                            <>
                                <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-phi-text-faint">
                                    Other run targets
                                </p>
                                {elsewhereProjects.map(renderRow)}
                            </>
                        )}
                    </>
                )}
            </div>

            <div className="px-1.5 pb-1.5">
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
                {mode === "edit" && editingProject && !editingProject.implicit ? (
                    <EditProjectForm
                        key={editingProject.id}
                        project={editingProject}
                        activeHostId={activeHostId}
                        hostNameById={hostNameById}
                        nameInputRef={nameInputRef}
                        onBack={() => onModeChange("list")}
                        onRename={(name) => onRenameProject(editingProject.id, name)}
                        onRemoveTarget={(hostId) => onRemoveTarget(editingProject.id, hostId)}
                        onAddTarget={(path) => onSetTarget(editingProject.id, activeHostId, path)}
                    />
                ) : (
                    <ProjectForm
                        key="create"
                        homeCwd={homeCwd}
                        hosts={hosts}
                        initialHostId={activeHostId}
                        nameInputRef={nameInputRef}
                        title="New project"
                        submitLabel="Create project"
                        onBack={() => onModeChange("list")}
                        onSubmit={handleCreate}
                    />
                )}
            </div>
        </div>
    );
}

export function DirectoryPicker({
    selectedProjectId,
    projects,
    hosts,
    activeHostId,
    hostNameById,
    onSelectProject,
    onCreateProject,
    onRenameProject,
    onRemoveProject,
    onSetTarget,
    onRemoveTarget,
    homeCwd,
    disabled,
}: DirectoryPickerProps) {
    const [mode, setMode] = useState<PanelMode>("list");
    const [editingId, setEditingId] = useState<string | null>(null);
    const editingProject = editingId ? (projects.find((p) => p.id === editingId) ?? null) : null;
    const selected = selectedProjectId ? (projects.find((p) => p.id === selectedProjectId) ?? null) : null;
    const label = selected?.name ?? "Select project";

    const handleModeChange = useCallback((next: PanelMode) => {
        if (next === "list") setEditingId(null);
        setMode(next);
    }, []);

    const handleEditProject = useCallback((project: ProjectOption) => {
        if (project.implicit) return;
        setEditingId(project.id);
        setMode("edit");
    }, []);

    return (
        <Popover className="relative min-w-0">
            <PopoverTrigger
                disabled={disabled}
                data-project-picker-trigger
                className="group inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-phi-text-secondary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60"
                aria-label={`Change project${selected ? `, currently ${selected.name}` : ", no project selected"}`}
            >
                <IconFolderFilled className="size-4 shrink-0 text-phi-text-secondary" />
                <span className="min-w-0 truncate text-[12.5px] font-medium">
                    {label}
                </span>
                <IconChevronDownFilled className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
            </PopoverTrigger>
            <PopoverContent
                anchor={{ to: "top start", gap: 12 }}
                className="w-max max-w-[min(360px,calc(100vw-32px))] overflow-hidden p-0"
            >
                <DirectoryPanel
                    selectedProjectId={selectedProjectId}
                    projects={projects}
                    hosts={hosts}
                    activeHostId={activeHostId}
                    hostNameById={hostNameById}
                    homeCwd={homeCwd}
                    onSelectProject={onSelectProject}
                    onCreateProject={onCreateProject}
                    onRenameProject={onRenameProject}
                    onRemoveProject={onRemoveProject}
                    onSetTarget={onSetTarget}
                    onRemoveTarget={onRemoveTarget}
                    mode={mode}
                    onModeChange={handleModeChange}
                    editingProject={editingProject}
                    onEditProject={handleEditProject}
                />
            </PopoverContent>
        </Popover>
    );
}
