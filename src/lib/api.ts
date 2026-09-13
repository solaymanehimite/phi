import type { ModelInfo, SessionInfo, SessionMessagesResponse, ThinkingLevel } from "../types/session";
import type { SseEvent } from "../types/sse";
import { LOCAL_HOST_ID, getStoredActiveHost } from "../hooks/useHosts";

// --- Sidecar discovery ---
// Packaged app: Electron main picks a free port at launch, renderer learns it
// via window.phi.getServerPort() (preload IPC).
// Dev (`bun run electron:dev`): external server on 3001, reached via Vite proxy.
// Remote host: the active host's stored url + token (see useHosts).
let cachedBase: string | null = null;

export async function getApiBase(): Promise<string> {
  return getBase();
}

/** Bearer token for the active host, or null for the local host / no token. */
async function getAuthToken(): Promise<string | null> {
  const host = getStoredActiveHost();
  if (host.id === LOCAL_HOST_ID) return null;
  return host.token ? host.token : null;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function unauthorizedMessage(res: Response, data: unknown): string | null {
  if (res.status !== 401) return null;
  void data;
  return "unauthorized — check host token";
}

async function getBase(): Promise<string> {
  const host = getStoredActiveHost();
  if (host.id !== LOCAL_HOST_ID) {
    return `${host.url.replace(/\/+$/, "")}/api`;
  }
  if (cachedBase) return cachedBase;
  if (typeof window === "undefined") return "/api";
  try {
    const port = await window.phi?.getServerPort();
    if (port && Number.isFinite(port) && port !== 3001) {
      cachedBase = `http://127.0.0.1:${port}/api`;
      return cachedBase;
    }
    // No bridge (plain `vite dev` in a browser) or dev server on 3001 —
    // both are reachable through Vite's /api proxy.
  } catch (e) {
    console.warn("[phi] getServerPort failed, falling back to /api", e);
  }
  return "/api";
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await getBase();
  const token = await getAuthToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${base}${path}`, { ...init, headers });
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const authMsg = unauthorizedMessage(res, data);
    if (authMsg) throw new Error(authMsg);
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function health(): Promise<{ ok: boolean; port: number; agentDir: string; cwd: string; home: string }> {
  const res = await apiFetch(`/health`);
  return jsonOrThrow(res);
}

export async function listSessions(opts: { cwd?: string; all?: boolean } = {}): Promise<SessionInfo[]> {
  const params = new URLSearchParams();
  if (opts.cwd) params.set("cwd", opts.cwd);
  if (opts.all) params.set("all", "1");
  const qs = params.toString();
  const path = qs ? `/sessions?${qs}` : `/sessions`;
  const res = await apiFetch(path);
  return jsonOrThrow(res);
}

export async function getMessages(file: string): Promise<SessionMessagesResponse> {
  const path = `/sessions/messages?file=${encodeURIComponent(file)}`;
  const res = await apiFetch(path);
  return jsonOrThrow(res);
}

export async function createSession(cwd?: string): Promise<{ ok: boolean; file: string; cwd: string }> {
  const res = await apiFetch(`/sessions/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd }),
  });
  return jsonOrThrow(res);
}

export type SwitchSessionResponse = { ok: boolean; file: string } & Partial<SessionMessagesResponse>;
export async function switchSession(file: string, cwd?: string): Promise<SwitchSessionResponse> {
  const res = await apiFetch(`/sessions/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, cwd }),
  });
  return jsonOrThrow(res);
}

export async function renameSession(file: string, name: string): Promise<{ ok: boolean; name: string }> {
  const res = await apiFetch(`/sessions/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, name }),
  });
  return jsonOrThrow(res);
}

export async function deleteSession(file: string): Promise<{ ok: boolean }> {
  const res = await apiFetch(`/sessions?file=${encodeURIComponent(file)}`, {
    method: "DELETE",
  });
  return jsonOrThrow(res);
}

export type ModelsResponse = {
  available: ModelInfo[];
  error?: string | null;
  providers?: Array<{ id: string; name: string; hasAuth: boolean }>;
  /** The model Pi itself would pick for a fresh session (null when none available). */
  default?: ModelInfo | null;
  /** The thinking level a fresh session would start with. */
  defaultThinkingLevel?: string | null;
};

export async function getModels(cwd?: string): Promise<ModelsResponse> {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  const res = await apiFetch(`/models${qs}`);
  return jsonOrThrow(res);
}

export async function setModel(opts: {
  sessionFile: string;
  provider: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
}): Promise<{ ok: boolean; model?: ModelInfo; thinkingLevel?: string }> {
  const res = await apiFetch(`/model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return jsonOrThrow(res);
}

export async function setThinkingLevel(sessionFile: string, thinkingLevel: ThinkingLevel): Promise<{ ok: boolean; thinkingLevel: string }> {
  const res = await apiFetch(`/model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, thinkingLevel }),
  });
  return jsonOrThrow(res);
}

/**
 * Single owner for all SSE POST streams (prompt, continue, compact).
 * Owns base URL resolution, auth headers, non-OK response parsing, frame
 * splitting on `\n\n`, ping/blank-line skipping, malformed JSON tolerance,
 * and the trailing buffer flush. Callers only supply path, body, and callback.
 */
export async function postSse(
  path: string,
  body: unknown,
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const base = await getBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(await getAuthToken()) },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("unauthorized — check host token");
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by \n\n
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith(": ping") || line.startsWith(":") || line.trim() === "") continue;
        if (line.startsWith("data: ")) {
          try {
            onEvent(JSON.parse(line.slice(6)) as SseEvent);
          } catch {
            // ignore malformed
          }
        }
      }
    }
  }
  // flush remaining
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(line.slice(6)) as SseEvent);
        } catch {}
      }
    }
  }
}

export async function streamCompact(
  opts: { sessionFile: string; customInstructions?: string; cwd?: string },
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return postSse(`/compact`, opts, onEvent, signal);
}

export async function abortCompaction(sessionFile: string, cwd?: string): Promise<{ ok: boolean; active: boolean }> {
  const res = await apiFetch(`/compact/abort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, cwd }),
  });
  return jsonOrThrow(res);
}

export type NavResult = {
  ok: boolean;
  nav: {
    type: "undo" | "redo";
    turnId: string | null;
    filesRestored: boolean;
    restoredPaths: string[];
    conversationOnly: boolean;
  };
} & Partial<SessionMessagesResponse>;

export async function undoTurn(sessionFile: string, cwd?: string): Promise<NavResult> {
  const res = await apiFetch(`/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, cwd }),
  });
  return jsonOrThrow(res);
}

export async function redoTurn(sessionFile: string, cwd?: string): Promise<NavResult> {
  const res = await apiFetch(`/redo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, cwd }),
  });
  return jsonOrThrow(res);
}

export type SessionStatsTokens = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

export type SessionContextUsage = {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
};

export type SessionStatsResponse = {
  file: string;
  tokens: SessionStatsTokens;
  cost: number;
  contextUsage: SessionContextUsage | null;
  breakdown: Array<{ key: string; cost: number; tokens: number }>;
  counts?: {
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    toolResults: number;
    totalMessages: number;
  };
};

export async function getSessionStats(file: string): Promise<SessionStatsResponse> {
  const res = await apiFetch(`/session/stats?file=${encodeURIComponent(file)}`);
  return jsonOrThrow(res);
}

export async function abortPrompt(sessionFile: string): Promise<{ ok: boolean; active: boolean }> {
  const res = await apiFetch(`/abort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile }),
  });
  return jsonOrThrow(res);
}

export async function streamContinue(
  body: { sessionFile: string; cwd?: string },
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return postSse(`/continue`, body, onEvent, signal);
}

export type ProviderRow = { id: string; label: string; baseUrl: string; hasKey: boolean; maskedKey: string };

export async function listProviders(): Promise<{ providers: ProviderRow[] }> {
  const res = await apiFetch(`/auth/providers`);
  return jsonOrThrow(res);
}

export async function upsertProvider(opts: { id: string; label: string; baseUrl: string; apiKey: string }): Promise<{ ok: boolean }> {
  const res = await apiFetch(`/auth/providers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return jsonOrThrow(res);
}

export async function deleteProvider(id: string): Promise<{ ok: boolean }> {
  const res = await apiFetch(`/auth/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
  return jsonOrThrow(res);
}

export async function testProvider(id: string, opts?: { baseUrl?: string; apiKey?: string }): Promise<{ ok: boolean }> {
  const res = await apiFetch(`/auth/providers/${encodeURIComponent(id)}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts ?? {}),
  });
  return jsonOrThrow(res);
}

export type SlashCommand = {
  name: string;
  description?: string;
  source: "extension" | "skill" | "prompt";
  argumentHint?: string;
};

export type CommandsResponse = {
  commands: SlashCommand[];
  extensionCommands: Array<{ name: string; description?: string; argumentHint?: string }>;
  skills: Array<{ name: string; description?: string; filePath?: string }>;
  prompts: Array<{ name: string; description?: string; argumentHint?: string; filePath?: string }>;
};

export async function getCommands(cwd?: string): Promise<CommandsResponse> {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  const res = await apiFetch(`/commands${qs}`);
  return jsonOrThrow(res);
}

export type ProjectFile = { path: string; name: string; isDirectory: boolean };
export type FilesResponse = { files: ProjectFile[] };
export async function listFiles(cwd?: string): Promise<ProjectFile[]> {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  const res = await apiFetch(`/files${qs}`);
  const data = (await jsonOrThrow(res)) as FilesResponse;
  return data.files ?? [];
}
