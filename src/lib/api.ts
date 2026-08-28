import type { SessionInfo, SessionMessagesResponse } from "../types/session";

const BASE = "/api";

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function health(): Promise<{ ok: boolean; port: number; agentDir: string }> {
  const res = await fetch(`${BASE}/health`);
  return jsonOrThrow(res);
}

export async function listSessions(opts: { cwd?: string; all?: boolean } = {}): Promise<SessionInfo[]> {
  const params = new URLSearchParams();
  if (opts.cwd) params.set("cwd", opts.cwd);
  if (opts.all) params.set("all", "1");
  const qs = params.toString();
  const url = qs ? `${BASE}/sessions?${qs}` : `${BASE}/sessions`;
  const res = await fetch(url);
  return jsonOrThrow(res);
}

export async function getMessages(file: string): Promise<SessionMessagesResponse> {
  const url = `${BASE}/sessions/messages?file=${encodeURIComponent(file)}`;
  const res = await fetch(url);
  return jsonOrThrow(res);
}

export async function createSession(cwd?: string): Promise<{ ok: boolean; file: string }> {
  const res = await fetch(`${BASE}/sessions/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd }),
  });
  return jsonOrThrow(res);
}

export async function switchSession(file: string, cwd?: string): Promise<{ ok: boolean; file: string }> {
  const res = await fetch(`${BASE}/sessions/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, cwd }),
  });
  return jsonOrThrow(res);
}

export async function renameSession(file: string, name: string): Promise<{ ok: boolean; name: string }> {
  const res = await fetch(`${BASE}/sessions/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, name }),
  });
  return jsonOrThrow(res);
}

export async function deleteSession(file: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/sessions?file=${encodeURIComponent(file)}`, {
    method: "DELETE",
  });
  return jsonOrThrow(res);
}

export async function getModels(): Promise<{ available: unknown[] }> {
  const res = await fetch(`${BASE}/models`);
  return jsonOrThrow(res);
}
