import cors from "cors";
import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  SessionManager,
  ModelRuntime,
  getAgentDir,
  createAgentSession,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createAgentSessionFromServices,
} from "@earendil-works/pi-coding-agent";

// ---- config ----
const rawPort = process.argv[2] ?? process.env.PORT ?? "3001";
const PORT = Number.parseInt(String(rawPort), 10) || 3001;
const HOST = "127.0.0.1";

const app = express();
app.use(cors({ origin: [/tauri\.localhost/, /localhost:\d+$/, /127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: "10mb" }));

// ---- state singletons (lazy) ----
let modelRuntime: Awaited<ReturnType<typeof ModelRuntime.create>> | undefined;
let runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>> | undefined;
// fallback single session when runtime not needed
let singleSession: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;

async function getModelRuntime() {
  if (!modelRuntime) {
    modelRuntime = await ModelRuntime.create();
  }
  return modelRuntime;
}

async function getRuntime(cwd = process.cwd()) {
  if (runtime) return runtime;
  const mr = await getModelRuntime();
  const factory = async ({ cwd: c, sessionManager, sessionStartEvent }: any) => {
    const services = await createAgentSessionServices({ cwd: c });
    const result = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      modelRuntime: mr,
    } as any);
    return { ...result, services, diagnostics: services.diagnostics } as any;
  };
  runtime = await createAgentSessionRuntime(factory as any, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager: SessionManager.create(cwd),
    modelRuntime: mr,
  } as any);
  return runtime;
}

// ---- helpers ----
function sseHeaders(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}

function sendSSE(res: express.Response, event: unknown) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ---- routes ----

// Health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, port: PORT, agentDir: getAgentDir() });
});

// Models — returns auth-filtered catalogue for the selector
// Normalize to plain JSON so frontend doesn't depend on SDK class shape
// Cached 30s to avoid hammering getAvailable/checkAuth on every rerender/poll.
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
    const availableRaw: any[] = await (mr as any).getAvailable?.() ?? [];
    const available = availableRaw.map((m: any) => ({
      provider: m.provider,
      id: m.id,
      name: m.name ?? m.id,
      api: m.api,
      reasoning: !!m.reasoning,
      input: m.input ?? ["text"],
      output: m.output,
      cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow ?? 0,
      maxTokens: m.maxTokens ?? 0,
      thinkingLevelMap: m.thinkingLevelMap ?? null,
    }));
    const payload = { available, error: (mr as any).getError?.() ?? null };
    modelsCache = { at: now, payload };
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(payload);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Sessions cache — biggest win for sidebar
// Disk-heavy listAll is cached 3s with ETag + deduped concurrent calls
let sessionsCache: { at: number; payload: any; etag: string } | null = null;
const SESSIONS_TTL_MS = 3000;
let pendingListAll: Promise<any> | null = null;

function etagFor(payload: any): string {
  if (!Array.isArray(payload) || payload.length === 0) return `"0-0"`;
  return `"${payload.length}-${(payload[0] as any)?.modified ?? ""}"`;
}

function invalidateSessionsCache() {
  sessionsCache = null;
}

// List sessions
// GET /api/sessions?cwd=/foo  (project)  or  /api/sessions (all) or /api/sessions?all=1
app.get("/api/sessions", async (req, res) => {
  try {
    const cwd = req.query.cwd as string | undefined;
    const all = req.query.all === "1" || req.query.all === "true";

    // cached fast-path for all=1 (sidebar)
    if (all && sessionsCache && Date.now() - sessionsCache.at < SESSIONS_TTL_MS) {
      if (req.headers["if-none-match"] === sessionsCache.etag) return res.status(304).end();
      res.setHeader("ETag", sessionsCache.etag);
      return res.json(sessionsCache.payload);
    }

    const doList = async () => {
      if (cwd && !all) return SessionManager.list(cwd);
      let infos: any[];
      infos = await (SessionManager as any).listAll();
      if (!Array.isArray(infos)) infos = await SessionManager.listAll(undefined as any);
      return infos;
    };

    // dedupe concurrent callers (session hop spam)
    if (!pendingListAll) {
      pendingListAll = doList().finally(() => setTimeout(() => (pendingListAll = null), 50));
    }
    const infos = await pendingListAll;

    if (all) {
      const etag = etagFor(infos);
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.setHeader("ETag", etag);
      sessionsCache = { at: Date.now(), payload: infos, etag };
    }
    res.json(infos);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Get messages for a session file
// GET /api/sessions/messages?file=/path/to/session.jsonl
app.get("/api/sessions/messages", async (req, res) => {
  try {
    const file = req.query.file as string;
    if (!file) return res.status(400).json({ error: "missing file query param" });
    const sm = SessionManager.open(file);
    const header = sm.getHeader();
    const entries = sm.getEntries();
    const ctx = sm.buildSessionContext();
    // return both raw entries and resolved context
    res.json({
      file,
      header,
      entries,
      context: ctx,
      sessionName: sm.getSessionName(),
      cwd: sm.getCwd(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// New session
app.post("/api/sessions/new", async (req, res) => {
  try {
    const cwd = (req.body?.cwd as string) || process.cwd();
    const rt = await getRuntime(cwd);
    await rt.newSession();
    // runtime.session changed — return new file
    const file = (rt.session as any).sessionFile ?? (rt as any).session?.sessionFile;
    invalidateSessionsCache();
    res.json({ ok: true, file });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Switch session — returns messages inline so frontend can skip 2nd fetch (1 RTT saved)
app.post("/api/sessions/switch", async (req, res) => {
  try {
    const { file, cwd } = req.body as { file: string; cwd?: string };
    if (!file) return res.status(400).json({ error: "missing file" });
    const rt = await getRuntime(cwd || path.dirname(file));
    await rt.switchSession(file);
    invalidateSessionsCache();
    // inline payload — frontend was doing Promise.all([switch, getMessages])
    const sm = SessionManager.open(file);
    res.json({
      ok: true,
      file,
      header: sm.getHeader(),
      entries: sm.getEntries(),
      context: sm.buildSessionContext(),
      sessionName: sm.getSessionName(),
      cwd: sm.getCwd(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Rename session
app.post("/api/sessions/rename", async (req, res) => {
  try {
    const { file, name } = req.body as { file: string; name: string };
    if (!file) return res.status(400).json({ error: "missing file" });
    const sm = SessionManager.open(file);
    sm.appendSessionInfo(name);
    invalidateSessionsCache();
    res.json({ ok: true, name: sm.getSessionName() });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Delete session (trash/unlink)
app.delete("/api/sessions", async (req, res) => {
  try {
    const file = (req.query.file as string) || (req.body as any)?.file;
    if (!file) return res.status(400).json({ error: "missing file" });
    // try SDK helper if available, else unlink — frontend confirms
    try {
      const maybeTrash = (SessionManager as any).trash ?? (SessionManager as any).remove;
      if (typeof maybeTrash === "function") await maybeTrash(file);
      else await fs.unlink(file);
    } catch {
      await fs.unlink(file);
    }
    invalidateSessionsCache();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Abort current streaming session
app.post("/api/abort", async (_req, res) => {
  try {
    const target = runtime?.session ?? singleSession;
    if (target) await (target as any).abort();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Model switch — supports changing model and/or thinkingLevel in one call
// Body: { provider, modelId, thinkingLevel? } where provider+modelId changes model.
// A bare { thinkingLevel } only changes effort for the current model.
// Effort visibility is filtered to the CURRENT model's thinkingLevelMap (gap B).
app.post("/api/model", async (req, res) => {
  try {
    const { provider, modelId, thinkingLevel } = req.body as {
      provider?: string;
      modelId?: string;
      thinkingLevel?: string;
    };

    if (!provider && !modelId && !thinkingLevel) {
      return res.status(400).json({ error: "missing provider/modelId or thinkingLevel" });
    }

    const mr = await getModelRuntime();
    // Ensure a session exists even if user sets model before first prompt
    let target: any = runtime?.session ?? singleSession;
    if (!target) {
      const rt = await getRuntime(process.cwd());
      target = rt.session;
    }
    if (!target) return res.status(500).json({ error: "no session available" });

    let nextModel: any = target.model;
    let nextLevel: string | undefined = target.thinkingLevel;

    if (provider && modelId) {
      const found = (mr as any).getModel?.(provider, modelId);
      if (!found) return res.status(404).json({ error: `unknown model ${provider}/${modelId}` });
      // Disallow switch while streaming — matches sidebar abort guard (App.tsx)
      if (target.isStreaming) return res.status(409).json({ error: "cannot switch model while streaming" });
      await (target as any).setModel(found);
      nextModel = found;
    }

    if (thinkingLevel) {
      // Validate against current/next model's supported levels when map exists
      const map = nextModel?.thinkingLevelMap as Record<string, string | null> | undefined;
      if (map) {
        const supported = Object.entries(map)
          .filter(([, v]) => v !== null)
          .map(([k]) => k);
        // if map is present and non-empty, enforce membership (allow "off" as well)
        if (supported.length && !supported.includes(thinkingLevel) && !(thinkingLevel in map)) {
          // Be lenient: still allow via clamp on frontend, but warn here with 400 for strictness
          // For gap B we reject unsupported to keep slider honest
          return res.status(400).json({ error: `thinkingLevel "${thinkingLevel}" not supported by ${nextModel?.provider}/${nextModel?.id}` });
        }
      }
      (target as any).setThinkingLevel(thinkingLevel);
      nextLevel = thinkingLevel;
    }

    // Return canonical post-mutation view so frontend can optimistically sync
    const outModel = nextModel
      ? {
          provider: nextModel.provider,
          id: nextModel.id,
          name: nextModel.name ?? nextModel.id,
          api: nextModel.api,
          reasoning: !!nextModel.reasoning,
          input: nextModel.input ?? ["text"],
          cost: nextModel.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: nextModel.contextWindow ?? 0,
          maxTokens: nextModel.maxTokens ?? 0,
          thinkingLevelMap: nextModel.thinkingLevelMap ?? null,
        }
      : null;

    res.json({ ok: true, model: outModel ?? target.model ?? null, thinkingLevel: nextLevel ?? target.thinkingLevel });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Prompt with SSE streaming
// POST /api/prompt  { text, sessionFile?, cwd?, images? }
// Streams SSE events: { type: "message_update" | ... }
app.post("/api/prompt", async (req, res) => {
  sseHeaders(res);
  // ensure headers flushed immediately (fixes nginx / vite proxy buffering)
  if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();

  const { text, sessionFile, cwd, images } = req.body as {
    text: string;
    sessionFile?: string;
    cwd?: string;
    images?: any[];
  };

  const hasImages = Array.isArray(images) && images.length > 0;
  if ((!text || typeof text !== "string" || !text.trim()) && !hasImages) {
    sendSSE(res, { type: "error", error: "missing text" });
    return res.end();
  }
  const promptText = typeof text === "string" && text.trim() ? text : (hasImages ? " " : text);

  try {
    const mr = await getModelRuntime();

    // Resolve/create session
    let session: any;
    if (runtime) {
      // if sessionFile specified and differs, switch first
      if (sessionFile) {
        const currentFile = (runtime.session as any)?.sessionFile;
        if (currentFile !== sessionFile) {
          await runtime.switchSession(sessionFile);
        }
      }
      session = runtime.session;
    } else {
      // first prompt: create a session via createAgentSession
      const sm = sessionFile
        ? SessionManager.open(sessionFile)
        : SessionManager.create(cwd || process.cwd());
      // try to use runtime, else single session
      try {
        const rt = await getRuntime(cwd || process.cwd());
        if (sessionFile) await rt.switchSession(sessionFile);
        session = rt.session;
      } catch {
        const created = await createAgentSession({
          sessionManager: sm,
          modelRuntime: mr,
        } as any);
        singleSession = created.session;
        session = created.session;
      }
    }

    // Heartbeat to keep proxies alive (Vite/ Tauri)
    const heartbeat = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 15_000);

    const off = session.subscribe((event: unknown) => {
      sendSSE(res, event);
    });

    // Ensure cleanup on client abort
    req.on("close", () => {
      clearInterval(heartbeat);
      try { off?.(); } catch {}
    });

    await session.prompt(promptText, images ? { images } : undefined);

    clearInterval(heartbeat);
    off();
    invalidateSessionsCache();

    // Signal completion for frontend convenience
    sendSSE(res, { type: "done" });
    res.end();
  } catch (e: any) {
    sendSSE(res, { type: "error", error: e?.message ?? String(e), stack: e?.stack });
    res.end();
  }
});

// Fallback 404 for api
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
