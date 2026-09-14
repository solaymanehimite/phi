import { memo, useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Composer } from "./components/composer";
import { DirectoryPicker } from "./components/directory-picker";
import { TargetPicker } from "./components/target-picker";
import { ModelSelector } from "./components/model-selector";
import { ThinkingEffortSelector } from "./components/thinking-effort";
import { ContextIndicator } from "./components/context-indicator";
import { Conversation } from "./components/conversation/conversation";
import { Streaming } from "./components/conversation/streaming";
import { Sidebar } from "./components/sidebar";
import { SidebarToggleIcon } from "./components/sidebar-toggle-icon";
import { SearchSessionsButton, SessionCommand, type CommandAction } from "./components/session-command";
import { NEW_TAB_PREFIX, SETTINGS_TAB_ID, Tabs, UI_DEMO_TAB_ID, isNewTabId } from "./components/tabs";
import { closeTab, nextTabAfterClose, promoteDraftTab } from "./lib/tabs";
import {
    IconArrowDown,
    IconComponents,
    IconLayoutSidebarFilled,
    IconMessageCircleFilled,
    IconMoonFilled,
    IconPlusFilled,
    IconKeyFilled,
    IconSettingsFilled,
    IconSunFilled,
} from "@tabler/icons-react";
import { Button } from "./components/ui/button";
import { Alert } from "./components/ui/alert";
import { SonnerViewport, useSonners } from "./components/ui/sonner";
import { InlineCode } from "./components/ui/code";
import { useSessions } from "./hooks/useSessions";
import { useSessionFlags } from "./hooks/useSessionFlags";
import { useProjects, type NewProjectInput } from "./hooks/useProjects";
import { LOCAL_HOST_ID, useHosts } from "./hooks/useHosts";
import { boundHostIds, resolveProjectOptions, sessionsForProject, type Project, type ProjectOption } from "./lib/projects";
import { useChat } from "./hooks/useChat";
import { useCompaction } from "./hooks/useCompaction";
import { clearQueueFor, useMessageQueue } from "./hooks/useMessageQueue";
import { QueueIndicator } from "./components/queue-indicator";
import { useModels } from "./hooks/useModels";
import { useSessionStats } from "./hooks/useSessionStats";
import { createSession, health, redoTurn, streamContinue, undoTurn } from "./lib/api";
import { CompactionIndicator } from "./components/compaction-indicator";
import { useEffectiveTheme, useTheme } from "./hooks/useTheme";
import { refreshCustomThemeApplication, clearActiveCustomTheme } from "./hooks/useCustomThemes";
import { brandingUrl } from "./lib/themed-assets";
import { useHealth } from "./hooks/useHealth";
import { FatalState } from "./components/fatal";
import { SettingsPanel, type SettingsSection } from "./components/settings";
const ProviderMenuDialog = lazy(() =>
    import("./components/provider-menu").then((m) => ({ default: m.ProviderMenuDialog })),
);
import { UiDemoPanel } from "./components/ui-demo";
import { ThemeEditor, useThemeEditorEnabled } from "./components/dev/ThemeEditor";
import { useShortcuts } from "./hooks/useShortcuts";
import { useZoom } from "./hooks/useZoom";
import { clearDraftFor } from "./hooks/useDraft";
import { InlineErrorBlock, InterruptedBlock, isInterruption, type InlineError } from "./components/inline-error";

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
            className="absolute bottom-4 left-1/2 z-10 inline-flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-phi-border-strong bg-phi-bg-elevated text-phi-text-secondary shadow-[0_4px_16px_var(--color-phi-shadow-strong)] transition-all duration-200 hover:border-phi-text-muted hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 data-[visible=false]:pointer-events-none data-[visible=false]:translate-y-2 data-[visible=false]:opacity-0"
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
    onContinue?: () => void;
    onDismiss?: () => void;
}) {
    if (!activeFile) return null;
    if (loading) {
        return (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <p className="py-10 text-center text-[13px] text-phi-text-muted">Loading messages…</p>
            </div>
        );
    }
    if (error && messages.length === 0) {
        return (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <Alert variant="error" className="mx-auto mt-6 max-w-xl text-[13px]">{error}</Alert>
            </div>
        );
    }
    if (messages.length === 0) {
        return (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                    <p className="text-[13px] text-phi-text-muted">No messages in this session yet.</p>
                    <p className="mt-1 text-[12px] text-phi-text-muted">Prompt streaming lands in Phase C.</p>
                    {inlineError && (isInterruption(inlineError.reason)
                        ? <InterruptedBlock onContinue={onContinue} />
                        : <InlineErrorBlock error={inlineError} onContinue={onContinue} onDismiss={onDismiss!} />)}
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
            mass={0.9}
            stiffness={0.08}
            damping={0.75}
        >
            <StickToBottom.Content
                scrollClassName="overflow-y-auto px-6 pt-6"
                className="flex flex-col items-center"
            >
                <div className="w-3xl flex h-full max-w-full flex-col">
                    <Conversation messages={messages} hideLastWork={hideLastWork} isStreaming={isStreaming} />
                    {showLive && (
                        <div className="pt-2 phi-work-stagger">
                            <Streaming text={streaming.text} workItems={streaming.workItems} error={streaming.error} isStreaming={isStreaming} startedAt={streaming.startedAt} />
                        </div>
                    )}
                    {inlineError && (isInterruption(inlineError.reason)
                        ? <InterruptedBlock onContinue={onContinue} />
                        : <InlineErrorBlock error={inlineError} onContinue={onContinue} onDismiss={onDismiss!} />)}
                    {error && !isStreaming && !inlineError && (
                        <Alert variant="error" className="mx-auto mt-3 w-full max-w-4xl text-[13px]">{error}</Alert>
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
    const sessionFlags = useSessionFlags();
    const chat = useChat(useMemo(() => ({ getHostId: (file: string) => sessions.hostOf(file) }), [sessions.hostOf]));
    const compaction = useCompaction(useMemo(() => ({ revalidate: chat.revalidate }), [chat.revalidate]));
    const queue = useMessageQueue(chat.activeFile);
    const lastCompactInstructionsRef = useRef<Record<string, string | undefined>>({});
    const models = useModels();
    const { theme, setTheme } = useTheme();
    const effectiveTheme = useEffectiveTheme();
    useZoom();
    const themeEditorEnabled = useThemeEditorEnabled();
    // Re-apply the saved custom theme (if any) on boot, after data-theme is set.
    useEffect(() => {
        refreshCustomThemeApplication();
    }, []);
    const healthHook = useHealth(3000);
    const [settingsActive, setSettingsActive] = useState(false);
    const [uiDemoActive, setUiDemoActive] = useState(false);
    const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
    const [modelError, setModelError] = useState<string | null>(null);
    const [draftModelKey, setDraftModelKey] = useState<string | undefined>(undefined);
    const [draftThinking, setDraftThinking] = useState<import("./types/session").ThinkingLevel | undefined>(undefined);
    const [homeCwd, setHomeCwd] = useState("");
    // New-chat run selection: which project and which run target its first
    // message starts on. Both mirror the active draft tab (see newTabTargets).
    const [newChatProjectId, setNewChatProjectId] = useState<string | null>(null);
    const [newChatHostId, setNewChatHostId] = useState<string>(LOCAL_HOST_ID);
    const { projects, addProject, renameProject, removeProject, setProjectTarget, removeProjectTarget } = useProjects();
    const { hosts, activeHostId, setActiveHostId } = useHosts();
    const activeHostIdRef = useRef(activeHostId);
    activeHostIdRef.current = activeHostId;
    const newChatProjectIdRef = useRef<string | null>(newChatProjectId);
    newChatProjectIdRef.current = newChatProjectId;
    const newChatHostIdRef = useRef<string>(newChatHostId);
    newChatHostIdRef.current = newChatHostId;
    // Sidebar + palette run-target badges. Hidden until a remote host exists.
    // Built from the subscribed hosts array: never read localStorage during
    // render, or the store snapshot churns and React re-renders forever.
    const hostNameById = useMemo(() => {
        const map: Record<string, string> = { [LOCAL_HOST_ID]: "Local" };
        for (const h of hosts) map[h.id] = h.name;
        return map;
    }, [hosts]);
    const showHostBadges = hosts.length > 0;
    const newTabCounterRef = useRef(2);
    const [openTabIds, setOpenTabIds] = useState<string[]>(([`${NEW_TAB_PREFIX}1`]));
    const openTabIdsRef = useRef<string[]>(openTabIds);
    const [activeNewTabId, setActiveNewTabId] = useState<string | null>(`${NEW_TAB_PREFIX}1`);
    const activeNewTabIdRef = useRef<string | null>(activeNewTabId);
    activeNewTabIdRef.current = activeNewTabId;
    // Per-draft-tab project + run target. The newChat* mirrors track the
    // active draft; entries are created with the tab, restored on switch,
    // dropped on promote/close.
    const [newTabTargets, setNewTabTargets] = useState<Record<string, { projectId: string | null; hostId: string }>>({});
    // single inline notice per session — interrupts clear on next send, never stack
    const [inlineErrors, setInlineErrors] = useState<Record<string, InlineError>>({});
    const streamSonners = useSonners();
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

    // Electron quit-guard: main shows the native confirm and owns the window,
    // renderer owns the streams. Report liveness so main only prompts mid-stream,
    // and abort everything when main says the user confirmed quit.
    useEffect(() => {
        window.phi?.setStreamingCount(chat.runningFiles.size);
    }, [chat.runningFiles.size]);

    useEffect(() => {
        const off = window.phi?.onAbortAll(() => {
            for (const f of Array.from(chat.runningFiles)) {
                try { void chat.abort(f); } catch {}
                const err: InlineError = { id: `${f}-${Date.now()}`, reason: "Interruption", message: "Session interrupted by quit. You can Continue to resume.", time: new Date().toLocaleTimeString(), canContinue: true };
                setInlineErrors((prev) => ({ ...prev, [f]: err }));
            }
        });
        return () => { try { off?.(); } catch {} };
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

    // Bottom-right sonner when a stream finishes in a session the user isn't
    // looking at — a finished background tab, or anything while the window
    // is hidden. The focused session already shows the result live.
    const sessionTitleFor = useCallback((file: string) => {
        const session = sessions.sessions.find((item) => item.path === file);
        const raw = session?.name?.trim() || session?.firstMessage?.trim() || file.split("/").pop() || "Session";
        return raw.length > 42 ? `${raw.slice(0, 42).trim()}…` : raw;
    }, [sessions.sessions]);
    const activeFileMirrorRef = useRef(chat.activeFile);
    activeFileMirrorRef.current = chat.activeFile;
    const prevRunningRef = useRef<Set<string>>(chat.runningFiles);
    const pushSonner = streamSonners.push;
    useEffect(() => {
        const prev = prevRunningRef.current;
        const next = chat.runningFiles;
        prevRunningRef.current = next;
        const finished = [...prev].filter((f) => !next.has(f));
        if (finished.length === 0) return;
        for (const file of finished) {
            if (file === activeFileMirrorRef.current && !document.hidden) continue;
            // Deleted sessions settle their stream on removal — not a finish.
            if (!openTabIdsRef.current.includes(file) && !sessions.sessions.some((s) => s.path === file)) continue;
            const failure = chat.errorsByFile[file]?.trim();
            pushSonner({
                title: sessionTitleFor(file),
                description: failure ? failure.slice(0, 140) : "Finished streaming",
                variant: failure ? "error" : "done",
                sessionFile: file,
            });
        }
    }, [chat.runningFiles, chat.errorsByFile, sessions.sessions, sessionTitleFor, pushSonner]);

    const openSessionTab = useCallback((id: string) => {
        const current = openTabIdsRef.current;
        if (current.includes(id)) return;
        const next = [...current, id];
        openTabIdsRef.current = next;
        setOpenTabIds(next);
    }, []);

    // Always creates a fresh new-chat draft tab and activates it. Draft tabs are
    // cheap and independent (own composer draft + project/target); the only
    // invariant is that at least one chat tab always exists.
    const createNewChatTab = useCallback((sel?: { projectId: string | null; hostId: string } | null) => {
        const id = `${NEW_TAB_PREFIX}${newTabCounterRef.current++}`;
        const initial = sel ?? { projectId: newChatProjectIdRef.current, hostId: newChatHostIdRef.current };
        setNewTabTargets((prev) => ({ ...prev, [id]: initial }));
        const next = [...openTabIdsRef.current, id];
        openTabIdsRef.current = next;
        setOpenTabIds(next);
        setActiveNewTabId(id);
        return id;
    }, []);

    const dropNewTabState = useCallback((id: string) => {
        clearDraftFor(id);
        setNewTabTargets((prev) => {
            if (!(id in prev)) return prev;
            const { [id]: _, ...rest } = prev;
            return rest;
        });
    }, []);

    // A sent draft tab becomes its session tab in place, preserving tab order.
    const promoteNewChatTab = useCallback((file: string) => {
        const current = openTabIdsRef.current;
        if (current.includes(file)) return;
        const { ids: next, retiredDraftId } = promoteDraftTab(current, activeNewTabId, file);
        if (retiredDraftId) dropNewTabState(retiredDraftId);
        openTabIdsRef.current = next;
        setOpenTabIds(next);
        setActiveNewTabId((prev) => (prev && next.includes(prev) ? prev : null));
    }, [activeNewTabId, dropNewTabState]);

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

    // Every (host, session directory) pair is a project: explicit entries
    // first, then implicit ones for pairs with no binding.
    const projectOptions = useMemo(
        () => resolveProjectOptions(projects, sessions.groups.map((g) => ({ hostId: g.hostId, cwd: g.cwd })), homeCwd || undefined),
        [projects, sessions.groups, homeCwd],
    );

    // Default the new-chat picker to the first project once any exist.
    useEffect(() => {
        if (newChatProjectIdRef.current !== null) return;
        if (projectOptions.length === 0) return;
        const first = projectOptions[0];
        setNewChatProjectId(first.id);
        if (first.implicit) {
            setNewChatHostId(first.hostId);
        } else {
            const bound = Object.keys(first.targets);
            if (!bound.includes(newChatHostIdRef.current) && bound[0]) {
                setNewChatHostId(bound[0]);
                setActiveHostId(bound[0]);
            }
        }
    }, [projectOptions, setActiveHostId]);

    // The selected project vanished (e.g. its last target was removed).
    // Fall back to the first remaining project.
    useEffect(() => {
        if (newChatProjectId === null) return;
        if (projectOptions.some((p) => p.id === newChatProjectId)) return;
        const first = projectOptions[0];
        setNewChatProjectId(first?.id ?? null);
        if (first && !first.implicit) {
            const host = Object.keys(first.targets)[0];
            if (host) setNewChatHostId(host);
        } else if (first && first.implicit) {
            setNewChatHostId(first.hostId);
        }
    }, [newChatProjectId, projectOptions]);

    // Effective workspace for the new-chat draft. Null when the project
    // isn't set up on the selected target — sending stays blocked until
    // it is (bind it from the run-target menu).
    const newChatCwd = useMemo(() => {
        if (!newChatProjectId) return null;
        const opt = projectOptions.find((p) => p.id === newChatProjectId);
        if (!opt) return null;
        if (opt.implicit) return opt.path;
        return opt.targets[newChatHostId] ?? null;
    }, [newChatProjectId, newChatHostId, projectOptions]);

    const selectedProject: ProjectOption | null = useMemo(
        () => projectOptions.find((p) => p.id === newChatProjectId) ?? null,
        [projectOptions, newChatProjectId],
    );

    const persistDraftTarget = useCallback((projectId: string | null, hostId: string) => {
        const tabId = activeNewTabIdRef.current;
        if (!tabId) return;
        setNewTabTargets((prev) => ({ ...prev, [tabId]: { projectId, hostId } }));
    }, []);

    const handleCreateProject = useCallback((input: NewProjectInput): Project => {
        const project = addProject({ ...input, hostId: newChatHostIdRef.current }, homeCwd || undefined);
        setNewChatProjectId(project.id);
        persistDraftTarget(project.id, newChatHostIdRef.current);
        return project;
    }, [addProject, homeCwd, persistDraftTarget]);

    const handleRenameProject = useCallback((id: string, name: string) => {
        renameProject(id, name);
    }, [renameProject]);

    const handleRemoveProject = useCallback((id: string) => {
        removeProject(id);
        if (newChatProjectIdRef.current === id) {
            // The fallback effect below picks the next project.
            setNewChatProjectId(null);
        }
    }, [removeProject]);

    const handleSetProjectTarget = useCallback((id: string, hostId: string, path: string) => {
        setProjectTarget(id, hostId, path, homeCwd || undefined);
    }, [setProjectTarget, homeCwd]);

    /** Project picker: choose the project, keep the target when bound. */
    const handleSelectProject = useCallback((id: string) => {
        const opt = projectOptions.find((p) => p.id === id);
        setNewChatProjectId(id);
        if (!opt) return;
        if (opt.implicit) {
            setNewChatHostId(opt.hostId);
            setActiveHostId(opt.hostId);
            persistDraftTarget(id, opt.hostId);
            return;
        }
        const bound = Object.keys(opt.targets);
        if (bound.includes(newChatHostIdRef.current)) {
            persistDraftTarget(id, newChatHostIdRef.current);
        } else if (bound[0]) {
            setNewChatHostId(bound[0]);
            setActiveHostId(bound[0]);
            persistDraftTarget(id, bound[0]);
        }
    }, [projectOptions, setActiveHostId, persistDraftTarget]);

    /** Run-target picker: choose where the project runs. */
    const handleTargetChange = useCallback((hostId: string) => {
        setNewChatHostId(hostId);
        setActiveHostId(hostId);
        persistDraftTarget(newChatProjectIdRef.current, hostId);
    }, [setActiveHostId, persistDraftTarget]);

    /** Bind the selected project to a new target, then run there. */
    const handleBindTarget = useCallback((projectId: string, hostId: string, path: string) => {
        setProjectTarget(projectId, hostId, path, homeCwd || undefined);
        setNewChatHostId(hostId);
        setActiveHostId(hostId);
        persistDraftTarget(projectId, hostId);
    }, [setProjectTarget, homeCwd, setActiveHostId, persistDraftTarget]);

    // Pinned sessions move out of their project into the Pinned group above
    // Projects; archived sessions move to the footer group. Both stay
    // searchable via Cmd+K. Newest first in both groups.
    const byModifiedDesc = (a: { modified: string }, b: { modified: string }) =>
        new Date(b.modified).getTime() - new Date(a.modified).getTime();
    const pinnedSessions = useMemo(
        () => sessions.sessions
            .filter((s) => sessionFlags.pinned.has(s.path) && !sessionFlags.archived.has(s.path))
            .sort(byModifiedDesc),
        [sessions.sessions, sessionFlags.pinned, sessionFlags.archived],
    );
    const archivedSessions = useMemo(
        () => sessions.sessions
            .filter((s) => sessionFlags.archived.has(s.path))
            .sort(byModifiedDesc),
        [sessions.sessions, sessionFlags.archived],
    );
    // Sidebar sections: every project (even empty) with its sessions across
    // all run targets, newest first. Pinned / archived sessions are
    // excluded — they live in their own groups.
    const projectGroups = useMemo(
        () => projectOptions.map((project) => ({
            project,
            sessions: sessionsForProject(sessions.sessions, project)
                .filter((s) => !sessionFlags.pinned.has(s.path) && !sessionFlags.archived.has(s.path)),
        })),
        [projectOptions, sessions.sessions, sessionFlags.pinned, sessionFlags.archived],
    );
    const orphanCount = useMemo(() => {
        const claimed = new Set<string>();
        for (const group of projectGroups) {
            for (const s of group.sessions) claimed.add(s.path);
        }
        return sessions.sessions.filter((s) => !claimed.has(s.path) && !sessionFlags.pinned.has(s.path) && !sessionFlags.archived.has(s.path)).length;
    }, [projectGroups, sessions.sessions, sessionFlags.pinned, sessionFlags.archived]);

    // Switching the execution host re-resolves models and reachability.
    // Sessions always aggregate across hosts (see useSessions).
    useEffect(() => {
        void sessions.refresh();
        void models.refresh({ silent: true });
        void healthHook.check(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeHostId]);

    const activeTitle = useMemo(() => chat.data?.sessionName || chat.data?.header?.id || chat.activeFile?.split("/").pop() || "New chat", [chat.data?.sessionName, chat.data?.header?.id, chat.activeFile]);
    const activeCwd = chat.data?.cwd || chat.data?.header?.cwd;

    // Current project for the command menu — the active session's project
    // wins, then the new-chat picker. Prefers the project name when known.
    const currentProjectOption: ProjectOption | null = useMemo(() => {
        if (activeCwd) {
            const hostId = chat.activeFile ? sessions.hostOf(chat.activeFile) : activeHostId;
            const claimed = projectOptions.find((p) => {
                if (p.implicit) return p.hostId === hostId && p.path === activeCwd;
                return p.targets[hostId] === activeCwd;
            });
            if (claimed) return claimed;
        }
        return selectedProject;
    }, [activeCwd, chat.activeFile, sessions.hostOf, activeHostId, projectOptions, selectedProject]);
    const currentProjectDisplay = currentProjectOption?.name ?? "";

    // Display name for the new-chat hero. Empty when no project is selected
    // yet (hero shows a placeholder instead).
    const newChatProjectDisplay = selectedProject?.name ?? "";

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
            const res: any = await models.setModel(sessionFile, provider, id, sessions.hostOf(sessionFile));
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
    }, [chat.activeFile, chat.patchModel, models.models, models.setModel, sessions.hostOf, setInlineFor]);

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
            const res: any = await models.setThinkingLevel(sessionFile, level, sessions.hostOf(sessionFile));
            if (res?.thinkingLevel) chat.patchModel(null as any, res.thinkingLevel, sessionFile);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setModelError(msg);
        }
    }, [models.setThinkingLevel, chat.patchModel, sessions.hostOf]);

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

    const selectNewTab = useCallback((id: string) => {
        setSettingsActive(false);
        setUiDemoActive(false);
        setActiveNewTabId(id);
        const stored = newTabTargets[id];
        if (stored !== undefined) {
            setNewChatProjectId(stored.projectId);
            setNewChatHostId(stored.hostId);
            if (stored.hostId !== activeHostIdRef.current) setActiveHostId(stored.hostId);
        }
        chat.clear();
        focusComposer();
    }, [chat.clear, focusComposer, newTabTargets, setActiveHostId]);
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

    // Execution follows selection: opening a session points the active host
    // at the run target it lives on, so every subsequent call routes there.
    // The api layer also reads the host fresh per call, so this is belt and
    // suspenders for anything that only knows the active host.
    const handleSelect = useCallback(async (file: string) => {
        setSettingsActive(false);
        setUiDemoActive(false);
        const hostId = sessions.hostOf(file);
        if (hostId !== activeHostIdRef.current) setActiveHostId(hostId);
        openSessionTab(file);
        if (file === chat.activeFile) { focusComposer(); return; }
        if (chat.hasCache(file)) {
            chat.hydrateFromCache(file);
            sessions.switchTo(file, undefined, hostId).catch((e) => console.warn("switchSession failed", e));
            chat.revalidate(file);
            focusComposer();
            return;
        }
        chat.prepareSwitch(file);
        try {
            const res = await sessions.switchTo(file, undefined, hostId);
            if ((res as any)?.context) chat.hydrateFromSwitch(res as any);
            else await chat.openFile(file);
        } catch (e) {
            console.warn("switchSession failed", e);
            await chat.openFile(file).catch(() => {});
        } finally { focusComposer(); }
    }, [openSessionTab, sessions.switchTo, sessions.hostOf, sessions.sessions, setActiveHostId, chat.openFile, chat.hydrateFromSwitch, chat.hydrateFromCache, chat.hasCache, chat.revalidate, chat.activeFile, chat.prepareSwitch, focusComposer]);

    const handleNewChat = useCallback(() => { setSettingsActive(false); setUiDemoActive(false); if (newChatHostIdRef.current !== activeHostIdRef.current) setActiveHostId(newChatHostIdRef.current); createNewChatTab(); chat.clear(); focusComposer(); }, [chat.clear, createNewChatTab, focusComposer, setActiveHostId]);

    const handleNewChatInProject = useCallback((projectId: string) => {
        setSettingsActive(false);
        setUiDemoActive(false);
        const opt = projectOptions.find((p) => p.id === projectId);
        let hostId = newChatHostIdRef.current;
        if (opt && !opt.implicit) {
            if (opt.targets[hostId] === undefined) hostId = Object.keys(opt.targets)[0] ?? hostId;
        } else if (opt && opt.implicit) {
            hostId = opt.hostId;
        }
        setNewChatProjectId(projectId);
        setNewChatHostId(hostId);
        setActiveHostId(hostId);
        createNewChatTab({ projectId, hostId });
        chat.clear();
        focusComposer();
    }, [chat.clear, createNewChatTab, focusComposer, projectOptions, setActiveHostId]);

    const handleToggleTheme = useCallback(() => {
        clearActiveCustomTheme();
        setTheme(effectiveTheme === "dark" ? "light" : "dark");
    }, [effectiveTheme, setTheme]);

    // Provider menu (shared by Settings and the Cmd+K palette). The dialog
    // chunk loads on first open, never on startup.
    const [providerMenuOpen, setProviderMenuOpen] = useState(false);
    const [providerMenuSeen, setProviderMenuSeen] = useState(false);
    const openProviderMenu = useCallback(() => {
        setProviderMenuSeen(true);
        setProviderMenuOpen(true);
    }, []);
    const [providersVersion, setProvidersVersion] = useState(0);
    const handleProvidersSaved = useCallback(() => {
        models.refresh({ silent: true });
        setProvidersVersion((v) => v + 1);
    }, [models]);

    // Global actions for the Cmd+K palette — always rendered above sessions.
    const commandActions: CommandAction[] = useMemo(() => {
        const iconClass = "size-5 shrink-0 text-current";
        const list: CommandAction[] = [];
        if (currentProjectOption) {
            list.push({
                id: "new-chat-in-project",
                label: `New chat in ${currentProjectDisplay || currentProjectOption.id}`,
                hint: "⌘N",
                keywords: ["new chat", "create", currentProjectDisplay],
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
            id: "manage-providers",
            label: "Providers",
            keywords: ["providers", "auth", "api key", "api keys", "add provider", "models"],
            icon: <IconKeyFilled className={iconClass} />,
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
    }, [currentProjectOption, currentProjectDisplay, effectiveTheme, sidebarOpen]);

    const handleCommandAction = useCallback((id: string) => {
        switch (id) {
            case "new-chat-in-project":
                if (currentProjectOption) handleNewChatInProject(currentProjectOption.id);
                else handleNewChat();
                break;
            case "new-chat":
                handleNewChat();
                break;
            case "open-settings":
                openSettingsTab();
                break;
            case "manage-providers":
                openProviderMenu();
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
    }, [currentProjectOption, handleNewChat, handleNewChatInProject, handleToggleTheme, openSettingsTab, openUiDemoTab]);

    const handleCloseTab = useCallback((id: string) => {
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
                if (!backend || !next.includes(backend)) {
                    const fallback = next.find((tabId) => tabId !== SETTINGS_TAB_ID && tabId !== UI_DEMO_TAB_ID);
                    if (fallback === undefined) handleNewChat();
                    else if (isNewTabId(fallback)) selectNewTab(fallback);
                    else void handleSelect(fallback);
                }
            }
            return;
        }
        // Chat tabs (sessions + new-chat drafts) — closing the last one swaps in
        // a fresh new-chat tab so there is always at least one chat tab.
        const closed = closeTab(current, id, {
            isChatTab: (tabId) => tabId !== SETTINGS_TAB_ID && tabId !== UI_DEMO_TAB_ID,
            makeFreshId: () => {
                // Last chat tab closed — force a fresh new tab in its place.
                const fresh = `${NEW_TAB_PREFIX}${newTabCounterRef.current++}`;
                setNewTabTargets((prev) => ({ ...prev, [fresh]: { projectId: newChatProjectIdRef.current, hostId: newChatHostIdRef.current } }));
                return fresh;
            },
        });
        if (closed.removedIndex < 0) return;
        if (isNewTabId(id)) {
            dropNewTabState(id);
            if (activeNewTabId === id) setActiveNewTabId(null);
        }
        const next = closed.ids;
        const nextActiveId = nextTabAfterClose(next, closed.removedIndex);
        openTabIdsRef.current = next;
        setOpenTabIds(next);
        const activeTab = settingsActive ? SETTINGS_TAB_ID : uiDemoActive ? UI_DEMO_TAB_ID : (chat.activeFile ?? activeNewTabId);
        if (id !== activeTab) return;
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
        if (nextActiveId === undefined) handleNewChat();
        else if (isNewTabId(nextActiveId)) selectNewTab(nextActiveId);
        else void handleSelect(nextActiveId);
    }, [activeNewTabId, chat.activeFile, dropNewTabState, handleNewChat, handleSelect, newChatCwd, selectNewTab, settingsActive, uiDemoActive]);

    const handleTabSelect = useCallback((id: string) => {
        if (id === SETTINGS_TAB_ID) {
            openSettingsTab();
            return;
        }
        if (id === UI_DEMO_TAB_ID) {
            openUiDemoTab();
            return;
        }
        if (isNewTabId(id)) {
            if (!openTabIdsRef.current.includes(id)) return;
            selectNewTab(id);
            return;
        }
        void handleSelect(id);
    }, [handleSelect, openSettingsTab, openUiDemoTab, selectNewTab]);

    const handleCycleTab = useCallback((dir: 1 | -1) => {
        const ids = openTabIdsRef.current;
        if (ids.length <= 1) return;
        const active = settingsActive ? SETTINGS_TAB_ID : uiDemoActive ? UI_DEMO_TAB_ID : (chat.activeFile ?? activeNewTabId ?? ids[0]);
        const from = ids.indexOf(active);
        const next = (((from < 0 ? 0 : from) + dir) + ids.length) % ids.length;
        handleTabSelect(ids[next]);
    }, [settingsActive, uiDemoActive, chat.activeFile, activeNewTabId, handleTabSelect]);

    const handleSelectTabByIndex = useCallback((index: number) => {
        const ids = openTabIdsRef.current;
        if (ids.length === 0) return;
        const target = ids[index < 0 ? ids.length - 1 : index];
        if (target === undefined) return;
        handleTabSelect(target);
    }, [handleTabSelect]);

    const handleCloseActiveTab = useCallback(() => {
        if (settingsActive) handleCloseTab(SETTINGS_TAB_ID);
        else if (uiDemoActive) handleCloseTab(UI_DEMO_TAB_ID);
        else {
            const active = chat.activeFile ?? activeNewTabId;
            if (active) handleCloseTab(active);
        }
    }, [settingsActive, uiDemoActive, handleCloseTab, chat.activeFile, activeNewTabId]);

    const handleRename = useCallback(async (file: string, name: string) => {
        await sessions.rename(file, name, sessions.hostOf(file));
        chat.invalidateCache(file);
        if (chat.activeFile === file) await chat.refreshSilent();
    }, [sessions.rename, sessions.hostOf, chat.activeFile, chat.refreshSilent, chat.invalidateCache]);

    const handleDelete = useCallback(async (file: string) => {
        await sessions.remove(file, sessions.hostOf(file));
        sessionFlags.removeFile(file);
        if (openTabIdsRef.current.includes(file)) handleCloseTab(file);
        chat.invalidateCache(file);
        chat.removeFile(file);
        clearQueueFor(file);
        setInlineFor(file, null);
    }, [sessions.remove, sessions.hostOf, sessionFlags.removeFile, handleCloseTab, chat.removeFile, chat.invalidateCache, setInlineFor]);

    const handleDeleteCurrent = useCallback(async () => {
        const f = chat.activeFile;
        if (!f) return;
        if (!confirm("Delete current session?")) return;
        await handleDelete(f);
    }, [chat.activeFile, handleDelete]);

    const handleAbort = useCallback(async () => {
        // Second step of the two-Esc stop: actually abort. Disarm first so a
        // slow abort can't leave the composer stuck showing Esc.
        if (abortArmTimerRef.current != null) {
            window.clearTimeout(abortArmTimerRef.current);
            abortArmTimerRef.current = null;
        }
        setAbortArmed(false);
        const f = chat.activeFile;
        if (!f) return;
        if (compaction.isCompacting(f)) {
            await compaction.abort(f, undefined, sessions.hostOf(f));
            focusComposer();
            return;
        }
        await chat.abort(f);
        const err: InlineError = { id: `${f}-${Date.now()}`, reason: "Abort", message: "Aborted by user.", time: new Date().toLocaleTimeString(), canContinue: true };
        setInlineFor(f, err);
        focusComposer();
    }, [chat.abort, chat.activeFile, compaction, focusComposer, setInlineFor]);

    // Two-Esc stop: the first Escape arms (send button morphs to Esc),
    // the second confirms the abort. Arming expires after a short window.
    const [abortArmed, setAbortArmed] = useState(false);
    const abortArmTimerRef = useRef<number | null>(null);
    const disarmAbort = useCallback(() => {
        if (abortArmTimerRef.current != null) {
            window.clearTimeout(abortArmTimerRef.current);
            abortArmTimerRef.current = null;
        }
        setAbortArmed(false);
    }, []);
    // Arming only makes sense mid-turn — drop it when streaming ends or
    // the user switches sessions so the composer never sticks on Esc.
    const abortArmActive = chat.isStreaming && chat.activeFile;
    useEffect(() => {
        if (!abortArmActive) disarmAbort();
    }, [abortArmActive, disarmAbort]);
    useEffect(() => () => {
        if (abortArmTimerRef.current != null) window.clearTimeout(abortArmTimerRef.current);
    }, []);
    const handleAbortRequest = useCallback(() => {
        if (!chat.isStreaming) return;
        if (abortArmed) {
            void handleAbort();
            return;
        }
        setAbortArmed(true);
        if (abortArmTimerRef.current != null) window.clearTimeout(abortArmTimerRef.current);
        abortArmTimerRef.current = window.setTimeout(() => {
            abortArmTimerRef.current = null;
            setAbortArmed(false);
        }, 2500);
    }, [abortArmed, chat.isStreaming, handleAbort]);

    const handleAbortCompaction = useCallback(async () => {
        const f = chat.activeFile;
        if (!f) return;
        await compaction.abort(f, undefined, sessions.hostOf(f));
        focusComposer();
    }, [chat.activeFile, compaction, focusComposer, sessions.hostOf]);

    const handleRetryCompaction = useCallback(async () => {
        const f = chat.activeFile;
        if (!f) return;
        const instr = lastCompactInstructionsRef.current[f];
        const cwd = (chat.data as unknown as { cwd?: string })?.cwd || (chat.data as unknown as { header?: { cwd?: string } })?.header?.cwd;
        try {
            await compaction.retry(f, instr, cwd, sessions.hostOf(f));
            sessions.refresh({ silent: true });
        } catch {}
        focusComposer();
    }, [chat.activeFile, chat.data, compaction, sessions, sessions.hostOf, focusComposer]);

    const handleContinue = useCallback(async () => {
        const f = chat.activeFile;
        if (!f) return;
        const hostId = sessions.hostOf(f);
        const cwd = activeCwd || newChatCwd || homeCwd;
        // optimistic: clear the notice, Continue will resume
        setInlineFor(f, null);
        try {
            // use sidecar continue streaming via same mechanism as prompt but via streamContinue
            // we replicate chat streaming logic here minimal
            await (chat as any).continueStreaming?.(f, cwd, hostId);
        } catch {
            // fallback to direct streamContinue
            try {
                await streamContinue({ sessionFile: f, cwd, hostId }, () => {});
                await chat.revalidate(f);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                const err: InlineError = { id: `${f}-${Date.now()}`, reason: makeInlineReason(msg), message: msg, time: new Date().toLocaleTimeString(), canContinue: msg.includes("continue") ? false : true };
                setInlineFor(f, err);
            }
        }
    }, [chat, activeCwd, newChatCwd, homeCwd, sessions.hostOf, setInlineFor]);

    const handleSend = useCallback(async (content: string, images?: { type: "image"; data: string; mimeType: string }[]) => {
        const trimmed = content.trim();
        // /undo and /redo are exact-match local commands. Anything with extra
        // text falls through to the agent as a normal message.
        if (trimmed === "/undo" || trimmed === "/redo") {
            const isUndo = trimmed === "/undo";
            const targetFile = chat.activeFile;
            if (!targetFile) {
                setModelError(`Open a session to ${isUndo ? "undo" : "redo"}.`);
                return;
            }
            if (chat.isStreaming) {
                setModelError(`Wait for the response to finish before running ${trimmed}.`);
                return;
            }
            if (compaction.isCompacting(targetFile)) {
                setModelError(`Wait for compaction to finish before running ${trimmed}.`);
                return;
            }
            setInlineFor(targetFile, null);
            try {
                const cwd = activeCwd || undefined;
                const hostId = sessions.hostOf(targetFile);
                if (isUndo) await undoTurn(targetFile, cwd, hostId);
                else await redoTurn(targetFile, cwd, hostId);
                await chat.revalidate(targetFile);
                sessions.refresh({ silent: true });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                const err: InlineError = { id: `${targetFile}-${Date.now()}`, reason: makeInlineReason(msg), message: msg, time: new Date().toLocaleTimeString(), canContinue: false };
                setInlineFor(targetFile, err);
            }
            focusComposer();
            return;
        }
        // /compact with optional instructions — keep verbatim routing even while streaming (compact will abort streaming)
        if (trimmed.startsWith("/compact")) {
            const after = trimmed.slice("/compact".length).trim();
            const isCompactCommand = trimmed === "/compact" || /^\/compact\s/.test(trimmed);
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
                // dismiss any inline notice before compact
                setInlineFor(targetFile, null);
                try {
                    const cwd = activeCwd || undefined;
                    await compaction.compact(targetFile, instructions, cwd, sessions.hostOf(targetFile));
                    sessions.refresh({ silent: true });
                } catch {}
                clearDraftFor(targetFile);
                focusComposer();
                return;
            }
        }
        // sending a new message clears the interrupt notice — no stacking
        if (chat.activeFile) setInlineFor(chat.activeFile, null);
        else if (content.trim() && activeNewTabId) clearDraftFor(activeNewTabId);
        let preparedSessionFile: string | undefined;
        // New chat starts on the selected run target. Execution follows the
        // picker: point the active host there first so every call below —
        // including anything that only knows the active host — routes right.
        const selectedHostId = !chat.activeFile ? newChatHostIdRef.current : sessions.hostOf(chat.activeFile);
        if (!chat.activeFile) {
            if (!newChatCwd) {
                setModelError(`Set ${selectedProject?.name ?? "the project"} up on ${hostNameById[selectedHostId] ?? selectedHostId} first — pick a run target or add its path.`);
                return;
            }
            setActiveHostId(selectedHostId);
        }
        const selectedCwd = !chat.activeFile ? (newChatCwd ?? homeCwd) || undefined : undefined;
        if (!chat.activeFile && (draftModelKey || draftThinking)) {
            try {
                const res = await createSession(selectedCwd, selectedHostId);
                const file = res.file;
                preparedSessionFile = file;
                promoteNewChatTab(file);
                try { await sessions.switchTo(file, selectedCwd, selectedHostId); } catch {}
                await chat.openFile(file);
                sessions.addOptimistic(file, selectedCwd || "", content, selectedHostId);
                const parsed = draftModelKey?.includes("/") ? { provider: draftModelKey.split("/")[0], id: draftModelKey.split("/").slice(1).join("/") } : null;
                if (parsed) {
                    try { const res: any = await models.setModel(file, parsed.provider, parsed.id, selectedHostId); if (res?.model) chat.patchModel(res.model, res.thinkingLevel, file); } catch (e) { setModelError(e instanceof Error ? e.message : String(e)); }
                }
                if (draftThinking) { try { await models.setThinkingLevel(file, draftThinking, selectedHostId); } catch (e) { setModelError(e instanceof Error ? e.message : String(e)); } }
                setDraftModelKey(undefined); setDraftThinking(undefined);
                await chat.refreshSilent();
            } catch (e) { console.warn("draft model pre-create failed", e); }
        }
        try {
            await chat.prompt(content, {
                cwd: selectedCwd,
                hostId: selectedHostId,
                images,
                sessionFile: preparedSessionFile,
                onNewFile: (file, cwd, firstMessage) => {
                    const realCwd = cwd || chat.data?.cwd || selectedCwd || "";
                    promoteNewChatTab(file);
                    sessions.addOptimistic(file, realCwd, firstMessage, selectedHostId);
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
        if (chat.activeFile || preparedSessionFile || activeNewTabId) clearDraftFor(chat.activeFile ?? preparedSessionFile ?? activeNewTabId);
        sessions.refresh({ silent: true });
        focusComposer();
    }, [chat.prompt, chat.data?.cwd, activeCwd, activeNewTabId, newChatCwd, newChatHostId, homeCwd, selectedProject, hostNameById, setActiveHostId, sessions.addOptimistic, sessions.refresh, sessions.hostOf, chat.activeFile, chat.isStreaming, chat.abort, draftModelKey, draftThinking, models.setModel, models.setThinkingLevel, promoteNewChatTab, chat.patchModel, chat.openFile, chat.refreshSilent, sessions.switchTo, focusComposer, setInlineFor, compaction]);

    // ---- Message queueing and steering (M3) ----
    // Synchronous mirror of the running set so interrupt can wait for the
    // aborted turn to settle before sending the follow-up prompt.
    const runningFilesRef = useRef(chat.runningFiles);
    runningFilesRef.current = chat.runningFiles;

    const handleQueue = useCallback((content: string, images?: { type: "image"; data: string; mimeType: string }[]) => {
        const file = chat.activeFile;
        if (!file) return;
        queue.enqueue(file, content, images);
        focusComposer();
    }, [chat.activeFile, queue.enqueue, focusComposer]);

    const handleInterrupt = useCallback(async (content: string, images?: { type: "image"; data: string; mimeType: string }[]) => {
        const file = chat.activeFile;
        if (!file || !chat.isStreaming) {
            await handleSend(content, images);
            return;
        }
        try { await chat.abort(file); } catch {}
        // Wait for the aborted turn to settle so the follow-up prompt is not
        // rejected as overlapping. Bounded poll; handleSend archives/raises otherwise.
        const deadline = Date.now() + 4000;
        while (runningFilesRef.current.has(file) && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 100));
        }
        await handleSend(content, images);
    }, [chat.activeFile, chat.isStreaming, chat.abort, handleSend]);

    const handleQueueRemove = useCallback((id: string) => {
        const file = chat.activeFile;
        if (file) queue.remove(file, id);
        focusComposer();
    }, [chat.activeFile, queue.remove, focusComposer]);

    const handleQueueEdit = useCallback((id: string, text: string) => {
        const file = chat.activeFile;
        if (!file || !text.trim()) return;
        queue.remove(file, id);
        window.dispatchEvent(new CustomEvent("phi:load-composer", { detail: { text } }));
    }, [chat.activeFile, queue.remove]);

    const handleQueueSendNow = useCallback((id: string) => {
        const file = chat.activeFile;
        if (!file) return;
        const item = queue.queueFor(file).find((q) => q.id === id);
        if (!item) return;
        queue.remove(file, id);
        void handleInterrupt(item.text, item.images);
    }, [chat.activeFile, queue.queueFor, queue.remove, handleInterrupt]);

    // Automatic sequential draining: when the agent finishes a turn, the head
    // of the queue sends as a follow-up. Serialised via drainingRef so a stale
    // isStreaming=false render can never shift two messages for one idle slot.
    const handleSendRef = useRef(handleSend);
    handleSendRef.current = handleSend;
    const drainingRef = useRef(false);
    const compactingActive = chat.activeFile ? compaction.isCompacting(chat.activeFile) : false;
    const queuedForActive = chat.activeFile ? queue.queueFor(chat.activeFile) : [];
    useEffect(() => {
        const file = chat.activeFile;
        if (!file || chat.isStreaming || chat.loading || compactingActive || queuedForActive.length === 0 || drainingRef.current) return;
        const head = queue.shift(file);
        if (!head) return;
        drainingRef.current = true;
        void (async () => {
            try {
                await handleSendRef.current(head.text, head.images);
            } finally {
                drainingRef.current = false;
            }
        })();
    }, [chat.activeFile, chat.isStreaming, chat.loading, compactingActive, queuedForActive.length, queue.shift]);

    const messages = useMemo(() => chat.data?.context.messages ?? [], [chat.data?.context.messages]);
    // Flattened (project, host) bindings for the palette's group lookup.
    const commandProjects = useMemo(() => {
        const out: Array<{ path: string; name: string }> = [];
        for (const p of projectOptions) {
            if (p.implicit) out.push({ path: p.path, name: p.name });
            else for (const targetPath of Object.values(p.targets)) out.push({ path: targetPath, name: p.name });
        }
        return out;
    }, [projectOptions]);
    const sessionStats = useSessionStats(chat.activeFile, messages.length, chat.isStreaming, chat.activeFile ? sessions.hostOf(chat.activeFile) : undefined);

    const tabItems = useMemo(() => openTabIds.map((id) => {
        if (isNewTabId(id)) return { id, title: "New chat" };
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
        onOpenSettings: openSettingsTab,
        onAbort: () => { if (!settingsActive && !uiDemoActive) handleAbortRequest(); },
        onNextTab: () => handleCycleTab(1),
        onPrevTab: () => handleCycleTab(-1),
        onSelectTabByIndex: handleSelectTabByIndex,
    }, { isStreaming: chat.isStreaming });

    // fatal gate
    if (healthHook.fatal) {
        return <FatalState error={healthHook.health?.error ?? null} home={healthHook.health?.home} port={healthHook.health?.port} agentDir={healthHook.health?.agentDir} onRetry={async () => { await healthHook.retry(); }} />;
    }

    return (
        <SessionCommand groups={sessions.groups} projects={commandProjects} hostNameById={hostNameById} showHostBadges={showHostBadges} loading={sessions.loading} error={sessions.error} actions={commandActions} onAction={handleCommandAction} onSelect={(file) => void handleSelect(file)}>
            {(openSearch) => {
                // Cmd+K ownership lives in SessionCommand alone; useShortcuts
                // deliberately ignores that chord so there is one handler.
                return (
                    <div className="phi-layout text-phi-text-primary antialiased selection:bg-phi-accent/25">
                        <div
                            className="phi-sidebar-wrap"
                            data-collapsed={sidebarOpen ? "false" : "true"}
                            aria-hidden={!sidebarOpen}
                        >
                            <Sidebar
                                projectGroups={projectGroups}
                                hostNameById={hostNameById}
                                showHostBadges={showHostBadges}
                                pinnedSessions={pinnedSessions}
                                archivedSessions={archivedSessions}
                                orphanCount={orphanCount}
                                activeFile={settingsActive ? SETTINGS_TAB_ID : uiDemoActive ? UI_DEMO_TAB_ID : chat.activeFile}
                                onSelect={handleSelect}
                                onNewChat={handleNewChat}
                                onOpenSearch={openSearch}
                                onOpenSettings={openSettingsTab}
                                collapsed={sessions.collapsed}
                                onToggleGroup={sessions.toggleGroup}
                                onRename={handleRename}
                                onDelete={handleDelete}
                                onTogglePin={sessionFlags.togglePin}
                                onToggleArchive={sessionFlags.toggleArchive}
                                loading={sessions.loading}
                                error={sessions.error}
                                runningFiles={chat.runningFiles}
                                onPrefetch={chat.prefetch}
                            />
                        </div>

                        <main className="phi-main bg-phi-bg-sidebar px-2 pb-2" data-sidebar-collapsed={sidebarOpen ? "false" : "true"}>
                            <Tabs
                                sidebarActions={
                                    <div className={`flex items-center transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${sidebarOpen ? "gap-0" : "gap-1"}`}>
                                        <div
                                            inert={sidebarOpen}
                                            aria-hidden={sidebarOpen}
                                            className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${sidebarOpen ? "max-w-0 opacity-0" : "max-w-10 opacity-100"}`}
                                        >
                                            <SearchSessionsButton onClick={openSearch} />
                                        </div>
                                        <Button
                                            variant="icon"
                                            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                                            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                                            onClick={() => setSidebarOpen((open) => !open)}
                                        >
                                            <SidebarToggleIcon expanded={sidebarOpen} className="size-4" />
                                        </Button>
                                    </div>
                                }
                                sidebarCollapsed={!sidebarOpen}
                                tabs={tabItems}
                                activeId={settingsActive ? SETTINGS_TAB_ID : uiDemoActive ? UI_DEMO_TAB_ID : (chat.activeFile ?? activeNewTabId)}
                                onSelect={handleTabSelect}
                                onClose={handleCloseTab}
                            />
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-phi-border-subtle bg-phi-bg-main shadow-[0_8px_30px_var(--color-phi-shadow)]">
                                {settingsActive ? (
                                    <section className="flex min-h-0 flex-1" aria-label="Settings">
                                        <SettingsPanel section={settingsSection} onSectionChange={setSettingsSection} onProvidersChanged={() => models.refresh({ silent: true })} onAddProvider={openProviderMenu} providersVersion={providersVersion} cwd={activeCwd || newChatCwd || homeCwd || undefined} />
                                    </section>
                                ) : uiDemoActive ? (
                                    <section className="flex min-h-0 flex-1" aria-label="UI demo">
                                        <UiDemoPanel />
                                    </section>
                                ) : (
                                <section className="relative flex min-h-0 flex-1 flex-col">
                                    {chat.activeFile ? (
                                        <div className="pointer-events-none absolute right-4 top-4 z-10 flex justify-end">
                                            <div className="pointer-events-auto">
                                                <ContextIndicator file={chat.activeFile} stats={sessionStats.stats} loading={sessionStats.loading} onRefresh={() => void sessionStats.refresh()} placement="below" />
                                            </div>
                                        </div>
                                    ) : null}
                                    {!chat.activeFile ? (
                                        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                                            <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                                                <img
                                                    src={brandingUrl("logo.svg", effectiveTheme)}
                                                    alt=""
                                                    aria-hidden="true"
                                                    className="phi-empty-logo"
                                                />
                                                <h1 className="mt-8 max-w-2xl text-balance text-[26px] leading-[1.2] tracking-tight text-phi-text-primary sm:text-[32px]">
                                                    What are we building in{" "}
                                                    <button
                                                        type="button"
                                                        onClick={focusProjectPicker}
                                                        title={newChatProjectDisplay ? `Change project, currently ${newChatProjectDisplay}` : "Select a project"}
                                                        aria-label={newChatProjectDisplay ? `Change project, currently ${newChatProjectDisplay}` : "Select a project"}
                                                        className="underline decoration-dashed decoration-phi-text-muted decoration-[2px] underline-offset-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                                                    >
                                                        {newChatProjectDisplay || "a project"}
                                                    </button>?
                                                </h1>
                                                {!sessions.loading && !sessions.error && projectOptions.length === 0 && (
                                                    <p className="mt-6 text-[12px] text-phi-text-muted">No projects yet — create one from the picker below to start chatting.</p>
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
                                            onContinue={handleContinue}
                                            onDismiss={() => chat.activeFile && setInlineFor(chat.activeFile, null)}
                                        />
                                    )}

                                    <div className="shrink-0 px-4 pb-4 sm:px-7 sm:pb-5">
                                        {(modelError) && (
                                            <div className="mx-auto mb-2 w-full max-w-4xl">
                                                <Alert variant="error" className="flex items-center justify-between gap-2 !text-[12.5px]">
                                                    <span className="truncate">{modelError}</span>
                                                    <button onClick={() => setModelError(null)} className="shrink-0 text-[11px] underline opacity-80 hover:opacity-100">Dismiss</button>
                                                </Alert>
                                            </div>
                                        )}
                                        {!modelError && !models.loading && models.models.length === 0 && !models.error && (
                                            <div className="mx-auto mb-2 w-full max-w-4xl">
                                                <Alert variant="warning" className="!text-[12.5px]">
                                                    No models available — check auth (run <InlineCode>pi auth</InlineCode>) or configure API keys. The model selector will populate after auth.
                                                </Alert>
                                            </div>
                                        )}
                                        {!chat.activeFile && (
                                            <div className="mx-auto pl-6 mb-1 flex w-full max-w-4xl min-w-0 flex-wrap items-center gap-1" ref={directoryPickerRef}>
                                                <DirectoryPicker selectedProjectId={newChatProjectId} projects={projectOptions} activeHostId={newChatHostId} hostNameById={hostNameById} onSelectProject={handleSelectProject} onCreateProject={handleCreateProject} onRenameProject={handleRenameProject} onRemoveProject={handleRemoveProject} onSetTarget={handleSetProjectTarget} onRemoveTarget={removeProjectTarget} homeCwd={homeCwd} disabled={chat.isStreaming || (chat.activeFile ? compaction.isCompacting(chat.activeFile) : false)} />
                                                {selectedProject && !selectedProject.implicit && (
                                                    <TargetPicker hosts={hosts} value={newChatHostId} boundHostIds={boundHostIds(selectedProject)} projectName={selectedProject.name} onChange={handleTargetChange} onBind={(hostId, path) => handleBindTarget(selectedProject.id, hostId, path)} disabled={chat.isStreaming} />
                                                )}
                                            </div>
                                        )}
                                        {(() => {
                                            const cFile = chat.activeFile;
                                            const isCompacting = cFile ? compaction.isCompacting(cFile) : false;
                                            const cErr = cFile ? compaction.errors[cFile] : null;
                                            const instr = cFile ? lastCompactInstructionsRef.current[cFile] : undefined;
                                            const showIndicator = Boolean(isCompacting || cErr);
                                            const queued = cFile ? queue.queueFor(cFile) : [];
                                            const showQueue = queued.length > 0;
                                            return (
                                                <div className="mx-auto flex w-full max-w-4xl flex-col gap-0">
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
                                                    <div
                                                        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${showQueue ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                                                    >
                                                        <div className="min-h-0 overflow-hidden">
                                                            {showQueue && (
                                                                <QueueIndicator items={queued} onRemove={handleQueueRemove} onEdit={handleQueueEdit} onSendNow={handleQueueSendNow} />
                                                            )}
                                                        </div>
                                                    </div>
                                                    <Composer onSend={handleSend} abortArmed={abortArmed} onQueue={handleQueue} isStreaming={chat.isStreaming} isCompacting={isCompacting} cwd={chat.activeFile ? activeCwd : (newChatCwd ?? homeCwd)} draftKey={chat.activeFile ?? activeNewTabId} beforeSend={<><ModelSelector models={models.models} value={selectedModelKey} thinkingLevel={thinkingLevel} onSelect={handleSelectModel} onThinkingChange={handleThinkingChange} disabled={chat.isStreaming || (cFile ? compaction.isCompacting(cFile) : false)} isStreaming={chat.isStreaming} loading={models.loading} error={models.error} /><ThinkingEffortSelector models={models.models} modelKey={selectedModelKey} value={thinkingLevel} onChange={handleThinkingChange} disabled={chat.isStreaming || (cFile ? compaction.isCompacting(cFile) : false)} /></>} />
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
                        <SonnerViewport
                            sonners={streamSonners.sonners}
                            onDismiss={streamSonners.dismiss}
                            onOpen={(item) => {
                                streamSonners.dismiss(item.id);
                                if (item.sessionFile) void handleSelect(item.sessionFile);
                            }}
                        />
                        {providerMenuSeen && (
                            <Suspense fallback={null}>
                                <ProviderMenuDialog open={providerMenuOpen} onOpenChange={setProviderMenuOpen} onSaved={handleProvidersSaved} />
                            </Suspense>
                        )}
                    </div>
                );
            }}
        </SessionCommand>
    );
}
