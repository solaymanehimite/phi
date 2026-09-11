import { useCallback, useEffect, useRef, useState } from "react";
import { getSessionStats, type SessionStatsResponse } from "../lib/api";

export type { SessionStatsResponse };
export type SessionStats = SessionStatsResponse;

const STREAM_POLL_MS = 4000;

/**
 * Session context usage + cost for the composer indicator. Best effort:
 * failures clear to an empty ring rather than surfacing errors.
 *
 * `revision` should change whenever fresh usage may exist (e.g. the
 * message count). While streaming, stats poll on an interval so the
 * ring tracks the running turn.
 */
export function useSessionStats(
  file: string | null,
  revision: number,
  isStreaming: boolean,
) {
  const [stats, setStats] = useState<SessionStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(file);
  fileRef.current = file;

  const refresh = useCallback(async () => {
    const current = fileRef.current;
    if (!current) return;
    try {
      const data = await getSessionStats(current);
      if (fileRef.current === current) setStats(data);
    } catch {
      // Indicator stays on its last reading when a refresh fails.
    }
  }, []);

  useEffect(() => {
    if (!file) {
      setStats(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSessionStats(file)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, revision]);

  useEffect(() => {
    if (!file || !isStreaming) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, STREAM_POLL_MS);
    return () => window.clearInterval(timer);
  }, [file, isStreaming, refresh]);

  return { stats, loading, refresh };
}
