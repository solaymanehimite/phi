import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/composer";
import { DirectoryPicker } from "./components/directory-picker";
import { ModelSelector } from "./components/model-selector";
import { Conversation } from "./components/conversation/conversation";
import { Streaming } from "./components/conversation/streaming";
import { Sidebar } from "./components/sidebar";
import { Tabs } from "./components/tabs";
import { Button } from "./components/ui/button";
import { PanelLeftIcon } from "./components/ui/icons";
import { useSessions } from "./hooks/useSessions";
import { useChat } from "./hooks/useChat";
import { useModels } from "./hooks/useModels";
import { createSession, health } from "./lib/api";

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
        workItems: import("./types/work").WorkItem[];
        error?: string;
        startedAt?: number | null;
    };
}) {
    if (!activeFile) return null;
    if (loading) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <p className="py-10 text-center text-[13px] text-phi-text-muted">
                    Loading messages…
                </p>
            </div>
        );
    }
    if (error) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <div className="mx-auto mt-6 max-w-xl rounded-lg border border-phi-error-border bg-phi-error-bg px-4 py-3 text-[13px] text-phi-error-text">
                    {error}
                </div>
            </div>
        );
    }
    if (messages.length === 0) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6">
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
    const hideLastWork = showLive && streaming.workItems.length > 0;
    return (
        <div className="mx-auto flex w-full flex-1 flex-col items-center overflow-y-auto px-6 pt-6">
            <div className="w-2xl h-full flex flex-col">
                <Conversation messages={messages} hideLastWork={hideLastWork} />
                {showLive && (
                    <div className="pt-2">
                        <Streaming
                            text={streaming.text}
                            workItems={streaming.workItems}
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
    const [homeCwd, setHomeCwd] = useState("");
    const [newChatCwd, setNewChatCwd] = useState<string | null>(null);
    const [openTabIds, setOpenTabIds] = useState<(string | null)[]>([null]);
    const openTabIdsRef = useRef<(string | null)[]>([null]);

    const openSessionTab = useCallback((id: string) => {
        const current = openTabIdsRef.current;
        const next = current.filter((tabId) => tabId !== null);
        if (!next.includes(id)) next.push(id);
        if (next.length === current.length && next.every((tabId, index) => tabId === current[index])) return;
        openTabIdsRef.current = next;
        setOpenTabIds(next);
    }, []);

    const ensureNewChatTab = useCallback(() => {
        const current = openTabIdsRef.current;
        if (current.includes(null)) return;
        const next = [...current, null];
        openTabIdsRef.current = next;
        setOpenTabIds(next);
    }, []);

    // A draft tab becomes the persisted session tab when its first prompt creates a file.
    const promoteNewChatTab = useCallback((file: string) => {
        const current = openTabIdsRef.current;
        if (current.includes(file)) return;
        const next = [...current];
        const draftIndex = next.indexOf(null);
        if (draftIndex >= 0) next[draftIndex] = file;
        else next.push(file);
        openTabIdsRef.current = next;
        setOpenTabIds(next);
    }, []);

    useEffect(() => {
        let cancelled = false;
        health()
            .then((res) => {
                if (!cancelled && res.home) {
                    setHomeCwd(res.home);
                    setNewChatCwd((current) => current ?? res.home);
                }
            })
            .catch(() => {
                // The picker still accepts a path if the health request is unavailable.
            });
        return () => {
            cancelled = true;
        };
    }, []);

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
            const sessionFile = chat.activeFile;
            if (!sessionFile) {
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
            chat.patchModel(optimistic, undefined, sessionFile);
            try {
                const res: any = await models.setModel(sessionFile, provider, id);
                if (res?.model)
                    chat.patchModel(res.model, res.thinkingLevel, sessionFile);
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
    const pendingThinkingFileRef = useRef<string | null>(null);

    // flush pending thinking level to server (debounced)
    const flushThinking = useCallback(async () => {
        const level = pendingThinkingRef.current;
        const sessionFile = pendingThinkingFileRef.current;
        pendingThinkingRef.current = null;
        pendingThinkingFileRef.current = null;
        thinkingCommitRef.current = null;
        if (!level || !sessionFile) return;
        try {
            const res: any = await models.setThinkingLevel(sessionFile, level);
            if (res?.thinkingLevel)
                chat.patchModel(null as any, res.thinkingLevel, sessionFile);
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
            const sessionFile = chat.activeFile;
            setModelError(null);
            // Instant optimistic so slider feels snappy; never reload messages
            chat.patchModel(null as any, level, sessionFile);
            // Debounce server sync — sliding through values only commits last one
            pendingThinkingRef.current = level;
            pendingThinkingFileRef.current = sessionFile;
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
            pendingThinkingFileRef.current = null;
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

    const focusComposer = useCallback(() => {
        requestAnimationFrame(() => {
            document
                .querySelector<HTMLTextAreaElement>('textarea[aria-label="Message Pi"]')
                ?.focus();
        });
    }, []);

    const handleSelect = useCallback(
        async (file: string) => {
            openSessionTab(file);
            if (file === chat.activeFile) {
                focusComposer();
                return;
            }
            // Selection only changes the viewport. Streams and their SSE readers
            // remain attached to their own session files in useChat.
            if (chat.hasCache(file)) {
                chat.hydrateFromCache(file);
                sessions
                    .switchTo(file)
                    .catch((e) => console.warn("switchSession failed", e));
                chat.revalidate(file);
                focusComposer();
                return;
            }
            chat.prepareSwitch(file);
            try {
                const res = await sessions.switchTo(file);
                if ((res as any)?.context) chat.hydrateFromSwitch(res as any);
                else await chat.openFile(file);
            } catch (e) {
                console.warn("switchSession failed", e);
                await chat.openFile(file).catch(() => { });
            } finally {
                focusComposer();
            }
        },
        [
            openSessionTab,
            sessions.switchTo,
            chat.openFile,
            chat.hydrateFromSwitch,
            chat.hydrateFromCache,
            chat.hasCache,
            chat.revalidate,
            chat.activeFile,
            chat.prepareSwitch,
            focusComposer,
        ],
    );

    const handleNewChat = useCallback(() => {
        ensureNewChatTab();
        chat.clear();
        focusComposer();
    }, [chat.clear, ensureNewChatTab, focusComposer]);

    const handleCloseTab = useCallback(
        (id: string | null) => {
            const current = openTabIdsRef.current;
            if (id === null && current.length === 1) return;
            const index = current.indexOf(id);
            if (index < 0) return;

            const next = current.filter((tabId) => tabId !== id);
            const nextActiveId = next[index] ?? next[index - 1] ?? null;
            openTabIdsRef.current = next.length > 0 ? next : [null];
            setOpenTabIds(openTabIdsRef.current);

            const isActive = id === chat.activeFile || (id === null && chat.activeFile === null);
            if (!isActive) return;
            if (nextActiveId === null) handleNewChat();
            else void handleSelect(nextActiveId);
        },
        [chat.activeFile, handleNewChat, handleSelect],
    );

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
            if (openTabIdsRef.current.includes(file)) handleCloseTab(file);
            chat.invalidateCache(file);
            chat.removeFile(file);
        },
        [sessions.remove, handleCloseTab, chat.removeFile, chat.invalidateCache],
    );

    const handleAbort = useCallback(async () => {
        await chat.abort();
        focusComposer();
    }, [chat.abort, focusComposer]);

    const handleSend = useCallback(
        async (
            content: string,
            images?: { type: "image"; data: string; mimeType: string }[],
        ) => {
            let preparedSessionFile: string | undefined;
            const selectedCwd = !chat.activeFile
                ? (newChatCwd ?? homeCwd) || undefined
                : undefined;
            if (!chat.activeFile && (draftModelKey || draftThinking)) {
                try {
                    const res = await createSession(selectedCwd);
                    const file = res.file;
                    preparedSessionFile = file;
                    promoteNewChatTab(file);
                    try {
                        await sessions.switchTo(file, selectedCwd);
                    } catch { }
                    await chat.openFile(file);
                    sessions.addOptimistic(
                        file,
                        selectedCwd || "/home/solaymanehimite/Dev/ship/Phi",
                        content,
                    );
                    const parsed = draftModelKey?.includes("/")
                        ? {
                            provider: draftModelKey.split("/")[0],
                            id: draftModelKey.split("/").slice(1).join("/"),
                        }
                        : null;
                    if (parsed) {
                        try {
                            const res: any = await models.setModel(
                                file,
                                parsed.provider,
                                parsed.id,
                            );
                            if (res?.model)
                                chat.patchModel(res.model, res.thinkingLevel, file);
                        } catch (e) {
                            setModelError(e instanceof Error ? e.message : String(e));
                        }
                    }
                    if (draftThinking) {
                        try {
                            await models.setThinkingLevel(file, draftThinking);
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
                cwd: selectedCwd,
                images,
                sessionFile: preparedSessionFile,
                onNewFile: (file, cwd, firstMessage) => {
                    const realCwd = cwd || chat.data?.cwd || selectedCwd || "";
                    promoteNewChatTab(file);
                    sessions.addOptimistic(
                        file,
                        realCwd || "/home/solaymanehimite/Dev/ship/Phi",
                        firstMessage,
                    );
                },
            });
            sessions.refresh({ silent: true });
            focusComposer();
        },
        [
            chat.prompt,
            chat.data?.cwd,
            newChatCwd,
            homeCwd,
            sessions.addOptimistic,
            sessions.refresh,
            chat.activeFile,
            draftModelKey,
            draftThinking,
            models.setModel,
            models.setThinkingLevel,
            promoteNewChatTab,
            chat.patchModel,
            chat.openFile,
            chat.refreshSilent,
            sessions.switchTo,
            focusComposer,
        ],
    );

    const messages = useMemo(
        () => chat.data?.context.messages ?? [],
        [chat.data?.context.messages],
    );

    const tabItems = useMemo(
        () =>
            openTabIds.map((id) => {
                if (id === null) {
                    return { id, title: "New chat" };
                }
                const session = sessions.sessions.find((item) => item.path === id);
                const fallback = id.split("/").pop() || "Session";
                const title =
                    session?.name?.trim() ||
                    session?.firstMessage?.trim() ||
                    (id === chat.activeFile ? activeTitle : fallback);
                return {
                    id,
                    title: title.length > 42 ? `${title.slice(0, 42).trim()}…` : title,
                    isRunning: chat.runningFiles.has(id),
                };
            }),
        [activeTitle, chat.activeFile, chat.runningFiles, openTabIds, sessions.sessions],
    );

    return (
        <div className="flex h-screen min-h-[480px] overflow-hidden bg-phi-bg-sidebar text-phi-text-primary antialiased selection:bg-phi-accent/25">
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
                    runningFiles={chat.runningFiles}
                    onPrefetch={chat.prefetch}
                />
            )}

            <main
                className="relative flex min-w-0 flex-1 flex-col bg-phi-bg-sidebar px-2 pb-2"
            >
                <Tabs
                    leadingAction={!sidebarOpen ? (
                        <Button
                            variant="icon"
                            aria-label="Open sidebar"
                            title="Open sidebar"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <PanelLeftIcon />
                        </Button>
                    ) : null}
                    tabs={tabItems}
                    activeId={chat.activeFile}
                    onSelect={(id) => id === null ? handleNewChat() : void handleSelect(id)}
                    onClose={handleCloseTab}
                />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-phi-border-subtle bg-phi-bg-main shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
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
                            <div className="mx-auto pl-6 mb-1 flex w-full max-w-3xl min-w-0 items-center gap-1">
                                {!chat.activeFile && (
                                    <DirectoryPicker
                                        cwd={(newChatCwd ?? homeCwd) || null}
                                        homeCwd={homeCwd}
                                        projects={sessions.groups.map(({ cwd, displayCwd }) => ({
                                            cwd,
                                            displayCwd,
                                        }))}
                                        onChange={setNewChatCwd}
                                        disabled={chat.isStreaming}
                                    />
                                )}
                                <ModelSelector
                                    models={models.models}
                                    value={selectedModelKey}
                                    thinkingLevel={thinkingLevel}
                                    onSelect={handleSelectModel}
                                    onThinkingChange={handleThinkingChange}
                                    disabled={chat.isStreaming}
                                    isStreaming={chat.isStreaming}
                                    loading={models.loading}
                                    error={models.error}
                                />
                            </div>
                            <Composer
                                onSend={handleSend}
                                onAbort={handleAbort}
                                isStreaming={chat.isStreaming}
                                cwd={chat.activeFile ? activeCwd : (newChatCwd ?? homeCwd)}
                            />
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
