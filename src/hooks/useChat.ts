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
};

export function useChat() {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [data, setData] = useState<SessionMessagesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streaming, setStreaming] = useState<StreamingState>({ text: "", thinking: "", tools: [] });

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
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
    setStreaming({ text: "", thinking: "", tools: [] });
  }, []);

  const refresh = useCallback(async () => {
    if (!activeFile) return;
    await openFile(activeFile);
  }, [activeFile, openFile]);

  const abort = useCallback(async () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    try {
      await abortPrompt();
    } catch {}
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
      setStreaming({ text: "", thinking: "", tools: [] });
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

        // keep isStreaming true while we fetch persisted history to avoid unmounting Streaming and jumping scroll
        // fetch without toggling loading to avoid spinner flicker
        try {
          const res = await getMessages(file!);
          // batch: replace history and clear streaming in same tick, then end streaming
          setData(res);
        } catch {}
        // clear streaming and end streaming after history is in place (next frame avoids flash)
        requestAnimationFrame(() => {
          setStreaming({ text: "", thinking: "", tools: [] });
          setIsStreaming(false);
          abortRef.current = null;
        });
      }
    },
    [activeFile, flush, scheduleFlush],
  );

  return { activeFile, data, loading, error, isStreaming, streaming, openFile, clear, refresh, setActiveFile, prompt, abort };
}
