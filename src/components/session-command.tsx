import { MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { Command } from "cmdk";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
            aria-label="Search sessions"
            aria-keyshortcuts="Meta+K Control+K"
            title={`Search sessions (${shortcut} / ${shortcut === "⌘K" ? "Ctrl K" : "⌘K"})`}
            className={`size-8 ${className}`}
        >
            <MagnifyingGlassIcon className="size-4" />
        </Button>
    );
}

type SessionCommandProps = {
    groups: SessionGroup[];
    loading: boolean;
    error: string | null;
    onSelect: (file: string) => void;
    children: (openSearch: () => void) => ReactNode;
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

export function SessionCommand({
    groups,
    loading,
    error,
    onSelect,
    children,
}: SessionCommandProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const openSearch = useCallback(() => setOpen(true), []);
    const handleOpenChange = useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
    }, []);
    const handleSelect = useCallback(
        (file: string) => {
            setOpen(false);
            setSearch("");
            onSelect(file);
        },
        [onSelect],
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
            <Command.Dialog
                open={open}
                onOpenChange={handleOpenChange}
                label="Search sessions"
                overlayClassName="session-command-overlay"
                contentClassName="session-command-content"
                loop
            >
                <div className="flex items-center gap-3 border-b border-phi-border-subtle px-4">
                    <MagnifyingGlassIcon className="size-4 shrink-0 text-phi-text-muted" />
                    <Command.Input
                        autoFocus
                        value={search}
                        onValueChange={setSearch}
                        placeholder="Search sessions…"
                        aria-label="Search sessions"
                        className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-phi-text-primary outline-none placeholder:text-phi-text-muted"
                    />
                </div>

                <Command.List
                    label="Sessions"
                    className="max-h-[min(60vh,480px)] overflow-y-auto p-2"
                >
                    {loading ? (
                        <Command.Loading className="px-3 py-8 text-center text-[12px] text-phi-text-muted">
                            Loading sessions…
                        </Command.Loading>
                    ) : error ? (
                        <div className="px-3 py-8 text-center text-[12px] text-phi-error-text">
                            {error}
                        </div>
                    ) : (
                        <>
                            <Command.Empty className="px-3 py-8 text-center text-[12px] text-phi-text-muted">
                                No sessions found.
                            </Command.Empty>
                            {groups.map((group) => (
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
                                    {group.sessions.map((session) => {
                                        const title = sessionTitle(session);
                                        return (
                                            <Command.Item
                                                key={session.path}
                                                value={session.path}
                                                keywords={[
                                                    title,
                                                    session.name ?? "",
                                                    session.firstMessage,
                                                    session.cwd,
                                                    group.displayCwd,
                                                ]}
                                                onSelect={() => handleSelect(session.path)}
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
        </>
    );
}
