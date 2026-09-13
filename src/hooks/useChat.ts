import { useCallback, useRef, useState } from "react";
import { abortPrompt, createSession, getMessages } from "../lib/api";
import { streamPrompt, type SseEvent } from "../lib/sse";
import { streamContinue } from "../lib/api";
import type { SessionMessagesResponse } from "../types/session";
import {
  createPendingStream,
  emptyStreamState,
  flushPendingToStream,
  isLocalNoticeFallback,
  reduceStreamEvent,
  responseContainsNotices,
  withNoticesAppended,
  type StreamDraft,
  type StreamingState,
} from "../lib/stream-reducer";

// Effect handle for one in-flight stream. The rAF id stays here in the hook;
// everything else lives in the pure `StreamDraft` owned by stream-reducer.
type PendingEntry = {
  draft: StreamDraft;
  rafId: number | null;
};

const MAX_CACHE = 20;

const emptyStream = emptyStreamState;

/**
 * Keeps transient chat state per persisted session file. The selected file only
 * controls what is rendered. It never owns or cancels another file's stream.
 */
export function useChat() {
  const [activeFileState, setActiveFileState] = useState<string | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const [dataState, setDataState] = useState<SessionMessagesResponse | null>(null);
  const dataRef = useRef<SessionMessagesResponse | null>(null);
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [errorsByFile, setErrorsByFile] = useState<Record<string, string>>({});
  const [streamsByFile, setStreamsByFile] = useState<Record<string, StreamingState>>({});
  const [runningFiles, setRunningFiles] = useState<Set<string>>(new Set());
  const runningFilesRef = useRef<Set<string>>(new Set());

  const cacheRef = useRef<Map<string, SessionMessagesResponse>>(new Map());
  const pendingPrefetchRef = useRef<Set<string>>(new Set());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const pendingStreamsRef = useRef<Map<string, PendingEntry>>(new Map());
  const noticesRef = useRef<Map<string, string[]>>(new Map());
  const seenAgentRef = useRef<Set<string>>(new Set());

  const setActiveFile = useCallback((file: string | null) => {
    activeFileRef.current = file;
    setActiveFileState(file);
  }, []);

  const setVisibleData = useCallback((payload: SessionMessagesResponse | null) => {
    dataRef.current = payload;
    setDataState(payload);
  }, []);

  const putCache = useCallback((file: string, payload: SessionMessagesResponse) => {
    const cache = cacheRef.current;
    if (cache.has(file)) cache.delete(file);
    cache.set(file, payload);
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest) cache.delete(oldest);
    }
  }, []);

  const storeResponse = useCallback((file: string, payload: SessionMessagesResponse) => {
    putCache(file, payload);
    if (activeFileRef.current === file) setVisibleData(payload);
  }, [putCache, setVisibleData]);

  const updateCachedResponse = useCallback((file: string, update: (current: SessionMessagesResponse) => SessionMessagesResponse) => {
    const current = cacheRef.current.get(file) ?? (activeFileRef.current === file ? dataRef.current : null);
    if (!current) return;
    const next = update(current);
    storeResponse(file, next);
  }, [storeResponse]);

  const setFileError = useCallback((file: string, message: string | null) => {
    setErrorsByFile((previous) => {
      if (!message) {
        if (!(file in previous)) return previous;
        const { [file]: _removed, ...rest } = previous;
        return rest;
      }
      return { ...previous, [file]: message };
    });
  }, []);

  const setFileLoading = useCallback((file: string, loading: boolean) => {
    setLoadingFiles((previous) => {
      const next = new Set(previous);
      if (loading) next.add(file);
      else next.delete(file);
      return next;
    });
  }, []);

  const markRunning = useCallback((file: string, running: boolean) => {
    const next = new Set(runningFilesRef.current);
    if (running) next.add(file);
    else next.delete(file);
    runningFilesRef.current = next;
    setRunningFiles(next);
  }, []);

  const updateStream = useCallback((file: string, update: (current: StreamingState) => StreamingState) => {
    setStreamsByFile((previous) => ({
      ...previous,
      [file]: update(previous[file] ?? emptyStream()),
    }));
  }, []);

  const flushStream = useCallback((file: string) => {
    const entry = pendingStreamsRef.current.get(file);
    if (!entry) return;
    entry.rafId = null;
    const captured = entry.draft;
    if (!captured.text && captured.thinking.length === 0) return;
    entry.draft = { ...captured, text: "", thinking: [] };
    updateStream(file, (stream) => flushPendingToStream(captured, stream).stream);
  }, [updateStream]);

  const scheduleFlush = useCallback((file: string) => {
    const pending = pendingStreamsRef.current.get(file);
    if (!pending || pending.rafId !== null) return;
    pending.rafId = requestAnimationFrame(() => flushStream(file));
  }, [flushStream]);

  const clearPendingStream = useCallback((file: string) => {
    const pending = pendingStreamsRef.current.get(file);
    if (pending?.rafId !== null && pending?.rafId !== undefined) cancelAnimationFrame(pending.rafId);
    pendingStreamsRef.current.delete(file);
  }, []);

  // Single code path for prompt and continuation events. Pure reduction lives
  // in `stream-reducer`; this only plumbs refs, stream state, and rAF.
  const applyStreamEvent = useCallback((file: string, event: SseEvent) => {
    const entry = pendingStreamsRef.current.get(file);
    if (!entry) return;
    const outcome = reduceStreamEvent(entry.draft, event);
    entry.draft = outcome.draft;
    if (outcome.sawAgent) seenAgentRef.current.add(file);
    if (outcome.notice !== undefined) noticesRef.current.get(file)?.push(outcome.notice);
    if (outcome.streamUpdate) updateStream(file, outcome.streamUpdate);
    if (outcome.error !== undefined) setFileError(file, outcome.error);
    if (outcome.buffered) scheduleFlush(file);
  }, [scheduleFlush, setFileError, updateStream]);

  const beginStream = useCallback((file: string) => {
    const controller = new AbortController();
    controllersRef.current.set(file, controller);
    pendingStreamsRef.current.set(file, { draft: createPendingStream(), rafId: null });
    noticesRef.current.set(file, []);
    seenAgentRef.current.delete(file);
    updateStream(file, () => ({ ...emptyStream(), startedAt: Date.now() }));
    markRunning(file, true);
    setFileError(file, null);
    return controller;
  }, [markRunning, setFileError, updateStream]);

  // Shared post-stream finalization: drain buffers, revalidate history with
  // custom notices merged, then tear down only this file's run. Prompt and
  // continuation differ only in `isSlash`.
  const finalizeStream = useCallback(async (file: string, controller: AbortController, isSlash: boolean) => {
    flushStream(file);
    const notices = noticesRef.current.get(file) ?? [];
    const sawAgent = seenAgentRef.current.has(file);
    try {
      const response = await getMessages(file);
      if (isLocalNoticeFallback(response, isSlash, sawAgent)) {
        updateCachedResponse(file, (current) => withNoticesAppended(current, notices));
      } else if (notices.length > 0) {
        storeResponse(file, responseContainsNotices(response, notices) ? response : withNoticesAppended(response, notices));
      } else {
        storeResponse(file, response);
      }
    } catch {
      // The optimistic transcript and live stream stay visible if refresh fails.
    }
    if (controllersRef.current.get(file) === controller) {
      controllersRef.current.delete(file);
      clearPendingStream(file);
      noticesRef.current.delete(file);
      seenAgentRef.current.delete(file);
      markRunning(file, false);
      setStreamsByFile((previous) => ({ ...previous, [file]: emptyStream() }));
    }
  }, [clearPendingStream, flushStream, markRunning, storeResponse, updateCachedResponse]);

  const openFile = useCallback(async (file: string) => {
    setActiveFile(file);
    setFileLoading(file, true);
    setFileError(file, null);
    try {
      const response = await getMessages(file);
      storeResponse(file, response);
    } catch (error) {
      setFileError(file, error instanceof Error ? error.message : String(error));
      if (activeFileRef.current === file) setVisibleData(null);
    } finally {
      setFileLoading(file, false);
    }
  }, [setActiveFile, setFileError, setFileLoading, setVisibleData, storeResponse]);

  const prepareSwitch = useCallback((file: string) => {
    setActiveFile(file);
    setFileLoading(file, true);
    setFileError(file, null);
  }, [setActiveFile, setFileError, setFileLoading]);

  const hydrateFromSwitch = useCallback((payload: SessionMessagesResponse) => {
    setActiveFile(payload.file);
    storeResponse(payload.file, payload);
    setFileLoading(payload.file, false);
    setFileError(payload.file, null);
  }, [setActiveFile, setFileError, setFileLoading, storeResponse]);

  const hydrateFromCache = useCallback((file: string): boolean => {
    const cached = cacheRef.current.get(file);
    if (!cached) return false;
    cacheRef.current.delete(file);
    cacheRef.current.set(file, cached);
    setActiveFile(file);
    setVisibleData(cached);
    setFileLoading(file, false);
    setFileError(file, null);
    return true;
  }, [setActiveFile, setFileError, setFileLoading, setVisibleData]);

  const hasCache = useCallback((file: string) => cacheRef.current.has(file), []);

  const prefetch = useCallback(async (file: string) => {
    if (!file || cacheRef.current.has(file) || pendingPrefetchRef.current.has(file)) return;
    if (file === activeFileRef.current) return;
    pendingPrefetchRef.current.add(file);
    try {
      storeResponse(file, await getMessages(file));
    } catch {
      // Hover prefetch is intentionally silent.
    } finally {
      pendingPrefetchRef.current.delete(file);
    }
  }, [storeResponse]);

  const revalidate = useCallback(async (file: string) => {
    try {
      storeResponse(file, await getMessages(file));
    } catch {
      // Cached history remains usable when a background refresh fails.
    }
  }, [storeResponse]);

  const invalidateCache = useCallback((file: string) => {
    cacheRef.current.delete(file);
  }, []);

  // Selecting New chat only clears the viewport. Background requests retain
  // their controllers, SSE readers, and stream buffers.
  const clear = useCallback(() => {
    setActiveFile(null);
    setVisibleData(null);
  }, [setActiveFile, setVisibleData]);

  const removeFile = useCallback((file: string) => {
    controllersRef.current.get(file)?.abort();
    controllersRef.current.delete(file);
    clearPendingStream(file);
    noticesRef.current.delete(file);
    seenAgentRef.current.delete(file);
    cacheRef.current.delete(file);
    markRunning(file, false);
    setStreamsByFile((previous) => {
      const { [file]: _removed, ...rest } = previous;
      return rest;
    });
    setErrorsByFile((previous) => {
      const { [file]: _removed, ...rest } = previous;
      return rest;
    });
    setLoadingFiles((previous) => {
      const next = new Set(previous);
      next.delete(file);
      return next;
    });
    if (activeFileRef.current === file) clear();
  }, [clear, clearPendingStream, markRunning]);

  const refresh = useCallback(async () => {
    const file = activeFileRef.current;
    if (file) await openFile(file);
  }, [openFile]);

  const refreshSilent = useCallback(async () => {
    const file = activeFileRef.current;
    if (!file) return;
    try {
      storeResponse(file, await getMessages(file));
    } catch {
      // Keep the visible transcript if a silent refresh fails.
    }
  }, [storeResponse]);

  const patchModel = useCallback((model: any, thinkingLevel?: string, sessionFile = activeFileRef.current) => {
    const file = sessionFile;
    if (!file) return;
    updateCachedResponse(file, (current) => ({
      ...current,
      context: {
        ...current.context,
        model: model ?? current.context.model,
        thinkingLevel: thinkingLevel ?? current.context.thinkingLevel,
      },
    }));
  }, [updateCachedResponse]);

  const abort = useCallback(async (file = activeFileRef.current) => {
    if (!file) return;
    // Keep the SSE reader attached. The targeted server abort settles the run,
    // which lets its normal cleanup persist the final aborted turn.
    await abortPrompt(file);
  }, []);

  const continueStreaming = useCallback(async (file: string, cwd?: string) => {
    if (!file) return;
    if (runningFilesRef.current.has(file)) {
      setFileError(file, "A prompt is already running for this session");
      return;
    }
    const controller = beginStream(file);
    try {
      await streamContinue({ sessionFile: file, cwd }, (event) => applyStreamEvent(file, event), controller.signal);
    } catch (error) {
      if ((error as Error).name !== "AbortError") { const message = error instanceof Error ? error.message : String(error); updateStream(file, (stream) => ({ ...stream, error: message })); setFileError(file, message); }
    } finally {
      await finalizeStream(file, controller, false);
    }
  }, [applyStreamEvent, beginStream, finalizeStream, setFileError, updateStream]);

  const prompt = useCallback(async (
    text: string,
    opts: {
      cwd?: string;
      sessionFile?: string;
      onNewFile?: (file: string, cwd: string, firstMessage: string) => void;
      images?: { type: "image"; data: string; mimeType: string }[];
    } = {},
  ) => {
    const trimmed = text.trim();
    const hasImages = (opts.images?.length ?? 0) > 0;
    if (!trimmed && !hasImages) return;

    let file = opts.sessionFile ?? activeFileRef.current;
    let cwd = opts.cwd;

    if (!file) {
      try {
        const created = await createSession(cwd);
        file = created.file;
        cwd = cwd ?? (created as { cwd?: string }).cwd;
        setActiveFile(file);
        opts.onNewFile?.(file, cwd ?? "", trimmed);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setFileError("__new__", message);
        throw error;
      }
    }

    let cached = cacheRef.current.get(file) ?? (activeFileRef.current === file ? dataRef.current : null);
    if (!cwd) cwd = cached?.cwd ?? cached?.header?.cwd;
    if (!cwd) {
      try {
        cached = await getMessages(file);
        storeResponse(file, cached);
        cwd = cached.cwd ?? cached.header?.cwd;
      } catch (error) {
        setFileError(file, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
    if (!cwd) {
      setFileError(file, "This session has no working directory");
      return;
    }

    if (runningFilesRef.current.has(file)) {
      setFileError(file, "A prompt is already running for this session");
      return;
    }

    const content: unknown[] = [];
    if (trimmed) content.push({ type: "text", text: trimmed });
    for (const image of opts.images ?? []) {
      content.push({ type: "image", data: image.data, mimeType: image.mimeType });
    }
    const userMessage = {
      role: "user",
      content,
      timestamp: Date.now(),
    } as unknown as SessionMessagesResponse["context"]["messages"][number];

    const initial = cached ?? {
      file,
      header: null,
      entries: [],
      context: { messages: [], thinkingLevel: "medium", model: null },
      cwd,
    } as unknown as SessionMessagesResponse;
    storeResponse(file, {
      ...initial,
      file,
      cwd,
      context: { ...initial.context, messages: [...initial.context.messages, userMessage] },
    });

    const streamFile = file;
    const controller = beginStream(streamFile);

    try {
      await streamPrompt(
        { text: trimmed || " ", sessionFile: streamFile, cwd, images: opts.images },
        (event: SseEvent) => applyStreamEvent(streamFile, event),
        controller.signal,
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        const message = error instanceof Error ? error.message : String(error);
        updateStream(streamFile, (stream) => ({ ...stream, error: message }));
        setFileError(streamFile, message);
      }
    } finally {
      await finalizeStream(streamFile, controller, trimmed.startsWith("/"));
    }
  }, [
    applyStreamEvent,
    beginStream,
    finalizeStream,
    setActiveFile,
    setFileError,
    storeResponse,
    updateStream,
  ]);

  const activeFile = activeFileState;
  const data = activeFile ? (dataState?.file === activeFile ? dataState : cacheRef.current.get(activeFile) ?? null) : null;
  const isStreaming = Boolean(activeFile && runningFiles.has(activeFile));
  const streaming = activeFile ? streamsByFile[activeFile] ?? emptyStream() : emptyStream();
  const loading = Boolean(activeFile && loadingFiles.has(activeFile));
  const error = activeFile ? errorsByFile[activeFile] ?? null : null;

  return {
    activeFile,
    data,
    loading,
    error,
    errorsByFile,
    isStreaming,
    streaming,
    runningFiles,
    openFile,
    prepareSwitch,
    hydrateFromSwitch,
    hydrateFromCache,
    hasCache,
    prefetch,
    revalidate,
    putCache,
    invalidateCache,
    clear,
    removeFile,
    refresh,
    refreshSilent,
    patchModel,
    setActiveFile,
    prompt,
    abort,
    continueStreaming,
  };
}
