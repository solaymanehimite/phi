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
  if (typeof window === "undefined") return "/api";
  if (!portPromise) {
    portPromise = (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const port = await invoke<number>("get_sidecar_port");
        if (port && Number.isFinite(port) && port !== 3001) {
          cachedBase = `http://127.0.0.1:${port}/api`;
          return cachedBase;
        }
        // dev fallback or invoke returned 3001 before sidecar ready -> retry next time
        if (port === 3001) throw new Error("sidecar not ready");
      } catch (e) {
        console.warn("[phi] get_sidecar_port failed, falling back to /api", e);
        // don't cache failure — retry on next call after 500ms
        portPromise = null;
      }
      return "/api";
    })();
  }
  const base = await portPromise;
  // if we fell back to /api but we're in Tauri, clear cache so next fetch retries invoke
  if (base === "/api" && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    portPromise = null;
  }
  return base;
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

export async function compactSession(opts: { sessionFile: string; customInstructions?: string; cwd?: string }): Promise<{ summary: string; tokensBefore: number; estimatedTokensAfter?: number }> {
  const base = await getBase();
  const res = await fetch(`${base}/compact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  // If SSE stream, caller should use streamCompact; this non-stream variant expects JSON when server returns non-SSE (fallback)
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    // consume SSE to completion and extract result
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: any = null;
    let error: string | null = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of frame.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === "done" && ev.result) result = ev.result;
              if (ev.type === "error" && ev.error) error = ev.error;
            } catch {}
          }
        }
      }
    }
    if (error) throw new Error(error);
    return result ?? { summary: "", tokensBefore: 0 };
  }
  return jsonOrThrow(res);
}

export async function streamCompact(
  opts: { sessionFile: string; customInstructions?: string; cwd?: string },
  onEvent: (ev: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const base = await getBase();
  const res = await fetch(`${base}/compact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith(": ping") || line.startsWith(":") || line.trim() === "") continue;
        if (line.startsWith("data: ")) {
          try { onEvent(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }
  }
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) if (line.startsWith("data: ")) try { onEvent(JSON.parse(line.slice(6))); } catch {}
  }
}

export async function abortCompaction(sessionFile: string, cwd?: string): Promise<{ ok: boolean; active: boolean }> {
  const res = await apiFetch(`/compact/abort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, cwd }),
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

export async function continuePrompt(sessionFile: string, cwd?: string): Promise<void> {
  const base = await getBase();
  const res = await fetch(`${base}/continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionFile, cwd }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  // Stream SSE similarly to prompt, but caller in useChat will handle SSE? For now we expose raw continue as SSE via fetch
  // This helper is for non-streaming check; actual streaming is handled by streamContinue
  return;
}

export async function streamContinue(
  body: { sessionFile: string; cwd?: string },
  onEvent: (ev: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const base = await getBase();
  const res = await fetch(`${base}/continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = frame.split("\n");
      for (const line of lines) {
        if (line.startsWith(": ping") || line.startsWith(":") || line.trim() === "") continue;
        if (line.startsWith("data: ")) {
          try { onEvent(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }
  }
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) if (line.startsWith("data: ")) try { onEvent(JSON.parse(line.slice(6))); } catch {}
  }
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
