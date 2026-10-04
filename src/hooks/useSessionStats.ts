import { useCallback, useEffect, useRef, useState } from "react";
import { getSessionStats, type SessionStatsResponse } from "../lib/api";

export type { SessionStatsResponse };
export type SessionStats = SessionStatsResponse;
const STREAM_POLL_MS = 4000;

/** Best-effort local Session context usage and cost. */
export function useSessionStats(file: string | null, revision: number, isStreaming: boolean) {
  const [stats, setStats] = useState<SessionStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(file);
  fileRef.current = file;
  const refresh = useCallback(async () => {
    const current = fileRef.current;
    if (!current) return;
    try { const data = await getSessionStats(current); if (fileRef.current === current) setStats(data); } catch {}
  }, []);
  useEffect(() => {
    if (!file) { setStats(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getSessionStats(file).then((data) => { if (!cancelled) setStats(data); }).catch(() => { if (!cancelled) setStats(null); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [file, revision]);
  useEffect(() => {
    if (!file || !isStreaming) return;
    const timer = window.setInterval(() => void refresh(), STREAM_POLL_MS);
    return () => window.clearInterval(timer);
  }, [file, isStreaming, refresh]);
  return { stats, loading, refresh };
}
