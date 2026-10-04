import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useClose } from "@headlessui/react";
import { IconCheckFilled, IconChevronDownFilled, IconChevronLeft, IconFolderFilled, IconFolderOpen, IconPencilFilled, IconPlusFilled, IconSearch, IconTrashFilled, IconXFilled } from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { NewProjectInput } from "../hooks/useProjects";
import { basenameOfPath, formatProjectPath, type Project, type ProjectOption } from "../lib/projects";
import { canBrowseDirectories, pickDirectory } from "../lib/directories";

type DirectoryPickerProps = {
    selectedProjectId: string | null;
    projects: ProjectOption[];
    onSelectProject: (id: string) => void;
    onCreateProject: (input: NewProjectInput) => Project;
    onRenameProject: (id: string, name: string) => void;
    onRemoveProject?: (id: string) => void;
    homeCwd?: string;
    disabled?: boolean;
    className?: string;
    triggerClassName?: string;
    triggerLabelClassName?: string;
    triggerChevronClassName?: string;
    showIcon?: boolean;
};

function ProjectForm({ homeCwd, nameInputRef, onBack, onSubmit }: { homeCwd?: string; nameInputRef: React.RefObject<HTMLInputElement | null>; onBack: () => void; onSubmit: (input: NewProjectInput) => void }) {
    const [name, setName] = useState("");
    const [path, setPath] = useState("");
    const [error, setError] = useState<string | null>(null);
    const browse = useCallback(async () => {
        setError(null);
        try {
            const selected = await pickDirectory(path.trim() || homeCwd);
            if (selected) { setPath(selected); setName((current) => current.trim() || basenameOfPath(selected)); }
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    }, [homeCwd, path]);
    return (
        <form onSubmit={(event) => { event.preventDefault(); if (name.trim() && path.trim()) onSubmit({ name: name.trim(), path: path.trim() }); }} className="w-full">
            <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                <Button variant="icon" size="icon" onClick={onBack} aria-label="Back to projects" className="!size-7"><IconChevronLeft className="size-5 shrink-0" /></Button>
                <p className="min-w-0 flex-1 truncate text-[13px] text-phi-text-primary">New project</p>
            </div>
            <div className="px-3 py-3">
                <label htmlFor="new-project-name" className="mb-1.5 block text-[13px] font-medium text-phi-text-primary">Name</label>
                <Input id="new-project-name" ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="My project" aria-label="Project name" spellCheck={false} autoComplete="off" variant="default" className="w-full !border-0 !bg-phi-overlay-strong !px-3 !text-[13px] placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40" />
                <span id="new-project-path-label" className="mb-1.5 mt-3 block text-[13px] font-medium text-phi-text-primary">Workspace</span>
                {canBrowseDirectories() ? (
                    <div className="flex gap-1.5">
                        <button type="button" onClick={() => void browse()} aria-labelledby="new-project-path-label new-project-path-value" title={path || "Choose a directory"} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-phi-overlay-strong px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40">
                            <IconFolderOpen className="size-3.5 shrink-0 text-phi-text-tertiary" /><span id="new-project-path-value" className={`min-w-0 flex-1 truncate text-[12px] ${path ? "text-phi-text-primary" : "text-phi-text-muted"}`}>{path ? formatProjectPath(path) : "Choose a directory…"}</span>
                        </button>
                        {path && <button type="button" onClick={() => setPath("")} title="Clear directory" aria-label="Clear directory" className="inline-flex shrink-0 items-center justify-center rounded-lg bg-phi-overlay-strong px-2 text-phi-text-tertiary hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"><IconXFilled className="size-3.5" /></button>}
                    </div>
                ) : <Input id="new-project-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="/home/you/code/project" aria-label="Project workspace" spellCheck={false} autoComplete="off" variant="default" className="w-full !border-0 !bg-phi-overlay-strong !px-3 placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40" />}
                {error && <p className="mt-1.5 text-[11px] leading-4 text-phi-error-text">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-1.5 px-2 pb-2 pt-2"><Button variant="ghost" size="xs" onClick={onBack} className="rounded-lg !text-[12.5px]">Cancel</Button><Button type="submit" variant="primary" size="xs" disabled={!name.trim() || !path.trim()} className="!rounded-lg !text-[12.5px]">Create project</Button></div>
        </form>
    );
}

function EditProjectForm({ project, nameInputRef, onBack, onRename }: { project: ProjectOption; nameInputRef: React.RefObject<HTMLInputElement | null>; onBack: () => void; onRename: (name: string) => void }) {
    const [name, setName] = useState(project.name);
    const save = useCallback(() => { const next = name.trim(); if (next && next !== project.name) onRename(next); }, [name, onRename, project.name]);
    return <div className="w-full"><div className="flex items-center gap-2 px-2 pb-1 pt-2"><Button variant="icon" size="icon" onClick={() => { save(); onBack(); }} aria-label="Back to projects" className="!size-7"><IconChevronLeft className="size-5 shrink-0" /></Button><p className="min-w-0 flex-1 truncate text-[13px] text-phi-text-primary">Edit project</p></div><div className="px-3 py-3"><label htmlFor="edit-project-name" className="mb-1.5 block text-[13px] font-medium text-phi-text-primary">Name</label><Input id="edit-project-name" ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); onBack(); } }} aria-label="Project name" spellCheck={false} autoComplete="off" variant="default" className="w-full !border-0 !bg-phi-overlay-strong !px-3 !text-[13px] focus-visible:ring-2 focus-visible:ring-phi-accent/40" /><p className="mt-3 truncate text-[12px] text-phi-text-muted" title={project.path}>{formatProjectPath(project.path)}</p></div><div className="flex items-center justify-end px-2 pb-2 pt-2"><Button variant="ghost" size="xs" onClick={() => { save(); onBack(); }} className="rounded-lg !text-[12.5px]">Done</Button></div></div>;
}

type PanelMode = "list" | "create" | "edit";
function DirectoryPanel({ selectedProjectId, projects, homeCwd, onSelectProject, onCreateProject, onRenameProject, onRemoveProject, mode, onModeChange, editingProject, onEditProject }: Omit<DirectoryPickerProps, "disabled" | "className" | "triggerClassName" | "triggerLabelClassName" | "triggerChevronClassName" | "showIcon"> & { mode: PanelMode; onModeChange: (mode: PanelMode) => void; editingProject: ProjectOption | null; onEditProject: (project: ProjectOption) => void }) {
    const close = useClose(); const [query, setQuery] = useState(""); const listRef = useRef<HTMLDivElement>(null); const formRef = useRef<HTMLDivElement>(null); const searchRef = useRef<HTMLInputElement>(null); const nameRef = useRef<HTMLInputElement>(null); const [height, setHeight] = useState<number>();
    useLayoutEffect(() => { const element = mode === "list" ? listRef.current : formRef.current; if (!element) return; const update = () => setHeight(element.offsetHeight); update(); const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect(); }, [mode, editingProject?.id]);
    useEffect(() => { if (mode === "list") searchRef.current?.focus(); else nameRef.current?.focus(); }, [mode]);
    const visible = useMemo(() => { const term = query.trim().toLowerCase(); return projects.filter((project) => !term || project.name.toLowerCase().includes(term) || project.path.toLowerCase().includes(term) || formatProjectPath(project.path).toLowerCase().includes(term)); }, [projects, query]);
    const select = useCallback((id: string) => { onSelectProject(id); close(); }, [close, onSelectProject]);
    const row = (project: ProjectOption) => <div key={project.id} className="group flex w-full items-center gap-1 rounded-lg pr-1 hover:bg-phi-overlay-strong focus-within:bg-phi-overlay-strong"><button type="button" onClick={() => select(project.id)} title={`${project.name} — ${formatProjectPath(project.path)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pl-3 pr-2 text-left text-[13px] text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40">{project.id === selectedProjectId ? <IconCheckFilled className="size-4 shrink-0 text-phi-text-secondary" /> : <span className="size-4 shrink-0" />}<span className="min-w-0 flex-1 truncate font-medium">{project.name}<span className="ml-1.5 truncate text-[11px] font-normal text-phi-text-faint">{formatProjectPath(project.path)}</span></span></button>{!project.implicit && <><button type="button" onClick={() => onEditProject(project)} aria-label={`Edit ${project.name}`} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-phi-text-muted opacity-0 hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 group-hover:opacity-100"><IconPencilFilled className="size-3.5" /></button>{onRemoveProject && <button type="button" onClick={() => onRemoveProject(project.id)} aria-label={`Remove ${project.name}`} className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-phi-text-muted opacity-0 hover:bg-phi-overlay-hover hover:text-phi-error-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 group-hover:opacity-100"><IconTrashFilled className="size-3.5" /></button>}</>}</div>;
    const listActive = mode === "list";
    return <div className={`relative max-w-full overflow-hidden transition-[height,width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${listActive ? "w-[304px]" : "w-[344px]"}`} style={height === undefined ? undefined : { height }}><div ref={listRef} inert={!listActive} aria-hidden={!listActive} className={`w-full transition-opacity duration-150 ${listActive ? "relative opacity-100" : "pointer-events-none absolute inset-x-0 top-0 opacity-0"}`}><div className="flex items-center gap-2 border-b border-phi-border-faint px-3 pb-3 pt-3"><IconSearch className="size-3.5 shrink-0 text-phi-text-muted" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && visible[0]) { event.preventDefault(); select(visible[0].id); } }} placeholder="Search projects" aria-label="Search projects" className="min-w-0 flex-1 bg-transparent text-sm text-phi-text-primary outline-none placeholder:text-phi-text-tertiary" />{query && <button type="button" onClick={() => setQuery("")} className="text-phi-text-muted hover:text-phi-text-secondary" aria-label="Clear search"><IconXFilled className="size-3.5" /></button>}</div><div className="max-h-56 overflow-y-auto px-1.5 pt-1.5">{visible.length ? visible.map(row) : <div className="px-2.5 py-6 text-center text-[12.5px] font-medium text-phi-text-secondary">{projects.length ? "No matching projects" : "No projects yet"}</div>}</div><div className="px-1.5 pb-1.5"><button type="button" onClick={() => onModeChange("create")} className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-phi-text-secondary hover:bg-phi-overlay-strong hover:text-phi-text-primary"><IconPlusFilled className="size-4 text-phi-text-tertiary" />New project</button></div></div><div ref={formRef} inert={listActive} aria-hidden={listActive} className={`w-full transition-opacity duration-150 ${listActive ? "pointer-events-none absolute inset-x-0 top-0 opacity-0" : "relative opacity-100"}`}>{mode === "edit" && editingProject ? <EditProjectForm project={editingProject} nameInputRef={nameRef} onBack={() => onModeChange("list")} onRename={(name) => onRenameProject(editingProject.id, name)} /> : <ProjectForm homeCwd={homeCwd} nameInputRef={nameRef} onBack={() => onModeChange("list")} onSubmit={(input) => { const project = onCreateProject(input); select(project.id); }} />}</div></div>;
}

export function DirectoryPicker({ selectedProjectId, projects, onSelectProject, onCreateProject, onRenameProject, onRemoveProject, homeCwd, disabled, className = "relative min-w-0", triggerClassName = "group inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-phi-text-secondary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60", triggerLabelClassName = "min-w-0 truncate text-[12.5px] font-medium", triggerChevronClassName = "size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180", showIcon = true }: DirectoryPickerProps) {
    const [mode, setMode] = useState<PanelMode>("list"); const [editingId, setEditingId] = useState<string | null>(null); const editingProject = editingId ? projects.find((project) => project.id === editingId) ?? null : null; const selected = selectedProjectId ? projects.find((project) => project.id === selectedProjectId) ?? null : null;
    return <Popover className={className}><PopoverTrigger disabled={disabled} data-project-picker-trigger className={triggerClassName} aria-label={`Change project${selected ? `, currently ${selected.name}` : ", no project selected"}`}>{showIcon && <IconFolderFilled className="size-4 shrink-0 text-phi-text-secondary" />}<span className={triggerLabelClassName}>{selected?.name ?? "Select project"}</span><IconChevronDownFilled className={triggerChevronClassName} /></PopoverTrigger><PopoverContent anchor={{ to: "bottom", gap: 8 }} origin="origin-top" className="w-max max-w-[min(360px,calc(100vw-32px))] overflow-hidden p-0"><DirectoryPanel selectedProjectId={selectedProjectId} projects={projects} onSelectProject={onSelectProject} onCreateProject={onCreateProject} onRenameProject={onRenameProject} onRemoveProject={onRemoveProject} homeCwd={homeCwd} mode={mode} onModeChange={(next) => { if (next === "list") setEditingId(null); setMode(next); }} editingProject={editingProject} onEditProject={(project) => { if (!project.implicit) { setEditingId(project.id); setMode("edit"); } }} /></PopoverContent></Popover>;
}
