import {
    IconArchiveFilled,
    IconArchiveOff,
    IconCheckFilled,
    IconChevronDownFilled,
    IconDotsFilled,
    IconFilterFilled,
    IconFolderFilled,
    IconPencilFilled,
    IconPinnedFilled,
    IconPinnedOff,
    IconPlusFilled,
    IconSendFilled,
    IconSettingsFilled,
    IconTrashFilled,
} from "@tabler/icons-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
import { useEffectiveTheme } from "../hooks/useTheme";
import { brandingUrl } from "../lib/themed-assets";
import { formatProjectPath, implicitProjectName, type ProjectGroup, type ProjectOption } from "../lib/projects";
import type { SessionInfo } from "../types/session";
import { useHasDraft } from "../hooks/useHasDraft";
import { ProviderLogo } from "./provider-logo";

type SidebarProps = {
    projectGroups: ProjectGroup[];
    projects: ProjectOption[];
    /** Pinned sessions sort first in the All view and keep their marker in Projects. */
    pinnedSessions: SessionInfo[];
    /** Archived sessions appear when the archive control is active. */
    archivedSessions: SessionInfo[];
    /** Sessions whose cwd matches no project — hidden from the sidebar, still searchable via Cmd+K. */
    orphanCount?: number;
    activeFile: string | null;
    selectedFiles: ReadonlySet<string>;
    onSelect: (file: string) => void;
    onToggleSelection: (file: string) => void;
    onNewChat: () => void;
    onOpenSearch: () => void;
    onOpenSettings?: () => void;
    collapsed: Set<string>;
    onToggleGroup: (key: string) => void;
    onRename: (file: string, name: string) => Promise<void>;
    onDelete: (file: string) => Promise<void>;
    onTogglePin: (file: string) => void;
    onToggleArchive: (file: string) => void;
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
    if (days < 30) return `${Math.floor(days / 7)}w`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    const years = Math.floor(days / 365);
    if (years < 10) {
        const remMonths = Math.floor((days % 365) / 30);
        if (remMonths >= 2) return `${years}y ${remMonths}mo`;
    }
    return `${years}y`;
}

function titleFor(s: { name?: string; firstMessage: string }): string {
    if (s.name?.trim()) return s.name.trim();
    const t = s.firstMessage.trim();
    if (!t) return "Untitled session";
    return t;
}

export const Sidebar = memo(function Sidebar({
    projectGroups,
    projects,
    pinnedSessions,
    archivedSessions,
    orphanCount = 0,
    activeFile,
    selectedFiles,
    onSelect,
    onToggleSelection,
    onNewChat,
    onOpenSearch,
    onOpenSettings,
    collapsed,
    onToggleGroup,
    onRename,
    onDelete,
    onTogglePin,
    onToggleArchive,
    loading,
    error,
    runningFiles,
    onPrefetch,
}: SidebarProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const searchLensPlay = useRef<(() => void) | null>(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [sessionFilter, setSessionFilter] = useState<"all" | "projects">("all");

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
    }, [projectGroups, pinnedSessions, archivedSessions, collapsed, loading, showArchived, sessionFilter, updateScrollEdges]);

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

    const theme = useEffectiveTheme();
    const projectNames = useMemo(() => new Map(projects.map((project) => [project.path, project.name])), [projects]);
    const pinnedPaths = useMemo(() => new Set(pinnedSessions.map((session) => session.path)), [pinnedSessions]);
    const sessionRows = useMemo(() => {
        const byPath = new Map<string, SessionInfo>();
        for (const session of pinnedSessions) byPath.set(session.path, session);
        for (const group of projectGroups) {
            for (const session of group.sessions) byPath.set(session.path, session);
        }
        return [...byPath.values()]
            .map((session) => ({
                session,
                projectName: projectNames.get(session.cwd) ?? implicitProjectName(session.cwd),
                pinned: pinnedPaths.has(session.path),
            }))
            .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.session.modified).getTime() - new Date(a.session.modified).getTime());
    }, [pinnedSessions, projectGroups, projectNames, pinnedPaths]);
    const groupedProjectRows = useMemo(
        () => projectGroups.map((group) => {
            const sessionsByPath = new Map(group.sessions.map((session) => [session.path, session]));
            for (const session of pinnedSessions) {
                if (session.cwd === group.project.path) sessionsByPath.set(session.path, session);
            }
            return {
                ...group,
                sessions: [...sessionsByPath.values()].sort(
                    (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
                ),
            };
        }),
        [pinnedSessions, projectGroups],
    );
    const archivedRows = useMemo(
        () => [...archivedSessions]
            .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
            .map((session) => ({ session, projectName: projectNames.get(session.cwd) ?? implicitProjectName(session.cwd) })),
        [archivedSessions, projectNames],
    );

    return (
        <aside className="flex h-full w-(--phi-sidebar-width) min-w-(--phi-sidebar-width) shrink-0 flex-col bg-phi-bg-sidebar">
            <div
                data-tauri-drag-region
                className="flex h-10 shrink-0 items-end pl-[18px] pr-[85px]"
                aria-hidden
            >
                <img
                    src={brandingUrl("logo.svg", theme)}
                    alt=""
                    draggable={false}
                    className="h-5 w-auto"
                />
            </div>

            <div className="mt-7 flex shrink-0 items-center px-3 pb-3">
                <Button variant="icon" className="!size-7" aria-label="New session" title="New session" onClick={onNewChat}>
                    <IconPlusFilled className="size-4" />
                </Button>
                <Button
                    variant="icon"
                    aria-label={showArchived ? "Show recent sessions" : "Show archived sessions"}
                    aria-pressed={showArchived}
                    title={showArchived ? "Show recent sessions" : "Show archived sessions"}
                    onClick={() => setShowArchived((showing) => !showing)}
                    className={showArchived ? "!size-7 bg-phi-overlay-active text-phi-text-primary" : "!size-7"}
                >
                    {showArchived ? <IconArchiveOff className="size-4" /> : <IconArchiveFilled className="size-4" />}
                </Button>
                <div className="ml-auto flex items-center gap-0">
                    <Button
                        variant="icon"
                        aria-label="Search sessions and commands"
                        aria-keyshortcuts="Meta+K Control+K"
                        title="Search sessions and commands (⌘K)"
                        onClick={onOpenSearch}
                        onMouseEnter={() => searchLensPlay.current?.()}
                        className="!size-7"
                    >
                        <SearchLensIcon playRef={searchLensPlay} />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            aria-label="Filter sessions"
                            className={`!size-7 !rounded-lg !opacity-100 ${sessionFilter === "projects" ? "bg-phi-overlay-active text-phi-text-primary" : ""}`}
                        >
                            <IconFilterFilled className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-32">
                            <DropdownMenuItem
                                icon={<IconCheckFilled className={`size-3.5 ${sessionFilter === "all" ? "" : "invisible"}`} />}
                                onClick={() => setSessionFilter("all")}
                            >
                                All
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                icon={<IconCheckFilled className={`size-3.5 ${sessionFilter === "projects" ? "" : "invisible"}`} />}
                                onClick={() => setSessionFilter("projects")}
                            >
                                Projects
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

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
                    ) : showArchived ? (
                        archivedRows.length === 0 ? (
                            <EmptyState
                                title="No archived sessions"
                                description="Archived sessions will appear here."
                            />
                        ) : (
                            <section aria-label="Archived sessions" className="pb-3">
                                <h2 className="px-2 pb-1.5 text-[13px] font-semibold text-phi-text-tertiary">Archived</h2>
                                <nav aria-label="Archived sessions" className="space-y-0.5">
                                    {archivedRows.map(({ session, projectName }) => (
                                        <SessionRowMemo
                                            key={session.path}
                                            session={session}
                                            projectName={projectName}
                                            active={session.path === activeFile}
                                            selected={selectedFiles.has(session.path)}
                                            isStreaming={runningFiles.has(session.path)}
                                            pinned={false}
                                            archived
                                            onSelect={onSelect}
                                            onToggleSelection={onToggleSelection}
                                            onRename={onRename}
                                            onDelete={onDelete}
                                            onTogglePin={onTogglePin}
                                            onToggleArchive={onToggleArchive}
                                            onPrefetch={onPrefetch}
                                        />
                                    ))}
                                </nav>
                            </section>
                        )
                    ) : sessionFilter === "projects" ? (
                        groupedProjectRows.length === 0 ? (
                            <EmptyState
                                title="No projects yet"
                                description="Sessions appear here when they belong to a project."
                            />
                        ) : (
                            <div className="pb-3">
                                {groupedProjectRows.map((group) => (
                                    <GroupSection
                                        key={group.project.id}
                                        group={group}
                                        collapsed={collapsed.has(group.project.id)}
                                        pinnedPaths={pinnedPaths}
                                        activeFile={activeFile}
                                        selectedFiles={selectedFiles}
                                        runningFiles={runningFiles}
                                        onToggleGroup={onToggleGroup}
                                        onSelect={onSelect}
                                        onToggleSelection={onToggleSelection}
                                        onRename={onRename}
                                        onDelete={onDelete}
                                        onTogglePin={onTogglePin}
                                        onToggleArchive={onToggleArchive}
                                        onPrefetch={onPrefetch}
                                    />
                                ))}
                            </div>
                        )
                    ) : sessionRows.length === 0 ? (
                        <EmptyState
                            title="No sessions yet"
                            description="Start a session in a workspace to see it here."
                            detail={orphanCount > 0 ? `${orphanCount} session${orphanCount === 1 ? "" : "s"} outside Projects — press ⌘K to find ${orphanCount === 1 ? "it" : "them"}.` : undefined}
                        />
                    ) : (
                        <section aria-label="Recent sessions" className="pb-3">
                            <h2 className="px-2 pb-1.5 text-[13px] font-semibold text-phi-text-tertiary">Recent</h2>
                            <nav aria-label="Recent sessions" className="space-y-0.5">
                                {sessionRows.map(({ session, projectName, pinned }) => (
                                    <SessionRowMemo
                                        key={session.path}
                                        session={session}
                                        projectName={projectName}
                                        active={session.path === activeFile}
                                        selected={selectedFiles.has(session.path)}
                                        isStreaming={runningFiles.has(session.path)}
                                        pinned={pinned}
                                        archived={false}
                                        onSelect={onSelect}
                                        onToggleSelection={onToggleSelection}
                                        onRename={onRename}
                                        onDelete={onDelete}
                                        onTogglePin={onTogglePin}
                                        onToggleArchive={onToggleArchive}
                                        onPrefetch={onPrefetch}
                                    />
                                ))}
                            </nav>
                        </section>
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

            <div className="mt-auto shrink-0 px-3 pb-4 pt-2">
                <Button
                    variant="icon"
                    aria-label="Open settings"
                    title="Settings (Cmd+,)"
                    onClick={() => onOpenSettings?.()}
                    className="group !size-7"
                >
                    <IconSettingsFilled className="size-4" />
                </Button>
            </div>
        </aside>
    );
});

// Test: search lens that flips around its handle axis on hover (lollipop
// spin). True geometry animation — each frame rewrites the lens `d` as a
// rotated ellipse with a shrinking minor axis, so the stroke stays a uniform
// 2px throughout (no perspective warping). Vendored from Tabler's outline
// search; only the lens animates, the handle sits on the axis.
const LENS_CX = 10;
const LENS_CY = 10;
const LENS_R = 7;
// Semi-major extent along the 45° handle diagonal.
const LENS_MAJ = LENS_R * Math.SQRT1_2;

function lensD(ry: number): string {
    const r = (n: number) => Number(n.toFixed(3));
    const sx = LENS_CX - LENS_MAJ;
    const sy = LENS_CY - LENS_MAJ;
    const d = LENS_MAJ * 2;
    return `M ${r(sx)} ${r(sy)} a ${LENS_R} ${r(ry)} 45 1 0 ${r(d)} ${r(d)} a ${LENS_R} ${r(ry)} 45 1 0 ${r(-d)} ${r(-d)}`;
}

const SearchLensIcon = memo(function SearchLensIcon({
    playRef,
}: {
    /** Hover intent channel — set to the flip player on mount. */
    playRef?: { current: (() => void) | null };
}) {
    const lensRef = useRef<SVGPathElement>(null);
    const rafRef = useRef<number | null>(null);

    const playFlip = useCallback(() => {
        const el = lensRef.current;
        if (!el) return;
        if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        const DURATION = 700;
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min((now - start) / DURATION, 1);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const ry = Math.max(LENS_R * Math.abs(Math.cos(eased * Math.PI)), 0.4);
            el.setAttribute("d", lensD(ry));
            rafRef.current = t < 1 ? requestAnimationFrame(tick) : null;
        };
        rafRef.current = requestAnimationFrame(tick);
    }, []);

    useEffect(() => {
        if (playRef) playRef.current = playFlip;
    }, [playFlip, playRef]);

    useEffect(
        () => () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        },
        [],
    );

    return (
        <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0"
        >
            <path ref={lensRef} d={lensD(LENS_R)} />
            <path d="M21 21l-6 -6" />
        </svg>
    );
});

const GroupSection = memo(function GroupSection({
    group,
    collapsed,
    pinnedPaths,
    activeFile,
    selectedFiles,
    runningFiles,
    onToggleGroup,
    onSelect,
    onToggleSelection,
    onRename,
    onDelete,
    onTogglePin,
    onToggleArchive,
    onPrefetch,
}: {
    group: ProjectGroup;
    collapsed: boolean;
    pinnedPaths: ReadonlySet<string>;
    activeFile: string | null;
    selectedFiles: ReadonlySet<string>;
    runningFiles: ReadonlySet<string>;
    onToggleGroup: (key: string) => void;
    onSelect: (file: string) => void;
    onToggleSelection: (file: string) => void;
    onRename: (file: string, name: string) => Promise<void>;
    onDelete: (file: string) => Promise<void>;
    onTogglePin: (file: string) => void;
    onToggleArchive: (file: string) => void;
    onPrefetch?: (file: string) => void;
}) {
    const handleToggle = useCallback(
        () => onToggleGroup(group.project.id),
        [onToggleGroup, group.project.id],
    );
    const { project } = group;
    const headerTitle = `${project.name} — ${formatProjectPath(project.path)}`;

    return (
        <div className="mb-2">
            <GroupCollapsibleTrigger
                collapsed={collapsed}
                onClick={handleToggle}
                aria-expanded={!collapsed}
                aria-label={`${project.name}, ${group.sessions.length} session${group.sessions.length === 1 ? "" : "s"}`}
                title={headerTitle}
                className="!gap-1.5 !px-2 !text-[13px] !font-semibold !text-phi-text-secondary hover:!text-phi-text-primary"
            >
                <IconFolderFilled aria-hidden="true" className="size-3.5 shrink-0 text-phi-text-muted" />
                <span className="min-w-0 max-w-[calc(100%_-_2.5rem)] truncate text-current">
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
                                    projectName={project.name}
                                    active={s.path === activeFile}
                                    selected={selectedFiles.has(s.path)}
                                    isStreaming={runningFiles.has(s.path)}
                                    pinned={pinnedPaths.has(s.path)}
                                    archived={false}
                                    onSelect={onSelect}
                                    onToggleSelection={onToggleSelection}
                                    onRename={onRename}
                                    onDelete={onDelete}
                                    onTogglePin={onTogglePin}
                                    onToggleArchive={onToggleArchive}
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
    projectName = implicitProjectName(session.cwd),
    active,
    selected,
    isStreaming,
    pinned,
    archived,
    onSelect,
    onToggleSelection,
    onRename,
    onDelete,
    onTogglePin,
    onToggleArchive,
    onPrefetch,
}: {
    session: SessionInfo;
    projectName?: string;
    active: boolean;
    selected: boolean;
    isStreaming?: boolean;
    pinned: boolean;
    archived: boolean;
    onSelect: (file: string) => void;
    onToggleSelection: (file: string) => void;
    onRename: (file: string, name: string) => Promise<void>;
    onDelete: (file: string) => Promise<void>;
    onTogglePin: (file: string) => void;
    onToggleArchive: (file: string) => void;
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
        (event: MouseEvent<HTMLButtonElement>) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                onToggleSelection(session.path);
                return;
            }
            onSelect(session.path);
        },
        [onSelect, onToggleSelection, session.path],
    );
    const handleRename = useCallback(
        (name: string) => onRename(session.path, name),
        [onRename, session.path],
    );
    const handleDelete = useCallback(
        () => onDelete(session.path),
        [onDelete, session.path],
    );
    const handleTogglePin = useCallback(
        () => onTogglePin(session.path),
        [onTogglePin, session.path],
    );
    const handleToggleArchive = useCallback(
        () => onToggleArchive(session.path),
        [onToggleArchive, session.path],
    );
    const handlePrefetch = useCallback(
        () => onPrefetch?.(session.path),
        [onPrefetch, session.path],
    );
    const hasDraft = useHasDraft(session.path);
    return (
        <SessionRow
            active={active}
            selected={selected}
            title={title}
            projectName={projectName}
            model={session.model ?? null}
            time={time}
            hasDraft={hasDraft}
            pinned={pinned}
            archived={archived}
            onClick={handleSelect}
            onRename={handleRename}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
            onToggleArchive={handleToggleArchive}
            isStreaming={isStreaming}
            onPrefetch={handlePrefetch}
        />
    );
});

const SessionRow = memo(function SessionRow({
    active,
    selected,
    title,
    projectName,
    model,
    time,
    hasDraft,
    pinned,
    archived,
    onClick,
    onRename,
    onDelete,
    onTogglePin,
    onToggleArchive,
    isStreaming,
    onPrefetch,
}: {
    active: boolean;
    selected: boolean;
    title: string;
    projectName: string;
    model: SessionInfo["model"] | null;
    time: string;
    hasDraft?: boolean;
    pinned: boolean;
    archived: boolean;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    onRename: (name: string) => Promise<void>;
    onDelete: () => Promise<void>;
    onTogglePin: () => void;
    onToggleArchive: () => void;
    isStreaming?: boolean;
    onPrefetch?: () => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(title);
    const [deleteConfirming, setDeleteConfirming] = useState(false);
    const deleteConfirmTimerRef = useRef<number | null>(null);

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
        if (!deleteConfirming) {
            setDeleteConfirming(true);
            if (deleteConfirmTimerRef.current !== null) window.clearTimeout(deleteConfirmTimerRef.current);
            deleteConfirmTimerRef.current = window.setTimeout(() => {
                setDeleteConfirming(false);
                deleteConfirmTimerRef.current = null;
            }, 3000);
            return;
        }
        if (deleteConfirmTimerRef.current !== null) window.clearTimeout(deleteConfirmTimerRef.current);
        deleteConfirmTimerRef.current = null;
        setDeleteConfirming(false);
        await onDelete();
    }, [deleteConfirming, onDelete]);

    useEffect(() => () => {
        if (deleteConfirmTimerRef.current !== null) window.clearTimeout(deleteConfirmTimerRef.current);
    }, []);

    return (
        <div
            onMouseEnter={onPrefetch}
            onFocusCapture={onPrefetch}
            className={`session-row group relative flex h-[52px] w-full items-center gap-1 rounded-lg px-1 text-left text-[13px] ${selected ? "bg-phi-accent/12 text-phi-text-primary outline outline-1 -outline-offset-1 outline-phi-accent/80" : active ? "bg-phi-overlay-active text-phi-text-primary" : "text-phi-text-secondary hover:bg-phi-overlay-hover hover:text-phi-text-secondary"}`}
        >
            {renaming ? (
                <div className="flex min-w-0 flex-1 items-center truncate rounded-lg px-1.5 py-1 pr-14">
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
                    className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden rounded-lg px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                >
                    <span className="flex min-w-0 items-center pr-11">
                        {pinned && (
                            <span title="Pinned session" className="mr-1 inline-flex shrink-0 text-phi-text-muted">
                                <IconPinnedFilled aria-hidden="true" className="size-[11px]" />
                            </span>
                        )}
                        <span title={title} className="min-w-0 flex-1 truncate">{title}</span>
                        {hasDraft && (
                            <IconSendFilled
                                className="ml-2 size-3 shrink-0 rotate-45 text-phi-text-muted"
                                aria-label="Draft"
                                title="Draft"
                            />
                        )}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-phi-text-muted">
                        <span title={projectName} className="min-w-0 flex-1 truncate">{projectName}</span>
                        {model && (
                            <span title={`${model.provider}/${model.modelId}`} className="shrink-0 text-phi-text-tertiary">
                                <ProviderLogo id={model.provider} name={model.modelId} size={14} />
                            </span>
                        )}
                    </span>
                </button>
            )}

            <span className="session-row-time pointer-events-none absolute right-2 top-1.5 text-[11px] text-phi-text-faint group-hover:opacity-0 group-focus-within:opacity-0">
                {time}
            </span>

            {!renaming && (
                <div className="absolute right-1 top-1.5 z-10 flex items-center gap-0.5">
                    <button
                        type="button"
                        onClick={archived ? onToggleArchive : onTogglePin}
                        title={archived ? "Unarchive session" : pinned ? "Unpin session" : "Pin session"}
                        aria-label={archived ? "Unarchive session" : pinned ? "Unpin session" : "Pin session"}
                        className="pointer-events-none grid size-6 place-items-center rounded-full text-phi-text-faint opacity-0 transition-colors hover:bg-phi-overlay-strong hover:text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                    >
                        {archived ? (
                            <IconArchiveOff className="size-[15px]" />
                        ) : pinned ? (
                            <IconPinnedOff className="size-[15px]" />
                        ) : (
                            <IconPinnedFilled className="size-[15px]" />
                        )}
                    </button>
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            aria-label="Session actions"
                            className="pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
                        >
                            <IconDotsFilled className="size-3.5" />
                        </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        {!archived && (
                            <DropdownMenuItem
                                icon={pinned ? <IconPinnedOff className="size-[15px]" /> : <IconPinnedFilled className="size-[15px]" />}
                                onClick={onTogglePin}
                            >
                                {pinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            icon={<IconPencilFilled className="size-[15px]" />}
                            onClick={handleStartRename}
                        >
                            Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            icon={archived ? <IconArchiveOff className="size-[15px]" /> : <IconArchiveFilled className="size-[15px]" />}
                            onClick={onToggleArchive}
                        >
                            {archived ? "Unarchive" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            icon={deleteConfirming ? <IconCheckFilled className="size-[15px]" /> : <IconTrashFilled className="size-[15px]" />}
                            onClick={(event) => {
                                event.preventDefault();
                                void handleDelete();
                            }}
                        >
                            {deleteConfirming ? "Confirm?" : "Delete"}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
        </div>
    );
});
