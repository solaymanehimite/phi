import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/composer";
import { Conversation } from "./components/conversation/conversation";
import { Streaming } from "./components/conversation/streaming";
import { Sidebar } from "./components/sidebar";
import { Button } from "./components/ui/button";
import { PanelLeftIcon } from "./components/ui/icons";
import { ThemeEditor } from "./components/dev/ThemeEditor";
import { useSessions } from "./hooks/useSessions";
import { useChat } from "./hooks/useChat";
import { useModels } from "./hooks/useModels";
import { createSession } from "./lib/api";

function formatCwd(cwd: string | undefined): string {
    if (!cwd) return "";
    const m = cwd.match(/^\/home\/[^/]+/);
    return m ? cwd.replace(m[0], "~") : cwd;
}

// Isolated scroll-aware viewport so App doesn't need to re-render on every streaming token
const ChatViewport = memo(function ChatViewport({
    activeFile,
    loading,
    error,
    messages,
    isStreaming,
    streaming,
}: {
    activeFile: string | null;
    loading: boolean;
    error: string | null;
    messages: unknown[];
    isStreaming: boolean;
    streaming: {
        text: string;
        thinking: string;
        tools: {
            toolCallId: string;
            toolName: string;
            args: Record<string, unknown>;
            partial?: string;
            result?: string;
            isError?: boolean;
            done?: boolean;
        }[];
        error?: string;
        startedAt?: number | null;
    };
}) {
    const scrollerRef = useRef<HTMLDivElement>(null);

    // auto-scroll while streaming (pinned to bottom on each delta)
    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        if (isStreaming) {
            el.scrollTop = el.scrollHeight;
        }
    }, [isStreaming, streaming.text, streaming.thinking, streaming.tools.length]);

    // after streaming finishes and history loads, pin to bottom
    useEffect(() => {
        if (isStreaming) return;
        const el = scrollerRef.current;
        if (!el) return;
        if ((messages.length ?? 0) > 0) {
            requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
            });
        }
    }, [isStreaming, messages.length]);

    if (!activeFile) return null;
    if (loading) {
        return (
            <div
                ref={scrollerRef}
                className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6"
            >
                <p className="py-10 text-center text-[13px] text-phi-text-muted">
                    Loading messages…
                </p>
            </div>
        );
    }
    if (error) {
        return (
            <div
                ref={scrollerRef}
                className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6"
            >
                <div className="mx-auto mt-6 max-w-xl rounded-lg border border-phi-error-border bg-phi-error-bg px-4 py-3 text-[13px] text-phi-error-text">
                    {error}
                </div>
            </div>
        );
    }
    if (messages.length === 0) {
        return (
            <div
                ref={scrollerRef}
                className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6"
            >
                <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                    <p className="text-[13px] text-phi-text-muted">
                        No messages in this session yet.
                    </p>
                    <p className="mt-1 text-[12px] text-phi-text-muted">
                        Prompt streaming lands in Phase C.
                    </p>
                </div>
            </div>
        );
    }
    const showLive = isStreaming;
    const hideLastWork =
        showLive &&
        (streaming.thinking.trim().length > 0 || streaming.tools.length > 0);
    return (
        <div
            ref={scrollerRef}
            className="mx-auto flex w-full flex-1 flex-col items-center overflow-y-auto px-6 pt-6"
        >
            <div className="w-2xl h-full flex flex-col">
                <Conversation messages={messages} hideLastWork={hideLastWork} />
                {showLive && (
                    <div className="pt-2">
                        <Streaming
                            text={streaming.text}
                            thinking={streaming.thinking}
                            tools={streaming.tools}
                            error={streaming.error}
                            isStreaming={isStreaming}
                        />
                    </div>
                )}
                {error && !isStreaming && (
                    <div className="rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[13px] text-phi-error-text">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
});

export default function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const sessions = useSessions();
    const chat = useChat();
    const models = useModels();
    const [modelError, setModelError] = useState<string | null>(null);
    const [draftModelKey, setDraftModelKey] = useState<string | undefined>(
        undefined,
    );
    const [draftThinking, setDraftThinking] = useState<
        import("./types/session").ThinkingLevel | undefined
    >(undefined);

    const activeTitle = useMemo(
        () =>
            chat.data?.sessionName ||
            chat.data?.header?.id ||
            chat.activeFile?.split("/").pop() ||
            "New chat",
        [chat.data?.sessionName, chat.data?.header?.id, chat.activeFile],
    );
    const activeCwd = chat.data?.cwd || chat.data?.header?.cwd;

    const ctxModel: any = (chat.data?.context as any)?.model;
    const ctxModelKey = ctxModel
        ? `${ctxModel.provider}/${ctxModel.modelId ?? ctxModel.id}`
        : undefined;
    const selectedModelKey = ctxModelKey ?? draftModelKey;
    const ctxThinking = (chat.data?.context as any)?.thinkingLevel as
        string | undefined;
    const thinkingLevel = ctxThinking ?? draftThinking;

    const handleSelectModel = useCallback(
        async (provider: string, id: string) => {
            const key = `${provider}/${id}`;
            if (!chat.activeFile) {
                setDraftModelKey(key);
                setModelError(null);
                return;
            }
            setModelError(null);
            const info = models.models.find(
                (m) => m.provider === provider && m.id === id,
            );
            const optimistic: any = info ?? { provider, id, modelId: id, name: id };
            // Optimistic only — no refresh. Model switch must not reload messages or flash "Loading…"
            chat.patchModel(optimistic, undefined);
            try {
                const res: any = await models.setModel(provider, id);
                if (res?.model) chat.patchModel(res.model, res.thinkingLevel);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                setModelError(msg);
                // Keep optimistic UI; do not reload history. Error banner is enough.
            }
        },
        [chat.activeFile, chat.patchModel, models.models, models.setModel],
    );

    // Debounced commit for thinking slider — UI patches instantly, server is debounced
    const thinkingCommitRef = useRef<number | null>(null);
    const pendingThinkingRef = useRef<
        import("./types/session").ThinkingLevel | null
    >(null);

    // flush pending thinking level to server (debounced)
    const flushThinking = useCallback(async () => {
        const level = pendingThinkingRef.current;
        pendingThinkingRef.current = null;
        thinkingCommitRef.current = null;
        if (!level || !chat.activeFile) return;
        try {
            const res: any = await models.setThinkingLevel(level);
            if (res?.thinkingLevel) chat.patchModel(null as any, res.thinkingLevel);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setModelError(msg);
        }
    }, [chat.activeFile, chat.patchModel, models.setThinkingLevel]);

    const handleThinkingChange = useCallback(
        (level: import("./types/session").ThinkingLevel) => {
            if (!chat.activeFile) {
                setDraftThinking(level);
                return;
            }
            setModelError(null);
            // Instant optimistic so slider feels snappy; never reload messages
            chat.patchModel(null as any, level);
            // Debounce server sync — sliding through values only commits last one
            pendingThinkingRef.current = level;
            if (thinkingCommitRef.current != null)
                window.clearTimeout(thinkingCommitRef.current);
            thinkingCommitRef.current = window.setTimeout(() => {
                flushThinking();
            }, 220);
        },
        [chat.activeFile, chat.patchModel, flushThinking],
    );

    // Cancel debounced thinking commit when session changes — don't apply level to wrong session
    useEffect(() => {
        return () => {
            if (thinkingCommitRef.current != null)
                window.clearTimeout(thinkingCommitRef.current);
        };
    }, []);
    useEffect(() => {
        // activeFile switched: drop pending commit for previous file
        if (thinkingCommitRef.current != null) {
            window.clearTimeout(thinkingCommitRef.current);
            thinkingCommitRef.current = null;
            pendingThinkingRef.current = null;
        }
    }, [chat.activeFile]);

    // Idle prefetch: warm top 5 recent sessions so first hover/click is often already cached (0ms)
    useEffect(() => {
        if (sessions.loading || sessions.groups.length === 0) return;
        const files: string[] = [];
        for (const g of sessions.groups) {
            for (const s of g.sessions) {
                if (s.path !== chat.activeFile) files.push(s.path);
                if (files.length >= 5) break;
            }
            if (files.length >= 5) break;
        }
        if (files.length === 0) return;
        const idle = (cb: () => void) =>
            (window as any).requestIdleCallback
                ? (window as any).requestIdleCallback(cb, { timeout: 2000 })
                : setTimeout(cb, 400);
        const cancelIdle = (id: any) =>
            (window as any).cancelIdleCallback
                ? (window as any).cancelIdleCallback(id)
                : clearTimeout(id);
        const id = idle(() => {
            files.forEach((f) => chat.prefetch(f));
        });
        return () => cancelIdle(id);
    }, [sessions.groups, sessions.loading, chat.activeFile, chat.prefetch]);

    useEffect(() => {
        if (chat.activeFile && chat.data?.context) {
            setDraftModelKey(undefined);
            setDraftThinking(undefined);
        }
    }, [chat.activeFile, chat.data?.context]);

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
                } catch { }
            }
            // Instant path: cached -> 0ms hydrate, then background revalidate + switch
            if (chat.hasCache(file)) {
                chat.hydrateFromCache(file);
                // background: keep server runtime in sync and refresh stale data without flash
                sessions
                    .switchTo(file)
                    .catch((e) => console.warn("switchSession failed", e));
                chat.revalidate(file);
                return;
            }
            // Cold path: instant loading feedback, then 1 RTT hydrate
            chat.prepareSwitch(file);
            try {
                const res = await sessions.switchTo(file);
                if ((res as any)?.context) {
                    chat.hydrateFromSwitch(res as any);
                } else {
                    await chat.openFile(file);
                }
            } catch (e) {
                console.warn("switchSession failed", e);
                await chat.openFile(file).catch(() => { });
            }
        },
        [
            sessions.switchTo,
            chat.openFile,
            chat.hydrateFromSwitch,
            chat.hydrateFromCache,
            chat.hasCache,
            chat.revalidate,
            chat.isStreaming,
            chat.abort,
            chat.activeFile,
            chat.prepareSwitch,
        ],
    );

    const handleNewChat = useCallback(async () => {
        if (chat.isStreaming) {
            const ok = window.confirm(
                "A response is still streaming. Starting a new chat will abort it. Continue?",
            );
            if (!ok) return;
            try {
                await chat.abort();
            } catch { }
        }
        chat.clear();
    }, [chat.clear, chat.isStreaming, chat.abort]);

    const handleRename = useCallback(
        async (file: string, name: string) => {
            await sessions.rename(file, name);
            chat.invalidateCache(file);
            if (chat.activeFile === file) await chat.refreshSilent();
        },
        [
            sessions.rename,
            chat.activeFile,
            chat.refreshSilent,
            chat.invalidateCache,
        ],
    );

    const handleDelete = useCallback(
        async (file: string) => {
            await sessions.remove(file);
            chat.invalidateCache(file);
            if (chat.activeFile === file) chat.clear();
        },
        [sessions.remove, chat.activeFile, chat.clear, chat.invalidateCache],
    );

    const handleSend = useCallback(
        async (content: string, images?: { type: "image"; data: string; mimeType: string }[]) => {
            if (!chat.activeFile && draftModelKey) {
                try {
                    const res = await createSession();
                    const file = res.file;
                    try {
                        await sessions.switchTo(file);
                    } catch { }
                    await chat.openFile(file);
                    sessions.addOptimistic(
                        file,
                        "/home/solaymanehimite/Dev/ship/Phi",
                        content,
                    );
                    const parsed = draftModelKey.includes("/")
                        ? {
                            provider: draftModelKey.split("/")[0],
                            id: draftModelKey.split("/").slice(1).join("/"),
                        }
                        : null;
                    if (parsed) {
                        try {
                            await models.setModel(parsed.provider, parsed.id);
                        } catch (e) {
                            setModelError(e instanceof Error ? e.message : String(e));
                        }
                    }
                    if (draftThinking) {
                        try {
                            await models.setThinkingLevel(draftThinking);
                        } catch (e) {
                            setModelError(e instanceof Error ? e.message : String(e));
                        }
                    }
                    setDraftModelKey(undefined);
                    setDraftThinking(undefined);
                    await chat.refreshSilent();
                } catch (e) {
                    console.warn("draft model pre-create failed", e);
                }
            }
            await chat.prompt(content, {
                images,
                onNewFile: (file, cwd, firstMessage) => {
                    const realCwd = cwd || chat.data?.cwd || "";
                    sessions.addOptimistic(
                        file,
                        realCwd || "/home/solaymanehimite/Dev/ship/Phi",
                        firstMessage,
                    );
                },
            });
            sessions.refresh({ silent: true });
        },
        [
            chat.prompt,
            chat.data?.cwd,
            sessions.addOptimistic,
            sessions.refresh,
            chat.activeFile,
            draftModelKey,
            draftThinking,
            models.setModel,
            models.setThinkingLevel,
            chat.openFile,
            chat.refreshSilent,
            sessions.switchTo,
        ],
    );

    const messages = useMemo(
        () => chat.data?.context.messages ?? [],
        [chat.data?.context.messages],
    );

    // stable header values memoized
    const headerTitle = useMemo(
        () => (chat.activeFile ? activeTitle : "New chat"),
        [chat.activeFile, activeTitle],
    );
    const headerCwd = useMemo(() => formatCwd(activeCwd), [activeCwd]);

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
                    onPrefetch={chat.prefetch}
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
                                    {headerCwd}
                                </span>
                                <span className="text-phi-separator">/</span>
                            </>
                        ) : null}
                        <span className="truncate font-medium text-phi-text-tertiary">
                            {headerTitle}
                        </span>
                    </div>
                    <div className="w-8" />
                </header>

                <section className="flex min-h-0 flex-1 flex-col">
                    {!chat.activeFile ? (
                        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6">
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
                        </div>
                    ) : (
                        <ChatViewport
                            activeFile={chat.activeFile}
                            loading={chat.loading}
                            error={chat.error}
                            messages={messages}
                            isStreaming={chat.isStreaming}
                            streaming={chat.streaming}
                        />
                    )}

                    <div className="shrink-0 px-4 sm:px-7">
                        {(modelError ||
                            (!models.loading &&
                                models.models.length === 0 &&
                                !models.error)) && (
                                <div className="mx-auto mb-2 w-full max-w-3xl">
                                    {modelError ? (
                                        <div className="flex items-center justify-between gap-2 rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[12.5px] text-phi-error-text">
                                            <span className="truncate">{modelError}</span>
                                            <button
                                                onClick={() => setModelError(null)}
                                                className="shrink-0 text-[11px] underline opacity-80 hover:opacity-100"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200/90">
                                            No models available — check auth (run{" "}
                                            <code className="rounded bg-black/20 px-1">pi auth</code>)
                                            or configure API keys. The model selector will populate
                                            after auth.
                                        </div>
                                    )}
                                </div>
                            )}
                        <Composer
                            onSend={handleSend}
                            onAbort={chat.abort}
                            isStreaming={chat.isStreaming}
                            models={models.models}
                            modelsLoading={models.loading}
                            modelsError={models.error}
                            selectedModelKey={selectedModelKey}
                            thinkingLevel={thinkingLevel}
                            onSelectModel={handleSelectModel}
                            onThinkingChange={handleThinkingChange}
                        />
                    </div>
                </section>
            </main>
            <ThemeEditor />
        </div>
    );
}
