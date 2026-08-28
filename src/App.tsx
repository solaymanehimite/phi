import { useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "./components/composer";
import { Conversation } from "./components/conversation/conversation";
import { Streaming } from "./components/conversation/streaming";
import { Sidebar } from "./components/sidebar";
import { Button } from "./components/ui/button";
import { PanelLeftIcon } from "./components/ui/icons";
import { useSessions } from "./hooks/useSessions";
import { useChat } from "./hooks/useChat";

function formatCwd(cwd: string | undefined): string {
    if (!cwd) return "";
    const m = cwd.match(/^\/home\/[^/]+/);
    return m ? cwd.replace(m[0], "~") : cwd;
}

export default function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const sessions = useSessions();
    const chat = useChat();

    const activeTitle =
        chat.data?.sessionName ||
        chat.data?.header?.id ||
        chat.activeFile?.split("/").pop() ||
        "New chat";
    const activeCwd = chat.data?.cwd || chat.data?.header?.cwd;

    const handleSelect = useCallback(
        async (file: string) => {
            if (file === chat.activeFile) return;
            if (chat.isStreaming) {
                const ok = window.confirm(
                    "A response is still streaming. Switching sessions will abort it. Switch anyway?",
                );
                if (!ok) return;
                try {
                    await chat.abort();
                } catch {
                    // abort failure is non-blocking — still switch
                }
            }
            try {
                await sessions.switchTo(file);
            } catch (e) {
                // switch failure is non-blocking — still try to load
                console.warn("switchSession failed", e);
            }
            await chat.openFile(file);
        },
        [sessions.switchTo, chat.openFile, chat.isStreaming, chat.abort, chat.activeFile],
    );

    const handleNewChat = useCallback(async () => {
        if (chat.isStreaming) {
            const ok = window.confirm(
                "A response is still streaming. Starting a new chat will abort it. Continue?",
            );
            if (!ok) return;
            try {
                await chat.abort();
            } catch {}
        }
        chat.clear();
    }, [chat.clear, chat.isStreaming, chat.abort]);

    const handleRename = useCallback(
        async (file: string, name: string) => {
            await sessions.rename(file, name);
            if (chat.activeFile === file) await chat.refresh();
        },
        [sessions.rename, chat.activeFile, chat.refresh],
    );

    const handleDelete = useCallback(
        async (file: string) => {
            await sessions.remove(file);
            if (chat.activeFile === file) chat.clear();
        },
        [sessions.remove, chat.activeFile, chat.clear],
    );

    const scrollerRef = useRef<HTMLDivElement>(null);

    const handleSend = useCallback(
        async (content: string) => {
            await chat.prompt(content, {
                onNewFile: (file, cwd, firstMessage) => {
                    // optimistic insert so session appears immediately (before server indexes it)
                    const realCwd = cwd || chat.data?.cwd || "";
                    sessions.addOptimistic(
                        file,
                        realCwd || "/home/solaymanehimite/Dev/ship/Phi",
                        firstMessage,
                    );
                },
            });
            // silent recency refresh after prompt completes (no flash)
            sessions.refresh({ silent: true });
        },
        [chat.prompt, chat.data?.cwd, sessions.addOptimistic, sessions.refresh],
    );

    // auto-scroll while streaming and after history replaces streaming
    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        // during streaming, keep pinned to bottom as deltas arrive
        if (chat.isStreaming) {
            el.scrollTop = el.scrollHeight;
            return;
        }
    }, [
        chat.isStreaming,
        chat.streaming.text,
        chat.streaming.thinking,
        chat.streaming.tools.length,
    ]);

    // after streaming finishes and history loads, pin to bottom
    useEffect(() => {
        if (chat.isStreaming) return;
        const el = scrollerRef.current;
        if (!el) return;
        // only scroll if we have messages (i.e. after a prompt or file open)
        if ((chat.data?.context.messages.length ?? 0) > 0) {
            requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
            });
        }
    }, [chat.isStreaming, chat.data?.context.messages.length]);

    const messages = chat.data?.context.messages ?? [];

    return (
        <div className="flex h-screen min-h-[480px] overflow-hidden bg-phi-bg-app text-phi-text-primary antialiased selection:bg-phi-accent/25">
            {sidebarOpen && (
                <Sidebar
                    groups={sessions.groups}
                    activeFile={chat.activeFile}
                    onSelect={handleSelect}
                    onClose={() => setSidebarOpen(false)}
                    onNewChat={handleNewChat}
                    search={sessions.search}
                    onSearchChange={sessions.setSearch}
                    collapsed={sessions.collapsed}
                    onToggleGroup={sessions.toggleGroup}
                    onRename={handleRename}
                    onDelete={handleDelete}
                    loading={sessions.loading}
                    error={sessions.error}
                    isStreaming={chat.isStreaming}
                />
            )}

            <main className="relative flex min-w-0 flex-1 flex-col bg-phi-bg-main">
                <header
                    data-tauri-drag-region
                    className="flex h-13 shrink-0 items-center border-b border-phi-border-subtle px-3"
                >
                    {!sidebarOpen && (
                        <Button
                            variant="icon"
                            aria-label="Open sidebar"
                            title="Open sidebar"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <PanelLeftIcon />
                        </Button>
                    )}
                    <div className="pointer-events-none mx-auto flex max-w-[60%] items-center gap-2 truncate px-10 text-[13px]">
                        {activeCwd ? (
                            <>
                                <span className="truncate font-medium text-phi-text-tertiary">
                                    {formatCwd(activeCwd)}
                                </span>
                                <span className="text-phi-separator">/</span>
                            </>
                        ) : null}
                        <span className="truncate font-medium text-phi-text-tertiary">
                            {chat.activeFile ? activeTitle : "New chat"}
                        </span>
                    </div>
                    <div className="w-8" />
                </header>

                <section className="flex min-h-0 flex-1 flex-col">
                    <div
                        ref={scrollerRef}
                        className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6"
                    >
                        {!chat.activeFile ? (
                            <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                                <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-phi-text-primary">
                                    Build, Fix and Ship
                                </h1>
                                {!sessions.loading &&
                                    sessions.groups.length === 0 &&
                                    !sessions.error && (
                                        <p className="mt-6 text-[12px] text-phi-text-muted">
                                            No sessions found — run `pi` in a project to create one.
                                        </p>
                                    )}
                            </div>
                        ) : chat.loading ? (
                            <p className="py-10 text-center text-[13px] text-phi-text-muted">
                                Loading messages…
                            </p>
                        ) : chat.error ? (
                            <div className="mx-auto mt-6 max-w-xl rounded-lg border border-phi-error-border bg-phi-error-bg px-4 py-3 text-[13px] text-phi-error-text">
                                {chat.error}
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                                <p className="text-[13px] text-phi-text-muted">
                                    No messages in this session yet.
                                </p>
                                <p className="mt-1 text-[12px] text-phi-text-muted">
                                    Prompt streaming lands in Phase C.
                                </p>
                            </div>
                        ) : (
                            <>
                                <Conversation messages={messages} />
                                {chat.isStreaming && (
                                    <div className="pt-2">
                                        <Streaming
                                            text={chat.streaming.text}
                                            thinking={chat.streaming.thinking}
                                            tools={chat.streaming.tools}
                                            error={chat.streaming.error}
                                        />
                                    </div>
                                )}
                                {chat.error && !chat.isStreaming && (
                                    <div className="rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[13px] text-phi-error-text">
                                        {chat.error}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="shrink-0 px-4 sm:px-7">
                        <Composer
                            onSend={handleSend}
                            onAbort={chat.abort}
                            isStreaming={chat.isStreaming}
                        />
                    </div>
                </section>
            </main>
        </div>
    );
}
