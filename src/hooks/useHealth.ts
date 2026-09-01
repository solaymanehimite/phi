import { useCallback, useEffect, useRef, useState } from "react";
import { health } from "../lib/api";

export type HealthState = {
  ok: boolean;
  port?: number;
  agentDir?: string;
  home?: string;
  cwd?: string;
  error?: string;
};

export function useHealth(pollMs = 3000) {
  const [state, setState] = useState<HealthState | null>(null);
  const [fatal, setFatal] = useState(false);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<number | null>(null);

  const check = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await health();
      setState({ ...res });
      setFatal(false);
      setLoading(false);
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ ok: false, error: msg } as HealthState);
      setFatal(true);
      setLoading(false);
      throw e;
    }
  }, []);

  const retry = useCallback(() => check(true), [check]);

  useEffect(() => {
    void check(true);
    timerRef.current = window.setInterval(() => {
      if (fatal) void check(false);
    }, pollMs);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [check, fatal, pollMs]);

  // Also poll always every pollMs to detect sidecar down while app running
  useEffect(() => {
    const id = window.setInterval(() => void check(false), pollMs);
    return () => window.clearInterval(id);
  }, [check, pollMs]);

  return { health: state, fatal, loading, retry, check };
}
