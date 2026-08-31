# Pi SDK Usage — Research for Phi

> Source: https://pi.dev/docs/latest/sdk (fetched 2026-08-28), extensions/session-format/rpc docs, plus local `@earendil-works/pi-coding-agent@0.84.3` source in `node_modules` and `examples/sdk/*.ts`.
> Intended as a build reference for Phi's Node sidecar. Phi's Tauri WebView talks to the Express sidecar over localhost; the sidecar owns the Pi SDK and session files.

---

## 1. Mental Model

Pi's SDK runs in-process inside Phi's Node sidecar. The sidecar owns:
- session files on disk (`~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`)
- LLM interaction via `Agent` (`@earendil-works/pi-agent-core`)
- resource discovery (extensions, skills, prompts, `AGENTS.md`, themes)
- model and credential resolution via `ModelRuntime`

The frontend communicates with the sidecar through the REST and SSE endpoints in `server/index.ts`. React does not import the SDK or access the filesystem directly.

Two entry points:

| Need | Use |
|------|-----|
| One session at a time, simple | `createAgentSession()` |
| A persisted session needs new / resume / fork / clone / import behavior | `createAgentSessionRuntime()` + `AgentSessionRuntime` |
| Phi's concurrent session support | One runtime per persisted session file in the Node sidecar |

Phi uses `createAgentSessionRuntime()` in the sidecar. Each persisted session file gets its own runtime entry so sessions can stream concurrently. `ModelRuntime` remains shared across entries.

---

## 2. Minimal Wiring (what Phi Alpha can paste)

```ts
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  modelRuntime,
});

const off = session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("What files are in the current directory?");
off();
session.dispose();
```

`npm install @earendil-works/pi-coding-agent` — SDK ships inside that package, no separate install.

`createAgentSession()` defaults to `DefaultResourceLoader` (discovers project extensions/skills/prompts/context files from `cwd` and global `agentDir`). Pass `resourceLoader` only when you need to override.

---

## 3. `createAgentSession()` — Full Interface

```ts
const { session, extensionsResult, modelFallbackMessage } = await createAgentSession({
  cwd: process.cwd(),          // for DefaultResourceLoader + session dir naming
  agentDir: getAgentDir(),     // default ~/.pi/agent
  model: opus,                 // Model | undefined
  thinkingLevel: "medium",     // off | minimal | low | medium | high | xhigh | max
  scopedModels: [...],         // for Ctrl+P cycling
  modelRuntime,
  tools: ["read","bash"],      // allowlist of built-ins (default: read, bash, edit, write)
  excludeTools: ["ask_question"],
  noTools: "all" | "builtin",  // disable
  customTools: [myTool],       // via defineTool()
  resourceLoader: loader,
  sessionManager: SessionManager.create(cwd),
  settingsManager: SettingsManager.create(),
});
```

Returned `AgentSession`:

```ts
interface AgentSession {
  prompt(text: string, options?: PromptOptions): Promise<void>;
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  sessionFile: string | undefined;
  sessionId: string;
  setModel(model: Model): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  cycleModel(): Promise<ModelCycleResult | undefined>;
  cycleThinkingLevel(): ThinkingLevel | undefined;
  agent: Agent;
  model: Model | undefined;
  thinkingLevel: ThinkingLevel;
  messages: AgentMessage[];
  isStreaming: boolean;
  navigateTree(targetId: string, options?: {...}): Promise<{editorText?: string; cancelled: boolean}>;
  compact(customInstructions?: string): Promise<CompactionResult>;
  abortCompaction(): void;
  abort(): Promise<void>;
  dispose(): void;
}
```

> Also: `session.agent.state` (`messages`, `model`, `thinkingLevel`, `systemPrompt`, `tools`, `streamingMessage`, `errorMessage`), `session.agent.waitForIdle()`, direct `state.messages = [...]` assignment for branching/restoration.

`createAgentSession()` internally uses `DefaultResourceLoader` when no `resourceLoader` is supplied. Supplying a custom loader disables automatic discovery for `cwd`/`agentDir` (they still affect session naming + tool cwd).

---

## 4. `AgentSessionRuntime` — Required for Phi's Sidebar Actions

Use when cwd-bound services must be rebuilt and the active session replaced.

```ts
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

// Replace active session:
await runtime.newSession();
await runtime.switchSession("/path/to/session.jsonl");
await runtime.fork("entry-id");                          // fork before entry
await runtime.fork("entry-id", { position: "at" });     // clone through entry
await runtime.importFromJsonl("/path/to/import.jsonl");
```

**Critical runtime semantics (easy to miss):**
- `runtime.session` **changes** after each replacement — never cache the old reference.
- **Re-subscribe** after every replacement (`session.subscribe` is per-session).
- If using extensions, **re-bind** with `runtime.session.bindExtensions(...)` after replacement.
- `runtime.diagnostics` reports creation issues; replacement failures **throw** (caller handles).
- Pattern from `examples/sdk/13-session-runtime.ts`:

```ts
let unsubscribe: (() => void) | undefined;
async function bindSession() {
  unsubscribe?.();
  const s = runtime.session;
  await s.bindExtensions({});
  unsubscribe = s.subscribe((e) => { /* ... */ });
  return s;
}
let session = await bindSession();
await runtime.newSession();
session = await bindSession();
```

Phi should centralize this in a `usePiRuntime` hook / Zustand store and ensure every `switchSession`/`newSession` tears down and re-attaches listeners.

---

## 5. Prompting, Queueing, Images

```ts
interface PromptOptions {
  expandPromptTemplates?: boolean;
  images?: ImageContent[];                 // { type:"image", source:{ type:"base64", mediaType, data } }
  streamingBehavior?: "steer" | "followUp";
  source?: InputSource;
  preflightResult?: (success: boolean) => void; // true = accepted/queued, false = rejected preflight
}
```

- Extension commands (`/cmd`) execute immediately even while streaming (they call `pi.sendMessage()` themselves).
- File-based prompt templates (`.md`) are expanded before send/queue.
- **While streaming, `prompt()` without `streamingBehavior` throws.** Provide `"steer"` or `"followUp"` or call `steer()`/`followUp()` directly.
- `steer` = delivered after current assistant turn's tool calls, before next LLM call.
- `followUp` = delivered only when agent fully stops.
- Both `steer`/`followUp` expand templates but **error on extension commands**.
- `preflightResult` fires **before** `prompt()` resolves; `prompt()` still waits for full run (including retries). Post-acceptance failures surface via events/messages, not `preflightResult(false)`.

Image paste for Phi composer (V1 roadmap):

```ts
await session.prompt("What's in this image?", {
  images: [{ type: "image", source: { type: "base64", mediaType: "image/png", data: base64 } }]
});
```

PRD says V1 has *single queue behavior, no steer/followUp distinction* — Phi can expose only one button/path and map it to `"followUp"` (or always queue with `followUp`), and defer the two-mode toggle to V2.

---

## 6. Events — What to Subscribe To

`session.subscribe(event => ...)` returns an unsubscribe fn. Event union:

**Streaming:**
- `message_update` — inspect `event.assistantMessageEvent.type`: `text_delta` | `thinking_delta` | `text_start/text_end` | `thinking_start/thinking_end` | `toolcall_start/delta/end`. For Phi: render `text_delta` into markdown, `thinking_delta` into dimmed collapsible, toolcall deltas can be ignored (tool lines come from tool_execution events).
- `message_start` / `message_end`
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end` (`toolName`, `args`/`toolCallId`, `partialResult` accumulated, `result`, `isError` — use `toolCallId` to correlate)
- `turn_start` / `turn_end` (`message`, `toolResults`)
- `agent_start` / `agent_end` (`messages`, `willRetry`) / `agent_settled` (fully idle)

**Queues / lifecycle:**
- `queue_update` (`steering`, `followUp` arrays)
- `compaction_start/end`, `auto_retry_start/end`, `summarization_retry_*`

For React: batch `message_update` deltas — doc calls out to "confirm SDK event batching rate to avoid render thrashing." Use `requestAnimationFrame` or a 16-32ms buffer before `setState`.

Phi needs at minimum: `message_update` (text_delta + thinking_delta), `tool_execution_*`, `turn_*`, `agent_start/end`, `queue_update`, and `compaction_*` for banners.

---

## 7. Session Management — Deep Dive (for Sidebar)

### SessionManager factories

```ts
SessionManager.create(cwd, sessionDir?)        // new persisted session
SessionManager.open(path, sessionDir?)         // open specific file
SessionManager.continueRecent(cwd, sessionDir?)// most recent or create new → { session, modelFallbackMessage }
SessionManager.inMemory(cwd?)                  // no disk
SessionManager.forkFrom(sourcePath, targetCwd, sessionDir?)

SessionManager.list(cwd, sessionDir?, onProgress?)  // current project only
SessionManager.listAll(onProgress?)                  // all projects
```

Files on disk: `~/.pi/agent/sessions/--<cwd-with-/-as--->/<timestamp>_<uuid>.jsonl`

### Instance API (tree)

```ts
sm.getEntries()                        // all entries excl. header
sm.getTree()                           // full tree { entry, children, label? }
sm.getPath()                           // root → leaf
sm.getLeafEntry() / getLeafId() / getEntry(id) / getChildren(id) / getLabel(id)
sm.branch(entryId)
sm.branchWithSummary(id, summary)
sm.createBranchedSession(leafId)       // extract branch to new file
sm.appendLabelChange(id, label)
sm.appendMessage(msg) / appendCompaction(...) / appendCustomEntry(...) etc.
sm.buildContextEntries()               // active branch with compaction applied
sm.buildSessionContext()               // { messages, thinkingLevel, model } for LLM
sm.getSessionName() / getCwd() / getSessionDir() / getSessionFile() / isPersisted()
```

### Session JSONL format (tree, v3)

Each line is an entry with `id` (8-hex), `parentId` (`null` for first), `timestamp` (ISO), `type`:

- `session` header: `{ type:"session", version:3, id, cwd, parentSession? }`
- `message`: `{ message: AgentMessage }` (see `AgentMessage` union below)
- `model_change`, `thinking_level_change`, `compaction` (with `summary`, `tokensBefore`, optional `retainedTail`, `usage`), `branch_summary`, `custom`, `custom_message`, `label`, `session_info` (`name`)

Tree: later entries point at `parentId`; branching adds children off earlier node. `buildContextEntries()` walks leaf→root honoring compaction (`retainedTail` checkpoint). `AgentMessage` roles: `user` | `assistant` | `toolResult` | `bashExecution` | `custom` | `branchSummary` | `compactionSummary`.

**For Phi sidebar grouping (§6.1):**
- Decode cwd from the encoded folder name (`--` → `/`). Doc open question: "ensure decode matches Pi's encoding exactly" — inspect `getAgentDir()` + `SessionManager.list` `sessionDir` logic; do **not** re-implement encoding.
- `SessionManager.list(cwd)` already decodes/filters by project; `listAll()` for grouped view.
- Row content PRD wants: `session name || truncated first user message` + relative time + model dot. Source: `sm.getSessionName()` else first `UserMessage` text, `header.timestamp` or entry timestamp for relative time, `model` from `buildSessionContext()` or `model_change` entries. Groups collapsible, sorted by `mtime` recency within group.
- Search: filter by `name`/`firstMessage` client-side.
- Actions: `New Session` → `runtime.newSession()`, Rename → `sm.appendSessionInfo(name)` / `session_info` entry, Delete → delete `.jsonl` file (use `trash` when available, same as CLI), confirm dialog.

---

## 8. Model & Auth

```ts
import { getModel } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create(); // restores cached catalogs, no network by default
const refreshed = await ModelRuntime.create({ allowModelNetwork: true, modelRefreshTimeoutMs: 15_000 });

const opus = getModel("anthropic","claude-opus-4-5");
const custom = modelRuntime.getModel("my-provider","my-model");
const available = await modelRuntime.getAvailable(); // only auth'd

const { session } = await createAgentSession({
  model: opus,
  thinkingLevel: "medium",
  scopedModels: [{ model: opus, thinkingLevel:"high"}],
  modelRuntime,
});
```

Fallback chain: session-stored model → settings default → first available.

Resolver helpers matching CLI parsing:

```ts
import { resolveCliModel, resolveModelScopeWithDiagnostics } from "@earendil-works/pi-coding-agent";
const cli = resolveCliModel({ cliModel:"anthropic/claude-opus-4-5:high", modelRuntime });
const { scopedModels, diagnostics } = await resolveModelScopeWithDiagnostics(["anthropic/*:high","gpt-5"], modelRuntime);
```

Catalogs persist to `~/.pi/agent/models-store.json` (override via `modelsStorePath`/`modelsStore`). Throttled 4h unless `force:true`. `PI_OFFLINE=1` disables network. `modelRuntime.refresh({ allowNetwork:true, force:true, signal })` for manual refresh (supports `AbortSignal.timeout(15000)`).

Auth priority: `setRuntimeApiKey` (temp, not persisted) > `~/.pi/agent/auth.json` > env (`ANTHROPIC_API_KEY` etc.) > fallback resolver from `models.json`.

```ts
for (const p of modelRuntime.getProviders()) console.log(p.name, p.auth, await modelRuntime.checkAuth(p.id));
await modelRuntime.setRuntimeApiKey("anthropic","sk-...");
const rt2 = await ModelRuntime.create({ authPath:"/my/app/auth.json", modelsPath:"/my/app/models.json" });
const rt3 = await ModelRuntime.create({ credentials: new InMemoryCredentialStore() });
```

`login/logout/setRuntimeApiKey/removeRuntimeApiKey` reject with `CredentialSynchronizationError` (`providerId`,`operation`,`credential`,`cause`) on local sync failure — don't blindly retry mutation.

Phi V1 composer pill (`claude-4-sonnet • medium`) calls `session.setModel()` / `session.setThinkingLevel()`; `cycleModel()`/`cycleThinkingLevel()` for hotkeys if desired.

---

## 9. SettingsManager

```ts
import { SettingsManager } from "@earendil-works/pi-coding-agent";
const sm = SettingsManager.create(cwd?, agentDir?); // merges ~/.pi/agent/settings.json + <cwd>/.pi/settings.json
sm.applyOverrides({ compaction:{enabled:false}, retry:{enabled:true, maxRetries:5} });
await sm.flush();        // durability boundary before exit/assert
sm.drainErrors();        // surface async persistence errors (manager never prints)

const mem = SettingsManager.inMemory({ compaction:{enabled:false} });
const custom = SettingsManager.create("/custom/cwd","/custom/agent");
```

Getters/setters are sync; persistence is async-enqueued. Phi likely doesn't need custom `SettingsManager` in Alpha — default merged settings are fine. Use `InMemory` only for tests.

---

## 10. Tools

Built-ins: `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, `ls`. Default: `read, bash, edit, write`.

```ts
await createAgentSession({ tools:["read","grep","find","ls"] });
await createAgentSession({ tools:["read","bash","grep"] });
await createAgentSession({ excludeTools:["ask_question"] });
await createAgentSession({ noTools:"all" });      // disable all
await createAgentSession({ noTools:"builtin" });  // keep extension/custom
```

Custom tool:

```ts
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
const myTool = defineTool({
  name:"my_tool", label:"My Tool", description:"...",
  parameters: Type.Object({ input: Type.String() }),
  execute: async (toolCallId, params) => ({
    content:[{ type:"text", text:`Result:${params.input}` }],
    details:{}
  })
});
await createAgentSession({ customTools:[myTool] });
```

If you pass `tools` allowlist, **include** custom/extension tool names explicitly (`tools:["read","bash","my_tool"]`). `edit` returns `details.patch` (unified) for SDK consumers and `details.diff` for TUI.

With custom `cwd`, built-ins are built for that cwd automatically.

---

## 11. ResourceLoader / Extensions / Skills / Context

`DefaultResourceLoader` discovers extensions (`~/.pi/agent/extensions/`, `.pi/extensions/`), skills (`.pi/skills/`, `.agents/skills/` walking up to git root), prompts (`.pi/prompts/`), context (`AGENTS.md` walk), themes.

```ts
import { DefaultResourceLoader, getAgentDir, createEventBus } from "@earendil-works/pi-coding-agent";
const loader = new DefaultResourceLoader({
  cwd, agentDir:getAgentDir(), settingsManager,
  additionalExtensionPaths:["/path/to/ext.ts"],
  extensionFactories:[ (pi)=>{ pi.on("agent_start",()=>{}) } ],
  systemPromptOverride:()=> "You are ...",
  skillsOverride: (cur)=> ({ skills:[...cur.skills, mySkill], diagnostics:cur.diagnostics }),
  agentsFilesOverride:(cur)=> ({ agentsFiles:[...cur.agentsFiles, {path:"/virtual/AGENTS.md", content:"# ..."}]}),
  promptsOverride:(cur)=> ({ prompts:[...cur.prompts, myPrompt], diagnostics:cur.diagnostics }),
  eventBus,
});
await loader.reload();
loader.getExtensions(); loader.getSkills(); loader.getPrompts(); loader.getThemes(); loader.getAgentsFiles();

// Named inline extension so startup list shows <inline:my-provider> not <inline:1>
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
const ext: InlineExtension = { name:"my-provider", factory:(pi)=>{} };
```

`createAgentSession` return value includes `extensionsResult: { extensions, errors, runtime }`.

Full inline example from `examples/sdk/12-full-control.ts` — build a minimal `ResourceLoader` that returns empty arrays and a static system prompt to bypass all discovery (useful for Phi if you ever want "no extensions" mode). Otherwise just omit `resourceLoader` and get discovery for free.

---

## 12. Phi-Specific Implementation Notes

**Current Phi wiring:**
- Keep Tauri thin. Rust spawns the sidecar and exposes its selected port; it does not index sessions or serve agent requests.
- The Node sidecar creates one `AgentSessionRuntime` per persisted session file and shares one `ModelRuntime` for model discovery and credentials.
- React calls the sidecar over REST and SSE. It never imports the SDK or accesses `~/.pi` directly.
- The frontend keeps transient stream state keyed by session file, so switching sessions does not stop background prompts.
- When a runtime is evicted, the sidecar reloads it from the persisted session file when needed.
- Render pipeline (§6.2): `User bubble` → `Thinking` (dimmed collapsible from `thinking_delta`) → `Assistant markdown` (stream `text_delta`, highlight code) → `Tool lines` (inline row: amber pulsing/green/red dot + icon + `tool arg` + duration/chevron; expand = indented scrollable output). Sequential tool calls are a flat list.
- Composer (§6.3): textarea `Enter`→send, `Shift+Enter`→newline. Image paste → base64 → `prompt(...,{images})`. Model pill → `session.setModel()` / `setThinkingLevel()`. `Stop` → `session.abort()`.
- Sidebar (§6.1): `SessionManager.listAll()` → decode cwd → group collapse + recency sort + search filter. Row: `name || firstUserMessage` + relative time + model dot.

**Error banners (§9):** non-blocking — amber banner above composer for auth, red inline block + retry for streaming error, toast + exclude for corrupted session entry.

**Performance:** direct SDK→React, plain Tailwind, virtualize sidebar if >200 sessions, optimistic updates, no spinner on streaming.

---

## 13. Alternatives & When Not to Use SDK

- **RPC mode** (`pi --mode rpc --no-session` + JSONL over stdin/stdout) is the subprocess-based alternative for non-Node integrations — prefer SDK when in same Node process and type safety is wanted.
- `InteractiveMode`, `runPrintMode`, `runRpcMode` are wrappers atop `createAgentSessionRuntime` for building full TUI/print/RPC shells — Phi does **not** need them.

---

## 14. Exported Surface (for lookup)

```
createAgentSession, createAgentSessionRuntime, AgentSessionRuntime,
ModelRuntime, ModelRegistry, CredentialSynchronizationError,
resolveCliModel, resolveModelScopeWithDiagnostics,
DefaultResourceLoader, createEventBus, ResourceLoader,
defineTool, getAgentDir, getPackageDir, getReadmePath, getDocsPath, getExamplesPath,
SessionManager, SettingsManager,
createCodingTools, createReadOnlyTools, createReadTool, createBashTool, ...
CONFIG_DIR_NAME
+ types: CreateAgentSessionOptions, CreateAgentSessionResult, ExtensionFactory, InlineExtension, ExtensionAPI, ToolDefinition, Skill, PromptTemplate
```

The SDK's extension event lifecycle includes `project_trust`, `session_start`, `input`, `before_agent_start`, `agent_start`, `turn_start`, `tool_call`, `tool_result`, `turn_end`, `agent_end`, and `agent_settled`, plus session switch, fork, compact, and tree events.

---

## 15. Local Examples to Copy

- `examples/sdk/01-minimal.ts` — smallest session
- `02-custom-model.ts` — model selection
- `05-tools.ts` — tool allowlist with custom cwd
- `11-sessions.ts` — list/open/continue
- `12-full-control.ts` — custom ResourceLoader, no discovery
- `13-session-runtime.ts` — the `bindSession()` re-subscribe pattern (Phi must follow)

All under `node_modules/@earendil-works/pi-coding-agent/examples/sdk/`.

