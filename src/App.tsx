import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/composer";
import { DirectoryPicker } from "./components/directory-picker";
import { ModelSelector } from "./components/model-selector";
import { Conversation } from "./components/conversation/conversation";
import { Streaming } from "./components/conversation/streaming";
import { Sidebar } from "./components/sidebar";
import { SearchSessionsButton, SessionCommand } from "./components/session-command";
import { Tabs } from "./components/tabs";
import { Button } from "./components/ui/button";
import { PanelLeftIcon } from "./components/ui/icons";
import { useSessions } from "./hooks/useSessions";
import { useChat } from "./hooks/useChat";
import { useCompaction } from "./hooks/useCompaction";
import { useModels } from "./hooks/useModels";
import { createSession, health, streamContinue } from "./lib/api";
import { CompactionIndicator } from "./components/compaction-indicator";
import { useTheme } from "./hooks/useTheme";
import { useHealth } from "./hooks/useHealth";
import { FatalState } from "./components/fatal";
import { SettingsPage } from "./components/settings";
import { useShortcuts } from "./hooks/useShortcuts";
import { clearDraftFor } from "./hooks/useDraft";
import { InlineErrorBlock, type InlineError } from "./components/inline-error";

// Isolated scroll-aware viewport so App doesn't need to re-render on every streaming token
const ChatViewport = memo(function ChatViewport({
    activeFile,
    loading,
    error,
    messages,
    isStreaming,
    streaming,
    inlineError,
    archivedErrors,
    onContinue,
    onDismiss,
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
    inlineError?: InlineError | null;
    archivedErrors?: InlineError[];
    onContinue?: () => void;
    onDismiss?: () => void;
}) {
    if (!activeFile) return null;
    if (loading) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <p className="py-10 text-center text-[13px] text-phi-text-muted">Loading messages…</p>
            </div>
        );
    }
    if (error && messages.length === 0) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <div className="mx-auto mt-6 max-w-xl rounded-lg border border-phi-error-border bg-phi-error-bg px-4 py-3 text-[13px] text-phi-error-text">{error}</div>
            </div>
        );
    }
    if (messages.length === 0) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                    <p className="text-[13px] text-phi-text-muted">No messages in this session yet.</p>
                    <p className="mt-1 text-[12px] text-phi-text-muted">Prompt streaming lands in Phase C.</p>
                    {inlineError && <InlineErrorBlock error={inlineError} onContinue={onContinue} onDismiss={onDismiss!} />}
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
                    <div className="pt-2 phi-work-stagger">
                        <Streaming text={streaming.text} workItems={streaming.workItems} error={streaming.error} isStreaming={isStreaming} />
                    </div>
                )}
                {archivedErrors?.map((e) => (
                    <InlineErrorBlock key={e.id} error={e} onDismiss={() => {}} archived />
                ))}
                {inlineError && <InlineErrorBlock error={inlineError} onContinue={onContinue} onDismiss={onDismiss!} />}
                {error && !isStreaming && !inlineError && (
                    <div className="mx-auto mt-3 w-full max-w-3xl rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[13px] text-phi-error-text">{error}</div>
                )}
            </div>
        </div>
    );
});

export default function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const sessions = useSessions();
    const chat = useChat();
    const compaction = useCompaction({ revalidate: chat.revalidate });
    const lastCompactInstructionsRef = useRef<Record<string, string | undefined>>({});
    const models = useModels();
    useTheme();
    const healthHook = useHealth(3000);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [modelError, setModelError] = useState<string | null>(null);
    const [draftModelKey, setDraftModelKey] = useState<string | undefined>(undefined);
    const [draftThinking, setDraftThinking] = useState<import("./types/session").ThinkingLevel | undefined>(undefined);
    const [homeCwd, setHomeCwd] = useState("");
    const [newChatCwd, setNewChatCwd] = useState<string | null>(null);
    const [openTabIds, setOpenTabIds] = useState<(string | null)[]>([null]);
    const openTabIdsRef = useRef<(string | null)[]>([null]);
    // inline errors per session: tail node
    const [inlineErrors, setInlineErrors] = useState<Record<string, InlineError>>({});
    const [archivedErrors, setArchivedErrors] = useState<Record<string, InlineError[]>>({});
    const directoryPickerRef = useRef<HTMLDivElement>(null);

    // quit guard
    useEffect(() => {
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (chat.runningFiles.size > 0) {
                e.preventDefault();
                e.returnValue = `${chat.runningFiles.size} session(s) streaming — abort and quit?`;
                return e.returnValue;
            }
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [chat.runningFiles.size]);

    // Tauri close-requested
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        (async () => {
            try {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                const win = getCurrentWindow();
                unlisten = await win.onCloseRequested(async (event) => {
                    if (chat.runningFiles.size > 0) {
                        const { confirm } = await import("@tauri-apps/plugin-dialog");
                        const ok = await confirm(`${chat.runningFiles.size} session(s) streaming — abort and quit?`, { title: "Phi", kind: "warning" });
                        if (!ok) {
                            event.preventDefault();
                            return;
                        }
                        // abort all running then allow close, and persist interruption blocks
                        for (const f of Array.from(chat.runningFiles)) {
                            try { await chat.abort(f); } catch {}
                            const err: InlineError = { id: `${f}-${Date.now()}`, reason: "Interruption", message: "Session interrupted by quit. You can Continue to resume.", time: new Date().toLocaleTimeString(), canContinue: true };
                            setInlineErrors((prev) => ({ ...prev, [f]: err }));
                        }
                    }
                });
            } catch {}
        })();
        return () => { try { unlisten?.(); } catch {} };
    }, [chat.runningFiles, chat.abort]);

    const setInlineFor = useCallback((file: string, err: InlineError | null) => {
        if (!err) {
            setInlineErrors((prev) => {
                const { [file]: _, ...rest } = prev;
                return rest;
            });
            return;
        }
        setInlineErrors((prev) => ({ ...prev, [file]: err }));
    }, []);

    const archiveInline = useCallback((file: string) => {
        setInlineErrors((prev) => {
            const cur = prev[file];
            if (!cur) return prev;
            const { [file]: _, ...rest } = prev;
            setArchivedErrors((a) => ({ ...a, [file]: [...(a[file] ?? []), cur] }));
            return rest;
        });
    }, []);

    const makeInlineReason = (msg: string): InlineError["reason"] => {
        const lower = msg.toLowerCase();
        if (lower.includes("abort")) return "Abort";
        if (lower.includes("interrupt")) return "Interruption";
        if (lower.includes("auth") || lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) return "Auth";
        if (lower.includes("rate") || lower.includes("429")) return "Rate limit";
        if (lower.includes("provider") || lower.includes("down") || lower.includes("overload") || lower.includes("5")) return "Provider down";
        return "Error";
    };

    // auto-map chat.error (stream error) to inline block
    useEffect(() => {
        const f = chat.activeFile;
        if (!f || !chat.error || chat.isStreaming) return;
        // avoid override if already has inline for this file with same message
        if (inlineErrors[f]?.message === chat.error) return;
        const reason = makeInlineReason(chat.error);
        const canContinue = reason === "Abort" || reason === "Interruption";
        const err: InlineError = { id: `${f}-${Date.now()}`, reason, message: chat.error, time: new Date().toLocaleTimeString(), canContinue };
        setInlineFor(f, err);
    }, [chat.error, chat.activeFile, chat.isStreaming, inlineErrors, setInlineFor]);

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
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const activeTitle = useMemo(() => chat.data?.sessionName || chat.data?.header?.id || chat.activeFile?.split("/").pop() || "New chat", [chat.data?.sessionName, chat.data?.header?.id, chat.activeFile]);
    const activeCwd = chat.data?.cwd || chat.data?.header?.cwd;

    const ctxModel: any = (chat.data?.context as any)?.model;
    const ctxModelKey = ctxModel ? `${ctxModel.provider}/${ctxModel.modelId ?? ctxModel.id}` : undefined;
    const selectedModelKey = ctxModelKey ?? draftModelKey;
    const ctxThinking = (chat.data?.context as any)?.thinkingLevel as string | undefined;
    const thinkingLevel = ctxThinking ?? draftThinking;

    const handleSelectModel = useCallback(async (provider: string, id: string) => {
        const key = `${provider}/${id}`;
        const sessionFile = chat.activeFile;
        if (!sessionFile) {
            setDraftModelKey(key);
            setModelError(null);
            return;
        }
        setModelError(null);
        const info = models.models.find((m) => m.provider === provider && m.id === id);
        const optimistic: any = info ?? { provider, id, modelId: id, name: id };
        chat.patchModel(optimistic, undefined, sessionFile);
        try {
            const res: any = await models.setModel(sessionFile, provider, id);
            if (res?.model) chat.patchModel(res.model, res.thinkingLevel, sessionFile);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // move auth errors to inline block instead of banner
            const reason = makeInlineReason(msg);
            if (reason === "Auth" || reason === "Rate limit" || reason === "Provider down") {
                const err: InlineError = { id: `${sessionFile}-${Date.now()}`, reason, message: msg, time: new Date().toLocaleTimeString(), canContinue: false };
                setInlineFor(sessionFile, err);
            } else setModelError(msg);
        }
    }, [chat.activeFile, chat.patchModel, models.models, models.setModel, setInlineFor]);

    const thinkingCommitRef = useRef<number | null>(null);
    const pendingThinkingRef = useRef<import("./types/session").ThinkingLevel | null>(null);
    const pendingThinkingFileRef = useRef<string | null>(null);

    const flushThinking = useCallback(async () => {
        const level = pendingThinkingRef.current;
        const sessionFile = pendingThinkingFileRef.current;
        pendingThinkingRef.current = null;
        pendingThinkingFileRef.current = null;
        thinkingCommitRef.current = null;
        if (!level || !sessionFile) return;
        try {
            const res: any = await models.setThinkingLevel(sessionFile, level);
            if (res?.thinkingLevel) chat.patchModel(null as any, res.thinkingLevel, sessionFile);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setModelError(msg);
        }
    }, [models.setThinkingLevel, chat.patchModel]);

    const handleThinkingChange = useCallback((level: import("./types/session").ThinkingLevel) => {
        if (!chat.activeFile) { setDraftThinking(level); return; }
        const sessionFile = chat.activeFile;
        setModelError(null);
        chat.patchModel(null as any, level, sessionFile);
        pendingThinkingRef.current = level;
        pendingThinkingFileRef.current = sessionFile;
        if (thinkingCommitRef.current != null) window.clearTimeout(thinkingCommitRef.current);
        thinkingCommitRef.current = window.setTimeout(() => { void flushThinking(); }, 220);
    }, [chat.activeFile, chat.patchModel, flushThinking]);

    useEffect(() => { return () => { if (thinkingCommitRef.current != null) window.clearTimeout(thinkingCommitRef.current); }; }, []);
    useEffect(() => {
        if (thinkingCommitRef.current != null) {
            window.clearTimeout(thinkingCommitRef.current);
            thinkingCommitRef.current = null;
            pendingThinkingRef.current = null;
            pendingThinkingFileRef.current = null;
        }
    }, [chat.activeFile]);

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
        const idle = (cb: () => void) => (window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 400);
        const cancelIdle = (id: any) => (window as any).cancelIdleCallback ? (window as any).cancelIdleCallback(id) : clearTimeout(id);
        const id = idle(() => { files.forEach((f) => chat.prefetch(f)); });
        return () => cancelIdle(id);
    }, [sessions.groups, sessions.loading, chat.activeFile, chat.prefetch]);

    useEffect(() => {
        if (chat.activeFile && chat.data?.context) { setDraftModelKey(undefined); setDraftThinking(undefined); }
    }, [chat.activeFile, chat.data?.context]);

    const focusComposer = useCallback(() => {
        requestAnimationFrame(() => { document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message Pi"]')?.focus(); });
    }, []);
    const focusProjectPicker = useCallback(() => {
        const el = document.querySelector<HTMLElement>('[data-project-picker-trigger]');
        if (!el) return;
        // HeadlessUI Popover opens on click — click to open dropdown
        (el as HTMLButtonElement).click();
        // After panel mounts, focus the search input (autoFocus is fallback, but ensure for Ctrl+P)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const input = document.querySelector<HTMLElement>('input[aria-label="Search projects"]');
                if (input) input.focus();
                else el.focus();
            });
        });
    }, []);

    const handleSelect = useCallback(async (file: string) => {
        openSessionTab(file);
        if (file === chat.activeFile) { focusComposer(); return; }
        if (chat.hasCache(file)) {
            chat.hydrateFromCache(file);
            sessions.switchTo(file).catch((e) => console.warn("switchSession failed", e));
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
            await chat.openFile(file).catch(() => {});
        } finally { focusComposer(); }
    }, [openSessionTab, sessions.switchTo, chat.openFile, chat.hydrateFromSwitch, chat.hydrateFromCache, chat.hasCache, chat.revalidate, chat.activeFile, chat.prepareSwitch, focusComposer]);

    const handleNewChat = useCallback(() => { ensureNewChatTab(); chat.clear(); focusComposer(); }, [chat.clear, ensureNewChatTab, focusComposer]);

    const handleCloseTab = useCallback((id: string | null) => {
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
    }, [chat.activeFile, handleNewChat, handleSelect]);

    const handleRename = useCallback(async (file: string, name: string) => {
        await sessions.rename(file, name);
        chat.invalidateCache(file);
        if (chat.activeFile === file) await chat.refreshSilent();
    }, [sessions.rename, chat.activeFile, chat.refreshSilent, chat.invalidateCache]);

    const handleDelete = useCallback(async (file: string) => {
        await sessions.remove(file);
        if (openTabIdsRef.current.includes(file)) handleCloseTab(file);
        chat.invalidateCache(file);
        chat.removeFile(file);
        setInlineFor(file, null);
    }, [sessions.remove, handleCloseTab, chat.removeFile, chat.invalidateCache, setInlineFor]);

    const handleDeleteCurrent = useCallback(async () => {
        const f = chat.activeFile;
        if (!f) return;
        if (!confirm("Delete current session?")) return;
        await handleDelete(f);
    }, [chat.activeFile, handleDelete]);

    const handleAbort = useCallback(async () => {
        const f = chat.activeFile;
        if (!f) return;
        if (compaction.isCompacting(f)) {
            await compaction.abort(f);
            focusComposer();
            return;
        }
        await chat.abort(f);
        const err: InlineError = { id: `${f}-${Date.now()}`, reason: "Abort", message: "Aborted by user.", time: new Date().toLocaleTimeString(), canContinue: true };
        setInlineFor(f, err);
        focusComposer();
    }, [chat.abort, chat.activeFile, compaction, focusComposer, setInlineFor]);

    const handleAbortCompaction = useCallback(async () => {
        const f = chat.activeFile;
        if (!f) return;
        await compaction.abort(f);
        focusComposer();
    }, [chat.activeFile, compaction, focusComposer]);

    const handleRetryCompaction = useCallback(async () => {
        const f = chat.activeFile;
        if (!f) return;
        const instr = lastCompactInstructionsRef.current[f];
        const cwd = (chat.data as unknown as { cwd?: string })?.cwd || (chat.data as unknown as { header?: { cwd?: string } })?.header?.cwd;
        try {
            await compaction.retry(f, instr, cwd);
            sessions.refresh({ silent: true });
        } catch {}
        focusComposer();
    }, [chat.activeFile, chat.data, compaction, sessions, focusComposer]);

    const handleContinue = useCallback(async () => {
        const f = chat.activeFile;
        if (!f) return;
        const cwd = activeCwd || newChatCwd || homeCwd;
        // optimistic: keep inline for now, clear archived? Continue will resume
        setInlineFor(f, null);
        try {
            // use sidecar continue streaming via same mechanism as prompt but via streamContinue
            // we replicate chat streaming logic here minimal
            await (chat as any).continueStreaming?.(f, cwd);
        } catch {
            // fallback to direct streamContinue
            try {
                await streamContinue({ sessionFile: f, cwd }, () => {});
                await chat.revalidate(f);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                const err: InlineError = { id: `${f}-${Date.now()}`, reason: makeInlineReason(msg), message: msg, time: new Date().toLocaleTimeString(), canContinue: msg.includes("continue") ? false : true };
                setInlineFor(f, err);
            }
        }
    }, [chat, activeCwd, newChatCwd, homeCwd, setInlineFor]);

    const handleSend = useCallback(async (content: string, images?: { type: "image"; data: string; mimeType: string }[]) => {
        const trimmed = content.trim();
        // /compact with optional instructions — keep verbatim routing even while streaming (compact will abort streaming)
        if (trimmed.startsWith("/compact")) {
            const after = trimmed.slice("/compact".length).trim();
            // allow "/compact" alone or with instructions; treat whitespace-only after as no instructions
            const isCompactCommand = trimmed === "/compact" || trimmed.startsWith("/compact ") || trimmed.startsWith("/compact\t") || trimmed.startsWith("/compact\n") || after.length >= 0 && trimmed.startsWith("/compact");
            if (isCompactCommand) {
                const instructions = after || undefined;
                const targetFile = chat.activeFile;
                if (!targetFile) {
                    setModelError("Open a session to compact.");
                    return;
                }
                if (chat.isStreaming) {
                    // compact will abort internally, but surface a hint
                    try { await chat.abort(targetFile); } catch {}
                }
                lastCompactInstructionsRef.current[targetFile] = instructions;
                // archive inline error before compact
                archiveInline(targetFile);
                try {
                    const cwd = activeCwd || undefined;
                    await compaction.compact(targetFile, instructions, cwd);
                    sessions.refresh({ silent: true });
                } catch {}
                clearDraftFor(targetFile);
                focusComposer();
                return;
            }
        }
        // archive inline error on new prompt
        if (chat.activeFile) archiveInline(chat.activeFile);
        else if (content.trim()) clearDraftFor(null);
        let preparedSessionFile: string | undefined;
        const selectedCwd = !chat.activeFile ? (newChatCwd ?? homeCwd) || undefined : undefined;
        if (!chat.activeFile && (draftModelKey || draftThinking)) {
            try {
                const res = await createSession(selectedCwd);
                const file = res.file;
                preparedSessionFile = file;
                promoteNewChatTab(file);
                try { await sessions.switchTo(file, selectedCwd); } catch {}
                await chat.openFile(file);
                sessions.addOptimistic(file, selectedCwd || "/home/solaymanehimite/Dev/ship/Phi", content);
                const parsed = draftModelKey?.includes("/") ? { provider: draftModelKey.split("/")[0], id: draftModelKey.split("/").slice(1).join("/") } : null;
                if (parsed) {
                    try { const res: any = await models.setModel(file, parsed.provider, parsed.id); if (res?.model) chat.patchModel(res.model, res.thinkingLevel, file); } catch (e) { setModelError(e instanceof Error ? e.message : String(e)); }
                }
                if (draftThinking) { try { await models.setThinkingLevel(file, draftThinking); } catch (e) { setModelError(e instanceof Error ? e.message : String(e)); } }
                setDraftModelKey(undefined); setDraftThinking(undefined);
                await chat.refreshSilent();
            } catch (e) { console.warn("draft model pre-create failed", e); }
        }
        try {
            await chat.prompt(content, {
                cwd: selectedCwd,
                images,
                sessionFile: preparedSessionFile,
                onNewFile: (file, cwd, firstMessage) => {
                    const realCwd = cwd || chat.data?.cwd || selectedCwd || "";
                    promoteNewChatTab(file);
                    sessions.addOptimistic(file, realCwd || "/home/solaymanehimite/Dev/ship/Phi", firstMessage);
                },
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const target = preparedSessionFile ?? chat.activeFile;
            if (target) {
                const err: InlineError = { id: `${target}-${Date.now()}`, reason: makeInlineReason(msg), message: msg, time: new Date().toLocaleTimeString(), canContinue: msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("interrupt") };
                setInlineFor(target, err);
            } else setModelError(msg);
        }
        if (chat.activeFile || preparedSessionFile) clearDraftFor(chat.activeFile ?? preparedSessionFile ?? null);
        sessions.refresh({ silent: true });
        focusComposer();
    }, [chat.prompt, chat.data?.cwd, activeCwd, newChatCwd, homeCwd, sessions.addOptimistic, sessions.refresh, chat.activeFile, chat.isStreaming, chat.abort, draftModelKey, draftThinking, models.setModel, models.setThinkingLevel, promoteNewChatTab, chat.patchModel, chat.openFile, chat.refreshSilent, sessions.switchTo, focusComposer, archiveInline, setInlineFor, compaction]);

    const messages = useMemo(() => chat.data?.context.messages ?? [], [chat.data?.context.messages]);

    const tabItems = useMemo(() => openTabIds.map((id) => {
        if (id === null) return { id, title: "New chat" };
        const session = sessions.sessions.find((item) => item.path === id);
        const fallback = id.split("/").pop() || "Session";
        const title = session?.name?.trim() || session?.firstMessage?.trim() || (id === chat.activeFile ? activeTitle : fallback);
        return { id, title: title.length > 42 ? `${title.slice(0, 42).trim()}…` : title, isRunning: chat.runningFiles.has(id) };
    }), [activeTitle, chat.activeFile, chat.runningFiles, openTabIds, sessions.sessions]);

    // shortcuts
    useShortcuts({
        onNewChat: handleNewChat,
        onCloseTab: () => handleCloseTab(chat.activeFile),
        onDeleteSession: () => void handleDeleteCurrent(),
        onFocusProject: focusProjectPicker,
        onOpenSearch: () => {},
        onOpenSettings: () => setSettingsOpen(true),
        onAbort: () => void handleAbort(),
    }, { isStreaming: chat.isStreaming });

    // fatal gate
    if (healthHook.fatal) {
        return <FatalState error={healthHook.health?.error ?? null} home={healthHook.health?.home} port={healthHook.health?.port} agentDir={healthHook.health?.agentDir} onRetry={async () => { await healthHook.retry(); }} />;
    }

    if (settingsOpen) {
        return <SettingsPage onClose={() => setSettingsOpen(false)} onProvidersChanged={() => models.refresh({ silent: true })} />;
    }

    return (
        <SessionCommand groups={sessions.groups} loading={sessions.loading} error={sessions.error} onSelect={(file) => void handleSelect(file)}>
            {(openSearch) => {
                // inject openSearch into shortcuts
                // we need to expose via ref hack: set onOpenSearch dynamic
                // For simplicity, handle Cmd+K via SessionCommand itself; shortcuts for K is no-op
                return (
                    <div className="phi-layout text-phi-text-primary antialiased selection:bg-phi-accent/25">
                        <div
                            className="phi-sidebar-wrap"
                            data-collapsed={sidebarOpen ? "false" : "true"}
                            aria-hidden={!sidebarOpen}
                        >
                            <Sidebar
                                groups={sessions.groups}
                                activeFile={chat.activeFile}
                                onSelect={handleSelect}
                                onNewChat={handleNewChat}
                                onOpenSettings={() => setSettingsOpen(true)}
                                collapsed={sessions.collapsed}
                                onToggleGroup={sessions.toggleGroup}
                                onRename={handleRename}
                                onDelete={handleDelete}
                                loading={sessions.loading}
                                error={sessions.error}
                                runningFiles={chat.runningFiles}
                                onPrefetch={chat.prefetch}
                            />
                        </div>

                        <main className="phi-main bg-phi-bg-sidebar px-2 pb-2" data-sidebar-collapsed={sidebarOpen ? "false" : "true"}>
                            <Tabs
                                sidebarActions={
                                    <div className="flex items-center gap-1">
                                        <SearchSessionsButton onClick={openSearch} />
                                        <Button
                                            variant="icon"
                                            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                                            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                                            onClick={() => setSidebarOpen((open) => !open)}
                                        >
                                            <PanelLeftIcon />
                                        </Button>
                                    </div>
                                }
                                sidebarCollapsed={!sidebarOpen}
                                tabs={tabItems}
                                activeId={chat.activeFile}
                                onSelect={(id) => id === null ? handleNewChat() : void handleSelect(id)}
                                onClose={handleCloseTab}
                            />
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-phi-border-subtle bg-phi-bg-main shadow-[0_8px_30px_var(--color-phi-shadow)]">
                                <section className="flex min-h-0 flex-1 flex-col">
                                    {!chat.activeFile ? (
                                        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                                            <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                                                <img
                                                    src="/logo_small.svg"
                                                    alt=""
                                                    aria-hidden="true"
                                                    className="phi-empty-logo"
                                                />
                                                {!sessions.loading && sessions.groups.length === 0 && !sessions.error && (
                                                    <p className="mt-6 text-[12px] text-phi-text-muted">No sessions found — run `pi` in a project to create one.</p>
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
                                            inlineError={chat.activeFile ? inlineErrors[chat.activeFile] ?? null : null}
                                            archivedErrors={chat.activeFile ? archivedErrors[chat.activeFile] ?? [] : []}
                                            onContinue={handleContinue}
                                            onDismiss={() => chat.activeFile && setInlineFor(chat.activeFile, null)}
                                        />
                                    )}

                                    <div className="shrink-0 px-4 sm:px-7">
                                        {(modelError) && (
                                            <div className="mx-auto mb-2 w-full max-w-3xl">
                                                <div className="flex items-center justify-between gap-2 rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[12.5px] text-phi-error-text">
                                                    <span className="truncate">{modelError}</span>
                                                    <button onClick={() => setModelError(null)} className="shrink-0 text-[11px] underline opacity-80 hover:opacity-100">Dismiss</button>
                                                </div>
                                            </div>
                                        )}
                                        {!modelError && !models.loading && models.models.length === 0 && !models.error && (
                                            <div className="mx-auto mb-2 w-full max-w-3xl">
                                                <div className="rounded-lg border border-phi-warning-border bg-phi-warning-bg px-3 py-2 text-[12.5px] text-phi-warning-text">
                                                    No models available — check auth (run <code className="rounded bg-phi-overlay px-1">pi auth</code>) or configure API keys. The model selector will populate after auth.
                                                </div>
                                            </div>
                                        )}
                                        <div className="mx-auto pl-6 mb-1 flex w-full max-w-3xl min-w-0 items-center gap-1" ref={directoryPickerRef}>
                                            {!chat.activeFile && (
                                                <DirectoryPicker cwd={(newChatCwd ?? homeCwd) || null} homeCwd={homeCwd} projects={sessions.groups.map(({ cwd, displayCwd }) => ({ cwd, displayCwd }))} onChange={setNewChatCwd} disabled={chat.isStreaming || (chat.activeFile ? compaction.isCompacting(chat.activeFile) : false)} />
                                            )}
                                            <ModelSelector models={models.models} value={selectedModelKey} thinkingLevel={thinkingLevel} onSelect={handleSelectModel} onThinkingChange={handleThinkingChange} disabled={chat.isStreaming || (chat.activeFile ? compaction.isCompacting(chat.activeFile) : false)} isStreaming={chat.isStreaming} loading={models.loading} error={models.error} />
                                        </div>
                                        {(() => {
                                            const cFile = chat.activeFile;
                                            const isCompacting = cFile ? compaction.isCompacting(cFile) : false;
                                            const cErr = cFile ? compaction.errors[cFile] : null;
                                            const instr = cFile ? lastCompactInstructionsRef.current[cFile] : undefined;
                                            const showIndicator = Boolean(isCompacting || cErr);
                                            return (
                                                <div className="mx-auto flex w-full max-w-3xl flex-col gap-0">
                                                    <div
                                                        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${showIndicator ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                                                    >
                                                        <div className="min-h-0 overflow-hidden">
                                                            {isCompacting && (
                                                                <CompactionIndicator customInstructions={instr ?? null} onAbort={handleAbortCompaction} />
                                                            )}
                                                            {cErr && !isCompacting && (
                                                                <CompactionIndicator error={cErr.message} canRetry={cErr.canRetry} onAbort={handleAbortCompaction} onRetry={handleRetryCompaction} onDismissError={() => cFile && compaction.clearError(cFile)} />
                                                            )}
                                                        </div>
                                                    </div>
                                                    <Composer onSend={handleSend} onAbort={handleAbort} isStreaming={chat.isStreaming} isCompacting={isCompacting} compactAttached={showIndicator} cwd={chat.activeFile ? activeCwd : (newChatCwd ?? homeCwd)} draftKey={chat.activeFile} />
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </section>
                            </div>
                        </main>
                    </div>
                );
            }}
        </SessionCommand>
    );
}
