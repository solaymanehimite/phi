import {
    IconChevronDownFilled,
    IconDotsFilled,
    IconPencilFilled,
    IconPlusFilled,
    IconRefresh,
    IconSearch,
    IconSendFilled,
    IconSettingsFilled,
    IconTrashFilled,
} from "@tabler/icons-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert } from "./ui/alert";
import { EmptyState } from "./ui/empty-state";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { GroupCollapsibleTrigger } from "./ui/collapsible";
import { formatProjectPath, type ProjectGroup } from "../lib/projects";
import type { SessionInfo } from "../types/session";
import { useHasDraft } from "../hooks/useHasDraft";
import { useEffectiveTheme } from "../hooks/useTheme";
import { brandingUrl } from "../lib/themed-assets";

type SidebarProps = {
    projectGroups: ProjectGroup[];
    /** Sessions whose cwd matches no project — hidden from the sidebar, still searchable via Cmd+K. */
    orphanCount?: number;
    activeFile: string | null;
    onSelect: (file: string) => void;
    onNewChat: () => void;
    onOpenSearch: () => void;
    onOpenSettings?: () => void;
    collapsed: Set<string>;
    onToggleGroup: (key: string) => void;
    onRename: (file: string, name: string) => Promise<void>;
    onDelete: (file: string) => Promise<void>;
    loading: boolean;
    error: string | null;
    runningFiles: ReadonlySet<string>;
    onPrefetch?: (file: string) => void;
};

function relativeTime(iso: string): string {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString();
}

function titleFor(s: { name?: string; firstMessage: string }): string {
    if (s.name?.trim()) return s.name.trim();
    const t = s.firstMessage.trim();
    if (!t) return "Untitled session";
    return t.length > 42 ? `${t.slice(0, 42).trim()}…` : t;
}

function BrandLogo({ className = "" }: { className?: string }) {
    const theme = useEffectiveTheme();
    return (
        <img
            src={brandingUrl("logo.svg", theme)}
            alt="Phi"
            className={className}
            draggable={false}
        />
    );
}

export const Sidebar = memo(function Sidebar({
    projectGroups,
    orphanCount = 0,
    activeFile,
    onSelect,
    onNewChat,
    onOpenSearch,
    onOpenSettings,
    collapsed,
    onToggleGroup,
    onRename,
    onDelete,
    loading,
    error,
    runningFiles,
    onPrefetch,
}: SidebarProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);

    const updateScrollEdges = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const threshold = 2;
        setCanScrollUp(el.scrollTop > threshold);
        setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > threshold);
    }, []);

    useEffect(() => {
        updateScrollEdges();
        const el = scrollRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => updateScrollEdges());
        ro.observe(el);
        window.addEventListener("resize", updateScrollEdges);
        // Content height animates on group collapse; re-check after transition
        const t = window.setTimeout(updateScrollEdges, 320);
        return () => {
            window.clearTimeout(t);
            window.removeEventListener("resize", updateScrollEdges);
            ro.disconnect();
        };
    }, [projectGroups, collapsed, loading, updateScrollEdges]);

    const scrollByPage = useCallback((direction: 1 | -1) => {
        const el = scrollRef.current;
        if (!el) return;
        const reduceMotion =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollBy({
            top: direction * Math.max(el.clientHeight * 0.8, 120),
            behavior: reduceMotion ? "instant" as ScrollBehavior : "smooth",
        });
    }, []);
    const scrollUp = useCallback(() => scrollByPage(-1), [scrollByPage]);
    const scrollDown = useCallback(() => scrollByPage(1), [scrollByPage]);

    return (
        <aside className="flex h-full w-[268px] min-w-[268px] shrink-0 flex-col bg-phi-bg-sidebar">
            <div
                data-tauri-drag-region
                className="mb-4 mt-2 flex shrink-0 items-center px-3"
            >
                <button
                    type="button"
                    onClick={onNewChat}
                    className="ml-2 mt-2 flex items-center focus-visible:outline-none"
                >
                    <BrandLogo className="h-5 w-auto" />
                </button>
            </div>

            <div className="shrink-0 space-y-0.5 px-2 pt-2">
                <Button className="w-full justify-start" onClick={onNewChat}>
                    <IconPlusFilled className="size-4" />
                    New chat
                </Button>
                <Button
                    className="group w-full justify-start"
                    onClick={onOpenSearch}
                    aria-keyshortcuts="Meta+K Control+K"
                    title="Search sessions and commands (⌘K)"
                >
                    <IconSearch className="size-4" />
                    <span className="min-w-0 flex-1 truncate text-left">Search</span>
                    <span className="shrink-0 text-[11px] text-phi-text-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">⌘K</span>
                </Button>
            </div>

            <div aria-hidden="true" className="h-4 shrink-0" />

            <div className="relative min-h-0 flex-1">
                <div
                    ref={scrollRef}
                    onScroll={updateScrollEdges}
                    className="min-h-0 h-full overflow-y-auto scrollbar-none px-2"
                >
                    {loading ? (
                        <p className="px-2 py-6 text-center text-[12px] text-phi-text-muted">
                            Loading sessions…
                        </p>
                    ) : error ? (
                        <Alert variant="error" className="mx-2 leading-4">{error}</Alert>
                    ) : projectGroups.length === 0 ? (
                        <EmptyState
                            title="No projects yet"
                            description="Create one from the project picker to start chatting in a directory."
                            detail={orphanCount > 0 ? `${orphanCount} session${orphanCount === 1 ? "" : "s"} outside projects — press ⌘K to find ${orphanCount === 1 ? "it" : "them"}.` : undefined}
                        />
                    ) : (
                        <div>
                            <p className="px-2.5 pb-3 text-[13px] font-semibold tracking-wide text-phi-text-tertiary">
                                Projects
                            </p>
                            <div className="space-y-0.5">
                            {projectGroups.map((group) => (
                                <GroupSection
                                    key={group.project.id}
                                    group={group}
                                    collapsed={collapsed.has(group.project.path)}
                                    activeFile={activeFile}
                                    runningFiles={runningFiles}
                                    onToggleGroup={onToggleGroup}
                                    onSelect={onSelect}
                                    onRename={onRename}
                                    onDelete={onDelete}
                                    onPrefetch={onPrefetch}
                                />
                            ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Top fade + more-content indicator */}
                <div
                    aria-hidden={!canScrollUp}
                    className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex h-12 items-start justify-center pt-1 transition-opacity duration-200 ${canScrollUp ? "opacity-100" : "opacity-0"}`}
                    style={{ background: "linear-gradient(to bottom, var(--color-phi-bg-sidebar) 15%, transparent)" }}
                >
                    <button
                        type="button"
                        tabIndex={canScrollUp ? 0 : -1}
                        aria-label="Scroll sessions up"
                        title="Scroll up"
                        onClick={scrollUp}
                        className={`pointer-events-auto inline-flex items-center justify-center text-phi-text-tertiary transition-all duration-200 hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 ${canScrollUp ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}
                    >
                        <IconChevronDownFilled className="size-3.5 rotate-180" />
                    </button>
                </div>

                {/* Bottom fade + more-content indicator */}
                <div
                    aria-hidden={!canScrollDown}
                    className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-12 items-end justify-center pb-1 transition-opacity duration-200 ${canScrollDown ? "opacity-100" : "opacity-0"}`}
                    style={{ background: "linear-gradient(to top, var(--color-phi-bg-sidebar) 15%, transparent)" }}
                >
                    <button
                        type="button"
                        tabIndex={canScrollDown ? 0 : -1}
                        aria-label="Scroll sessions down"
                        title="Scroll down"
                        onClick={scrollDown}
                        className={`pointer-events-auto inline-flex items-center justify-center text-phi-text-tertiary transition-all duration-200 hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 ${canScrollDown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}
                    >
                        <IconChevronDownFilled className="size-3.5" />
                    </button>
                </div>
            </div>

            <div className="mt-auto flex shrink-0 items-center px-3 pb-4 pt-2">
                <Button
                    variant="icon"
                    onClick={onOpenSettings}
                    title="Settings (Cmd+,)"
                    aria-label="Open settings"
                    className="!size-7"
                >
                    <IconSettingsFilled className="size-4" />
                </Button>
            </div>
        </aside>
    );
});

const GroupSection = memo(function GroupSection({
    group,
    collapsed,
    activeFile,
    runningFiles,
    onToggleGroup,
    onSelect,
    onRename,
    onDelete,
    onPrefetch,
}: {
    group: ProjectGroup;
    collapsed: boolean;
    activeFile: string | null;
    runningFiles: ReadonlySet<string>;
    onToggleGroup: (key: string) => void;
    onSelect: (file: string) => void;
    onRename: (file: string, name: string) => Promise<void>;
    onDelete: (file: string) => Promise<void>;
    onPrefetch?: (file: string) => void;
}) {
    const handleToggle = useCallback(
        () => onToggleGroup(group.project.path),
        [onToggleGroup, group.project.path],
    );
    const { project } = group;

    return (
        <div>
            <GroupCollapsibleTrigger
                collapsed={collapsed}
                onClick={handleToggle}
                aria-expanded={!collapsed}
                aria-label={`${project.name}, ${group.sessions.length} session${group.sessions.length === 1 ? "" : "s"}`}
                title={`${project.name} — ${formatProjectPath(project.path)}`}
            >
                <span className="min-w-0 flex-1 truncate text-current">
                    {project.name}
                </span>
            </GroupCollapsibleTrigger>

            <div
                className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
            >
                <div className="overflow-hidden">
                    {group.sessions.length > 0 ? (
                        <nav
                            aria-label={project.name}
                            className="mt-1 space-y-0.5 pb-0.5"
                        >
                            {group.sessions.map((s) => (
                                <SessionRowMemo
                                    key={s.path}
                                    session={s}
                                    active={s.path === activeFile}
                                    isStreaming={runningFiles.has(s.path)}
                                    onSelect={onSelect}
                                    onRename={onRename}
                                    onDelete={onDelete}
                                    onPrefetch={onPrefetch}
                                />
                            ))}
                        </nav>
                    ) : (
                        !collapsed && (
                            <p className="mt-1 pb-0.5 pl-[34px] text-[11px] text-phi-text-faint">
                                No sessions yet
                            </p>
                        )
                    )}
                </div>
            </div>
        </div>
    );
});

// Wrapper that derives stable props from session so title/time don't recreate callbacks
const SessionRowMemo = memo(function SessionRowMemo({
    session,
    active,
    isStreaming,
    onSelect,
    onRename,
    onDelete,
    onPrefetch,
}: {
    session: SessionInfo;
    active: boolean;
    isStreaming?: boolean;
    onSelect: (file: string) => void;
    onRename: (file: string, name: string) => Promise<void>;
    onDelete: (file: string) => Promise<void>;
    onPrefetch?: (file: string) => void;
}) {
    const title = useMemo(
        () => titleFor(session),
        [session.name, session.firstMessage],
    );
    // time is relative; compute once per modified change. Recomputed via parent render is enough
    // avoid Date.now() per frame storm — only changes when modified changes or active toggles
    const time = useMemo(
        () => relativeTime(session.modified),
        [session.modified],
    );
    const handleSelect = useCallback(
        () => onSelect(session.path),
        [onSelect, session.path],
    );
    const handleRename = useCallback(
        (name: string) => onRename(session.path, name),
        [onRename, session.path],
    );
    const handleDelete = useCallback(
        () => onDelete(session.path),
        [onDelete, session.path],
    );
    const handlePrefetch = useCallback(
        () => onPrefetch?.(session.path),
        [onPrefetch, session.path],
    );
    const hasDraft = useHasDraft(session.path);

    return (
        <SessionRow
            active={active}
            title={title}
            time={time}
            hasDraft={hasDraft}
            onClick={handleSelect}
            onRename={handleRename}
            onDelete={handleDelete}
            isStreaming={isStreaming}
            onPrefetch={handlePrefetch}
        />
    );
});

const SessionRow = memo(function SessionRow({
    active,
    title,
    time,
    hasDraft,
    onClick,
    onRename,
    onDelete,
    isStreaming,
    onPrefetch,
}: {
    active: boolean;
    title: string;
    time: string;
    hasDraft?: boolean;
    onClick: () => void;
    onRename: (name: string) => Promise<void>;
    onDelete: () => Promise<void>;
    isStreaming?: boolean;
    onPrefetch?: () => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(title);

    const handleRename = useCallback(async () => {
        const name = draft.trim();
        if (!name) return;
        await onRename(name);
        setRenaming(false);
    }, [draft, onRename]);

    const handleDraftChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
        [],
    );
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleRename();
            }
            if (e.key === "Escape") setRenaming(false);
        },
        [handleRename],
    );
    const handleBlur = useCallback(() => setRenaming(false), []);
    const handleStartRename = useCallback(() => {
        setDraft(title);
        setRenaming(true);
    }, [title]);
    const handleDelete = useCallback(async () => {
        if (!confirm("Delete this session?")) return;
        await onDelete();
    }, [onDelete]);

    return (
        <div
            onMouseEnter={onPrefetch}
            onFocusCapture={onPrefetch}
            className={`session-row group relative flex h-8 w-full items-center gap-1 rounded-lg pl-7 pr-1 text-left text-[13px] ${active ? "bg-phi-overlay-active text-phi-text-primary" : "text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-secondary"}`}
        >
            {renaming ? (
                <div className="flex min-w-0 flex-1 items-center gap-2.5 truncate rounded-lg px-1.5 py-1 pr-8">
                    {isStreaming ? (
                        <IconRefresh className="size-4 shrink-0 animate-spin text-phi-text-secondary" />
                    ) : null}
                    <Input
                        autoFocus
                        value={draft}
                        onChange={handleDraftChange}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        variant="inline"
                    />
                </div>
            ) : (
                <button
                    type="button"
                    onClick={onClick}
                    className="flex min-w-0 flex-1 items-center gap-2.5 truncate rounded-lg px-1.5 py-1 pr-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                >
                    {isStreaming ? (
                        <IconRefresh className="size-4 shrink-0 animate-spin text-phi-text-secondary" />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-left">{title}</span>
                    {hasDraft && (
                        <IconSendFilled
                            className="size-3 shrink-0 text-phi-text-muted"
                            aria-label="Draft"
                            title="Draft"
                        />
                    )}
                </button>
            )}

            <span className="session-row-time pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-phi-text-faint group-hover:opacity-0">
                {time}
            </span>

            <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label="Session actions"
                        className="pointer-events-none group-hover:pointer-events-auto"
                    >
                        <IconDotsFilled className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem
                            icon={<IconPencilFilled className="size-[15px]" />}
                            onClick={handleStartRename}
                        >
                            Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            icon={<IconTrashFilled className="size-[15px]" />}
                            onClick={handleDelete}
                        >
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
});
