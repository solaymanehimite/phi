import {
    IconArchive,
    IconArchiveFilled,
    IconArchiveOff,
    IconChevronDownFilled,
    IconDotsFilled,
    IconPencilFilled,
    IconPinnedFilled,
    IconPinnedOff,
    IconPlusFilled,
    IconLoader2,
    IconSearch,
    IconSendFilled,
    IconSettingsFilled,
    IconTrashFilled,
} from "@tabler/icons-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import { NavItem } from "./ui/nav-item";
import { formatProjectPath, type ProjectGroup } from "../lib/projects";
import type { SessionInfo } from "../types/session";
import { useHasDraft } from "../hooks/useHasDraft";
import { useEffectiveTheme } from "../hooks/useTheme";
import { brandingUrl } from "../lib/themed-assets";

type SidebarProps = {
    projectGroups: ProjectGroup[];
    /** Pinned sessions — shown in their own group above Projects. */
    pinnedSessions: SessionInfo[];
    /** Archived sessions — shown in the footer group above Settings. */
    archivedSessions: SessionInfo[];
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
    pinnedSessions,
    archivedSessions,
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
    onTogglePin,
    onToggleArchive,
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
    }, [projectGroups, pinnedSessions, archivedSessions, collapsed, loading, updateScrollEdges]);

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

    const pinnedCollapsed = collapsed.has("pinned");
    const archivedCollapsed = collapsed.has("archived");
    const handleTogglePinned = useCallback(() => onToggleGroup("pinned"), [onToggleGroup]);
    const handleToggleArchived = useCallback(() => onToggleGroup("archived"), [onToggleGroup]);

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
                            {pinnedSessions.length > 0 && (
                                <div className="mb-1">
                                    <MetaGroupTrigger
                                        collapsed={pinnedCollapsed}
                                        onClick={handleTogglePinned}
                                        label="Pinned"
                                        count={pinnedSessions.length}
                                        icon={<IconPinnedFilled aria-hidden className="size-4 shrink-0 text-current" />}
                                    />
                                    <div
                                        className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${pinnedCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
                                    >
                                        <div className="overflow-hidden">
                                            <nav
                                                aria-label="Pinned"
                                                className="mt-1 space-y-0.5 pb-0.5"
                                            >
                                                {pinnedSessions.map((s) => (
                                                    <SessionRowMemo
                                                        key={s.path}
                                                        session={s}
                                                        active={s.path === activeFile}
                                                        isStreaming={runningFiles.has(s.path)}
                                                        pinned
                                                        archived={false}
                                                        onSelect={onSelect}
                                                        onRename={onRename}
                                                        onDelete={onDelete}
                                                        onTogglePin={onTogglePin}
                                                        onToggleArchive={onToggleArchive}
                                                        onPrefetch={onPrefetch}
                                                    />
                                                ))}
                                            </nav>
                                        </div>
                                    </div>
                                </div>
                            )}
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
                                    onTogglePin={onTogglePin}
                                    onToggleArchive={onToggleArchive}
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

            <div className="mt-auto shrink-0 px-2 pb-4 pt-2">
                {archivedSessions.length > 0 && (
                    <div className="mb-1">
                        <MetaGroupTrigger
                            collapsed={archivedCollapsed}
                            onClick={handleToggleArchived}
                            label="Archived"
                            count={archivedSessions.length}
                            icon={<IconArchiveFilled aria-hidden className="size-4 shrink-0 text-current" />}
                        />
                        <div
                            className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${archivedCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
                        >
                            <div className="overflow-hidden">
                                <nav
                                    aria-label="Archived"
                                    className="mt-1 max-h-44 space-y-0.5 overflow-y-auto scrollbar-none pb-0.5"
                                >
                                    {archivedSessions.map((s) => (
                                        <SessionRowMemo
                                            key={s.path}
                                            session={s}
                                            active={s.path === activeFile}
                                            isStreaming={runningFiles.has(s.path)}
                                            pinned={false}
                                            archived
                                            onSelect={onSelect}
                                            onRename={onRename}
                                            onDelete={onDelete}
                                            onTogglePin={onTogglePin}
                                            onToggleArchive={onToggleArchive}
                                            onPrefetch={onPrefetch}
                                        />
                                    ))}
                                </nav>
                            </div>
                        </div>
                    </div>
                )}
                <NavItem
                    label="Settings"
                    icon={IconSettingsFilled}
                    onClick={() => onOpenSettings?.()}
                    title="Settings (Cmd+,)"
                    ariaLabel="Open settings"
                />
            </div>
        </aside>
    );
});

// Group header for the Pinned / Archived meta-groups. Same row treatment as
// GroupCollapsibleTrigger but with a fixed icon (pin / archive) plus a
// collapse chevron instead of the folder open/closed pair.
const MetaGroupTrigger = memo(function MetaGroupTrigger({
    collapsed,
    onClick,
    label,
    count,
    icon,
}: {
    collapsed: boolean;
    onClick: () => void;
    label: string;
    count: number;
    icon: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-expanded={!collapsed}
            aria-label={`${label}, ${count} session${count === 1 ? "" : "s"}`}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-medium text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
        >
            {icon}
            <span className="min-w-0 flex-1 truncate text-current">
                {label}
            </span>
            <IconChevronDownFilled
                aria-hidden
                className={`size-3.5 shrink-0 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
            />
        </button>
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
    onTogglePin,
    onToggleArchive,
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
    onTogglePin: (file: string) => void;
    onToggleArchive: (file: string) => void;
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
                                    pinned={false}
                                    archived={false}
                                    onSelect={onSelect}
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
    active,
    isStreaming,
    pinned,
    archived,
    onSelect,
    onRename,
    onDelete,
    onTogglePin,
    onToggleArchive,
    onPrefetch,
}: {
    session: SessionInfo;
    active: boolean;
    isStreaming?: boolean;
    pinned: boolean;
    archived: boolean;
    onSelect: (file: string) => void;
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
            title={title}
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

function MarqueeTitle({ title }: { title: string }) {
    const outerRef = useRef<HTMLSpanElement>(null);
    const innerRef = useRef<HTMLSpanElement>(null);
    const [dist, setDist] = useState(0);

    useEffect(() => {
        const measure = () => {
            const outer = outerRef.current;
            const inner = innerRef.current;
            if (!outer || !inner) return;
            const overflow = inner.scrollWidth - outer.clientWidth;
            setDist(overflow > 8 ? Math.ceil(overflow) : 0);
        };
        measure();
        const t = window.setTimeout(measure, 120);
        window.addEventListener("resize", measure);
        return () => {
            window.clearTimeout(t);
            window.removeEventListener("resize", measure);
        };
    }, [title]);

    // Linear ping-pong marquee driven by rAF so the edge fade (vignette)
    // is only visible while the text is actually moving, and fades only
    // the edge(s) that still hide content.
    useEffect(() => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner || dist <= 0) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const row = outer.closest(".session-row");
        if (!row) return;

        const SPEED = 45; // px per second, constant (linear)
        const START_DELAY = 350;
        const END_PAUSE = 800;
        let raf = 0;
        let timer: number | null = null;
        let alive = true;
        let hovering = false;

        const clear = () => {
            inner.style.transform = "";
            (outer.style as CSSProperties & { webkitMaskImage?: string }).webkitMaskImage = "none";
            outer.style.maskImage = "none";
        };
        const paintMask = (x: number) => {
            const atStart = x > -1.5;
            const atEnd = x < -(dist - 1.5);
            let mask: string | null = null;
            if (!atStart && !atEnd)
                mask = "linear-gradient(to right, transparent, #000 10px, #000 calc(100% - 12px), transparent)";
            else if (!atStart)
                mask = "linear-gradient(to right, transparent, #000 10px)";
            else if (!atEnd)
                mask = "linear-gradient(to right, #000 calc(100% - 12px), transparent)";
            if (mask) {
                (outer.style as CSSProperties & { webkitMaskImage?: string }).webkitMaskImage = mask;
                outer.style.maskImage = mask;
            } else {
                (outer.style as CSSProperties & { webkitMaskImage?: string }).webkitMaskImage = "none";
                outer.style.maskImage = "none";
            }
        };
        const run = (from: number, to: number, done: () => void) => {
            const span = Math.abs(to - from);
            const dur = Math.max(500, (span / SPEED) * 1000);
            const t0 = performance.now();
            const step = (now: number) => {
                if (!alive || !hovering) return;
                const p = Math.min(1, (now - t0) / dur);
                const x = from + (to - from) * p; // linear, no easing
                inner.style.transform = `translateX(${x}px)`;
                paintMask(x);
                if (p < 1) raf = requestAnimationFrame(step);
                else done();
            };
            raf = requestAnimationFrame(step);
        };
        const loop = () => {
            if (!alive || !hovering) return;
            run(0, -dist, () => {
                if (!alive || !hovering) return;
                timer = window.setTimeout(() => {
                    if (!alive || !hovering) return;
                    run(-dist, 0, () => {
                        if (!alive || !hovering) return;
                        clear();
                        timer = window.setTimeout(() => {
                            if (alive && hovering) loop();
                        }, START_DELAY);
                    });
                }, END_PAUSE);
            });
        };
        const enter = () => {
            hovering = true;
            cancelAnimationFrame(raf);
            if (timer != null) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                if (alive && hovering) loop();
            }, START_DELAY);
        };
        const leave = () => {
            hovering = false;
            cancelAnimationFrame(raf);
            if (timer != null) {
                window.clearTimeout(timer);
                timer = null;
            }
            clear();
        };
        row.addEventListener("mouseenter", enter);
        row.addEventListener("mouseleave", leave);
        row.addEventListener("focusin", enter);
        row.addEventListener("focusout", leave);
        return () => {
            alive = false;
            hovering = false;
            cancelAnimationFrame(raf);
            if (timer != null) window.clearTimeout(timer);
            row.removeEventListener("mouseenter", enter);
            row.removeEventListener("mouseleave", leave);
            row.removeEventListener("focusin", enter);
            row.removeEventListener("focusout", leave);
            clear();
        };
    }, [dist]);

    const overflowing = dist > 0;
    return (
        <span
            ref={outerRef}
            data-active={overflowing ? "true" : "false"}
            className="session-title-mask min-w-0 flex-1 overflow-hidden"
        >
            <span
                ref={innerRef}
                title={title}
                data-marquee={overflowing ? "true" : "false"}
                className="session-title-inner"
            >
                {title}
            </span>
        </span>
    );
}

const SessionRow = memo(function SessionRow({
    active,
    title,
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
    title: string;
    time: string;
    hasDraft?: boolean;
    pinned: boolean;
    archived: boolean;
    onClick: () => void;
    onRename: (name: string) => Promise<void>;
    onDelete: () => Promise<void>;
    onTogglePin: () => void;
    onToggleArchive: () => void;
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
            {!renaming && (
                <button
                    type="button"
                    onClick={onToggleArchive}
                    title={archived ? "Unarchive session" : "Archive session"}
                    aria-label={archived ? "Unarchive session" : "Archive session"}
                    className="absolute left-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-phi-text-faint opacity-0 transition-all duration-150 hover:bg-phi-overlay-strong hover:text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                    {archived ? (
                        <IconArchiveOff className="size-[15px]" />
                    ) : (
                        <IconArchive className="size-[15px]" />
                    )}
                </button>
            )}
            {renaming ? (
                <div className="flex min-w-0 flex-1 items-center gap-2.5 truncate rounded-lg px-1.5 py-1 pr-8">
                    {isStreaming ? (
                        <IconLoader2 className="size-4 shrink-0 animate-spin text-phi-text-primary" />
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
                        <IconLoader2 className="size-4 shrink-0 animate-spin text-phi-text-primary" />
                    ) : null}
                    <MarqueeTitle title={title} />
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
