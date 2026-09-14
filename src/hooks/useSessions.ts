import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { listSessions, createSession, switchSession, renameSession, deleteSession } from "../lib/api";
import type { SessionInfo } from "../types/session";
import { useLocalStorage } from "./useLocalStorage";
import { HOSTS_CHANGED_EVENT, LOCAL_HOST, getStoredHosts } from "./useHosts";

export type SessionGroup = {
  hostId: string;
  cwd: string;
  displayCwd: string; // decoded, with ~ for home
  sessions: SessionInfo[];
};

function toDisplayCwd(cwd: string): string {
  if (!cwd) return "(no cwd)";
  // Best-effort ~ replacement — we try to infer home from first segment if path starts with /home/xxx
  // Server already decodes; we just shorten for UI.
  // We keep full path in `cwd`, displayCwd is just for rendering.
  // Replace /home/<user> with ~ if present
  // This is purely cosmetic; grouping key remains `cwd`.
  const m = cwd.match(/^\/home\/[^/]+/);
  if (m) return cwd.replace(m[0], "~");
  return cwd;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-host fetch failures. An unreachable host degrades to an empty list —
  // the rest of the sidebar still renders.
  const [hostErrors, setHostErrors] = useState<Record<string, string>>({});
  // Bumped whenever the host list changes so aggregation re-runs.
  const [hostsVersion, setHostsVersion] = useState(0);
  // Persist collapsed groups across restarts.
  const [collapsed, setCollapsed] = useLocalStorage<Set<string>>(
    "phi:sidebar:collapsed",
    new Set(),
    {
      serialize: (v) => JSON.stringify([...v]),
      deserialize: (s) => {
        try {
          const parsed = JSON.parse(s);
          return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
        } catch {
          return new Set<string>();
        }
      },
    },
  );
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    setError(null);
    try {
      // Aggregate every run target: local first, then stored remotes.
      // One host failing must not take down the sidebar.
      const hosts = [LOCAL_HOST, ...getStoredHosts()];
      const settled = await Promise.allSettled(
        hosts.map(async (host) => ({
          hostId: host.id,
          sessions: await listSessions({ all: true, hostId: host.id }),
        })),
      );
      const merged: SessionInfo[] = [];
      const errors: Record<string, string> = {};
      for (const result of settled) {
        if (result.status === "fulfilled") {
          for (const s of result.value.sessions) {
            merged.push({ ...s, hostId: result.value.hostId });
          }
        } else {
          const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          // Find which host failed by matching the in-flight order.
          const idx = settled.indexOf(result);
          const hostId = hosts[idx]?.id ?? "?";
          errors[hostId] = msg;
        }
      }
      setSessions(Array.isArray(merged) ? merged : []);
      setHostErrors(errors);
      const failures = Object.keys(errors);
      if (failures.length > 0 && merged.length === 0) {
        setError(
          failures.length === hosts.length
            ? errors[failures[0]]
            : null,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, hostsVersion]);

  useEffect(() => {
    const onHostsChanged = () => setHostsVersion((v) => v + 1);
    window.addEventListener(HOSTS_CHANGED_EVENT, onHostsChanged);
    return () => window.removeEventListener(HOSTS_CHANGED_EVENT, onHostsChanged);
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, SessionGroup>();
    for (const s of sessions) {
      const hostId = s.hostId || LOCAL_HOST.id;
      const key = `${hostId}\n${s.cwd || "(unknown)"}`;
      let group = map.get(key);
      if (!group) {
        group = { hostId, cwd: s.cwd || "(unknown)", displayCwd: toDisplayCwd(s.cwd), sessions: [] };
        map.set(key, group);
      }
      group.sessions.push(s);
    }
    const out = [...map.values()];
    for (const g of out) {
      g.sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    }
    out.sort(
      (a, b) =>
        new Date(b.sessions[0]?.modified ?? 0).getTime() -
        new Date(a.sessions[0]?.modified ?? 0).getTime(),
    );
    return out;
  }, [sessions]);

  /** Which run target a session file lives on (local when unknown). */
  const hostOf = useCallback(
    (file: string): string => {
      const found = sessions.find((s) => s.path === file);
      return found?.hostId || LOCAL_HOST.id;
    },
    [sessions],
  );

  const toggleGroup = useCallback((key: string) => {
    startTransition(() => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    });
  }, [setCollapsed]);

  const createNew = useCallback(
    async (cwd?: string, hostId?: string) => {
      const res = await createSession(cwd, hostId);
      await refresh({ silent: true });
      return res.file;
    },
    [refresh],
  );

  const switchTo = useCallback(async (file: string, cwd?: string, hostId?: string) => {
    const res = await switchSession(file, cwd, hostId);
    return res as Awaited<ReturnType<typeof switchSession>>;
  }, []);

  const rename = useCallback(
    async (file: string, name: string, hostId?: string) => {
      // optimistic — instant title update
      setSessions((prev) => prev.map((s) => (s.path === file ? { ...s, name } : s)));
      try {
        await renameSession(file, name, hostId);
        await refresh({ silent: true });
      } catch (e) {
        // revert on failure
        await refresh({ silent: true });
        throw e;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (file: string, hostId?: string) => {
      // optimistic — instant removal
      setSessions((prev) => prev.filter((s) => s.path !== file));
      try {
        await deleteSession(file, hostId);
        await refresh({ silent: true });
      } catch (e) {
        await refresh({ silent: true });
        throw e;
      }
    },
    [refresh],
  );

  const addOptimistic = useCallback((file: string, cwd: string, firstMessage: string, hostId?: string) => {
    setSessions((prev) => {
      if (prev.some((s) => s.path === file)) return prev;
      const now = new Date().toISOString();
      const raw = file.split("/").pop() ?? file;
      const id = raw.replace(".jsonl", "").split("_").pop() ?? raw;
      const info: SessionInfo = {
        path: file,
        id,
        cwd,
        hostId: hostId || LOCAL_HOST.id,
        created: now,
        modified: now,
        messageCount: 1,
        firstMessage: firstMessage.slice(0, 200),
        allMessagesText: firstMessage,
      };
      return [info, ...prev];
    });
  }, []);

  return {
    sessions,
    groups,
    loading,
    error,
    hostErrors,
    isPending,
    collapsed,
    toggleGroup,
    refresh,
    hostOf,
    createNew,
    switchTo,
    rename,
    remove,
    addOptimistic,
  };
}
