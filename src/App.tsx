import { useCallback, useEffect, useRef, useState } from "react";
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

export default function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const sessions = useSessions();
    const chat = useChat();
    const models = useModels();
    const [modelError, setModelError] = useState<string | null>(null);
    // Draft selection for "New chat" (no activeFile) — so the pill still reflects user choice
    // before the first session exists. Applied on next prompt / create.
    const [draftModelKey, setDraftModelKey] = useState<string | undefined>(undefined);
    const [draftThinking, setDraftThinking] = useState<import("./types/session").ThinkingLevel | undefined>(undefined);

    const activeTitle =
        chat.data?.sessionName ||
        chat.data?.header?.id ||
        chat.activeFile?.split("/").pop() ||
        "New chat";
    const activeCwd = chat.data?.cwd || chat.data?.header?.cwd;

    // Derive "provider/id" key for the selector from session context; fall back to draft for New chat
    const ctxModel: any = (chat.data?.context as any)?.model;
    const ctxModelKey = ctxModel ? `${ctxModel.provider}/${ctxModel.modelId ?? ctxModel.id}` : undefined;
    const selectedModelKey = ctxModelKey ?? draftModelKey;
    const ctxThinking = (chat.data?.context as any)?.thinkingLevel as string | undefined;
    const thinkingLevel = ctxThinking ?? draftThinking;

    const handleSelectModel = useCallback(
        async (provider: string, id: string) => {
            const key = `${provider}/${id}`;
            // New chat: no session yet — keep draft so pill updates immediately and next prompt uses it
            if (!chat.activeFile) {
                setDraftModelKey(key);
                setModelError(null);
                return;
            }
            setModelError(null);
            // Optimistic — update pill instantly, don't block UI on server round-trip
            const info = models.models.find((m) => m.provider === provider && m.id === id);
            const optimistic: any = info ?? { provider, id, modelId: id, name: id };
            chat.patchModel(optimistic, undefined);
            try {
                const res: any = await models.setModel(provider, id);
                if (res?.model) chat.patchModel(res.model, res.thinkingLevel);
                // silent background sync, not awaited
                chat.refresh().catch(() => {});
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                setModelError(msg);
                chat.refresh().catch(() => {});
            }
        },
        [chat.activeFile, chat.patchModel, chat.refresh, models.models, models.setModel],
    );

    const handleThinkingChange = useCallback(
        async (level: import("./types/session").ThinkingLevel) => {
            if (!chat.activeFile) {
                setDraftThinking(level);
                return;
            }
            setModelError(null);
            // Optimistic — slider moves instantly
            chat.patchModel(null as any, level);
            try {
                const res: any = await models.setThinkingLevel(level);
                if (res?.thinkingLevel) chat.patchModel(null as any, res.thinkingLevel);
                chat.refresh().catch(() => {});
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                setModelError(msg);
                chat.refresh().catch(() => {});
            }
        },
        [chat.activeFile, chat.patchModel, chat.refresh, models.setThinkingLevel],
    );

    // When a session is opened, its context becomes authoritative — clear draft
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
            // If starting a new session with a draft model/thinking, materialize the session first
            // so setModel targets the correct file before the first prompt.
            if (!chat.activeFile && draftModelKey) {
                try {
                    const res = await createSession();
                    const file = res.file;
                    // Make runtime point at the new file
                    try {
                        await sessions.switchTo(file);
                    } catch {}
                    await chat.openFile(file);
                    sessions.addOptimistic(file, "/home/solaymanehimite/Dev/ship/Phi", content);
                    const parsed = draftModelKey.includes("/") ? { provider: draftModelKey.split("/")[0], id: draftModelKey.split("/").slice(1).join("/") } : null;
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
                    await chat.refresh();
                } catch (e) {
                    // fallback to normal prompt path if pre-materialization fails
                    console.warn("draft model pre-create failed", e);
                }
            }
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
        [chat.prompt, chat.data?.cwd, sessions.addOptimistic, sessions.refresh, chat.activeFile, draftModelKey, draftThinking, models.setModel, models.setThinkingLevel, chat.openFile, chat.refresh, sessions.switchTo],
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
                        {(modelError || (!models.loading && models.models.length === 0 && !models.error)) && (
                            <div className="mx-auto mb-2 w-full max-w-3xl">
                                {modelError ? (
                                    <div className="flex items-center justify-between gap-2 rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[12.5px] text-phi-error-text">
                                        <span className="truncate">{modelError}</span>
                                        <button onClick={() => setModelError(null)} className="shrink-0 text-[11px] underline opacity-80 hover:opacity-100">Dismiss</button>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200/90">
                                        No models available — check auth (run <code className="rounded bg-black/20 px-1">pi auth</code>) or configure API keys. The model selector will populate after auth.
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
