import { useCallback, useEffect, useMemo, useState } from "react";
import { listSessions, createSession, switchSession, renameSession, deleteSession } from "../lib/api";
import type { SessionInfo } from "../types/session";

export type SessionGroup = {
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

function groupByCwd(sessions: SessionInfo[]): SessionGroup[] {
  const map = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const key = s.cwd || "(unknown)";
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  const groups: SessionGroup[] = [];
  for (const [cwd, list] of map) {
    // sort within group by modified desc (recency)
    list.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    groups.push({ cwd, displayCwd: toDisplayCwd(cwd), sessions: list });
  }
  // sort groups by most recent session in group
  groups.sort(
    (a, b) =>
      new Date(b.sessions[0]?.modified ?? 0).getTime() -
      new Date(a.sessions[0]?.modified ?? 0).getTime(),
  );
  return groups;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // all=1 for grouped sidebar (PRD 6.1); server decodes cwd
      const data = await listSessions({ all: true });
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter((s) => {
      const name = (s.name ?? "").toLowerCase();
      const first = (s.firstMessage ?? "").toLowerCase();
      const cwd = (s.cwd ?? "").toLowerCase();
      return name.includes(q) || first.includes(q) || cwd.includes(q);
    });
  }, [sessions, search]);

  const groups = useMemo(() => groupByCwd(filtered), [filtered]);

  const toggleGroup = useCallback((cwd: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  }, []);

  const createNew = useCallback(
    async (cwd?: string) => {
      const res = await createSession(cwd);
      await refresh();
      return res.file;
    },
    [refresh],
  );

  const switchTo = useCallback(async (file: string) => {
    await switchSession(file);
  }, []);

  const rename = useCallback(
    async (file: string, name: string) => {
      await renameSession(file, name);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (file: string) => {
      await deleteSession(file);
      await refresh();
    },
    [refresh],
  );

  return {
    sessions,
    filtered,
    groups,
    loading,
    error,
    search,
    setSearch,
    collapsed,
    toggleGroup,
    refresh,
    createNew,
    switchTo,
    rename,
    remove,
  };
}
