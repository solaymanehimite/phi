import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Composer } from "./components/composer";
import { DirectoryPicker } from "./components/directory-picker";
import { ModelSelector } from "./components/model-selector";
import { ThinkingEffortSelector } from "./components/thinking-effort";
import { Conversation } from "./components/conversation/conversation";
import { Streaming } from "./components/conversation/streaming";
import { Sidebar } from "./components/sidebar";
import { SearchSessionsButton, SessionCommand, type CommandAction } from "./components/session-command";
import { SETTINGS_TAB_ID, Tabs, UI_DEMO_TAB_ID } from "./components/tabs";
import {
    IconArrowDown,
    IconComponents,
    IconLayoutSidebarFilled,
    IconLayoutSidebarLeftCollapse,
    IconMessageCircleFilled,
    IconMoonFilled,
    IconPlusFilled,
    IconSettingsFilled,
    IconSunFilled,
} from "@tabler/icons-react";
import { Button } from "./components/ui/button";
import { Alert } from "./components/ui/alert";
import { InlineCode } from "./components/ui/code";
import { useSessions } from "./hooks/useSessions";
import { useProjects, type NewProjectInput } from "./hooks/useProjects";
import { normalizeProjectPath, resolveProjectOptions, sessionsForProject, type Project } from "./lib/projects";
import { useChat } from "./hooks/useChat";
import { useCompaction } from "./hooks/useCompaction";
import { useModels } from "./hooks/useModels";
import { createSession, health, streamContinue } from "./lib/api";
import { CompactionIndicator } from "./components/compaction-indicator";
import { useEffectiveTheme, useTheme } from "./hooks/useTheme";
import { brandingUrl } from "./lib/themed-assets";
import { useHealth } from "./hooks/useHealth";
import { FatalState } from "./components/fatal";
import { SettingsPanel, type SettingsSection } from "./components/settings";
import { UiDemoPanel } from "./components/ui-demo";
import { ThemeEditor, useThemeEditorEnabled } from "./components/dev/ThemeEditor";
import { useShortcuts } from "./hooks/useShortcuts";
import { clearDraftFor } from "./hooks/useDraft";
import { InlineErrorBlock, type InlineError } from "./components/inline-error";

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Small floating arrow-down indicator, visible only when the viewport is not stuck to the bottom
const ScrollToBottomButton = memo(function ScrollToBottomButton() {
    const { isAtBottom, scrollToBottom } = useStickToBottomContext();
    const visible = !isAtBottom;
    return (
        <button
            type="button"
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
            aria-hidden={!visible}
            tabIndex={visible ? 0 : -1}
            onClick={() => void scrollToBottom(prefersReducedMotion() ? "instant" : undefined)}
            data-visible={visible ? "true" : "false"}
            className="absolute bottom-4 left-1/2 z-10 inline-flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-phi-border-strong bg-phi-bg-elevated text-phi-text-secondary shadow-[0_4px_16px_var(--color-phi-shadow-strong)] transition-all duration-200 hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 data-[visible=false]:pointer-events-none data-[visible=false]:translate-y-2 data-[visible=false]:opacity-0"
        >
            <IconArrowDown className="size-4" />
        </button>
    );
});

// When the user sends a message while scrolled up, re-stick to the bottom.
// Streaming growth itself is handled by the stick-to-bottom resize observer,
// which intentionally preserves the position when the user scrolled up to read.
const StickOnUserMessage = memo(function StickOnUserMessage({ messages }: { messages: unknown[] }) {
    const { scrollToBottom } = useStickToBottomContext();
    const prevLengthRef = useRef(messages.length);
    useEffect(() => {
        const prevLength = prevLengthRef.current;
        prevLengthRef.current = messages.length;
        if (messages.length <= prevLength) return;
        const last = messages[messages.length - 1] as Record<string, unknown> | undefined;
        if (last && String(last.role ?? "") === "user") {
            void scrollToBottom(prefersReducedMotion() ? "instant" : undefined);
        }
    }, [messages, scrollToBottom]);
    return null;
});

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
                <Alert variant="error" className="mx-auto mt-6 max-w-xl text-[13px]">{error}</Alert>
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
    const resizeAnimation: "instant" | "smooth" = prefersReducedMotion() ? "instant" : "smooth";
    return (
        <StickToBottom
            key={activeFile}
            className="relative min-h-0 w-full flex-1"
            resize={resizeAnimation}
            initial="instant"
        >
            <StickToBottom.Content
                scrollClassName="overflow-y-auto px-6 pt-6"
                className="flex flex-col items-center"
            >
                <div className="w-2xl flex h-full max-w-full flex-col">
                    <Conversation messages={messages} hideLastWork={hideLastWork} isStreaming={isStreaming} />
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
                        <Alert variant="error" className="mx-auto mt-3 w-full max-w-3xl text-[13px]">{error}</Alert>
                    )}
                </div>
            </StickToBottom.Content>
            <ScrollToBottomButton />
            <StickOnUserMessage messages={messages} />
        </StickToBottom>
    );
});

export default function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const sessions = useSessions();
    const chat = useChat();
    const compaction = useCompaction({ revalidate: chat.revalidate });
    const lastCompactInstructionsRef = useRef<Record<string, string | undefined>>({});
    const models = useModels();
    const { theme, setTheme } = useTheme();
    const effectiveTheme = useEffectiveTheme();
    const themeEditorEnabled = useThemeEditorEnabled();
    const healthHook = useHealth(3000);
    const [settingsActive, setSettingsActive] = useState(false);
    const [uiDemoActive, setUiDemoActive] = useState(false);
    const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
    const [modelError, setModelError] = useState<string | null>(null);
    const [draftModelKey, setDraftModelKey] = useState<string | undefined>(undefined);
    const [draftThinking, setDraftThinking] = useState<import("./types/session").ThinkingLevel | undefined>(undefined);
    const [homeCwd, setHomeCwd] = useState("");
    const [newChatCwd, setNewChatCwd] = useState<string | null>(null);
    const { projects, addProject, updateProject, removeProject } = useProjects();
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

    const openSettingsTab = useCallback(() => {
        const current = openTabIdsRef.current;
        if (!current.includes(SETTINGS_TAB_ID)) {
            const next = [...current, SETTINGS_TAB_ID];
            openTabIdsRef.current = next;
            setOpenTabIds(next);
        }
        setUiDemoActive(false);
        setSettingsActive(true);
    }, []);

    const openUiDemoTab = useCallback(() => {
        const current = openTabIdsRef.current;
        if (!current.includes(UI_DEMO_TAB_ID)) {
            const next = [...current, UI_DEMO_TAB_ID];
            openTabIdsRef.current = next;
            setOpenTabIds(next);
        }
        setSettingsActive(false);
        setUiDemoActive(true);
    }, []);

    useEffect(() => {
        let cancelled = false;
        health()
            .then((res) => {
                if (!cancelled && res.home) {
                    setHomeCwd(res.home);
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    // Every session directory is a project: explicit entries first, then
    // implicit ones (folder name, no icon) for directories without an entry.
    const projectOptions = useMemo(
        () => resolveProjectOptions(projects, sessions.groups.map((g) => g.cwd), homeCwd || undefined),
        [projects, sessions.groups, homeCwd],
    );

    // Default the new-chat picker to the first project once any exist.
    // Home stays a silent send fallback — it is never listed as a project.
    useEffect(() => {
        if (newChatCwd !== null) return;
        if (projectOptions.length === 0) return;
        setNewChatCwd(projectOptions[0].path);
    }, [newChatCwd, projectOptions]);

    const handleCreateProject = useCallback((input: NewProjectInput): Project => {
        const project = addProject(input, homeCwd || undefined);
        setNewChatCwd(project.path);
        return project;
    }, [addProject, homeCwd]);

    const handleUpdateProject = useCallback((id: string, input: NewProjectInput) => {
        const prev = projects.find((p) => p.id === id);
        updateProject(id, input, homeCwd || undefined);
        if (prev && newChatCwd === prev.path) {
            setNewChatCwd(normalizeProjectPath(input.path, homeCwd || undefined) || prev.path);
        }
    }, [newChatCwd, projects, updateProject, homeCwd]);

    const handleRemoveProject = useCallback((id: string) => {
        const removed = projects.find((p) => p.id === id);
        removeProject(id);
        if (removed && newChatCwd === removed.path) {
            const remaining = projects.filter((p) => p.id !== id);
            setNewChatCwd(remaining[0]?.path ?? null);
        }
    }, [newChatCwd, projects, removeProject]);

    // Sidebar sections: every project (even empty) with its sessions, newest first.
    const projectGroups = useMemo(
        () => projectOptions.map((project) => ({
            project,
            sessions: sessionsForProject(sessions.sessions, project.path),
        })),
        [projectOptions, sessions.sessions],
    );
    const orphanCount = useMemo(() => {
        const paths = new Set(projectOptions.map((p) => p.path));
        return sessions.sessions.filter((s) => !paths.has(s.cwd)).length;
    }, [projectOptions, sessions.sessions]);

    const activeTitle = useMemo(() => chat.data?.sessionName || chat.data?.header?.id || chat.activeFile?.split("/").pop() || "New chat", [chat.data?.sessionName, chat.data?.header?.id, chat.activeFile]);
    const activeCwd = chat.data?.cwd || chat.data?.header?.cwd;

    // Current project for the command menu — active session cwd wins, then the
    // new-chat picker cwd, then home. Prefers the project name when known.
    const currentProjectCwd = activeCwd || newChatCwd || homeCwd || "";
    const currentProjectDisplay = useMemo(() => {
        if (!currentProjectCwd) return "";
        const project = projectOptions.find((p) => p.path === currentProjectCwd);
        if (project) return project.name;
        if (homeCwd && (currentProjectCwd === homeCwd || currentProjectCwd.startsWith(`${homeCwd}/`))) {
            const rest = currentProjectCwd.slice(homeCwd.length).replace(/^\//, "");
            if (!rest) return "~";
            return rest.split("/").pop() || `~/${rest}`;
        }
        const trimmed = currentProjectCwd.endsWith("/") ? currentProjectCwd.slice(0, -1) : currentProjectCwd;
        return trimmed.split("/").pop() || trimmed;
    }, [currentProjectCwd, homeCwd, projects]);

    const ctxModel: any = (chat.data?.context as any)?.model;
    const ctxModelKey = ctxModel ? `${ctxModel.provider}/${ctxModel.modelId ?? ctxModel.id}` : undefined;
    const selectedModelKey = ctxModelKey ?? draftModelKey ?? models.defaultModelKey;
    const ctxThinking = (chat.data?.context as any)?.thinkingLevel as string | undefined;
    const thinkingLevel = ctxThinking ?? draftThinking ?? models.defaultThinkingLevel ?? undefined;

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

    // New chat has no session yet, so there is no context model to display.
    // Silently resolve Pi's actual default for the new-chat workspace (project
    // settings can override it per workspace). Server-cached and never blocks
    // the new-chat screen — the selector updates in place when it lands.
    const newChatDefaultCwd = !chat.activeFile ? (newChatCwd ?? homeCwd ?? "") : "";
    useEffect(() => {
        if (!newChatDefaultCwd) return;
        void models.refresh({ silent: true, cwd: newChatDefaultCwd });
    }, [newChatDefaultCwd]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setSettingsActive(false);
        setUiDemoActive(false);
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

    const handleNewChat = useCallback(() => { setSettingsActive(false); setUiDemoActive(false); ensureNewChatTab(); chat.clear(); focusComposer(); }, [chat.clear, ensureNewChatTab, focusComposer]);

    const handleNewChatInProject = useCallback((cwd: string) => {
        setSettingsActive(false);
        setUiDemoActive(false);
        if (cwd) setNewChatCwd(cwd);
        ensureNewChatTab();
        chat.clear();
        focusComposer();
    }, [chat.clear, ensureNewChatTab, focusComposer]);

    const handleToggleTheme = useCallback(() => {
        setTheme(effectiveTheme === "dark" ? "light" : "dark");
    }, [effectiveTheme, setTheme]);

    // Global actions for the Cmd+K palette — always rendered above sessions.
    const commandActions: CommandAction[] = useMemo(() => {
        const iconClass = "size-5 shrink-0 text-current";
        const list: CommandAction[] = [];
        if (currentProjectCwd) {
            list.push({
                id: "new-chat-in-project",
                label: `New chat in ${currentProjectDisplay || currentProjectCwd}`,
                hint: "⌘N",
                keywords: ["new chat", "create", currentProjectCwd, currentProjectDisplay],
                icon: <IconPlusFilled className={iconClass} />,
            });
        }
        list.push({
            id: "new-chat",
            label: "New chat",
            keywords: ["new chat", "blank", "empty"],
            icon: <IconMessageCircleFilled className={iconClass} />,
        });
        list.push({
            id: "open-settings",
            label: "Open settings",
            hint: "⌘,",
            keywords: ["settings", "preferences", "config", "appearance", "models", "providers"],
            icon: <IconSettingsFilled className={iconClass} />,
        });
        list.push({
            id: "open-ui-demo",
            label: "Open UI demo",
            keywords: ["ui demo", "components", "design system", "showcase", "storybook", "styleguide"],
            icon: <IconComponents className={iconClass} />,
        });
        list.push({
            id: "toggle-theme",
            label: `Toggle theme (currently ${effectiveTheme})`,
            keywords: ["theme", "dark", "light", "appearance", "toggle"],
            icon: effectiveTheme === "dark" ? <IconSunFilled className={iconClass} /> : <IconMoonFilled className={iconClass} />,
        });
        list.push({
            id: "toggle-sidebar",
            label: sidebarOpen ? "Hide sidebar" : "Show sidebar",
            keywords: ["sidebar", "toggle", "panel", "hide", "show"],
            icon: <IconLayoutSidebarFilled className={iconClass} />,
        });
        return list;
    }, [currentProjectCwd, currentProjectDisplay, effectiveTheme, sidebarOpen]);

    const handleCommandAction = useCallback((id: string) => {
        switch (id) {
            case "new-chat-in-project":
                if (currentProjectCwd) handleNewChatInProject(currentProjectCwd);
                else handleNewChat();
                break;
            case "new-chat":
                handleNewChat();
                break;
            case "open-settings":
                openSettingsTab();
                break;
            case "open-ui-demo":
                openUiDemoTab();
                break;
            case "toggle-theme":
                handleToggleTheme();
                break;
            case "toggle-sidebar":
                setSidebarOpen((open) => !open);
                break;
        }
    }, [currentProjectCwd, handleNewChat, handleNewChatInProject, handleToggleTheme, openSettingsTab, openUiDemoTab]);

    const handleCloseTab = useCallback((id: string | null) => {
        const current = openTabIdsRef.current;
        // Settings + UI demo behave like any other tab.
        if (id === SETTINGS_TAB_ID || id === UI_DEMO_TAB_ID) {
            if (!current.includes(id)) return;
            const next = current.filter((tabId) => tabId !== id);
            openTabIdsRef.current = next;
            setOpenTabIds(next);
            const wasActive = (id === SETTINGS_TAB_ID && settingsActive) || (id === UI_DEMO_TAB_ID && uiDemoActive);
            if (wasActive) {
                setSettingsActive(false);
                setUiDemoActive(false);
                // The backend may point at a session whose tab was closed while a special tab was front.
                const backend = chat.activeFile;
                if (!next.includes(backend)) {
                    const fallback = next.find((tabId) => tabId !== SETTINGS_TAB_ID && tabId !== UI_DEMO_TAB_ID) ?? null;
                    if (fallback === null) handleNewChat();
                    else void handleSelect(fallback);
                }
            }
            return;
        }
        // Session tabs — always keep at least one chat tab (special tabs don't count).
        const chatTabs = current.filter((tabId) => tabId !== SETTINGS_TAB_ID && tabId !== UI_DEMO_TAB_ID);
        if (id === null && chatTabs.length <= 1 && chatTabs.includes(null)) return;
        const index = current.indexOf(id);
        if (index < 0) return;
        const filtered = current.filter((tabId) => tabId !== id);
        const nextActiveId = filtered[index] ?? filtered[index - 1] ?? null;
        let next = filtered;
        if (!next.some((tabId) => tabId !== SETTINGS_TAB_ID && tabId !== UI_DEMO_TAB_ID)) {
            next = [...next, null];
        }
        openTabIdsRef.current = next.length > 0 ? next : [null];
        setOpenTabIds(openTabIdsRef.current);
        const isUiActive = !settingsActive && !uiDemoActive && (id === chat.activeFile || (id === null && chat.activeFile === null));
        if (!isUiActive) return;
        if (nextActiveId === SETTINGS_TAB_ID) {
            setSettingsActive(true);
            setUiDemoActive(false);
            return;
        }
        if (nextActiveId === UI_DEMO_TAB_ID) {
            setSettingsActive(false);
            setUiDemoActive(true);
            return;
        }
        if (nextActiveId === null) handleNewChat();
        else void handleSelect(nextActiveId);
    }, [chat.activeFile, handleNewChat, handleSelect, settingsActive, uiDemoActive]);

    const handleTabSelect = useCallback((id: string | null) => {
        if (id === SETTINGS_TAB_ID) {
            openSettingsTab();
            return;
        }
        if (id === UI_DEMO_TAB_ID) {
            openUiDemoTab();
            return;
        }
        if (id === null) handleNewChat();
        else void handleSelect(id);
    }, [handleNewChat, handleSelect, openSettingsTab, openUiDemoTab]);

    const handleCloseActiveTab = useCallback(() => {
        if (settingsActive) handleCloseTab(SETTINGS_TAB_ID);
        else if (uiDemoActive) handleCloseTab(UI_DEMO_TAB_ID);
        else handleCloseTab(chat.activeFile);
    }, [settingsActive, uiDemoActive, handleCloseTab, chat.activeFile]);

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
        if (id === SETTINGS_TAB_ID) return { id, title: "Settings" };
        if (id === UI_DEMO_TAB_ID) return { id, title: "UI demo" };
        const session = sessions.sessions.find((item) => item.path === id);
        const fallback = id.split("/").pop() || "Session";
        const title = session?.name?.trim() || session?.firstMessage?.trim() || (id === chat.activeFile ? activeTitle : fallback);
        return { id, title: title.length > 42 ? `${title.slice(0, 42).trim()}…` : title, isRunning: chat.runningFiles.has(id) };
    }), [activeTitle, chat.activeFile, chat.runningFiles, openTabIds, sessions.sessions]);

    // shortcuts
    useShortcuts({
        onNewChat: handleNewChat,
        onCloseTab: handleCloseActiveTab,
        onDeleteSession: () => { if (!settingsActive && !uiDemoActive) void handleDeleteCurrent(); },
        onFocusProject: focusProjectPicker,
        onOpenSearch: () => {},
        onOpenSettings: openSettingsTab,
        onAbort: () => { if (!settingsActive && !uiDemoActive) void handleAbort(); },
    }, { isStreaming: chat.isStreaming });

    // fatal gate
    if (healthHook.fatal) {
        return <FatalState error={healthHook.health?.error ?? null} home={healthHook.health?.home} port={healthHook.health?.port} agentDir={healthHook.health?.agentDir} onRetry={async () => { await healthHook.retry(); }} />;
    }

    return (
        <SessionCommand groups={sessions.groups} projects={projectOptions} loading={sessions.loading} error={sessions.error} actions={commandActions} onAction={handleCommandAction} onSelect={(file) => void handleSelect(file)}>
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
                                projectGroups={projectGroups}
                                orphanCount={orphanCount}
                                activeFile={settingsActive ? SETTINGS_TAB_ID : uiDemoActive ? UI_DEMO_TAB_ID : chat.activeFile}
                                onSelect={handleSelect}
                                onNewChat={handleNewChat}
                                onOpenSettings={openSettingsTab}
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
                                            <IconLayoutSidebarLeftCollapse className="size-4" />
                                        </Button>
                                    </div>
                                }
                                sidebarCollapsed={!sidebarOpen}
                                tabs={tabItems}
                                activeId={settingsActive ? SETTINGS_TAB_ID : uiDemoActive ? UI_DEMO_TAB_ID : chat.activeFile}
                                onSelect={handleTabSelect}
                                onClose={handleCloseTab}
                            />
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-phi-border-subtle bg-phi-bg-main shadow-[0_8px_30px_var(--color-phi-shadow)]">
                                {settingsActive ? (
                                    <section className="flex min-h-0 flex-1" aria-label="Settings">
                                        <SettingsPanel section={settingsSection} onSectionChange={setSettingsSection} onProvidersChanged={() => models.refresh({ silent: true })} />
                                    </section>
                                ) : uiDemoActive ? (
                                    <section className="flex min-h-0 flex-1" aria-label="UI demo">
                                        <UiDemoPanel />
                                    </section>
                                ) : (
                                <section className="flex min-h-0 flex-1 flex-col">
                                    {!chat.activeFile ? (
                                        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                                            <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                                                <img
                                                    src={brandingUrl("logo_small.svg", effectiveTheme)}
                                                    alt=""
                                                    aria-hidden="true"
                                                    className="phi-empty-logo"
                                                />
                                                {!sessions.loading && !sessions.error && projectOptions.length === 0 && (
                                                    <p className="mt-6 text-[12px] text-phi-text-muted">No projects yet — create one from the picker below to start chatting.</p>
                                                )}
                                                {!sessions.loading && !sessions.error && projectOptions.length > 0 && sessions.groups.length === 0 && (
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
                                                <Alert variant="error" className="flex items-center justify-between gap-2 !text-[12.5px]">
                                                    <span className="truncate">{modelError}</span>
                                                    <button onClick={() => setModelError(null)} className="shrink-0 text-[11px] underline opacity-80 hover:opacity-100">Dismiss</button>
                                                </Alert>
                                            </div>
                                        )}
                                        {!modelError && !models.loading && models.models.length === 0 && !models.error && (
                                            <div className="mx-auto mb-2 w-full max-w-3xl">
                                                <Alert variant="warning" className="!text-[12.5px]">
                                                    No models available — check auth (run <InlineCode>pi auth</InlineCode>) or configure API keys. The model selector will populate after auth.
                                                </Alert>
                                            </div>
                                        )}
                                        <div className="mx-auto pl-6 mb-1 flex w-full max-w-3xl min-w-0 items-center gap-1" ref={directoryPickerRef}>
                                            {!chat.activeFile && (
                                                <DirectoryPicker cwd={newChatCwd} projects={projectOptions} onChange={setNewChatCwd} onCreateProject={handleCreateProject} onUpdateProject={handleUpdateProject} onRemoveProject={handleRemoveProject} homeCwd={homeCwd} disabled={chat.isStreaming || (chat.activeFile ? compaction.isCompacting(chat.activeFile) : false)} />
                                            )}
                                            <ModelSelector models={models.models} value={selectedModelKey} thinkingLevel={thinkingLevel} onSelect={handleSelectModel} onThinkingChange={handleThinkingChange} disabled={chat.isStreaming || (chat.activeFile ? compaction.isCompacting(chat.activeFile) : false)} isStreaming={chat.isStreaming} loading={models.loading} error={models.error} />
                                            <ThinkingEffortSelector models={models.models} modelKey={selectedModelKey} value={thinkingLevel} onChange={handleThinkingChange} disabled={chat.isStreaming || (chat.activeFile ? compaction.isCompacting(chat.activeFile) : false)} />
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
                                )}
                            </div>
                            {!settingsActive && !uiDemoActive && themeEditorEnabled && (
                                <div className="absolute bottom-4 right-4 z-40">
                                    <ThemeEditor />
                                </div>
                            )}
                        </main>
                    </div>
                );
            }}
        </SessionCommand>
    );
}
