import {
    ArrowPathIcon,
    EllipsisHorizontalIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
} from "@heroicons/react/24/solid";
import { memo, useCallback, useMemo, useState } from "react";
import { ThemeEditor } from "./dev/ThemeEditor";
import { Button } from "./ui/button";
import { PanelLeftIcon } from "./ui/icons";
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
import logo from "../../public/logo.svg"

type SidebarProps = {
    groups: SessionGroup[];
    activeFile: string | null;
    onSelect: (file: string) => void;
    onClose: () => void;
    onNewChat: () => void;
    search: string;
    onSearchChange: (v: string) => void;
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

export const Sidebar = memo(function Sidebar({
    groups,
    activeFile,
    onSelect,
    onClose,
    onNewChat,
    search,
    onSearchChange,
    collapsed,
    onToggleGroup,
    onRename,
    onDelete,
    loading,
    error,
    runningFiles,
    onPrefetch,
}: SidebarProps) {
    const handleSearchChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value),
        [onSearchChange],
    );

    return (
        <aside className="flex w-[268px] shrink-0 flex-col bg-phi-bg-sidebar max-sm:absolute max-sm:inset-y-0 max-sm:z-20 max-sm:shadow-[18px_0_50px_rgba(0,0,0,0.45)]">
            <div
                data-tauri-drag-region
                className="flex shrink-0 mb-4 mt-2 items-center justify-between px-3"
            >
                <button
                    type="button"
                    onClick={onNewChat}
                    className="flex items-center mt-2 ml-2 focus-visible:outline-none"
                >
                    <img
                        src={logo}
                        className="h-5"
                        style={{
                            imageRendering: "pixelated",
                        }}
                    />
                </button>
                <Button
                    variant="icon"
                    aria-label="Close sidebar"
                    title="Close sidebar"
                    onClick={onClose}
                >
                    <PanelLeftIcon />
                </Button>
            </div>

            <div className="px-2 pt-2">
                <Button className="w-full justify-start" onClick={onNewChat}>
                    <PlusIcon className="size-4" />
                    New chat
                </Button>
            </div>

            <div className="px-4 pt-3">
                <Input
                    value={search}
                    onChange={handleSearchChange}
                    placeholder="Search sessions…"
                    aria-label="Search sessions"
                    variant="search"
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-4">
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
                        {search ? "No matches" : "No sessions yet"}
                    </p>
                ) : (
                    <div className="space-y-4">
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
                )}
            </div>

            <div className="flex shrink-0 items-center px-3 pb-3 pt-2">
                <ThemeEditor className="h-7 w-7" iconClassName="size-3" />
            </div>
        </aside>
    );
});

function repoNameFor(cwd: string): string {
    if (!cwd || cwd === "(unknown)" || cwd === "(no cwd)") return cwd;
    const trimmed = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;
    const seg = trimmed.split("/").pop();
    return seg || trimmed;
}

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
    const repoName = useMemo(
        () => repoNameFor(group.displayCwd),
        [group.displayCwd],
    );

    return (
        <div>
            <GroupCollapsibleTrigger
                collapsed={collapsed}
                onClick={handleToggle}
                aria-expanded={!collapsed}
                title={group.displayCwd}
            >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 truncate text-[11px] font-semibold tracking-wide text-phi-text-muted">
                        {repoName}
                    </span>
                    <span
                        className="ml-auto min-w-0 max-w-[150px] shrink truncate text-right text-[10px] font-normal tracking-normal text-phi-text-faint/70"
                        style={{ direction: "rtl" }}
                        title={group.displayCwd}
                    >
                        {group.displayCwd}
                    </span>
                </span>
            </GroupCollapsibleTrigger>

            <div
                className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
            >
                <div className="overflow-hidden">
                    <nav
                        aria-label={group.displayCwd}
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

    return (
        <SessionRow
            active={active}
            title={title}
            time={time}
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
    onClick,
    onRename,
    onDelete,
    isStreaming,
    onPrefetch,
}: {
    active: boolean;
    title: string;
    time: string;
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
                        <ArrowPathIcon className="size-4 shrink-0 animate-spin text-phi-text-secondary" />
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
                        <ArrowPathIcon className="size-4 shrink-0 animate-spin text-phi-text-secondary" />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-left">{title}</span>
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
                        <EllipsisHorizontalIcon className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem
                            icon={<PencilIcon className="size-[15px]" />}
                            onClick={handleStartRename}
                        >
                            Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            icon={<TrashIcon className="size-[15px]" />}
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
