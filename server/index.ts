import cors from "cors";
import express from "express";
import { execFile as execFileCb } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import { resolve as resolvePath, join as joinPath, dirname, basename, relative } from "node:path";
import {
  SessionManager,
  ModelRuntime,
  SettingsManager,
  getAgentDir,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createAgentSessionFromServices,
  DefaultPackageManager,
  loadSkills,
  CONFIG_DIR_NAME,
} from "@earendil-works/pi-coding-agent";
import { clampThinkingLevel } from "./thinking";
import { isPathSafe, isUnderNestedRepo } from "./paths";
import { findUndoTurn, undoFallbackTarget, type TurnRecord } from "./nav";
import {
  normalizeProviderBaseUrl,
  validateProviderInput,
  validateProviderTestInput,
} from "./providers";

// ---- config ----
const rawPort = process.argv[2] ?? process.env.PORT ?? "3001";
const PORT = Number.parseInt(String(rawPort), 10) || 3001;
const HOST = process.env.PHI_HOST ?? "127.0.0.1";
const PHI_TOKEN = process.env.PHI_TOKEN || "";
const PHI_SYSTEM_PROMPT_APPEND = "When writing reasoning or thinking, use plain text only. Do not use Markdown formatting.";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ---- token auth ----
// When PHI_TOKEN is set, every /api/* request except /api/health must carry
// it as `Authorization: Bearer <token>` (query `?token=` is also accepted
// for fetch/SSE simplicity). Without PHI_TOKEN, behavior is unchanged.
app.use("/api", (req, res, next) => {
  if (!PHI_TOKEN) return next();
  if (req.path === "/health") return next();
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  const query = typeof req.query.token === "string" ? req.query.token : undefined;
  if (bearer === PHI_TOKEN || query === PHI_TOKEN) return next();
  res.status(401).json({ error: "unauthorized" });
});

class ApiError extends Error {
  public code?: string;
  public details?: unknown;
  constructor(message: string, readonly status = 400, code?: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function errorStatus(error: unknown): number {
  return error instanceof ApiError ? error.status : 500;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalisePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return resolvePath(os.homedir(), trimmed.slice(2));
  return resolvePath(trimmed);
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
  /** Per-session nav lock: undo/redo take the same lock as prompts. */
  activeNav?: boolean;
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
      resourceLoaderOptions: {
        appendSystemPrompt: [PHI_SYSTEM_PROMPT_APPEND],
      },
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
  // Redo stacks are ephemeral by design: evicted with the runtime.
  // Undo still works from the persisted tree + checkpoint file.
  navStates.delete(entry.sessionFile);
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

// ---- Turn checkpoints: undo / redo (v1) ----
// Conversation nav is pointer moves on the append-only session tree (branch /
// resetLeaf). File nav is `git stash create` snapshots + selective restore.
// Invariants: files first, conversation second (the leaf never moves when a
// restore fails); capture failure never fails the turn (the boundary becomes
// conversation-only); only worktree-vs-snapshot divergence on affected paths
// is a typed conflict, everything else is one generic restore error.
type FileSnapshot = { repoRoot: string | null; tree: string | null; head: string | null };
type NavState = {
  /** Ephemeral redo stack. Lost on sidecar restart or runtime eviction. */
  redoStack: Array<{ leafId: string; turnId: string | null }>;
};
const navStates = new Map<string, NavState>();
const MAX_TURNS_PER_SESSION = 100;
const EMPTY_SNAPSHOT: FileSnapshot = { repoRoot: null, tree: null, head: null };

function navStateFor(sessionFile: string): NavState {
  const key = normalisePath(sessionFile);
  let state = navStates.get(key);
  if (!state) {
    state = { redoStack: [] };
    navStates.set(key, state);
  }
  return state;
}

function clearRedoStack(sessionFile: string) {
  const state = navStates.get(normalisePath(sessionFile));
  if (state) state.redoStack.length = 0;
}

function checkpointFileFor(sessionFile: string): string {
  const dir = process.env.PHI_CHECKPOINTS_DIR || joinPath(os.homedir(), ".config", "phi", "checkpoints");
  return joinPath(dir, `${createHash("sha1").update(normalisePath(sessionFile)).digest("hex")}.json`);
}

async function loadTurns(sessionFile: string): Promise<TurnRecord[]> {
  try {
    const raw = await fs.readFile(checkpointFileFor(sessionFile), "utf-8");
    const data = JSON.parse(raw) as { turns?: unknown };
    if (!Array.isArray(data.turns)) return [];
    return (data.turns as TurnRecord[]).filter(
      (t) => t && typeof t.id === "string" && typeof t.afterLeaf === "string",
    );
  } catch {
    return [];
  }
}

async function saveTurns(sessionFile: string, turns: TurnRecord[]): Promise<void> {
  const file = checkpointFileFor(sessionFile);
  await fs.mkdir(dirname(file), { recursive: true });
  const trimmed = turns.slice(Math.max(0, turns.length - MAX_TURNS_PER_SESSION));
  await fs.writeFile(file, JSON.stringify({ sessionFile: normalisePath(sessionFile), turns: trimmed }, null, 2));
}

/** Append a turn record and clear the redo stack. Bookkeeping: never throws. */
async function recordTurn(
  sessionFile: string,
  turn: Omit<TurnRecord, "id" | "ts">,
): Promise<void> {
  try {
    const turns = await loadTurns(sessionFile);
    turns.push({
      ...turn,
      id: `chk_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffff).toString(36)}`,
      ts: Date.now(),
    });
    await saveTurns(sessionFile, turns);
    clearRedoStack(sessionFile);
  } catch {
    // Checkpoint bookkeeping must never fail the turn.
  }
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileCb("git", args, { cwd, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout ?? "").trim());
    });
  });
}

async function findRepoRoot(cwd: string): Promise<string | null> {
  try {
    return await runGit(["rev-parse", "--show-toplevel"], cwd);
  } catch {
    return null;
  }
}

/** Never rejects. A null tree means "uncaptured": conversation-only nav. */
async function captureSnapshot(cwd: string): Promise<FileSnapshot> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) return EMPTY_SNAPSHOT;
    let head: string | null = null;
    try {
      head = await runGit(["rev-parse", "HEAD"], repoRoot);
    } catch {
      head = null;
    }
    let tree: string | null = null;
    try {
      // Writes the stash object without touching worktree, index, or HEAD.
      // Empty output means a clean worktree: HEAD itself is the snapshot.
      tree = (await runGit(["stash", "create"], repoRoot)) || head;
    } catch {
      tree = head;
    }
    if (!tree) return { repoRoot, tree: null, head };
    return { repoRoot, tree, head };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function splitNull(out: string): string[] {
  return out
    .split("\0")
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function diffTrees(repoRoot: string, a: string, b: string): Promise<string[]> {
  return splitNull(await runGit(["diff", "--name-only", "--no-renames", "-z", a, b, "--"], repoRoot));
}

async function diffWorktree(repoRoot: string, tree: string, paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const chunk of chunks(paths, 200)) {
    if (chunk.length === 0) continue;
    out.push(...splitNull(await runGit(["diff", "--name-only", "--no-renames", "-z", tree, "--", ...chunk], repoRoot)));
  }
  return out;
}

async function existsInTree(repoRoot: string, tree: string, rel: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFileCb("git", ["cat-file", "-e", `${tree}:${rel}`], { cwd: repoRoot, timeout: 15_000 }, (error) =>
      resolve(!error),
    );
  });
}

const RESTORE_FAILED = "file restore failed; conversation unchanged";

/**
 * Selective restore: diff(currentTree, targetTree) is the plan. Only paths
 * inside the repo root are touched; deletions are file-level `rm` and never
 * recurse into nested repositories. Throws ApiError on any failure; the
 * caller must not move the leaf in that case.
 */
async function restoreWorktreeToTree(
  repoRoot: string,
  currentTree: string,
  targetTree: string,
): Promise<{ restoredPaths: string[] }> {
  try {
    await fs.access(repoRoot);
  } catch {
    throw new ApiError("workspace repository is no longer available; conversation unchanged", 500);
  }
  let affected: string[];
  try {
    affected = await diffTrees(repoRoot, currentTree, targetTree);
  } catch {
    throw new ApiError(RESTORE_FAILED, 500);
  }
  if (affected.length === 0) return { restoredPaths: [] };
  let conflicted: string[];
  try {
    // Worktree vs the current snapshot, scoped to affected paths only.
    conflicted = await diffWorktree(repoRoot, currentTree, affected);
  } catch {
    throw new ApiError(RESTORE_FAILED, 500);
  }
  if (conflicted.length > 0) {
    const shown = conflicted.slice(0, 10).join(", ");
    throw new ApiError(
      `files changed since the checkpoint: ${shown}${conflicted.length > 10 ? "\u2026" : ""}`,
      409,
      "conflict",
      { paths: conflicted },
    );
  }
  const toRestore: string[] = [];
  const toDelete: string[] = [];
  for (const p of affected) {
    if (!isPathSafe(repoRoot, p)) throw new ApiError(RESTORE_FAILED, 500);
    if (await existsInTree(repoRoot, targetTree, p)) toRestore.push(p);
    else toDelete.push(p);
  }
  try {
    for (const chunk of chunks(toRestore, 200)) {
      if (chunk.length === 0) continue;
      await runGit(["checkout", targetTree, "--", ...chunk], repoRoot);
    }
    for (const p of toDelete) {
      if (isUnderNestedRepo(repoRoot, p)) {
        throw new ApiError("file restore refused inside a nested repository; conversation unchanged", 500);
      }
      try {
        await fs.unlink(joinPath(repoRoot, p));
      } catch (error: any) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(RESTORE_FAILED, 500);
  }
  let remaining: string[];
  try {
    remaining = await diffWorktree(repoRoot, targetTree, affected);
  } catch {
    throw new ApiError("file restore failed verification; conversation unchanged", 500);
  }
  if (remaining.length > 0) throw new ApiError("file restore failed verification; conversation unchanged", 500);
  return { restoredPaths: affected };
}

/**
 * The runtime caches agent messages in memory (AgentSession.prompt builds the
 * next turn from agent state, not from the session manager), so a raw
 * branch() would leave stale history behind. Supernova rebuilds from the
 * visible branch after navigation; same here. Verified against the SDK's own
 * navigateTree, which does exactly this assignment.
 */
function rebuildAgentMessages(session: any) {
  const sm = session?.sessionManager;
  const agent = session?.agent;
  if (!sm || !agent?.state) throw new ApiError("live session has no agent state", 500);
  agent.state.messages = sm.buildSessionContext().messages;
}

/** Shared per-session lock for nav ops: rejects while a prompt, compaction, or another nav op is active. */
function assertNavIdle(entry: SessionRuntimeEntry) {
  if (isPromptActive(entry)) throw new ApiError("a prompt is already running for this session", 409);
  const session: any = entry.runtime.session;
  if (session?.isCompacting) throw new ApiError("compaction is in progress for this session", 409);
  if (entry.activeNav) throw new ApiError("a navigation operation is already in progress for this session", 409);
}

function sendNavError(res: express.Response, error: unknown) {
  const body: { error: string; code?: string; details?: unknown } = { error: errorMessage(error) };
  if (error instanceof ApiError && error.code) {
    body.code = error.code;
    body.details = error.details;
  }
  return res.status(errorStatus(error)).json(body);
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
// Cache is keyed by cwd because project settings can override the default model.
const modelsCache = new Map<string, { at: number; payload: any }>();
const MODELS_TTL_MS = 30_000;
const MODELS_CACHE_MAX_KEYS = 8;

// Preferred default model per provider, mirroring Pi's own fresh-session
// fallback (defaultModelPerProvider in pi's model-resolver). Only the order
// matters: the first entry matching an available model wins. If Pi adds or
// renames providers, the final "first available" fallback keeps us correct.
const DEFAULT_MODEL_PRIORITY: Array<[string, string]> = [
  ["anthropic", "claude-opus-4-8"],
  ["openai-codex", "gpt-5.5"],
  ["openai", "gpt-5.5"],
  ["azure-openai-responses", "gpt-5.4"],
  ["google", "gemini-3.1-pro-preview"],
  ["google-vertex", "gemini-3.1-pro-preview"],
  ["github-copilot", "gpt-5.4"],
  ["xai", "grok-4.6"],
  ["kimi-coding", "kimi-for-coding"],
  ["moonshotai", "kimi-k2.6"],
  ["moonshotai-cn", "kimi-k2.6"],
  ["opencode", "kimi-k2.6"],
  ["opencode-go", "kimi-k2.6"],
  ["zai", "glm-5.3"],
  ["zai-coding-cn", "glm-5.3"],
  ["deepseek", "deepseek-v4-pro"],
  ["minimax", "MiniMax-M2.7"],
  ["minimax-cn", "MiniMax-M2.7"],
  ["mistral", "devstral-medium-latest"],
  ["openrouter", "moonshotai/kimi-k2.6"],
  ["vercel-ai-gateway", "zai/glm-5.1"],
  ["groq", "openai/gpt-oss-120b"],
  ["cerebras", "gpt-oss-120b"],
  ["nvidia", "nvidia/nemotron-3-super-120b-a12b"],
  ["radius", "auto"],
  ["huggingface", "moonshotai/Kimi-K2.6"],
  ["fireworks", "accounts/fireworks/models/kimi-k2p6"],
  ["together", "moonshotai/Kimi-K2.6"],
  ["baseten", "zai-org/GLM-5.2"],
  ["qwen-token-plan", "qwen3.7-max"],
  ["qwen-token-plan-cn", "qwen3.7-max"],
  ["qwen-token-plan-individual", "qwen3.8-max"],
  ["xiaomi", "mimo-v2.5-pro"],
  ["xiaomi-token-plan-cn", "mimo-v2.5-pro"],
  ["xiaomi-token-plan-ams", "mimo-v2.5-pro"],
  ["xiaomi-token-plan-sgp", "mimo-v2.5-pro"],
  ["ant-ling", "Ring-2.6-1T"],
  ["amazon-bedrock", "us.anthropic.claude-opus-4-6-v1"],
  ["cloudflare-workers-ai", "@cf/moonshotai/kimi-k2.6"],
  ["cloudflare-ai-gateway", "workers-ai/@cf/moonshotai/kimi-k2.6"],
];

// Thinking-level clamping lives in ./thinking.ts (mirrors pi-ai).

// Resolve the model Pi itself would pick for a fresh session in `cwd`:
// saved settings default first, then per-provider preferred defaults,
// then first available. `availableRaw` is already auth-filtered.
function resolveDefaultModel(availableRaw: any[], settings: any): any | undefined {
  const defaultProvider = settings?.getDefaultProvider?.();
  const defaultModelId = settings?.getDefaultModel?.();
  if (defaultProvider && defaultModelId) {
    const found = availableRaw.find((m) => m.provider === defaultProvider && m.id === defaultModelId);
    if (found) return found;
  }
  for (const [provider, id] of DEFAULT_MODEL_PRIORITY) {
    const match = availableRaw.find((m) => m.provider === provider && m.id === id);
    if (match) return match;
  }
  return availableRaw[0];
}

function resolveDefaultThinkingLevel(defaultModel: any, settings: any): string | null {
  if (!defaultModel) return null;
  const perModel = settings?.getModelThinkingLevel?.(defaultModel.provider, defaultModel.id);
  const level = perModel ?? settings?.getDefaultThinkingLevel?.() ?? "medium";
  return clampThinkingLevel(defaultModel, level);
}

app.get("/api/models", async (req, res) => {
  try {
    const now = Date.now();
    const cwdParam = typeof req.query.cwd === "string" && req.query.cwd.trim() ? req.query.cwd : "";
    const cacheKey = cwdParam ? normalisePath(cwdParam) : "";
    const cached = modelsCache.get(cacheKey);
    if (cached && now - cached.at < MODELS_TTL_MS) {
      // Refresh recency for the LRU cap.
      modelsCache.delete(cacheKey);
      modelsCache.set(cacheKey, cached);
      res.setHeader("Cache-Control", "public, max-age=30");
      return res.json(cached.payload);
    }
    const mr = await getModelRuntime();
    const availableRaw: any[] = (await (mr as any).getAvailable?.()) ?? [];
    // Settings read is two tiny JSON files; never let it fail the request.
    let settings: any = null;
    try {
      settings = SettingsManager.create(cacheKey || os.homedir(), getAgentDir());
    } catch {
      settings = null;
    }
    const defaultRaw = resolveDefaultModel(availableRaw, settings);
    const payload = {
      available: availableRaw.map(serialiseModel),
      error: (mr as any).getError?.() ?? null,
      default: serialiseModel(defaultRaw ?? null),
      defaultThinkingLevel: resolveDefaultThinkingLevel(defaultRaw, settings),
    };
    modelsCache.set(cacheKey, { at: now, payload });
    if (modelsCache.size > MODELS_CACHE_MAX_KEYS) {
      const oldest = modelsCache.keys().next().value as string | undefined;
      if (oldest !== undefined) modelsCache.delete(oldest);
    }
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
    if (entry.activeNav) throw new ApiError("a navigation operation is in progress for this session", 409);

    const promptText = typeof text === "string" && text.trim() ? text : " ";
    const session: any = entry.runtime.session;
    touchRuntime(entry);

    // Undo boundary: the pre-turn leaf is the parent of the turn's user entry
    // in the linear case, so it doubles as the undo target. The file snapshot
    // is a `git stash create` photo. Capture failure never fails the turn.
    const turnBeforeLeaf: string | null = session.sessionManager?.getLeafId?.() ?? null;
    const snapBefore: FileSnapshot = await captureSnapshot(entry.cwd);

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
      try {
        const afterLeaf: string | null = session.sessionManager?.getLeafId?.() ?? null;
        if (afterLeaf !== turnBeforeLeaf) {
          const snapAfter = await captureSnapshot(entry.cwd);
          await recordTurn(entry.sessionFile, {
            kind: "prompt",
            beforeLeaf: turnBeforeLeaf,
            afterLeaf,
            beforeTree: snapBefore.tree,
            afterTree: snapAfter.tree,
            head: snapAfter.head ?? snapBefore.head,
            repoRoot: snapAfter.repoRoot ?? snapBefore.repoRoot,
          });
        }
      } catch {
        // Checkpoint bookkeeping must never fail the turn.
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

// ---- Compaction (M3) ----
// POST /api/compact { sessionFile, cwd?, customInstructions? } -> SSE stream of compaction events
app.post("/api/compact", async (req, res) => {
  const { sessionFile, cwd, customInstructions } = req.body as {
    sessionFile?: string;
    cwd?: string;
    customInstructions?: string;
  };
  try {
    if (!sessionFile) throw new ApiError("missing sessionFile");
    const entry = await getSessionRuntime(sessionFile, cwd);
    const session: any = entry.runtime.session;
    if (session.isCompacting) throw new ApiError("compaction already in progress", 409);
    if (isPromptActive(entry)) throw new ApiError("a prompt is already running for this session", 409);
    if (entry.activeNav) throw new ApiError("a navigation operation is in progress for this session", 409);
    entry.activeNav = true;
    const instructions = typeof customInstructions === "string" ? customInstructions.trim() : undefined;
    // Compaction touches no workspace files: the turn is conversation-only.
    const compactBeforeLeaf: string | null = session.sessionManager?.getLeafId?.() ?? null;
    touchRuntime(entry);
    sseHeaders(res);
    if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();
    let connectionClosed = false;
    const heartbeat = setInterval(() => { if (!connectionClosed) res.write(": ping\n\n"); }, 15_000);
    const off = session.subscribe((event: unknown) => sendSSE(res, event));
    res.on("close", () => { connectionClosed = true; clearInterval(heartbeat); try { off(); } catch {} });
    try {
      const result = await session.compact(instructions || undefined);
      try {
        const afterLeaf: string | null = session.sessionManager?.getLeafId?.() ?? null;
        if (afterLeaf !== compactBeforeLeaf) {
          await recordTurn(entry.sessionFile, {
            kind: "compact",
            beforeLeaf: compactBeforeLeaf,
            afterLeaf,
            beforeTree: null,
            afterTree: null,
            head: null,
            repoRoot: null,
          });
        }
      } catch {
        // Checkpoint bookkeeping must never fail the turn.
      }
      invalidateSessionsCache();
      if (!connectionClosed) {
        sendSSE(res, { type: "done", result });
        res.end();
      }
    } catch (error) {
      if (!connectionClosed) {
        const aborted = (error as Error).name === "AbortError" || String(errorMessage(error)).toLowerCase().includes("cancelled");
        if (aborted) sendSSE(res, { type: "compaction_end", aborted: true });
        sendSSE(res, { type: "error", error: errorMessage(error), aborted });
        res.end();
      }
    } finally {
      clearInterval(heartbeat);
      try { off(); } catch {}
      entry.activeNav = false;
      touchRuntime(entry);
      void cleanupRuntimeRegistry();
    }
  } catch (error) {
    if (!res.headersSent) return res.status(errorStatus(error)).json({ error: errorMessage(error) });
    sendSSE(res, { type: "error", error: errorMessage(error) });
    res.end();
  }
});

app.post("/api/compact/abort", async (req, res) => {
  try {
    const { sessionFile, cwd } = req.body as { sessionFile?: string; cwd?: string };
    if (!sessionFile) throw new ApiError("missing sessionFile");
    const entry = runtimeEntries.get(normalisePath(sessionFile));
    if (!entry) return res.json({ ok: true, active: false });
    if (cwd) assertCwdMatches(entry.cwd, cwd);
    const session: any = entry.runtime.session;
    if (!session.isCompacting) return res.json({ ok: true, active: false });
    touchRuntime(entry);
    try { session.abortCompaction(); } catch {}
    res.json({ ok: true, active: true });
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
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

function invalidateModelsCache() { modelsCache.clear(); }

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

app.get("/api/auth/pi", async (_req, res) => {
  try {
    const mr = await getModelRuntime();
    const creds = await (mr as any).listCredentials?.() ?? [];
    const providers = await Promise.all(
      (creds as Array<{ providerId: string; type: string }>).map(async (c) => {
        let source: string | undefined;
        try {
          const check = await (mr as any).checkAuth?.(c.providerId);
          if (check?.source) source = check.source;
        } catch {}
        const name = (mr as any).getProvider?.(c.providerId)?.name ?? c.providerId;
        return { id: c.providerId, name, type: c.type, source: source ?? null };
      }),
    );
    providers.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ providers });
  } catch (error) { res.status(errorStatus(error)).json({ error: errorMessage(error) }); }
});

app.get("/api/auth/presets", async (_req, res) => {
  try {
    const mr = await getModelRuntime();
    let registered = new Set<string>();
    try {
      registered = new Set<string>((mr as any).getRegisteredProviderIds?.() ?? []);
    } catch {}
    // Pi's builtin catalog (minus Phi's own custom registrations):
    // display names, ids for logos, default base URLs, and which auth
    // methods each provider supports (oauth-only providers like
    // openai-codex must never see the API-key form).
    const presets = (((mr as any).getProviders?.() ?? []) as Array<{ id?: string; name?: string; baseUrl?: string; auth?: { oauth?: { loginLabel?: string }; apiKey?: unknown } }>)
      .filter((p) => p?.id && p?.baseUrl && !registered.has(p.id))
      .map((p) => ({
        id: p.id as string,
        name: p.name ?? (p.id as string),
        baseUrl: p.baseUrl as string,
        oauth: Boolean(p.auth?.oauth),
        apiKey: Boolean(p.auth?.apiKey),
        loginLabel: p.auth?.oauth?.loginLabel ?? null,
      }));
    presets.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ presets });
  } catch (error) { res.status(errorStatus(error)).json({ error: errorMessage(error) }); }
});

// ---- OAuth login sessions ----
// Drives ModelRuntime.login() for oauth-capable providers. The login runs in
// the background: notify() events queue up for polling, prompt() parks until
// the renderer answers. Tokens land in Pi's own auth store; the UI only ever
// sees instructions, codes, and URLs — never secrets.
type OAuthLoginState = {
  id: string;
  providerId: string;
  status: "running" | "done" | "error" | "cancelled";
  events: Array<{ type: string; message?: string; url?: string; instructions?: string; userCode?: string; verificationUri?: string }>;
  prompt: { message: string; placeholder?: string; secret: boolean } | null;
  resolvePrompt: ((value: string) => void) | null;
  rejectPrompt: ((err: Error) => void) | null;
  abort: () => void;
  error: string | null;
  finishedAt: number | null;
};
const oauthLogins = new Map<string, OAuthLoginState>();
const OAUTH_LOGIN_TTL_MS = 5 * 60_000;

function pruneOAuthLogins() {
  const now = Date.now();
  for (const [id, state] of oauthLogins) {
    if (state.finishedAt && now - state.finishedAt > OAUTH_LOGIN_TTL_MS) oauthLogins.delete(id);
  }
  while (oauthLogins.size > 20) {
    const oldest = oauthLogins.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    oauthLogins.delete(oldest);
  }
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { providerId } = req.body as { providerId?: string };
    if (!providerId) throw new ApiError("missing providerId");
    pruneOAuthLogins();
    for (const existing of oauthLogins.values()) {
      if (existing.providerId === providerId && existing.status === "running") {
        throw new ApiError("a sign-in is already in progress for this provider", 409);
      }
    }
    const mr = await getModelRuntime();
    const provider = (mr as any).getProvider?.(providerId);
    if (!provider) throw new ApiError(`unknown provider ${providerId}`, 404);
    if (!provider.auth?.oauth) throw new ApiError(`${providerId} does not support OAuth sign-in`, 400);

    const id = `login_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffff).toString(36)}`;
    const controller = new AbortController();
    const state: OAuthLoginState = {
      id, providerId, status: "running", events: [], prompt: null,
      resolvePrompt: null, rejectPrompt: null,
      abort: () => controller.abort(), error: null, finishedAt: null,
    };
    oauthLogins.set(id, state);

    const interaction = {
      signal: controller.signal,
      notify: (event: any) => {
        if (!event || state.status !== "running") return;
        if (event.type === "auth_url" && event.url) {
          state.events.push({ type: "auth_url", url: event.url, instructions: event.instructions });
        } else if (event.type === "device_code" && event.userCode) {
          state.events.push({ type: "device_code", userCode: event.userCode, verificationUri: event.verificationUri });
        } else if ((event.type === "info" || event.type === "progress") && event.message) {
          state.events.push({ type: event.type, message: event.message });
        }
      },
      prompt: (p: any) =>
        new Promise<string>((resolve, reject) => {
          if (controller.signal.aborted || state.status !== "running") {
            return reject(new Error("sign-in cancelled"));
          }
          // A raced prompt supersedes the parked one (e.g. manual_code
          // losing to a callback server).
          state.rejectPrompt?.(new Error("superseded"));
          state.prompt = { message: p?.message ?? "Enter the code", placeholder: p?.placeholder, secret: p?.type === "secret" };
          state.resolvePrompt = (value: string) => {
            state.prompt = null; state.resolvePrompt = null; state.rejectPrompt = null;
            resolve(value);
          };
          state.rejectPrompt = (err: Error) => {
            state.prompt = null; state.resolvePrompt = null; state.rejectPrompt = null;
            reject(err);
          };
        }),
    };

    void (async () => {
      try {
        await (mr as any).login(providerId, "oauth", interaction);
        state.status = "done";
      } catch (e) {
        const msg = errorMessage(e);
        state.status = controller.signal.aborted || /cancel|abort|superseded/i.test(msg) ? "cancelled" : "error";
        state.error = msg;
      } finally {
        state.prompt = null; state.resolvePrompt = null; state.rejectPrompt = null;
        state.finishedAt = Date.now();
        invalidateModelsCache();
      }
    })();

    res.json({ loginId: id });
  } catch (error) { res.status(errorStatus(error)).json({ error: errorMessage(error) }); }
});

app.get("/api/auth/login/:id", (req, res) => {
  const state = oauthLogins.get(req.params.id);
  if (!state) return res.status(404).json({ error: "sign-in not found" });
  const events = state.events;
  state.events = [];
  res.json({ status: state.status, events, prompt: state.prompt, error: state.error });
});

app.post("/api/auth/login/:id/answer", (req, res) => {
  const state = oauthLogins.get(req.params.id);
  if (!state) return res.status(404).json({ error: "sign-in not found" });
  const { value, cancel } = req.body as { value?: string; cancel?: boolean };
  if (cancel) {
    state.rejectPrompt?.(new Error("sign-in cancelled"));
    state.abort();
    return res.json({ ok: true });
  }
  if (typeof value !== "string" || !state.resolvePrompt) {
    return res.status(409).json({ error: "no prompt awaiting an answer" });
  }
  state.resolvePrompt(value);
  res.json({ ok: true });
});

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
    const invalid = validateProviderInput({ id, label, baseUrl, apiKey });
    if (invalid || !id || !baseUrl || !apiKey) throw new ApiError(invalid ?? "missing id/baseUrl/apiKey");
    const providers = await loadStoredProviders();
    const idx = providers.findIndex((p) => p.id === id);
    const entry: StoredProvider = { id, label: label || id, baseUrl: normalizeProviderBaseUrl(baseUrl), apiKey };
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
    const testInvalid = validateProviderTestInput(baseUrl, apiKey);
    if (testInvalid || !baseUrl || !apiKey) throw new ApiError(testInvalid ?? "missing baseUrl/apiKey");
    const url = `${normalizeProviderBaseUrl(baseUrl)}/models`;
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
    if (entry.activeNav) throw new ApiError("a navigation operation is in progress for this session", 409);
    const session: any = entry.runtime.session;
    touchRuntime(entry);
    const turnBeforeLeaf: string | null = session.sessionManager?.getLeafId?.() ?? null;
    const snapBefore: FileSnapshot = await captureSnapshot(entry.cwd);
    sseHeaders(res);
    if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();
    let connectionClosed = false;
    const heartbeat = setInterval(() => { if (!connectionClosed) res.write(": ping\n\n"); }, 15_000);
    const off = session.subscribe((event: unknown) => sendSSE(res, event));
    res.on("close", () => { connectionClosed = true; clearInterval(heartbeat); try { off(); } catch {} });
    // Try agent-level continue first, fallback to a "Continue" nudge prompt.
    // SDK continue() only resumes when the transcript ends on a user or
    // tool-result message (cut mid tool-loop). After interrupting plain text
    // streaming it ends on assistant, so continue() throws — nudge instead.
    const tryAgentContinue = async () => {
      const agent: any = session.agent;
      const continuer = typeof agent?.continue === "function"
        ? agent.continue.bind(agent)
        : typeof session.continue === "function"
          ? session.continue.bind(session)
          : null;
      if (!continuer) throw new ApiError("continue not supported by this SDK version", 501);
      try {
        return await continuer();
      } catch (err) {
        if (!/cannot continue from message role:\s*assistant/i.test(errorMessage(err))) throw err;
        const prompter = typeof agent?.prompt === "function"
          ? agent.prompt.bind(agent)
          : typeof session.prompt === "function"
            ? session.prompt.bind(session)
            : null;
        if (!prompter) throw err;
        return await prompter("Continue");
      }
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
      try {
        const afterLeaf: string | null = session.sessionManager?.getLeafId?.() ?? null;
        if (afterLeaf !== turnBeforeLeaf) {
          const snapAfter = await captureSnapshot(entry.cwd);
          await recordTurn(entry.sessionFile, {
            kind: "continue",
            beforeLeaf: turnBeforeLeaf,
            afterLeaf,
            beforeTree: snapBefore.tree,
            afterTree: snapAfter.tree,
            head: snapAfter.head ?? snapBefore.head,
            repoRoot: snapAfter.repoRoot ?? snapBefore.repoRoot,
          });
        }
      } catch {
        // Checkpoint bookkeeping must never fail the turn.
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

// ---- Undo / redo ----
// POST /api/undo { sessionFile, cwd? } — files first, conversation second.
// The leaf never moves when the workspace restore fails.
app.post("/api/undo", async (req, res) => {
  try {
    const { sessionFile, cwd } = req.body as { sessionFile?: string; cwd?: string };
    if (!sessionFile) throw new ApiError("missing sessionFile");
    const entry = await getSessionRuntime(sessionFile, cwd);
    assertNavIdle(entry);
    entry.activeNav = true;
    try {
      const session: any = entry.runtime.session;
      const sm = session.sessionManager;
      const curLeaf = sm.getLeafId() as string | null;
      if (!curLeaf) throw new ApiError("nothing to undo", 404);
      const turns = await loadTurns(entry.sessionFile);
      let branchIds = new Set<string>();
      try {
        for (const e of sm.getBranch()) branchIds.add(e.id);
      } catch {
        branchIds = new Set(curLeaf ? [curLeaf] : []);
      }
      const turn = findUndoTurn(turns, branchIds);
      let targetLeaf: string | null | undefined;
      let turnId: string | null = null;
      let filesRestored = false;
      let restoredPaths: string[] = [];
      let conversationOnly = false;
      if (turn) {
        turnId = turn.id;
        targetLeaf = turn.beforeLeaf;
        if (turn.beforeTree && turn.afterTree && turn.repoRoot) {
          const restored = await restoreWorktreeToTree(turn.repoRoot, turn.afterTree, turn.beforeTree);
          filesRestored = true;
          restoredPaths = restored.restoredPaths;
        } else {
          conversationOnly = true;
        }
      } else {
        targetLeaf = undoFallbackTarget(sm);
        if (targetLeaf === undefined) throw new ApiError("nothing to undo", 404);
        conversationOnly = true;
      }
      if (targetLeaf === curLeaf) throw new ApiError("nothing to undo", 404);
      navStateFor(entry.sessionFile).redoStack.push({ leafId: curLeaf, turnId });
      if (targetLeaf === null) sm.resetLeaf();
      else sm.branch(targetLeaf);
      rebuildAgentMessages(session);
      touchRuntime(entry);
      invalidateSessionsCache();
      res.json({
        ok: true,
        nav: { type: "undo", turnId, filesRestored, restoredPaths, conversationOnly },
        ...(await sessionPayload(sessionFile)),
      });
    } finally {
      entry.activeNav = false;
    }
  } catch (error) {
    if (!res.headersSent) return sendNavError(res, error);
  }
});

// POST /api/redo { sessionFile, cwd? } — pops the ephemeral redo stack.
// Unavailable after sidecar restart or runtime eviction; undo still works.
app.post("/api/redo", async (req, res) => {
  try {
    const { sessionFile, cwd } = req.body as { sessionFile?: string; cwd?: string };
    if (!sessionFile) throw new ApiError("missing sessionFile");
    const entry = await getSessionRuntime(sessionFile, cwd);
    assertNavIdle(entry);
    entry.activeNav = true;
    try {
      const stack = navStateFor(entry.sessionFile).redoStack;
      const next = stack.pop();
      if (!next) throw new ApiError("nothing to redo", 404);
      const session: any = entry.runtime.session;
      const sm = session.sessionManager;
      if (!sm.getEntry(next.leafId)) throw new ApiError("redo target no longer exists", 404);
      const turns = await loadTurns(entry.sessionFile);
      const turn = next.turnId ? turns.find((t) => t.id === next.turnId) : undefined;
      let filesRestored = false;
      let restoredPaths: string[] = [];
      let conversationOnly = false;
      try {
        if (turn?.beforeTree && turn?.afterTree && turn?.repoRoot) {
          const restored = await restoreWorktreeToTree(turn.repoRoot, turn.beforeTree, turn.afterTree);
          filesRestored = true;
          restoredPaths = restored.restoredPaths;
        } else {
          conversationOnly = true;
        }
        sm.branch(next.leafId);
        rebuildAgentMessages(session);
      } catch (error) {
        // A failed redo stays redoable so resolving the conflict can retry it.
        stack.push(next);
        throw error;
      }
      touchRuntime(entry);
      invalidateSessionsCache();
      res.json({
        ok: true,
        nav: { type: "redo", turnId: next.turnId, filesRestored, restoredPaths, conversationOnly },
        ...(await sessionPayload(sessionFile)),
      });
    } finally {
      entry.activeNav = false;
    }
  } catch (error) {
    if (!res.headersSent) return sendNavError(res, error);
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

// ---- Skills ----
// Lists every discoverable skill (enabled and disabled) for `cwd`, with the
// name/description Pi parsed from each SKILL.md. Toggling persists Pi's own
// `+pattern` / `-pattern` overrides into settings.json, mirroring the TUI
// config selector, so new sessions pick the change up.
app.get("/api/skills", async (req, res) => {
  try {
    const cwd = normalisePath((req.query.cwd as string) || process.cwd());
    const agentDir = getAgentDir();
    const settings = SettingsManager.create(cwd, agentDir);
    const pm = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
    const resolved = await pm.resolve();
    const entries = resolved.skills ?? [];
    let details = new Map<string, { name: string; description: string; filePath: string }>();
    try {
      const loaded = loadSkills({ cwd, agentDir, skillPaths: entries.map((e) => e.path), includeDefaults: true });
      for (const s of loaded.skills) details.set(normalisePath(s.filePath), s);
    } catch {
      // Name/description enrichment is best effort; paths still list.
    }
    const skills = entries.map((e) => {
      const d = details.get(normalisePath(e.path));
      const fileName = basename(e.path);
      const parent = basename(dirname(e.path));
      return {
        name: d?.name ?? (fileName === "SKILL.md" ? parent : fileName.replace(/\.md$/, "")),
        description: d?.description ?? "",
        filePath: e.path,
        enabled: e.enabled,
        scope: e.metadata.scope,
        origin: e.metadata.origin,
        source: e.metadata.source,
        baseDir: e.metadata.baseDir ?? null,
      };
    });
    skills.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ skills });
  } catch (error) {
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
});

function stripSkillPatternPrefix(pattern: string): string {
  return pattern.startsWith("!") || pattern.startsWith("+") || pattern.startsWith("-") ? pattern.slice(1) : pattern;
}

function toPosixRel(p: string): string {
  return p.replace(/\\/g, "/");
}

app.post("/api/skills/toggle", async (req, res) => {
  try {
    const { path, enabled, cwd: rawCwd } = req.body as { path?: string; enabled?: boolean; cwd?: string };
    if (!path || typeof path !== "string") throw new ApiError("missing path");
    if (typeof enabled !== "boolean") throw new ApiError("missing enabled");
    const cwd = normalisePath(typeof rawCwd === "string" && rawCwd.trim() ? rawCwd : process.cwd());
    const agentDir = getAgentDir();
    const settings = SettingsManager.create(cwd, agentDir);
    const pm = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
    const resolved = await pm.resolve();
    const entry = (resolved.skills ?? []).find((e) => normalisePath(e.path) === normalisePath(path));
    if (!entry) throw new ApiError("skill not found", 404);
    const scope = entry.metadata.scope === "project" ? "project" : "user";
    const topLevelBaseDir = scope === "project" ? joinPath(cwd, CONFIG_DIR_NAME) : agentDir;

    if (entry.metadata.origin === "top-level") {
      const baseDir = entry.metadata.baseDir ?? topLevelBaseDir;
      const pattern = toPosixRel(relative(baseDir, entry.path));
      const current = scope === "project"
        ? [...(settings.getProjectSettings().skills ?? [])]
        : [...(settings.getGlobalSettings().skills ?? [])];
      const updated = current.filter((p) => stripSkillPatternPrefix(p) !== pattern);
      updated.push(`${enabled ? "+" : "-"}${pattern}`);
      if (scope === "project") settings.setProjectSkillPaths(updated);
      else settings.setSkillPaths(updated);
      await settings.flush();
    } else {
      const baseDir = entry.metadata.baseDir ?? dirname(entry.path);
      const pattern = toPosixRel(relative(baseDir, entry.path));
      const current = [...(scope === "project"
        ? (settings.getProjectSettings().packages ?? [])
        : (settings.getGlobalSettings().packages ?? []))];
      const idx = current.findIndex((pkg) => (typeof pkg === "string" ? pkg : pkg.source) === entry.metadata.source);
      if (idx === -1) throw new ApiError("package source is not in settings", 400);
      let pkg = current[idx];
      if (typeof pkg === "string") {
        pkg = { source: pkg };
        current[idx] = pkg;
      }
      const skills = [...((pkg as { skills?: string[] }).skills ?? [])];
      const next = skills.filter((p) => stripSkillPatternPrefix(p) !== pattern);
      next.push(`${enabled ? "+" : "-"}${pattern}`);
      (pkg as { skills?: string[] }).skills = next;
      if (scope === "project") settings.setProjectPackages(current);
      else settings.setPackages(current);
      await settings.flush();
    }
    commandsCache = null;
    res.json({ ok: true, enabled });
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

// ---- Session stats: context usage + cost (composer indicator) ----
// Live runtimes report AgentSession.getSessionStats() (trailing estimates
// included). Evicted sessions fall back to persisted entries + the last
// assistant usage, mirroring the TUI footer math.
function summarizeSessionEntries(entries: any[]) {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, total: 0 };
  const byKey = new Map<string, { cost: number; tokens: number }>();
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;
  let toolResults = 0;
  let totalMessages = 0;
  const add = (usage: any, key: string) => {
    if (!usage) return;
    const input = usage.input || 0;
    const output = usage.output || 0;
    const cacheRead = usage.cacheRead || 0;
    const cacheWrite = usage.cacheWrite || 0;
    const cost = usage.cost?.total || 0;
    const tokens = input + output + cacheRead + cacheWrite;
    totals.input += input;
    totals.output += output;
    totals.cacheRead += cacheRead;
    totals.cacheWrite += cacheWrite;
    totals.cost += cost;
    totals.total += tokens;
    if (tokens > 0 || cost > 0) {
      const cur = byKey.get(key) ?? { cost: 0, tokens: 0 };
      cur.cost += cost;
      cur.tokens += tokens;
      byKey.set(key, cur);
    }
  };
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type === "branch_summary" || entry.type === "compaction") {
      add((entry as any).usage, "Tools/summaries");
      continue;
    }
    if (entry.type !== "message") continue;
    const message: any = (entry as any).message;
    if (!message) continue;
    totalMessages++;
    if (message.role === "user") {
      userMessages++;
    } else if (message.role === "toolResult") {
      toolResults++;
      add(message.usage, "Tools/summaries");
    } else if (message.role === "assistant") {
      assistantMessages++;
      if (Array.isArray(message.content)) {
        toolCalls += message.content.filter((c: any) => c?.type === "toolCall").length;
      }
      add(message.usage, `${message.provider ?? "unknown"}/${message.responseModel ?? message.model ?? "unknown"}`);
    }
  }
  const breakdown = [...byKey.entries()]
    .map(([key, v]) => ({ key, cost: v.cost, tokens: v.tokens }))
    .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  return { totals, breakdown, counts: { userMessages, assistantMessages, toolCalls, toolResults, totalMessages } };
}

function contextTokensOf(usage: any): number {
  if (!usage) return 0;
  if (typeof usage.totalTokens === "number" && usage.totalTokens > 0) return usage.totalTokens;
  return (usage.input || 0) + (usage.output || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0);
}

app.get("/api/session/stats", async (req, res) => {
  try {
    const file = req.query.file as string;
    if (!file) throw new ApiError("missing file query param");
    const key = normalisePath(file);
    const live = runtimeEntries.get(key);
    if (live) {
      touchRuntime(live);
      const session: any = live.runtime.session;
      const stats = session.getSessionStats();
      const { totals, breakdown, counts } = summarizeSessionEntries(session.sessionManager.getEntries());
      return res.json({
        file: live.sessionFile,
        tokens: { input: totals.input, output: totals.output, cacheRead: totals.cacheRead, cacheWrite: totals.cacheWrite, total: totals.total },
        cost: totals.cost,
        contextUsage: stats.contextUsage ?? null,
        breakdown,
        counts,
      });
    }
    try {
      await fs.access(key);
    } catch {
      throw new ApiError("session file does not exist", 404);
    }
    const sm: any = SessionManager.open(key);
    const entries = sm.getEntries();
    const { totals, breakdown, counts } = summarizeSessionEntries(entries);
    let contextWindow = 0;
    try {
      const model = sm.buildSessionContext()?.model as { provider?: string; modelId?: string; id?: string } | null;
      if (model?.provider) {
        const mr = await getModelRuntime();
        const found = (mr as any).getModel?.(model.provider, (model as any).modelId ?? (model as any).id);
        if (found) contextWindow = found.contextWindow ?? 0;
      }
    } catch {
      // Model resolution is best effort; totals still report.
    }
    let contextUsage: { tokens: number | null; contextWindow: number; percent: number | null } | null = null;
    if (contextWindow > 0) {
      let branch: any[] = [];
      try {
        branch = sm.getBranch();
      } catch {
        branch = entries;
      }
      let boundary = -1;
      for (let i = branch.length - 1; i >= 0; i--) {
        if (branch[i]?.type === "compaction") {
          boundary = i;
          break;
        }
      }
      let tokens: number | null = null;
      for (let i = branch.length - 1; i > boundary; i--) {
        const message: any = branch[i]?.type === "message" ? (branch[i] as any).message : null;
        if (!message || message.role !== "assistant") continue;
        if (message.stopReason === "aborted" || message.stopReason === "error") continue;
        const t = contextTokensOf(message.usage);
        if (t > 0) {
          tokens = t;
          break;
        }
      }
      if (tokens != null) {
        contextUsage = { tokens, contextWindow, percent: (tokens / contextWindow) * 100 };
      } else if (boundary >= 0) {
        contextUsage = { tokens: null, contextWindow, percent: null };
      } else {
        contextUsage = { tokens: 0, contextWindow, percent: 0 };
      }
    }
    res.json({
      file: key,
      tokens: { input: totals.input, output: totals.output, cacheRead: totals.cacheRead, cacheWrite: totals.cacheWrite, total: totals.total },
      cost: totals.cost,
      contextUsage,
      breakdown,
      counts,
    });
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
  if (PHI_TOKEN) console.log("[phi sidecar] token auth enabled");
  if (String(rawPort) !== String(PORT)) {
    console.log(`[phi sidecar] note: PORT env/arg ${rawPort} parsed to ${PORT}`);
  }
});
