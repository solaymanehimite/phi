import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createSession, deleteSession, listSessions, renameSession, switchSession } from "../lib/api";
import type { SessionInfo } from "../types/session";
import { useLocalStorage } from "./useLocalStorage";

export type SessionGroup = { cwd: string; displayCwd: string; sessions: SessionInfo[] };

function toDisplayCwd(cwd: string): string {
  if (!cwd) return "(no workspace)";
  const home = cwd.match(/^\/home\/[^/]+/);
  return home ? cwd.replace(home[0], "~") : cwd;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useLocalStorage<Set<string>>("phi:sidebar:collapsed", new Set(), {
    serialize: (value) => JSON.stringify([...value]),
    deserialize: (value) => {
      try { return new Set(Array.isArray(JSON.parse(value)) ? JSON.parse(value) as string[] : []); }
      catch { return new Set<string>(); }
    },
  });
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try { setSessions(await listSessions({ all: true })); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { if (!opts?.silent) setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const groups = useMemo(() => {
    const grouped = new Map<string, SessionGroup>();
    for (const session of sessions) {
      const cwd = session.cwd || "(unknown)";
      const group = grouped.get(cwd) ?? { cwd, displayCwd: toDisplayCwd(cwd), sessions: [] };
      group.sessions.push(session);
      grouped.set(cwd, group);
    }
    const result = [...grouped.values()];
    for (const group of result) group.sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    return result.sort((a, b) => new Date(b.sessions[0]?.modified ?? 0).getTime() - new Date(a.sessions[0]?.modified ?? 0).getTime());
  }, [sessions]);

  const toggleGroup = useCallback((key: string) => {
    startTransition(() => setCollapsed((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    }));
  }, [setCollapsed]);

  const createNew = useCallback(async (cwd?: string) => {
    const result = await createSession(cwd);
    await refresh({ silent: true });
    return result.file;
  }, [refresh]);
  const switchTo = useCallback((file: string, cwd?: string) => switchSession(file, cwd), []);
  const rename = useCallback(async (file: string, name: string) => {
    setSessions((current) => current.map((session) => session.path === file ? { ...session, name } : session));
    try { await renameSession(file, name); await refresh({ silent: true }); }
    catch (error) { await refresh({ silent: true }); throw error; }
  }, [refresh]);
  const remove = useCallback(async (file: string) => {
    setSessions((current) => current.filter((session) => session.path !== file));
    try { await deleteSession(file); await refresh({ silent: true }); }
    catch (error) { await refresh({ silent: true }); throw error; }
  }, [refresh]);
  const addOptimistic = useCallback((file: string, cwd: string, firstMessage: string) => {
    setSessions((current) => {
      if (current.some((session) => session.path === file)) return current;
      const now = new Date().toISOString();
      const raw = file.split("/").pop() ?? file;
      return [{ path: file, id: raw.replace(".jsonl", "").split("_").pop() ?? raw, cwd, created: now, modified: now, messageCount: 1, firstMessage: firstMessage.slice(0, 200), allMessagesText: firstMessage }, ...current];
    });
  }, []);

  return { sessions, groups, loading, error, isPending, collapsed, toggleGroup, refresh, createNew, switchTo, rename, remove, addOptimistic };
}
