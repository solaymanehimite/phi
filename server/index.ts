import cors from "cors";
import express from "express";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import { resolve as resolvePath, join as joinPath, dirname } from "node:path";
import {
  SessionManager,
  ModelRuntime,
  getAgentDir,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createAgentSessionFromServices,
} from "@earendil-works/pi-coding-agent";

// ---- config ----
const rawPort = process.argv[2] ?? process.env.PORT ?? "3001";
const PORT = Number.parseInt(String(rawPort), 10) || 3001;
const HOST = "127.0.0.1";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function errorStatus(error: unknown): number {
  return error instanceof ApiError ? error.status : 500;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalisePath(path: string): string {
  return resolvePath(path);
}

function assertCwdMatches(actual: string, requested?: string) {
  if (requested && normalisePath(requested) !== normalisePath(actual)) {
    throw new ApiError("cwd does not match the session's persisted working directory");
  }
}

// ---- shared model runtime ----
let modelRuntime: Awaited<ReturnType<typeof ModelRuntime.create>> | undefined;

async function getModelRuntime() {
  if (!modelRuntime) modelRuntime = await ModelRuntime.create();
  return modelRuntime;
}

// ---- live session runtime registry ----
// A runtime is keyed by its JSONL file, not cwd. Several sessions may share a cwd.
type AgentRuntime = Awaited<ReturnType<typeof createAgentSessionRuntime>>;
type SessionRuntimeEntry = {
  sessionFile: string;
  cwd: string;
  runtime: AgentRuntime;
  activePrompt?: Promise<void>;
  lastUsedAt: number;
};

const runtimeEntries = new Map<string, SessionRuntimeEntry>();
const runtimeInitialisers = new Map<string, Promise<SessionRuntimeEntry>>();

// Keep recent sessions warm without allowing an unbounded number of extension/tool contexts.
// Active prompts are never counted toward the idle cap and are never evicted.
const RUNTIME_IDLE_MS = 20 * 60_000;
const MAX_IDLE_RUNTIMES = 8;
const RUNTIME_CLEANUP_INTERVAL_MS = 60_000;

function isPromptActive(entry: SessionRuntimeEntry): boolean {
  return Boolean(entry.activePrompt) || Boolean((entry.runtime.session as any).isStreaming);
}

function touchRuntime(entry: SessionRuntimeEntry) {
  entry.lastUsedAt = Date.now();
}

async function createRuntimeEntry(sessionManager: any): Promise<SessionRuntimeEntry> {
  const file = sessionManager.getSessionFile?.();
  if (!file) throw new ApiError("cannot create a live runtime for an in-memory session", 500);

  const sessionFile = normalisePath(file);
  const cwd = sessionManager.getCwd();
  const sharedModelRuntime = await getModelRuntime();

  const factory = async ({ cwd: runtimeCwd, sessionManager: runtimeSessionManager, sessionStartEvent }: any) => {
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir: getAgentDir(),
      modelRuntime: sharedModelRuntime,
    });
    const created = await createAgentSessionFromServices({
      services,
      sessionManager: runtimeSessionManager,
      sessionStartEvent,
    } as any);
    return { ...created, services, diagnostics: services.diagnostics } as any;
  };

  const runtime = await createAgentSessionRuntime(factory as any, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager,
  });

  // Extension commands and extension tools are session-local. Bind them once for
  // this runtime rather than on each request.
  await runtime.session.bindExtensions({});

  return { sessionFile, cwd, runtime, lastUsedAt: Date.now() };
}

async function getSessionRuntime(sessionFile: string, requestedCwd?: string): Promise<SessionRuntimeEntry> {
  if (!sessionFile) throw new ApiError("missing sessionFile");
  const key = normalisePath(sessionFile);
  const existing = runtimeEntries.get(key);
  if (existing) {
    assertCwdMatches(existing.cwd, requestedCwd);
    touchRuntime(existing);
    return existing;
  }

  // A missing file is not a resumable persisted session. Never let
  // SessionManager.open() fall back to process.cwd() for that case.
  try {
    await fs.access(key);
  } catch {
    throw new ApiError("session file does not exist", 404);
  }

  // Validate the persisted session before waiting for or building its runtime.
  // Existing sessions never inherit process.cwd().
  const sessionManager = SessionManager.open(key);
  assertCwdMatches(sessionManager.getCwd(), requestedCwd);

  const pending = runtimeInitialisers.get(key);
  if (pending) return pending;

  const initialiser = createRuntimeEntry(sessionManager)
    .then((entry) => {
      runtimeEntries.set(key, entry);
      void cleanupRuntimeRegistry();
      return entry;
    })
    .finally(() => runtimeInitialisers.delete(key));
  runtimeInitialisers.set(key, initialiser);
  return initialiser;
}

async function createSessionRuntime(cwd: string): Promise<SessionRuntimeEntry> {
  const sessionManager = SessionManager.create(normalisePath(cwd));
  const file = sessionManager.getSessionFile?.();
  if (!file) throw new ApiError("failed to create a persisted session", 500);
  const key = normalisePath(file);

  const entry = await createRuntimeEntry(sessionManager);
  runtimeEntries.set(key, entry);
  void cleanupRuntimeRegistry();
  return entry;
}

async function disposeRuntimeEntry(entry: SessionRuntimeEntry, abort = false) {
  if (runtimeEntries.get(entry.sessionFile) === entry) {
    runtimeEntries.delete(entry.sessionFile);
  }
  if (abort && isPromptActive(entry)) {
    try {
      await entry.runtime.session.abort();
    } catch {
      // Dispose still needs to release extension and tool resources.
    }
  }
  try {
    await entry.runtime.dispose();
  } catch (error) {
    console.warn(`[phi sidecar] failed to dispose runtime ${entry.sessionFile}: ${errorMessage(error)}`);
  }
}

async function cleanupRuntimeRegistry() {
  const now = Date.now();
  const idle = [...runtimeEntries.values()]
    // Pi intentionally defers writing a brand-new JSONL until it has an
    // assistant message. Keep that small draft runtime alive rather than
    // evicting state that cannot yet be reloaded from disk.
    .filter((entry) => !isPromptActive(entry) && existsSync(entry.sessionFile))
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  const evictionCandidates = new Set<SessionRuntimeEntry>();
  for (const entry of idle) {
    if (now - entry.lastUsedAt >= RUNTIME_IDLE_MS) evictionCandidates.add(entry);
  }
  for (const entry of idle.slice(0, Math.max(0, idle.length - MAX_IDLE_RUNTIMES))) {
    evictionCandidates.add(entry);
  }

  await Promise.all([...evictionCandidates].map((entry) => disposeRuntimeEntry(entry)));
}

const cleanupTimer = setInterval(() => void cleanupRuntimeRegistry(), RUNTIME_CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

// ---- helpers ----
function sseHeaders(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}

function sendSSE(res: express.Response, event: unknown) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function sessionPayloadFromManager(file: string, sm: any) {
  return {
    file: sm.getSessionFile?.() ?? file,
    header: sm.getHeader(),
    entries: sm.getEntries(),
    context: sm.buildSessionContext(),
    sessionName: sm.getSessionName(),
    cwd: sm.getCwd(),
  };
}

async function sessionPayload(file: string) {
  const key = normalisePath(file);
  const live = runtimeEntries.get(key);
  if (live) return sessionPayloadFromManager(live.sessionFile, live.runtime.session.sessionManager);

  try {
    await fs.access(key);
  } catch {
    throw new ApiError("session file does not exist", 404);
  }
  return sessionPayloadFromManager(key, SessionManager.open(key));
}

function serialiseModel(model: any) {
  if (!model) return null;
  return {
    provider: model.provider,
    id: model.id,
    name: model.name ?? model.id,
    api: model.api,
    reasoning: Boolean(model.reasoning),
    input: model.input ?? ["text"],
    output: model.output,
    cost: model.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow ?? 0,
    maxTokens: model.maxTokens ?? 0,
    thinkingLevelMap: model.thinkingLevelMap ?? null,
  };
}

// ---- routes ----
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, port: PORT, agentDir: getAgentDir(), cwd: process.cwd(), home: os.homedir() });
});

// Models are process-wide because ModelRuntime owns provider configuration and credentials.
let modelsCache: { at: number; payload: any } | null = null;
const MODELS_TTL_MS = 30_000;
app.get("/api/models", async (_req, res) => {
  try {
    const now = Date.now();
    if (modelsCache && now - modelsCache.at < MODELS_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=30");
      return res.json(modelsCache.payload);
    }
    const mr = await getModelRuntime();
    const availableRaw: any[] = (await (mr as any).getAvailable?.()) ?? [];
    const payload = {
      available: availableRaw.map(serialiseModel),
      error: (mr as any).getError?.() ?? null,
    };
    modelsCache = { at: now, payload };
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(payload);
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

// Sessions cache — listAll can be disk-heavy for a populated Pi directory.
let sessionsCache: { at: number; payload: any; etag: string } | null = null;
const SESSIONS_TTL_MS = 3_000;
let pendingListAll: Promise<any[]> | null = null;

function etagFor(payload: any): string {
  if (!Array.isArray(payload) || payload.length === 0) return '"0-0"';
  return `"${payload.length}-${payload[0]?.modified ?? ""}"`;
}

function invalidateSessionsCache() {
  sessionsCache = null;
}

app.get("/api/sessions", async (req, res) => {
  try {
    const cwd = req.query.cwd as string | undefined;
    const all = req.query.all === "1" || req.query.all === "true";

    if (all && sessionsCache && Date.now() - sessionsCache.at < SESSIONS_TTL_MS) {
      if (req.headers["if-none-match"] === sessionsCache.etag) return res.status(304).end();
      res.setHeader("ETag", sessionsCache.etag);
      return res.json(sessionsCache.payload);
    }

    let infos: any[];
    if (all) {
      if (!pendingListAll) {
        pendingListAll = Promise.resolve((SessionManager as any).listAll())
          .then((result) => (Array.isArray(result) ? result : (SessionManager as any).listAll(undefined)))
          .finally(() => setTimeout(() => (pendingListAll = null), 50));
      }
      infos = await pendingListAll;
      const etag = etagFor(infos);
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.setHeader("ETag", etag);
      sessionsCache = { at: Date.now(), payload: infos, etag };
    } else {
      infos = cwd ? await SessionManager.list(cwd) : await (SessionManager as any).listAll();
    }
    res.json(infos);
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

app.get("/api/sessions/messages", async (req, res) => {
  try {
    const file = req.query.file as string;
    if (!file) throw new ApiError("missing file query param");
    res.json(await sessionPayload(file));
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

// New sessions get their own runtime immediately. This makes a model selection
// made before the first prompt target the same runtime that receives that prompt.
app.post("/api/sessions/new", async (req, res) => {
  try {
    const cwd = normalisePath((req.body?.cwd as string) || process.cwd());
    const entry = await createSessionRuntime(cwd);
    invalidateSessionsCache();
    res.json({ ok: true, file: entry.sessionFile, cwd: entry.cwd });
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

// "Switch" now means select/ensure a session runtime. It never replaces or
// tears down another entry, so an in-flight prompt keeps running.
app.post("/api/sessions/switch", async (req, res) => {
  try {
    const { file, cwd } = req.body as { file?: string; cwd?: string };
    if (!file) throw new ApiError("missing file");
    await getSessionRuntime(file, cwd);
    invalidateSessionsCache();
    res.json({ ok: true, ...(await sessionPayload(file)) });
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

app.post("/api/sessions/rename", async (req, res) => {
  try {
    const { file, name } = req.body as { file?: string; name?: string };
    if (!file) throw new ApiError("missing file");
    const key = normalisePath(file);
    const live = runtimeEntries.get(key);
    let sm: any;
    if (live) {
      touchRuntime(live);
      sm = live.runtime.session.sessionManager;
    } else {
      try {
        await fs.access(key);
      } catch {
        throw new ApiError("session file does not exist", 404);
      }
      sm = SessionManager.open(key);
    }
    sm.appendSessionInfo(name ?? "");
    invalidateSessionsCache();
    res.json({ ok: true, name: sm.getSessionName() });
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

app.delete("/api/sessions", async (req, res) => {
  try {
    const file = (req.query.file as string) || (req.body as any)?.file;
    if (!file) throw new ApiError("missing file");
    const key = normalisePath(file);
    const liveEntry = runtimeEntries.get(key);
    if (liveEntry) await disposeRuntimeEntry(liveEntry, true);

    try {
      const maybeTrash = (SessionManager as any).trash ?? (SessionManager as any).remove;
      if (typeof maybeTrash === "function") await maybeTrash(file);
      else await fs.unlink(file);
    } catch (error: any) {
      // A draft session has a live runtime but no JSONL until its first assistant
      // message. Disposing that runtime is enough to delete the draft.
      if (error?.code !== "ENOENT") await fs.unlink(file);
    }
    invalidateSessionsCache();
    res.json({ ok: true });
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

// Abort only the requested live session. An idle or evicted session is a no-op.
app.post("/api/abort", async (req, res) => {
  try {
    const { sessionFile } = req.body as { sessionFile?: string };
    if (!sessionFile) throw new ApiError("missing sessionFile");
    const entry = runtimeEntries.get(normalisePath(sessionFile));
    if (!entry || !isPromptActive(entry)) return res.json({ ok: true, active: false });
    touchRuntime(entry);
    await entry.runtime.session.abort();
    res.json({ ok: true, active: true });
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

// Model changes are transcript-local. There is deliberately no global fallback
// session, so overlapping requests cannot mutate another session's model.
app.post("/api/model", async (req, res) => {
  try {
    const { sessionFile, provider, modelId, thinkingLevel } = req.body as {
      sessionFile?: string;
      provider?: string;
      modelId?: string;
      thinkingLevel?: string;
    };
    if (!sessionFile) throw new ApiError("missing sessionFile");
    if ((!provider || !modelId) && !thinkingLevel) {
      throw new ApiError("missing provider/modelId or thinkingLevel");
    }

    const entry = await getSessionRuntime(sessionFile);
    const target: any = entry.runtime.session;
    if (isPromptActive(entry)) throw new ApiError("cannot switch model while streaming", 409);

    const mr = await getModelRuntime();
    let nextModel: any = target.model;
    let nextLevel: string | undefined = target.thinkingLevel;

    if (provider && modelId) {
      const found = (mr as any).getModel?.(provider, modelId);
      if (!found) throw new ApiError(`unknown model ${provider}/${modelId}`, 404);
      await target.setModel(found);
      nextModel = found;
    }

    if (thinkingLevel) {
      const map = nextModel?.thinkingLevelMap as Record<string, string | null> | undefined;
      if (map) {
        const supported = Object.entries(map)
          .filter(([, value]) => value !== null)
          .map(([level]) => level);
        if (supported.length && !supported.includes(thinkingLevel) && !(thinkingLevel in map)) {
          throw new ApiError(`thinkingLevel "${thinkingLevel}" not supported by ${nextModel?.provider}/${nextModel?.id}`);
        }
      }
      target.setThinkingLevel(thinkingLevel);
      nextLevel = target.thinkingLevel;
    }

    touchRuntime(entry);
    invalidateSessionsCache();
    res.json({ ok: true, model: serialiseModel(nextModel ?? target.model), thinkingLevel: nextLevel ?? target.thinkingLevel });
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

// POST /api/prompt { sessionFile, cwd, text, images? }
// One active prompt is allowed per session runtime. Disconnecting an SSE client
// only detaches that client; it does not abort the agent run.
app.post("/api/prompt", async (req, res) => {
  const { text, sessionFile, cwd, images } = req.body as {
    text?: string;
    sessionFile?: string;
    cwd?: string;
    images?: any[];
  };

  try {
    const hasImages = Array.isArray(images) && images.length > 0;
    if ((!text || typeof text !== "string" || !text.trim()) && !hasImages) {
      throw new ApiError("missing text");
    }
    if (!sessionFile) throw new ApiError("missing sessionFile");
    if (!cwd) throw new ApiError("missing cwd");

    // getSessionRuntime opens the session header once when needed and verifies
    // cwd before any directory-bound services are created.
    const entry = await getSessionRuntime(sessionFile, cwd);
    if (isPromptActive(entry)) throw new ApiError("a prompt is already running for this session", 409);

    const promptText = typeof text === "string" && text.trim() ? text : " ";
    const session: any = entry.runtime.session;
    touchRuntime(entry);

    sseHeaders(res);
    if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();

    let connectionClosed = false;
    const heartbeat = setInterval(() => {
      if (!connectionClosed) res.write(": ping\n\n");
    }, 15_000);
    const off = session.subscribe((event: unknown) => sendSSE(res, event));
    res.on("close", () => {
      connectionClosed = true;
      clearInterval(heartbeat);
      try {
        off();
      } catch {
        // Subscription cleanup is best effort after a broken connection.
      }
    });

    // Set this synchronously before yielding so a second request cannot pass the
    // one-prompt check while the first prompt starts.
    const promptPromise = session.prompt(promptText, images ? { images } : undefined);
    entry.activePrompt = promptPromise;

    try {
      await promptPromise;
      invalidateSessionsCache();
      if (!connectionClosed) {
        sendSSE(res, { type: "done" });
        res.end();
      }
    } catch (error) {
      if (!connectionClosed) {
        sendSSE(res, { type: "error", error: errorMessage(error) });
        res.end();
      }
    } finally {
      clearInterval(heartbeat);
      try {
        off();
      } catch {
        // no-op
      }
      if (entry.activePrompt === promptPromise) entry.activePrompt = undefined;
      touchRuntime(entry);
      void cleanupRuntimeRegistry();
    }
  } catch (error) {
    if (!res.headersSent) return res.status(errorStatus(error)).json({ error: errorMessage(error) });
    sendSSE(res, { type: "error", error: errorMessage(error) });
    res.end();
  }
});

// Exposes just enough state for a future reconnecting client. The current UI
// keeps its SSE readers open while switching, so it primarily uses local state.
app.get("/api/runtimes", (_req, res) => {
  const runtimes = [...runtimeEntries.values()].map((entry) => ({
    sessionFile: entry.sessionFile,
    cwd: entry.cwd,
    status: isPromptActive(entry) ? "running" : "idle",
    lastUsedAt: entry.lastUsedAt,
  }));
  res.json({ runtimes });
});

// ---- Providers / Auth (M2) ----

type StoredProvider = { id: string; label: string; baseUrl: string; apiKey: string };

function authFilePath(): string {
  const base = process.env.PHI_AUTH_PATH || joinPath(os.homedir(), ".config", "phi", "auth.json");
  return base;
}

async function loadStoredProviders(): Promise<StoredProvider[]> {
  try {
    const raw = await fs.readFile(authFilePath(), "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data as StoredProvider[];
    if (Array.isArray((data as any).providers)) return (data as any).providers as StoredProvider[];
    return [];
  } catch {
    return [];
  }
}

async function saveStoredProviders(providers: StoredProvider[]): Promise<void> {
  const file = authFilePath();
  const dir = dirname(file);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(providers, null, 2), { mode: 0o600 });
  try { await fs.chmod(file, 0o600); } catch {}
}

function invalidateModelsCache() { modelsCache = null; }

async function syncProvidersToRuntime() {
  const providers = await loadStoredProviders();
  const mr = await getModelRuntime();
  for (const p of providers) {
    if (!p.id || !p.baseUrl) continue;
    try {
      (mr as any).registerProvider?.(p.id, {
        name: p.label || p.id,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
      });
    } catch (e) { console.warn(`[phi] registerProvider ${p.id} failed`, e); }
    try {
      if (p.apiKey) await (mr as any).setRuntimeApiKey?.(p.id, p.apiKey);
    } catch {}
  }
  invalidateModelsCache();
}

// initial sync (best effort)
void syncProvidersToRuntime();

app.get("/api/auth/providers", async (_req, res) => {
  try {
    const providers = await loadStoredProviders();
    const masked = providers.map((p) => ({
      id: p.id,
      label: p.label,
      baseUrl: p.baseUrl,
      hasKey: Boolean(p.apiKey),
      maskedKey: p.apiKey ? `${p.apiKey.slice(0, 4)}••••${p.apiKey.slice(-4)}` : "",
    }));
    res.json({ providers: masked });
  } catch (error) { res.status(errorStatus(error)).json({ error: errorMessage(error) }); }
});

app.post("/api/auth/providers", async (req, res) => {
  try {
    const { id, label, baseUrl, apiKey } = req.body as { id?: string; label?: string; baseUrl?: string; apiKey?: string };
    if (!id || !baseUrl || !apiKey) throw new ApiError("missing id/baseUrl/apiKey");
    if (!/^https?:\/\//.test(baseUrl)) throw new ApiError("baseUrl must be http(s)://");
    const providers = await loadStoredProviders();
    const idx = providers.findIndex((p) => p.id === id);
    const entry: StoredProvider = { id, label: label || id, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
    if (idx >= 0) providers[idx] = entry; else providers.push(entry);
    await saveStoredProviders(providers);
    const mr = await getModelRuntime();
    try { (mr as any).registerProvider?.(id, { name: entry.label, baseUrl: entry.baseUrl, apiKey: entry.apiKey }); } catch {}
    try { await (mr as any).setRuntimeApiKey?.(id, apiKey); } catch {}
    invalidateModelsCache();
    res.json({ ok: true });
  } catch (error) { res.status(errorStatus(error)).json({ error: errorMessage(error) }); }
});

app.delete("/api/auth/providers/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const providers = await loadStoredProviders();
    const next = providers.filter((p) => p.id !== id);
    if (next.length === providers.length) throw new ApiError("provider not found", 404);
    await saveStoredProviders(next);
    const mr = await getModelRuntime();
    try { (mr as any).unregisterProvider?.(id); } catch {}
    try { await (mr as any).removeRuntimeApiKey?.(id); } catch {}
    invalidateModelsCache();
    res.json({ ok: true });
  } catch (error) { res.status(errorStatus(error)).json({ error: errorMessage(error) }); }
});

app.post("/api/auth/providers/:id/test", async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body as { baseUrl?: string; apiKey?: string };
    let baseUrl = body.baseUrl;
    let apiKey = body.apiKey;
    if (!baseUrl || !apiKey) {
      const providers = await loadStoredProviders();
      const found = providers.find((p) => p.id === id);
      if (!found) throw new ApiError("provider not found", 404);
      baseUrl = baseUrl || found.baseUrl;
      apiKey = apiKey || found.apiKey;
    }
    if (!baseUrl || !apiKey) throw new ApiError("missing baseUrl/apiKey");
    const url = `${baseUrl.replace(/\/+$/, "")}/models`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal });
      const text = await resp.text();
      if (!resp.ok) throw new ApiError(`test failed ${resp.status}: ${text.slice(0, 500)}`, 400);
      res.json({ ok: true, status: resp.status });
    } finally { clearTimeout(t); }
  } catch (error) { res.status(errorStatus(error)).json({ error: errorMessage(error) }); }
});

// ---- Continue (M2) ----
app.post("/api/continue", async (req, res) => {
  const { sessionFile, cwd } = req.body as { sessionFile?: string; cwd?: string };
  try {
    if (!sessionFile) throw new ApiError("missing sessionFile");
    const entry = await getSessionRuntime(sessionFile, cwd);
    if (isPromptActive(entry)) throw new ApiError("a prompt is already running for this session", 409);
    const session: any = entry.runtime.session;
    touchRuntime(entry);
    sseHeaders(res);
    if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();
    let connectionClosed = false;
    const heartbeat = setInterval(() => { if (!connectionClosed) res.write(": ping\n\n"); }, 15_000);
    const off = session.subscribe((event: unknown) => sendSSE(res, event));
    res.on("close", () => { connectionClosed = true; clearInterval(heartbeat); try { off(); } catch {} });
    // Try agent-level continue first, fallback to prompt with empty continuer
    const tryAgentContinue = async () => {
      const agent: any = session.agent;
      if (typeof agent?.continue === "function") return agent.continue();
      if (typeof session.continue === "function") return session.continue();
      // fallback: re-prompt with special continue flag if SDK exposes it via prompt options
      // We attempt a no-op prompt that tells SDK to continue (some versions accept { continue: true })
      // If not, throw.
      throw new ApiError("continue not supported by this SDK version", 501);
    };
    const promptPromise = tryAgentContinue();
    entry.activePrompt = promptPromise as Promise<void>;
    try {
      await promptPromise;
      invalidateSessionsCache();
      if (!connectionClosed) { sendSSE(res, { type: "done" }); res.end(); }
    } catch (error) {
      if (!connectionClosed) { sendSSE(res, { type: "error", error: errorMessage(error) }); res.end(); }
    } finally {
      clearInterval(heartbeat);
      try { off(); } catch {}
      if (entry.activePrompt === promptPromise) entry.activePrompt = undefined;
      touchRuntime(entry);
      void cleanupRuntimeRegistry();
    }
  } catch (error) {
    if (!res.headersSent) return res.status(errorStatus(error)).json({ error: errorMessage(error) });
    sendSSE(res, { type: "error", error: errorMessage(error) });
    res.end();
  }
});

// ---- Slash commands ----
let commandsCache: { at: number; payload: unknown; cwd: string } | null = null;
const COMMANDS_TTL_MS = 5_000;

type CommandSource = { session: any; services: any; dispose?: () => Promise<void> | void };

async function commandSourceForCwd(cwd: string): Promise<CommandSource> {
  const normalisedCwd = normalisePath(cwd);
  const live = [...runtimeEntries.values()].find((entry) => normalisePath(entry.cwd) === normalisedCwd);
  if (live) {
    touchRuntime(live);
    return { session: live.runtime.session, services: live.runtime.services };
  }

  // Command discovery must not allocate a registry entry or replace a live
  // session. Use an in-memory session solely to let extensions register commands.
  const sharedModelRuntime = await getModelRuntime();
  const services = await createAgentSessionServices({
    cwd: normalisedCwd,
    agentDir: getAgentDir(),
    modelRuntime: sharedModelRuntime,
  });
  const sessionManager = SessionManager.inMemory(normalisedCwd);
  const runtime = await createAgentSessionRuntime(async ({ sessionManager: targetManager, sessionStartEvent }: any) => {
    const created = await createAgentSessionFromServices({
      services,
      sessionManager: targetManager,
      sessionStartEvent,
    } as any);
    return { ...created, services, diagnostics: services.diagnostics } as any;
  }, {
    cwd: normalisedCwd,
    agentDir: getAgentDir(),
    sessionManager,
  });
  await runtime.session.bindExtensions({});
  return { session: runtime.session, services, dispose: () => runtime.dispose() };
}

function commandsFromSource(source: CommandSource) {
  const { session, services } = source;
  let extensionCommands: Array<{ name: string; description?: string; argumentHint?: string; sourceInfo?: unknown }> = [];
  try {
    const runner: any = session?.extensionRunner ?? session?._extensionRunner ?? services?.extensionRunner;
    if (runner?.getRegisteredCommands) {
      extensionCommands = runner.getRegisteredCommands().map((command: any) => ({
        name: command.invocationName ?? command.name,
        description: command.description,
        argumentHint: command.argumentHint,
        sourceInfo: command.sourceInfo,
      }));
    } else if (runner?.getCommands) {
      extensionCommands = runner.getCommands().map((command: any) => ({
        name: command.name,
        description: command.description,
        sourceInfo: command.sourceInfo,
      }));
    }
  } catch {
    // A broken extension must not make the composer unusable.
  }

  const loader: any = services?.resourceLoader ?? session?.resourceLoader;
  const skillResult = loader?.getSkills?.();
  const promptResult = loader?.getPrompts?.();
  const skills = Array.isArray(skillResult?.skills)
    ? skillResult.skills.map((skill: any) => ({ name: skill.name, description: skill.description, filePath: skill.filePath }))
    : [];
  let prompts = Array.isArray(promptResult?.prompts)
    ? promptResult.prompts.map((prompt: any) => ({
        name: prompt.name,
        description: prompt.description,
        argumentHint: prompt.argumentHint,
        filePath: prompt.filePath,
      }))
    : [];

  if (prompts.length === 0 && Array.isArray(session?.promptTemplates)) {
    prompts = session.promptTemplates.map((prompt: any) => ({
      name: prompt.name,
      description: prompt.description,
      argumentHint: prompt.argumentHint,
    }));
  }

  const commands = [
    ...extensionCommands.map((command) => ({
      name: command.name,
      description: command.description,
      source: "extension" as const,
      argumentHint: command.argumentHint,
    })),
    ...skills.map((skill: any) => ({ name: `skill:${skill.name}`, description: skill.description, source: "skill" as const })),
    ...prompts.map((prompt: any) => ({
      name: prompt.name,
      description: prompt.description,
      source: "prompt" as const,
      argumentHint: prompt.argumentHint,
    })),
  ];

  return { commands, extensionCommands, skills, prompts };
}

app.get("/api/commands", async (req, res) => {
  try {
    const cwd = normalisePath((req.query.cwd as string) || process.cwd());
    const now = Date.now();
    if (commandsCache && commandsCache.cwd === cwd && now - commandsCache.at < COMMANDS_TTL_MS) {
      return res.json(commandsCache.payload);
    }

    const source = await commandSourceForCwd(cwd);
    try {
      const payload = commandsFromSource(source);
      commandsCache = { at: now, payload, cwd };
      res.json(payload);
    } finally {
      await source.dispose?.();
    }
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

// ---- File listing for @-mentions ----
const FILE_LIST_CACHE_TTL_MS = 5000;
const fileListCache = new Map<string, { at: number; payload: unknown }>();
const FILE_LIST_IGNORE = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".turbo",
  ".parcel-cache",
  "dist",
  "build",
  "out",
  ".output",
  "coverage",
  ".cache",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".venv",
  "venv",
  ".idea",
  "target",
  ".cargo",
]);
const FILE_LIST_MAX = 4000;
const FILE_LIST_MAX_DEPTH = 10;

type FileEntry = { path: string; name: string; isDirectory: boolean };

async function walkFiles(root: string): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  type QueueItem = { abs: string; rel: string; depth: number };
  const queue: QueueItem[] = [{ abs: root, rel: "", depth: 0 }];
  let head = 0;
  while (head < queue.length && results.length < FILE_LIST_MAX) {
    const cur = queue[head++];
    if (cur.depth > FILE_LIST_MAX_DEPTH) continue;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(cur.abs, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (results.length >= FILE_LIST_MAX) break;
      if (ent.name.startsWith(".") && cur.depth === 0 && FILE_LIST_IGNORE.has(ent.name)) continue;
      if (FILE_LIST_IGNORE.has(ent.name)) continue;
      const rel = cur.rel ? `${cur.rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        // skip ignored dirs even when nested
        results.push({ path: rel, name: ent.name, isDirectory: true });
        if (cur.depth + 1 <= FILE_LIST_MAX_DEPTH) {
          try {
            const stat = await fs.lstat(joinPath(cur.abs, ent.name));
            if (!stat.isSymbolicLink()) queue.push({ abs: joinPath(cur.abs, ent.name), rel, depth: cur.depth + 1 });
          } catch {}
        }
      } else if (ent.isFile()) {
        results.push({ path: rel, name: ent.name, isDirectory: false });
      }
    }
  }
  return results;
}

app.get("/api/files", async (req, res) => {
  try {
    const rawCwd = (req.query.cwd as string) || process.cwd();
    const cwd = normalisePath(rawCwd);
    const now = Date.now();
    const cached = fileListCache.get(cwd);
    if (cached && now - cached.at < FILE_LIST_CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=5");
      return res.json(cached.payload);
    }
    try {
      await fs.access(cwd);
    } catch {
      return res.json({ files: [] });
    }
    const files = await walkFiles(cwd);
    const payload = { files };
    fileListCache.set(cwd, { at: now, payload });
    // simple LRU cap 20 entries
    if (fileListCache.size > 20) {
      const oldest = [...fileListCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
      if (oldest) fileListCache.delete(oldest);
    }
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(payload);
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "not found" });
});

app.listen(PORT, HOST, () => {
  console.log(`[phi sidecar] listening on http://${HOST}:${PORT}`);
  console.log(`[phi sidecar] agentDir=${getAgentDir()} cwd=${process.cwd()}`);
  if (String(rawPort) !== String(PORT)) {
    console.log(`[phi sidecar] note: PORT env/arg ${rawPort} parsed to ${PORT}`);
  }
});
