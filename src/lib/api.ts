import type { ModelInfo, SessionInfo, SessionMessagesResponse, ThinkingLevel } from "../types/session";
import type { SseEvent } from "../types/sse";
import { LOCAL_HOST, LOCAL_HOST_ID, getStoredActiveHost, getStoredHosts, type Host } from "../hooks/useHosts";

/**
 * Resolve a host id to its Host record. Empty ids mean the active host;
 * unknown ids fall back to the active host so a deleted host degrades
 * instead of failing every call.
 */
export function resolveHost(hostId?: string | null): Host {
  if (!hostId) return getStoredActiveHost();
  if (hostId === LOCAL_HOST_ID) return LOCAL_HOST;
  return getStoredHosts().find((h) => h.id === hostId) ?? getStoredActiveHost();
}

// --- Sidecar discovery ---
// Packaged app: Electron main picks a free port at launch, renderer learns it
// via window.phi.getServerPort() (preload IPC).
// Dev (`bun run electron:dev`): external server on 3001, reached via Vite proxy.
// Remote host: the active host's stored url + token (see useHosts).
let cachedBase: string | null = null;

export async function getApiBase(): Promise<string> {
  return getBase();
}

/** Bearer token for the given host (default: active), or null for local / no token. */
async function getAuthToken(host: Host = getStoredActiveHost()): Promise<string | null> {
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

async function getBase(host: Host = getStoredActiveHost()): Promise<string> {
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

async function apiFetch(path: string, init?: RequestInit, hostId?: string): Promise<Response> {
  const host = resolveHost(hostId);
  const base = await getBase(host);
  const token = await getAuthToken(host);
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

export async function health(hostId?: string): Promise<{ ok: boolean; port: number; agentDir: string; cwd: string; home: string }> {
  const res = await apiFetch(`/health`, undefined, hostId);
  return jsonOrThrow(res);
}

export async function listSessions(opts: { cwd?: string; all?: boolean; hostId?: string } = {}): Promise<SessionInfo[]> {
  const params = new URLSearchParams();
  if (opts.cwd) params.set("cwd", opts.cwd);
  if (opts.all) params.set("all", "1");
  const qs = params.toString();
  const path = qs ? `/sessions?${qs}` : `/sessions`;
  const res = await apiFetch(path, undefined, opts.hostId);
  return jsonOrThrow(res);
}

export async function getMessages(file: string, hostId?: string): Promise<SessionMessagesResponse> {
  const path = `/sessions/messages?file=${encodeURIComponent(file)}`;
  const res = await apiFetch(path, undefined, hostId);
  return jsonOrThrow(res);
}

export async function createSession(cwd?: string, hostId?: string): Promise<{ ok: boolean; file: string; cwd: string }> {
  const res = await apiFetch(`/sessions/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd }),
  }, hostId);
  return jsonOrThrow(res);
}

export type SwitchSessionResponse = { ok: boolean; file: string } & Partial<SessionMessagesResponse>;
export async function switchSession(file: string, cwd?: string, hostId?: string): Promise<SwitchSessionResponse> {
  const res = await apiFetch(`/sessions/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, cwd }),
  }, hostId);
  return jsonOrThrow(res);
}

export async function renameSession(file: string, name: string, hostId?: string): Promise<{ ok: boolean; name: string }> {
  const res = await apiFetch(`/sessions/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, name }),
  }, hostId);
  return jsonOrThrow(res);
}

export async function deleteSession(file: string, hostId?: string): Promise<{ ok: boolean }> {
  const res = await apiFetch(`/sessions?file=${encodeURIComponent(file)}`, {
    method: "DELETE",
  }, hostId);
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

export async function getModels(cwd?: string, hostId?: string): Promise<ModelsResponse> {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  const res = await apiFetch(`/models${qs}`, undefined, hostId);
  return jsonOrThrow(res);
}

export async function setModel(opts: {
  sessionFile: string;
  provider: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
  hostId?: string;
}): Promise<{ ok: boolean; model?: ModelInfo; thinkingLevel?: string }> {
  const { hostId, ...body } = opts;
  const res = await apiFetch(`/model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, hostId);
  return jsonOrThrow(res);
}

export async function setThinkingLevel(sessionFile: string, thinkingLevel: ThinkingLevel, hostId?: string): Promise<{ ok: boolean; thinkingLevel: string }> {
  const res = await apiFetch(`/model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, thinkingLevel }),
  }, hostId);
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
  hostId?: string,
): Promise<void> {
  const host = resolveHost(hostId);
  const base = await getBase(host);
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(await getAuthToken(host)) },
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
  opts: { sessionFile: string; customInstructions?: string; cwd?: string; hostId?: string },
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { hostId, ...body } = opts;
  return postSse(`/compact`, body, onEvent, signal, hostId);
}

export async function abortCompaction(sessionFile: string, cwd?: string, hostId?: string): Promise<{ ok: boolean; active: boolean }> {
  const res = await apiFetch(`/compact/abort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, cwd }),
  }, hostId);
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

export async function undoTurn(sessionFile: string, cwd?: string, hostId?: string): Promise<NavResult> {
  const res = await apiFetch(`/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, cwd }),
  }, hostId);
  return jsonOrThrow(res);
}

export async function redoTurn(sessionFile: string, cwd?: string, hostId?: string): Promise<NavResult> {
  const res = await apiFetch(`/redo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, cwd }),
  }, hostId);
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

export async function getSessionStats(file: string, hostId?: string): Promise<SessionStatsResponse> {
  const res = await apiFetch(`/session/stats?file=${encodeURIComponent(file)}`, undefined, hostId);
  return jsonOrThrow(res);
}

export async function abortPrompt(sessionFile: string, hostId?: string): Promise<{ ok: boolean; active: boolean }> {
  const res = await apiFetch(`/abort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile }),
  }, hostId);
  return jsonOrThrow(res);
}

export async function streamContinue(
  body: { sessionFile: string; cwd?: string; hostId?: string },
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { hostId, ...payload } = body;
  return postSse(`/continue`, payload, onEvent, signal, hostId);
}

export type ProviderRow = { id: string; label: string; baseUrl: string; hasKey: boolean; maskedKey: string };

export type PiAuthRow = { id: string; name: string; type: "api_key" | "oauth" | string; source: string | null };

export async function listPiAuth(): Promise<{ providers: PiAuthRow[] }> {
  const res = await apiFetch(`/auth/pi`);
  return jsonOrThrow(res);
}

export type ProviderPreset = { id: string; name: string; baseUrl: string; oauth: boolean; apiKey: boolean; loginLabel: string | null };

export async function listProviderPresets(): Promise<{ presets: ProviderPreset[] }> {
  const res = await apiFetch(`/auth/presets`);
  return jsonOrThrow(res);
}

export type OAuthLoginEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | { type: "device_code"; userCode: string; verificationUri?: string }
  | { type: "info" | "progress"; message: string };

export type OAuthLoginStatus = {
  status: "running" | "done" | "error" | "cancelled";
  events: OAuthLoginEvent[];
  prompt: { message: string; placeholder?: string; secret: boolean } | null;
  error: string | null;
};

export async function startOAuthLogin(providerId: string): Promise<{ loginId: string }> {
  const res = await apiFetch(`/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId }),
  });
  return jsonOrThrow(res);
}

export async function getOAuthLogin(loginId: string): Promise<OAuthLoginStatus> {
  const res = await apiFetch(`/auth/login/${encodeURIComponent(loginId)}`);
  return jsonOrThrow(res);
}

export async function answerOAuthLogin(loginId: string, body: { value?: string; cancel?: boolean }): Promise<{ ok: boolean }> {
  const res = await apiFetch(`/auth/login/${encodeURIComponent(loginId)}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

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

export type SkillRow = {
  name: string;
  description: string;
  filePath: string;
  enabled: boolean;
  scope: "user" | "project" | string;
  origin: string;
  source: string;
  baseDir: string | null;
};

export async function listSkills(cwd?: string, hostId?: string): Promise<{ skills: SkillRow[] }> {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  const res = await apiFetch(`/skills${qs}`, undefined, hostId);
  return jsonOrThrow(res);
}

export async function toggleSkill(path: string, enabled: boolean, cwd?: string, hostId?: string): Promise<{ ok: boolean; enabled: boolean }> {
  const res = await apiFetch(`/skills/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, enabled, cwd }),
  }, hostId);
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

export async function getCommands(cwd?: string, hostId?: string): Promise<CommandsResponse> {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  const res = await apiFetch(`/commands${qs}`, undefined, hostId);
  return jsonOrThrow(res);
}

export type ProjectFile = { path: string; name: string; isDirectory: boolean };
export type FilesResponse = { files: ProjectFile[] };
export async function listFiles(cwd?: string, hostId?: string): Promise<ProjectFile[]> {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  const res = await apiFetch(`/files${qs}`, undefined, hostId);
  const data = (await jsonOrThrow(res)) as FilesResponse;
  return data.files ?? [];
}
