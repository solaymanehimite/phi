import { useCallback, useRef, useState } from "react";
import { abortPrompt, createSession, getMessages } from "../lib/api";
import { streamPrompt, type SseEvent } from "../lib/sse";
import type { SessionMessagesResponse } from "../types/session";
import type { WorkItem, WorkOrder } from "../types/work";

type StreamingState = {
  text: string;
  workItems: WorkItem[];
  error?: string;
  startedAt?: number | null;
};

type PendingThinking = {
  id: string;
  order: WorkOrder;
  text: string;
};

type PendingStream = {
  text: string;
  thinking: PendingThinking[];
  rafId: number | null;
  assistantMessageIndex: number;
  currentThinkingContentIndex: number | null;
  fallbackContentIndex: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function compareWorkOrder(a: WorkOrder, b: WorkOrder): number {
  return a.message - b.message || a.content - b.content;
}

function insertWorkItem(items: WorkItem[], item: WorkItem): WorkItem[] {
  const existingIndex = items.findIndex((current) => current.id === item.id);
  const next = [...items];
  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
      ...item,
      order: next[existingIndex].order,
    } as WorkItem;
  } else {
    next.push(item);
  }
  next.sort((a, b) => compareWorkOrder(a.order, b.order));
  return next;
}

function patchWorkItem(items: WorkItem[], id: string, patch: Record<string, unknown>): WorkItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return items;
  const next = [...items];
  next[index] = { ...next[index], ...patch } as WorkItem;
  return next;
}

function toolCallFromAssistantEvent(event: Record<string, unknown>): {
  id: string;
  name: string;
  args: Record<string, unknown>;
} | null {
  const direct = asRecord(event.toolCall);
  const partial = asRecord(event.partial);
  const content = Array.isArray(partial.content) ? partial.content : [];
  const contentIndex = typeof event.contentIndex === "number" ? event.contentIndex : -1;
  const block = contentIndex >= 0 ? asRecord(content[contentIndex]) : {};
  const call = Object.keys(direct).length > 0 ? direct : block;
  const id = typeof call.id === "string" ? call.id : "";
  const name = typeof call.name === "string" ? call.name : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    args: asRecord(call.arguments ?? call.args),
  };
}

const MAX_CACHE = 20;

function emptyStream(): StreamingState {
  return { text: "", workItems: [], startedAt: null };
}

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
  const pendingStreamsRef = useRef<Map<string, PendingStream>>(new Map());
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
    const pending = pendingStreamsRef.current.get(file);
    if (!pending) return;
    pending.rafId = null;
    const { text, thinking } = pending;
    if (!text && thinking.length === 0) return;
    pending.text = "";
    pending.thinking = [];
    updateStream(file, (stream) => {
      let workItems = stream.workItems;
      for (const update of thinking) {
        const index = workItems.findIndex((item) => item.id === update.id);
        const item = index >= 0 ? workItems[index] : undefined;
        if (item?.kind === "thinking") {
          workItems = [...workItems];
          workItems[index] = {
            ...item,
            text: item.text + update.text,
          };
        } else {
          workItems = insertWorkItem(workItems, {
            kind: "thinking",
            id: update.id,
            text: update.text,
            order: update.order,
          });
        }
      }
      return {
        ...stream,
        text: stream.text + text,
        workItems,
      };
    });
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
        return;
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
        return;
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

    const controller = new AbortController();
    controllersRef.current.set(file, controller);
    pendingStreamsRef.current.set(file, {
      text: "",
      thinking: [],
      rafId: null,
      assistantMessageIndex: -1,
      currentThinkingContentIndex: null,
      fallbackContentIndex: 1_000_000,
    });
    noticesRef.current.set(file, []);
    seenAgentRef.current.delete(file);
    updateStream(file, () => ({ ...emptyStream(), startedAt: Date.now() }));
    markRunning(file, true);
    setFileError(file, null);

    try {
      await streamPrompt(
        { text: trimmed || " ", sessionFile: file, cwd, images: opts.images },
        (event: SseEvent) => {
          const type = String(event.type ?? "");
          const pending = pendingStreamsRef.current.get(file!);
          if (!pending) return;

          if (type === "agent_start") {
            seenAgentRef.current.add(file!);
          } else if (type === "message_start" || type === "message_end") {
            const message = asRecord(event.message);
            if (type === "message_start") {
              flushStream(file!);
              if (message.role === "assistant") {
                pending.assistantMessageIndex += 1;
                pending.currentThinkingContentIndex = null;
                pending.fallbackContentIndex = 1_000_000;
              }
            }

            if (message.role === "custom" && message.display !== false) {
              const messageContent = message.content;
              const notice = typeof messageContent === "string"
                ? messageContent
                : Array.isArray(messageContent)
                  ? messageContent
                    .map((part) => part && typeof part === "object" && "text" in (part as Record<string, unknown>)
                      ? String((part as Record<string, unknown>).text ?? "")
                      : typeof part === "string" ? part : "")
                    .filter(Boolean)
                    .join("\n")
                  : "";
              if (notice.trim()) {
                noticesRef.current.get(file!)?.push(notice.trim());
                pending.text += (pending.text ? "\n\n" : "") + notice.trim();
                scheduleFlush(file!);
              }
            }

            if (type === "message_end") flushStream(file!);
          } else if (type === "message_update") {
            const assistantEvent = asRecord(event.assistantMessageEvent ?? event.event);
            const assistantEventType = String(assistantEvent.type ?? "");
            if (assistantEventType === "text_delta" && typeof assistantEvent.delta === "string") {
              pending.text += assistantEvent.delta;
              scheduleFlush(file!);
            } else if (assistantEventType === "thinking_start" || assistantEventType === "thinking_delta") {
              if (pending.assistantMessageIndex < 0) pending.assistantMessageIndex = 0;
              const contentIndex = typeof assistantEvent.contentIndex === "number"
                ? assistantEvent.contentIndex
                : (pending.currentThinkingContentIndex ??= pending.fallbackContentIndex++);
              pending.currentThinkingContentIndex = contentIndex;

              if (assistantEventType === "thinking_delta" && typeof assistantEvent.delta === "string") {
                const id = `thinking:${pending.assistantMessageIndex}:${contentIndex}`;
                const existing = pending.thinking.find((item) => item.id === id);
                if (existing) existing.text += assistantEvent.delta;
                else pending.thinking.push({
                  id,
                  order: { message: pending.assistantMessageIndex, content: contentIndex },
                  text: assistantEvent.delta,
                });
                scheduleFlush(file!);
              }
            } else if (assistantEventType === "thinking_end") {
              pending.currentThinkingContentIndex = null;
            } else if (assistantEventType === "toolcall_start" || assistantEventType === "toolcall_end") {
              const call = toolCallFromAssistantEvent(assistantEvent);
              if (call) {
                flushStream(file!);
                if (pending.assistantMessageIndex < 0) pending.assistantMessageIndex = 0;
                const contentIndex = typeof assistantEvent.contentIndex === "number"
                  ? assistantEvent.contentIndex
                  : pending.fallbackContentIndex++;
                updateStream(file!, (stream) => ({
                  ...stream,
                  workItems: insertWorkItem(stream.workItems, {
                    kind: "tool",
                    id: call.id,
                    name: call.name,
                    args: call.args,
                    order: { message: pending.assistantMessageIndex, content: contentIndex },
                  }),
                }));
              }
            }
          } else if (type === "tool_execution_start") {
            flushStream(file!);
            if (pending.assistantMessageIndex < 0) pending.assistantMessageIndex = 0;
            const toolCallId = String(event.toolCallId ?? event.id ?? `${Date.now()}`);
            const toolName = String(event.toolName ?? event.name ?? "tool");
            const args = asRecord(event.args ?? event.toolArgs);
            const fallbackOrder = {
              message: pending.assistantMessageIndex,
              content: pending.fallbackContentIndex++,
            };
            updateStream(file!, (stream) => {
              const existing = stream.workItems.find((item) => item.id === toolCallId);
              return {
                ...stream,
                workItems: insertWorkItem(stream.workItems, {
                  kind: "tool",
                  id: toolCallId,
                  name: toolName,
                  args,
                  order: existing?.order ?? fallbackOrder,
                }),
              };
            });
          } else if (type === "tool_execution_update") {
            flushStream(file!);
            const toolCallId = String(event.toolCallId ?? "");
            const partial = event.partialResult ?? event.output ?? "";
            const partialText = typeof partial === "string"
              ? partial
              : partial && typeof partial === "object" ? JSON.stringify(partial).slice(0, 500) : "";
            updateStream(file!, (stream) => ({
              ...stream,
              workItems: patchWorkItem(stream.workItems, toolCallId, { partial: partialText }),
            }));
          } else if (type === "tool_execution_end") {
            flushStream(file!);
            const toolCallId = String(event.toolCallId ?? "");
            const result = event.result;
            const resultRecord = asRecord(result);
            let resultText = "";
            if (typeof result === "string") resultText = result;
            else if (Array.isArray(resultRecord.content)) {
              resultText = resultRecord.content
                .map((part) => String(asRecord(part).text ?? ""))
                .join("\n");
            } else if (result) resultText = JSON.stringify(result).slice(0, 4000);
            updateStream(file!, (stream) => ({
              ...stream,
              workItems: patchWorkItem(stream.workItems, toolCallId, {
                result: resultText,
                isError: Boolean(event.isError),
                done: true,
              }),
            }));
          } else if (type === "error") {
            const message = String(event.error ?? "error");
            updateStream(file!, (stream) => ({ ...stream, error: message }));
            setFileError(file!, message);
          }
        },
        controller.signal,
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        const message = error instanceof Error ? error.message : String(error);
        updateStream(file, (stream) => ({ ...stream, error: message }));
        setFileError(file, message);
      }
    } finally {
      flushStream(file);
      const notices = noticesRef.current.get(file) ?? [];
      const sawAgent = seenAgentRef.current.has(file);
      const isSlash = trimmed.startsWith("/");

      try {
        const response = await getMessages(file);
        const emptyHistory = response.context.messages.length === 0;
        if (isSlash && emptyHistory && !sawAgent) {
          updateCachedResponse(file, (current) => {
            if (notices.length === 0) return current;
            return {
              ...current,
              context: {
                ...current.context,
                messages: [...current.context.messages, {
                  role: "assistant",
                  content: notices.map((notice) => ({ type: "text", text: notice })),
                  timestamp: Date.now(),
                } as unknown as SessionMessagesResponse["context"]["messages"][number]],
              },
            };
          });
        } else if (notices.length > 0) {
          const noticesInHistory = response.context.messages.some((message) => {
            const messageContent = (message as Record<string, unknown>).content;
            return Array.isArray(messageContent) && messageContent.some((part) => notices.includes(String((part as Record<string, unknown>).text ?? "")));
          });
          if (!noticesInHistory) {
            response.context.messages.push({
              role: "assistant",
              content: notices.map((notice) => ({ type: "text", text: notice })),
              timestamp: Date.now(),
            } as unknown as SessionMessagesResponse["context"]["messages"][number]);
          }
          storeResponse(file, response);
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
    }
  }, [
    clearPendingStream,
    flushStream,
    markRunning,
    scheduleFlush,
    setActiveFile,
    setFileError,
    storeResponse,
    updateCachedResponse,
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
  };
}
