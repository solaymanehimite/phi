import { useCallback, useRef, useState } from "react";
import { abortPrompt, createSession, getMessages } from "../lib/api";
import { streamPrompt, type SseEvent } from "../lib/sse";
import type { SessionMessagesResponse } from "../types/session";

type StreamingTool = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  partial?: string;
  result?: string;
  isError?: boolean;
  done?: boolean;
};

type StreamingState = {
  text: string;
  thinking: string;
  tools: StreamingTool[];
  error?: string;
  startedAt?: number | null;
  elapsedMs?: number | null;
};

export function useChat() {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [data, setData] = useState<SessionMessagesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streaming, setStreaming] = useState<StreamingState>({ text: "", thinking: "", tools: [], startedAt: null, elapsedMs: null });
  const streamStartedAtRef = useRef<number | null>(null);

  // LRU cache for instant session hopping — keeps last 20 sessions in memory (0ms on 2nd visit)
  const cacheRef = useRef<Map<string, SessionMessagesResponse>>(new Map());
  const pendingPrefetchRef = useRef<Set<string>>(new Set());
  const MAX_CACHE = 20;
  const putCache = useCallback((file: string, payload: SessionMessagesResponse) => {
    const m = cacheRef.current;
    if (m.has(file)) m.delete(file);
    m.set(file, payload);
    if (m.size > MAX_CACHE) {
      const first = m.keys().next().value as string | undefined;
      if (first) m.delete(first);
    }
  }, []);

  // rAF buffering for text/thinking deltas
  const pendingText = useRef("");
  const pendingThinking = useRef("");
  const rafId = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const flush = useCallback(() => {
    rafId.current = null;
    const t = pendingText.current;
    const th = pendingThinking.current;
    if (!t && !th) return;
    pendingText.current = "";
    pendingThinking.current = "";
    setStreaming((s) => ({
      ...s,
      text: s.text + t,
      thinking: s.thinking + th,
    }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(flush);
  }, [flush]);

  const openFile = useCallback(async (file: string) => {
    setActiveFile(file);
    setLoading(true);
    setError(null);
    try {
      const res = await getMessages(file);
      setData(res);
      putCache(file, res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [putCache]);

  // Prepare switch — instant "Loading..." feedback without extra fetch
  const prepareSwitch = useCallback((file: string) => {
    setActiveFile(file);
    setLoading(true);
    setError(null);
  }, []);

  // Hydrate from switch response that already contains messages — avoids 2nd RTT
  const hydrateFromSwitch = useCallback((payload: SessionMessagesResponse) => {
    setActiveFile(payload.file);
    setData(payload);
    setLoading(false);
    setError(null);
    putCache(payload.file, payload);
  }, [putCache]);

  // Instant path: if cached, hydrate immediately with 0ms (no loading flash)
  const hydrateFromCache = useCallback((file: string): boolean => {
    const cached = cacheRef.current.get(file);
    if (!cached) return false;
    // move to MRU
    cacheRef.current.delete(file);
    cacheRef.current.set(file, cached);
    setActiveFile(file);
    setData(cached);
    setLoading(false);
    setError(null);
    return true;
  }, []);

  const hasCache = useCallback((file: string) => cacheRef.current.has(file), []);

  // Prefetch on hover/focus/idle — low priority, no loading state
  const prefetch = useCallback(async (file: string) => {
    if (!file || cacheRef.current.has(file) || pendingPrefetchRef.current.has(file)) return;
    if (file === activeFile) return;
    pendingPrefetchRef.current.add(file);
    try {
      const res = await getMessages(file);
      putCache(file, res);
    } catch {}
    finally {
      pendingPrefetchRef.current.delete(file);
    }
  }, [activeFile, putCache]);

  // Silent revalidate cached entry in background (stale-while-revalidate)
  const revalidate = useCallback(async (file: string) => {
    try {
      const res = await getMessages(file);
      putCache(file, res);
      // if still viewing this file, patch data without flash
      setData((prev) => (prev?.file === file ? res : prev));
    } catch {}
  }, [putCache]);

  const invalidateCache = useCallback((file: string) => {
    cacheRef.current.delete(file);
  }, []);

  const clear = useCallback(() => {
    // abort any streaming
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
    }
    if (rafId.current != null) cancelAnimationFrame(rafId.current);
    pendingText.current = "";
    pendingThinking.current = "";
    setActiveFile(null);
    setData(null);
    setError(null);
    setLoading(false);
    setIsStreaming(false);
    streamStartedAtRef.current = null;
    setStreaming({ text: "", thinking: "", tools: [], startedAt: null, elapsedMs: null });
  }, []);

  const refresh = useCallback(async () => {
    if (!activeFile) return;
    await openFile(activeFile);
  }, [activeFile, openFile]);

  // Silent refresh — updates data without flashing "Loading messages…"
  const refreshSilent = useCallback(async () => {
    if (!activeFile) return;
    try {
      const res = await getMessages(activeFile);
      setData(res);
      putCache(activeFile, res);
    } catch {}
  }, [activeFile, putCache]);

  // Optimistic patch for model/thinking without full refetch — keeps UI snappy
  const patchModel = useCallback((model: any, thinkingLevel?: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        context: {
          ...prev.context,
          model: model ?? prev.context.model,
          thinkingLevel: thinkingLevel ?? (prev.context as any).thinkingLevel,
        },
      } as typeof prev;
      // keep cache in sync so re-hopping stays instant with correct model
      if (next.file) putCache(next.file, next);
      return next;
    });
  }, [putCache]);

  const abort = useCallback(async () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    try {
      await abortPrompt();
    } catch {}
    const elapsed = streamStartedAtRef.current != null ? Date.now() - streamStartedAtRef.current : null;
    if (elapsed != null) setStreaming((s) => ({ ...s, elapsedMs: elapsed }));
    setIsStreaming(false);
  }, []);

  const prompt = useCallback(
    async (text: string, opts: { cwd?: string; onNewFile?: (file: string, cwd: string, firstMessage: string) => void } = {}) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      let file = activeFile;
      const cwdForNew = opts.cwd ?? "";

      // lazy create session if none
      if (!file) {
        try {
          const res = await createSession(opts.cwd);
          file = res.file;
          setActiveFile(file);
          opts.onNewFile?.(file, cwdForNew, trimmed);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          return;
        }
      }

      // optimistic user bubble: add to local data
      setData((prev) => {
        const userMsg = { role: "user", content: [{ type: "text", text: trimmed }], timestamp: Date.now() } as unknown as SessionMessagesResponse["context"]["messages"][number];
        if (!prev) {
          // create minimal context with user message so it shows immediately
          return {
            file: file!,
            header: null,
            entries: [],
            context: {
              messages: [userMsg],
              thinkingLevel: "medium",
              model: null,
            },
            cwd: opts.cwd ?? "",
          } as unknown as SessionMessagesResponse;
        }
        const next = { ...prev, file: file!, context: { ...prev.context, messages: [...prev.context.messages, userMsg] } };
        return next as SessionMessagesResponse;
      });

      setIsStreaming(true);
      streamStartedAtRef.current = Date.now();
      setStreaming({ text: "", thinking: "", tools: [], startedAt: streamStartedAtRef.current, elapsedMs: null });
      setError(null);
      pendingText.current = "";
      pendingThinking.current = "";

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        await streamPrompt(
          { text: trimmed, sessionFile: file },
          (ev: SseEvent) => {
            const type = String(ev.type ?? "");

            if (type === "message_update") {
              const ae = (ev.assistantMessageEvent ?? ev.event ?? {}) as Record<string, unknown>;
              const t = String(ae.type ?? "");
              if (t === "text_delta" && typeof ae.delta === "string") {
                pendingText.current += ae.delta;
                scheduleFlush();
              } else if (t === "thinking_delta" && typeof ae.delta === "string") {
                pendingThinking.current += ae.delta;
                scheduleFlush();
              }
              // text_start/thinking_start etc ignored
            } else if (type === "tool_execution_start") {
              const toolName = String((ev.toolName as string) ?? (ev as Record<string, unknown>).name ?? "tool");
              const toolCallId = String((ev.toolCallId as string) ?? (ev as Record<string, unknown>).id ?? `${Date.now()}`);
              const args = (ev.args as Record<string, unknown>) ?? (ev as Record<string, unknown>).toolArgs ?? {};
              setStreaming((s) => ({
                ...s,
                tools: [...s.tools, { toolCallId, toolName, args: args as Record<string, unknown> }],
              }));
            } else if (type === "tool_execution_update") {
              const toolCallId = String((ev.toolCallId as string) ?? "");
              const partial = (ev.partialResult as Record<string, unknown>)?.content ?? ev.partialResult ?? ev.output ?? "";
              let textPartial = "";
              if (typeof partial === "string") textPartial = partial;
              else if (Array.isArray((partial as Record<string, unknown>).content)) textPartial = "";
              else if (partial && typeof partial === "object") textPartial = JSON.stringify(partial).slice(0, 500);
              if (toolCallId) {
                setStreaming((s) => ({
                  ...s,
                  tools: s.tools.map((t) => (t.toolCallId === toolCallId ? { ...t, partial: textPartial } : t)),
                }));
              }
            } else if (type === "tool_execution_end") {
              const toolCallId = String((ev.toolCallId as string) ?? "");
              const isError = Boolean(ev.isError);
              const result = ev.result as Record<string, unknown> | undefined;
              let textResult = "";
              if (result?.content && Array.isArray(result.content)) {
                textResult = (result.content as Array<Record<string, unknown>>)
                  .map((c) => String(c.text ?? ""))
                  .join("\n");
              } else if (typeof result === "string") textResult = result;
              else if (result) textResult = JSON.stringify(result).slice(0, 4000);
              setStreaming((s) => ({
                ...s,
                tools: s.tools.map((t) => (t.toolCallId === toolCallId ? { ...t, result: textResult, isError, done: true } : t)),
              }));
            } else if (type === "error") {
              const msg = String((ev.error as string) ?? "error");
              setStreaming((s) => ({ ...s, error: msg }));
              setError(msg);
            } else if (type === "done") {
              // handled after loop
            }
          },
          ac.signal,
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setStreaming((s) => ({ ...s, error: msg }));
        }
      } finally {
        // flush any pending deltas synchronously
        if (rafId.current != null) {
          cancelAnimationFrame(rafId.current);
          rafId.current = null;
        }
        const t = pendingText.current;
        const th = pendingThinking.current;
        if (t || th) {
          // apply remaining deltas to a snapshot before we swap to persisted history
          pendingText.current = "";
          pendingThinking.current = "";
          // we need to keep them visible until history loads, so update streaming one last time
          setStreaming((s) => ({ ...s, text: s.text + t, thinking: s.thinking + th }));
        }

        // compute elapsed for "Spent xx" label
        const elapsed = streamStartedAtRef.current != null ? Date.now() - streamStartedAtRef.current : null;
        if (elapsed != null) {
          setStreaming((s) => ({ ...s, elapsedMs: elapsed }));
        }

        // keep isStreaming true while we fetch persisted history to avoid unmounting Streaming and jumping scroll
        // fetch without toggling loading to avoid spinner flicker
        try {
          const res = await getMessages(file!);
          // batch: replace history and clear streaming in same tick, then end streaming
          setData(res);
          putCache(file!, res);
        } catch {}
        setIsStreaming(false);
        abortRef.current = null;
        // hold Spent label briefly as single collapsible; hide history's duplicate during this window
        setTimeout(() => {
          streamStartedAtRef.current = null;
          setStreaming({ text: "", thinking: "", tools: [], startedAt: null, elapsedMs: null });
        }, 2200);
      }
    },
    [activeFile, flush, scheduleFlush],
  );

  return { activeFile, data, loading, error, isStreaming, streaming, openFile, prepareSwitch, hydrateFromSwitch, hydrateFromCache, hasCache, prefetch, revalidate, putCache, invalidateCache, clear, refresh, refreshSilent, patchModel, setActiveFile, prompt, abort };
}
