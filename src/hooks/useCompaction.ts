import { useCallback, useRef, useState } from "react";
import { abortCompaction, streamCompact, getMessages } from "../lib/api";
import type { SessionMessagesResponse } from "../types/session";

type CompactionError = { message: string; canRetry: boolean };
type CompactionResult = { summary: string; tokensBefore: number; estimatedTokensAfter?: number };

export function useCompaction(opts: {
  revalidate?: (file: string) => Promise<void>;
  getMessages?: typeof getMessages;
  storeResponse?: (file: string, payload: SessionMessagesResponse) => void;
}) {
  const [compactingFiles, setCompactingFiles] = useState<Set<string>>(new Set());
  const compactingRef = useRef<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, CompactionError>>({});
  const [results, setResults] = useState<Record<string, CompactionResult>>({});
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  const markCompacting = useCallback((file: string, on: boolean) => {
    const next = new Set(compactingRef.current);
    if (on) next.add(file);
    else next.delete(file);
    compactingRef.current = next;
    setCompactingFiles(next);
  }, []);

  const setErr = useCallback((file: string, err: string | null, canRetry = true) => {
    setErrors((prev) => {
      if (!err) {
        if (!(file in prev)) return prev;
        const { [file]: _d, ...rest } = prev;
        return rest;
      }
      return { ...prev, [file]: { message: err, canRetry } };
    });
  }, []);

  const compact = useCallback(
    async (file: string, customInstructions?: string, cwd?: string) => {
      if (!file) throw new Error("missing session file");
      if (compactingRef.current.has(file)) throw new Error("compaction already in progress");
      const controller = new AbortController();
      controllersRef.current.set(file, controller);
      markCompacting(file, true);
      setErr(file, null);
      try {
        let lastResult: CompactionResult | null = null;
        let sawError = false;
        let errorMsg = "";
        let aborted = false;
        await streamCompact(
          { sessionFile: file, customInstructions, cwd },
          (ev) => {
            const t = String((ev as Record<string, unknown>).type ?? "");
            if (t === "compaction_start") {
              // keep compacting state
            } else if (t === "compaction_end" && (ev as Record<string, unknown>).aborted) {
              aborted = true;
            } else if (t === "done" && (ev as Record<string, unknown>).result) {
              lastResult = ev.result as CompactionResult;
            } else if (t === "error") {
              sawError = true;
              errorMsg = String((ev as Record<string, unknown>).error ?? "Compaction failed");
              if ((ev as Record<string, unknown>).aborted) aborted = true;
            }
          },
          controller.signal,
        );
        if (aborted) {
          setErr(file, null);
          return { aborted: true as const };
        }
        if (sawError && errorMsg) {
          const canRetry = !/cancelled/i.test(errorMsg);
          setErr(file, errorMsg, canRetry);
          throw new Error(errorMsg);
        }
        if (lastResult) setResults((prev) => ({ ...prev, [file]: lastResult! }));
        // refresh session data so compaction entry appears
        try {
          if (opts.revalidate) await opts.revalidate(file);
          else if (opts.getMessages && opts.storeResponse) {
            const payload = await getMessages(file);
            opts.storeResponse(file, payload);
          }
        } catch {}
        setErr(file, null);
        return { aborted: false as const, result: lastResult };
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setErr(file, null);
          return { aborted: true as const };
        }
        const msg = e instanceof Error ? e.message : String(e);
        if (/abort|cancel/i.test(msg)) {
          setErr(file, null);
          return { aborted: true as const };
        }
        const canRetry = true;
        setErr(file, msg, canRetry);
        throw e;
      } finally {
        if (controllersRef.current.get(file) === controller) controllersRef.current.delete(file);
        markCompacting(file, false);
      }
    },
    [markCompacting, setErr, opts],
  );

  const abort = useCallback(
    async (file: string, cwd?: string) => {
      if (!file) return;
      // local abort
      controllersRef.current.get(file)?.abort();
      try {
        await abortCompaction(file, cwd);
      } catch {}
      markCompacting(file, false);
      setErr(file, null);
    },
    [markCompacting, setErr],
  );

  const retry = useCallback(
    async (file: string, customInstructions?: string, cwd?: string) => {
      setErr(file, null);
      return compact(file, customInstructions, cwd);
    },
    [compact, setErr],
  );

  const clearError = useCallback((file: string) => setErr(file, null), [setErr]);

  return {
    compactingFiles,
    compact,
    abort,
    retry,
    clearError,
    errors,
    results,
    isCompacting: (file: string | null) => (file ? compactingFiles.has(file) : false),
  };
}
