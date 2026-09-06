import {
    IconChevronDownFilled,
    IconDotsFilled,
    IconPencilFilled,
    IconPlusFilled,
    IconRefresh,
    IconSendFilled,
    IconSettingsFilled,
    IconTrashFilled,
} from "@tabler/icons-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { GroupCollapsibleTrigger } from "./ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { SessionGroup } from "../hooks/useSessions";
import type { SessionInfo } from "../types/session";
import { useHasDraft } from "../hooks/useHasDraft";
import { useEffectiveTheme } from "../hooks/useTheme";
import { brandingUrl } from "../lib/themed-assets";

type SidebarProps = {
    groups: SessionGroup[];
    activeFile: string | null;
    onSelect: (file: string) => void;
    onNewChat: () => void;
    onOpenSettings?: () => void;
    collapsed: Set<string>;
    onToggleGroup: (cwd: string) => void;
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
    groups,
    activeFile,
    onSelect,
    onNewChat,
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
    }, [groups, collapsed, loading, updateScrollEdges]);

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

            <div className="shrink-0 px-2 pt-2">
                <Button className="w-full justify-start" onClick={onNewChat}>
                    <IconPlusFilled className="size-4" />
                    New chat
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
                        <div className="mx-2 rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[12px] leading-4 text-phi-error-text">
                            {error}
                        </div>
                    ) : groups.length === 0 ? (
                        <p className="px-2 py-6 text-center text-[12px] text-phi-text-muted">
                            No sessions yet
                        </p>
                    ) : (
                        <div>
                            <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-phi-text-faint">
                                Projects
                            </p>
                            <div className="space-y-0.5">
                            {groups.map((group) => (
                                <GroupSection
                                    key={group.cwd}
                                    group={group}
                                    collapsed={collapsed.has(group.cwd)}
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
                <button
                    onClick={onOpenSettings}
                    title="Settings (Cmd+,)"
                    aria-label="Open settings"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                >
                    <IconSettingsFilled className="size-4" />
                </button>
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
    group: SessionGroup;
    collapsed: boolean;
    activeFile: string | null;
    runningFiles: ReadonlySet<string>;
    onToggleGroup: (cwd: string) => void;
    onSelect: (file: string) => void;
    onRename: (file: string, name: string) => Promise<void>;
    onDelete: (file: string) => Promise<void>;
    onPrefetch?: (file: string) => void;
}) {
    const handleToggle = useCallback(
        () => onToggleGroup(group.cwd),
        [onToggleGroup, group.cwd],
    );

    return (
        <div>
            <GroupCollapsibleTrigger
                collapsed={collapsed}
                onClick={handleToggle}
                className="h-8 rounded-lg"
                aria-expanded={!collapsed}
                title={group.displayCwd}
            >
                <span className="shrink-0 truncate text-[12px] font-semibold tracking-wide text-current">
                    {group.displayCwd}
                </span>
            </GroupCollapsibleTrigger>

            <div
                className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
            >
                <div className="overflow-hidden">
                    <nav
                        aria-label={group.displayCwd}
                        className="mt-1 space-y-0.5 border-l border-phi-border-faint pb-0.5 ml-[13px] pl-2"
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
            className={`session-row group relative flex h-8 w-full items-center gap-1 rounded-lg px-1 text-left text-[13px] ${active ? "bg-phi-overlay-active text-phi-text-primary" : "text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-secondary"}`}
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
