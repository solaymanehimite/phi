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
app.use(cors({ origin: [/localhost:\d+$/, /127\.0\.0\.1:\d+$/] }));
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
}

function sendSSE(res: express.Response, event: unknown) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ---- routes ----

// Health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, port: PORT, agentDir: getAgentDir() });
});

// Models
app.get("/api/models", async (_req, res) => {
  try {
    const mr = await getModelRuntime();
    const available = await (mr as any).getAvailable?.() ?? [];
    res.json({ available });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// List sessions
// GET /api/sessions?cwd=/foo  (project)  or  /api/sessions (all) or /api/sessions?all=1
app.get("/api/sessions", async (req, res) => {
  try {
    const cwd = req.query.cwd as string | undefined;
    const all = req.query.all === "1" || req.query.all === "true";
    let infos: any[];
    if (cwd && !all) {
      infos = await SessionManager.list(cwd);
    } else {
      // listAll has two overloads; try without arg first
      infos = await (SessionManager as any).listAll();
      // fallback if it expects string
      if (!Array.isArray(infos)) infos = await SessionManager.listAll(undefined as any);
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
    res.json({ ok: true, file });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Switch session
app.post("/api/sessions/switch", async (req, res) => {
  try {
    const { file, cwd } = req.body as { file: string; cwd?: string };
    if (!file) return res.status(400).json({ error: "missing file" });
    const rt = await getRuntime(cwd || path.dirname(file));
    await rt.switchSession(file);
    res.json({ ok: true, file });
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
    // try trash via SDK helper if available, else unlink
    // For now unlink — frontend confirms
    await fs.unlink(file);
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

// Model switch
app.post("/api/model", async (req, res) => {
  try {
    const { provider, modelId, thinkingLevel } = req.body as {
      provider?: string;
      modelId?: string;
      thinkingLevel?: string;
    };
    const mr = await getModelRuntime();
    const target = runtime?.session ?? singleSession;
    if (provider && modelId && target && (target as any).setModel) {
      const model = (mr as any).getModel?.(provider, modelId) ?? { provider, modelId };
      await (target as any).setModel(model);
    }
    if (thinkingLevel && target && (target as any).setThinkingLevel) {
      (target as any).setThinkingLevel(thinkingLevel);
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Prompt with SSE streaming
// POST /api/prompt  { text, sessionFile?, cwd?, images? }
// Streams SSE events: { type: "message_update" | ... }
app.post("/api/prompt", async (req, res) => {
  sseHeaders(res);

  const { text, sessionFile, cwd, images } = req.body as {
    text: string;
    sessionFile?: string;
    cwd?: string;
    images?: any[];
  };

  if (!text || typeof text !== "string") {
    sendSSE(res, { type: "error", error: "missing text" });
    return res.end();
  }

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

    await session.prompt(text, images ? { images } : undefined);

    clearInterval(heartbeat);
    off();

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
