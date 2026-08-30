import type { ModelInfo, SessionInfo, SessionMessagesResponse, ThinkingLevel } from "../types/session";

// --- Tauri sidecar support ---
// Dev: Vite proxy -> /api on 127.0.0.1:3001 (no Tauri)
// Prod: Tauri WebView fetches http://127.0.0.1:<random-port>/api where port is picked by Rust at launch
let cachedBase: string | null = null;
let portPromise: Promise<string> | null = null;

export async function getApiBase(): Promise<string> {
  return getBase();
}

async function getBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  // Branch on Tauri: __TAURI__ injected by Tauri in WebView only (not browser dev)
  const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
  if (!isTauri) return "/api";
  if (!portPromise) {
    portPromise = (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const port = await invoke<number>("get_sidecar_port");
        if (port && Number.isFinite(port)) {
          cachedBase = `http://127.0.0.1:${port}/api`;
          return cachedBase;
        }
      } catch (e) {
        console.warn("[phi] get_sidecar_port failed, falling back to /api", e);
      }
      return "/api";
    })();
  }
  return portPromise;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await getBase();
  return fetch(`${base}${path}`, init);
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
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

export async function createSession(cwd?: string): Promise<{ ok: boolean; file: string }> {
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
};

export async function getModels(): Promise<ModelsResponse> {
  const res = await apiFetch(`/models`);
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

export async function abortPrompt(sessionFile: string): Promise<{ ok: boolean; active: boolean }> {
  const res = await apiFetch(`/abort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile }),
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
