import { MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { Command } from "cmdk";
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionGroup } from "../hooks/useSessions";
import type { SessionInfo } from "../types/session";
import { Button } from "./ui/button";
import { ChatIcon } from "./ui/icons";

type SearchSessionsButtonProps = {
    onClick: () => void;
    className?: string;
};

export function SearchSessionsButton({
    onClick,
    className = "",
}: SearchSessionsButtonProps) {
    const shortcut =
        typeof navigator !== "undefined" &&
        /Mac|iPod|iPhone|iPad/.test(navigator.platform)
            ? "⌘K"
            : "Ctrl K";

    return (
        <Button
            variant="icon"
            onClick={onClick}
            aria-label="Open command menu"
            aria-keyshortcuts="Meta+K Control+K"
            title={`Commands & sessions (${shortcut} / ${shortcut === "⌘K" ? "Ctrl K" : "⌘K"})`}
            className={`size-8 ${className}`}
        >
            <MagnifyingGlassIcon className="size-4" />
        </Button>
    );
}

export type CommandAction = {
    id: string;
    label: string;
    /** Small hint shown on the right (e.g. shortcut or target cwd). */
    hint?: string;
    keywords?: string[];
    icon?: ReactNode;
};

type SessionCommandProps = {
    groups: SessionGroup[];
    loading: boolean;
    error: string | null;
    actions: CommandAction[];
    onAction: (id: string) => void;
    onSelect: (file: string) => void;
    children: (openMenu: () => void) => ReactNode;
};

function sessionTitle(session: SessionInfo): string {
    if (session.name?.trim()) return session.name.trim();
    const firstMessage = session.firstMessage.trim();
    if (!firstMessage) return "Untitled session";
    return firstMessage.length > 64
        ? `${firstMessage.slice(0, 64).trim()}…`
        : firstMessage;
}

function groupTitle(group: SessionGroup): string {
    if (!group.displayCwd || group.displayCwd === "(unknown)") {
        return "Other sessions";
    }
    const trimmed = group.displayCwd.endsWith("/")
        ? group.displayCwd.slice(0, -1)
        : group.displayCwd;
    return trimmed.split("/").pop() || trimmed;
}

const ActionGroup = memo(function ActionGroup({
    actions,
    onAction,
}: {
    actions: CommandAction[];
    onAction: (id: string) => void;
}) {
    if (actions.length === 0) return null;
    return (
        <Command.Group
            heading={
                <div className="px-2 pb-1 pt-1 text-[10px] font-semibold tracking-[0.12em] text-phi-text-muted">
                    Actions
                </div>
            }
        >
            {actions.map((action) => (
                <Command.Item
                    key={action.id}
                    value={`action ${action.id} ${action.label}`}
                    keywords={action.keywords}
                    onSelect={() => onAction(action.id)}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-phi-text-secondary outline-none data-[selected=true]:bg-phi-overlay-active data-[selected=true]:text-phi-text-primary"
                >
                    {action.icon ?? (
                        <ChatIcon className="size-5 shrink-0 text-current" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{action.label}</span>
                    {action.hint && (
                        <span className="shrink-0 text-[11px] text-phi-text-faint">
                            {action.hint}
                        </span>
                    )}
                </Command.Item>
            ))}
        </Command.Group>
    );
});

// Cap how many session rows ever mount in the palette DOM. cmdk renders every
// <Command.Item> and re-scores all of them per keystroke, so an uncapped list
// blocks the main thread (frozen input, disappearing cursor) with a few
// hundred sessions.
const MAX_ROWS_WHEN_FILTERING = 80;
const MAX_ROWS_PER_GROUP = 20;

function matchesQuery(session: SessionInfo, title: string, group: SessionGroup, q: string): boolean {
    if (!q) return true;
    return (
        title.toLowerCase().includes(q) ||
        session.path.toLowerCase().includes(q) ||
        (session.name ?? "").toLowerCase().includes(q) ||
        session.firstMessage.toLowerCase().includes(q) ||
        session.cwd.toLowerCase().includes(q) ||
        group.displayCwd.toLowerCase().includes(q)
    );
}

const PaletteDialog = memo(function PaletteDialog({
    open,
    onOpenChange,
    groups,
    loading,
    error,
    actions,
    onAction,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groups: SessionGroup[];
    loading: boolean;
    error: string | null;
    actions: CommandAction[];
    onAction: (id: string) => void;
    onSelect: (file: string) => void;
}) {
    // Search state lives here — inside the dialog — so typing only re-renders
    // the palette, not the whole app shell behind it. (Previously `search`
    // lived in the wrapper that also rendered `children`, so every keystroke
    // reconciled the entire sidebar + conversation tree and blocked input.)
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!open) setSearch("");
    }, [open ]);

    const query = search.trim().toLowerCase();

    const filteredActions = useMemo(() => {
        if (!query) return actions;
        return actions.filter((a) =>
            `${a.label} ${a.id} ${(a.keywords ?? []).join(" ")}`.toLowerCase().includes(query),
        );
    }, [actions, query]);

    const filteredGroups = useMemo(() => {
        // Keep the palette focused on actions until the user starts a search.
        if (!query) return [];
        const cap = MAX_ROWS_WHEN_FILTERING;
        const out: Array<{ group: SessionGroup; sessions: SessionInfo[] }> = [];
        let total = 0;
        for (const group of groups) {
            if (total >= cap) break;
            const perGroupCap = Math.min(MAX_ROWS_PER_GROUP, cap - total);
            const sessions: SessionInfo[] = [];
            for (const session of group.sessions) {
                if (sessions.length >= perGroupCap) break;
                // Titles are derived; computing inline avoids a pre-pass over
                // thousands of sessions when there is no query.
                const title = query ? sessionTitle(session) : "";
                if (query && !matchesQuery(session, title, group, query)) continue;
                sessions.push(session);
                total += 1;
                if (total >= cap) break;
            }
            if (sessions.length > 0) out.push({ group, sessions });
        }
        return out;
    }, [groups, query]);

    const empty = !loading && !error && filteredActions.length === 0 && filteredGroups.length === 0;

    return (
        <Command.Dialog
            open={open}
            onOpenChange={onOpenChange}
            label="Commands and sessions"
            overlayClassName="session-command-overlay"
            contentClassName="session-command-content"
            loop
            // We filter manually (cheap substring + capped rows) instead of
            // cmdk's per-keystroke scoring over the full session list.
            shouldFilter={false}
        >
            <div className="flex items-center gap-3 border-b border-phi-border-subtle px-4">
                <MagnifyingGlassIcon className="size-4 shrink-0 text-phi-text-muted" />
                <Command.Input
                    autoFocus
                    value={search}
                    onValueChange={setSearch}
                    placeholder="Type a command or search sessions…"
                    aria-label="Type a command or search sessions"
                    className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-phi-text-primary outline-none placeholder:text-phi-text-muted"
                />
            </div>

            <Command.List
                label="Commands and sessions"
                className="max-h-[min(60vh,480px)] overflow-y-auto p-2"
            >
                {loading ? (
                    <>
                        <ActionGroup actions={filteredActions} onAction={onAction} />
                        <Command.Loading className="px-3 py-8 text-center text-[12px] text-phi-text-muted">
                            Loading sessions…
                        </Command.Loading>
                    </>
                ) : error ? (
                    <>
                        <ActionGroup actions={filteredActions} onAction={onAction} />
                        <div className="px-3 py-8 text-center text-[12px] text-phi-error-text">
                            {error}
                        </div>
                    </>
                ) : (
                    <>
                        {empty && (
                            <div className="px-3 py-8 text-center text-[12px] text-phi-text-muted">
                                No results found.
                            </div>
                        )}
                        <ActionGroup actions={filteredActions} onAction={onAction} />
                        {filteredGroups.map(({ group, sessions }) => (
                            <Command.Group
                                key={group.cwd}
                                value={group.cwd}
                                heading={
                                    <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3 text-[10px] font-semibold tracking-[0.12em] text-phi-text-muted">
                                        <span>{groupTitle(group)}</span>
                                        <span className="min-w-0 truncate normal-case tracking-normal text-phi-text-faint">
                                            {group.displayCwd}
                                        </span>
                                    </div>
                                }
                            >
                                {sessions.map((session) => {
                                    const title = sessionTitle(session);
                                    return (
                                        <Command.Item
                                            key={session.path}
                                            value={session.path}
                                            keywords={[title]}
                                            onSelect={() => onSelect(session.path)}
                                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-phi-text-secondary outline-none data-[selected=true]:bg-phi-overlay-active data-[selected=true]:text-phi-text-primary"
                                        >
                                            <ChatIcon className="size-4 shrink-0 text-phi-text-muted" />
                                            <span className="min-w-0 flex-1 truncate">
                                                {title}
                                            </span>
                                        </Command.Item>
                                    );
                                })}
                            </Command.Group>
                        ))}
                    </>
                )}
            </Command.List>
        </Command.Dialog>
    );
});

export function SessionCommand({
    groups,
    loading,
    error,
    actions,
    onAction,
    onSelect,
    children,
}: SessionCommandProps) {
    const [open, setOpen] = useState(false);

    const openSearch = useCallback(() => setOpen(true), []);
    const handleOpenChange = useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
    }, []);
    const closeAnd = useCallback((fn: () => void) => {
        setOpen(false);
        fn();
    }, []);
    const handleSelect = useCallback(
        (file: string) => {
            closeAnd(() => onSelect(file));
        },
        [closeAnd, onSelect],
    );
    const handleAction = useCallback(
        (id: string) => {
            closeAnd(() => onAction(id));
        },
        [closeAnd, onAction],
    );

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if (
                event.key.toLowerCase() !== "k" ||
                !(event.metaKey || event.ctrlKey)
            ) {
                return;
            }
            event.preventDefault();
            setOpen((current) => !current);
        };

        document.addEventListener("keydown", handleShortcut);
        return () => document.removeEventListener("keydown", handleShortcut);
    }, []);

    return (
        <>
            {children(openSearch)}
            <PaletteDialog
                open={open}
                onOpenChange={handleOpenChange}
                groups={groups}
                loading={loading}
                error={error}
                actions={actions}
                onAction={handleAction}
                onSelect={handleSelect}
            />
        </>
    );
}
