# Milestone 1 PRD — Phi

## 1. Overview
Fast, clean desktop GUI for the Pi coding agent. Replaces terminal TUI for daily use. No bloat: no diff view, editor, or browser. Just a graphical translation of Pi's built-in features with a focus on browsing and resuming sessions.

Inspired by Codex sidebar grouping, but lighter. Built for personal use first, publishable later.

## 2. Goals
- Feel faster than the TUI for navigation; streaming and interactions feel instant.
- Graphical parity with Pi CLI features, delivered in phases.
- Browse, search, and resume sessions without touching the terminal.
- Stay in sync with Pi CLI — same session files, no second source of truth.

## 3. Non-Goals (V1)
- No file explorer, editor, diff view, or embedded browser.
- No Fork / Clone / Tree navigation (deferred to V2).
- No @-file autocomplete or /-command palette in V1 (deferred).
- No steer / followUp distinction while streaming — single queue behavior.
- No multi-user, remote server, or auth management UI beyond banners.

## 4. Tech Stack
- **Shell:** Tauri (window + OS glue only)
- **Frontend:** Vite + React + plain Tailwind CSS
- **No UI library:** No Radix, no shadcn. Minimal dependencies to keep bundle small and startup fast.
- **Sidecar:** Node.js + Express owning the Pi SDK (`@earendil-works/pi-coding-agent`) — `AgentSession`, `AgentSessionRuntime`, `SessionManager`, `ModelRuntime`. Single local hop over `127.0.0.1` via REST + SSE.
- **Tauri stays thin:** No Rust HTTP server, no session indexing in Rust. Window/drag/icon only; sidecar is a plain Node process.

> Lesson from opencode attempt: 3 hops (WebView → Rust → HTTP → Node → SDK) compound latency. Tauri's WebView is sandboxed with no Node runtime — `pi` SDK needs `node:fs`/`child_process`/`~/.pi` — so direct import in React is impossible. A single `localhost` hop (1–5ms) to an Express sidecar is the minimal fix. No Electron rewrite needed for Alpha.

## 5. Architecture
```
Tauri WebView (Vite + React)  --fetch/SSE-->  Node sidecar (Express)  --in-process-->  Pi SDK
  localhost:1420 / 1420 proxy                 localhost:3001 (dev)                         ~/.pi/agent/sessions
```
- **Sidecar owns the SDK.** `server/index.ts` (Node 20+ ESM) creates `ModelRuntime` and exposes `SessionManager`/`AgentSessionRuntime` over HTTP. React never imports the SDK — WebView has no `fs`/`child_process`.
- **Source of truth:** `~/.pi/agent/sessions/<encoded-cwd>/` JSONL trees, same as Pi CLI. No custom DB, no mirror index. Sidecar is the only process that touches `~/.pi`.
- **Lifecycle:** `AgentSessionRuntime` in sidecar owns `newSession()` / `switchSession()` / `prompt()` / `abort()`. Frontend re-subscribes to SSE stream after each switch (never cache old `session` object).
- **Events streamed via SSE:** `message_update` (text_delta, thinking_delta), `tool_execution_start/update/end`, `turn_start/end`, `agent_start/end` → `res.write(`data: ${JSON.stringify(e)}\n\n`)`. Frontend buffers with `requestAnimationFrame` (16–32ms) to avoid thrash.
- **Dev:** Sidecar runs as plain Node alongside Vite. `bun --watch server/index.ts` + `vite` via `concurrently`; Vite proxies `/api` → `127.0.0.1:3001`. Iterate in browser at `http://localhost:1420` — no Rust needed.
- **Prod (later):** Bundle sidecar with `@yao-pkg/pkg` (or `node:sea`) to `src-tauri/binaries/server-<target-triple>` and spawn via `tauri-plugin-shell` `Command.sidecar()` with a dynamic port arg. Tauri kills it on app close. `externalBin` is deferred — not needed for Alpha.
- **Rust stays thin:** Tauri window config only. No session indexing in Rust unless proven slow at 1000+ sessions.

## 6. UI Structure
### Layout
- **Left sidebar:** Grouped session list (see 6.1)
- **Header:** Thin bar — cwd breadcrumb (decoded `~/projects/foo`) + session name + cost/context indicator
- **Main:** Vertical conversation stream
- **Bottom:** Composer

No right drawer, no dense TUI footer. Chat is the hero.

### 6.1 Sidebar — Session Browser
- Grouped by directory (decoded cwd from Pi's encoded folder name), like Codex.
- Groups collapsible, sorted by recency (mtime) within group.
- Row content: `session name || truncated first user message` + relative time + model dot.
- Search input at top of sidebar filters by name/first message.
- Fallback: flat "Recent" view if grouping feels noisy (toggle).
- Actions V1: `New Session` button at top, hover `...` menu per row → Rename, Delete (with confirm). Uses same trash behavior as CLI when available.
- V2: Fork, Clone, Tree, Export scopes.

### 6.2 Conversation Stream
- Order: User bubble → Thinking (dimmed, collapsible, streams) → Assistant markdown (streams, syntax-highlighted code) → Tool lines.
- Markdown rendering with code highlighting. No card walls.
- **Tool lines:** Minimal inline row — status dot (amber pulsing = running, green = ok, red = error) + icon (file/terminal) + `tool arg` like `read src/app.ts` or `bash npm test` + duration/chevron. Click expands indented output/diff block (scrollable). Sequential calls render as scannable list, no grouping.

### 6.3 Composer
- V1: Styled multiline textarea, image paste support, Send/Stop, model picker pill in composer footer (e.g. `claude-4-sonnet • medium` calling `session.setModel()` / `setThinkingLevel()`).
- Keyboard: Enter to send, Shift+Enter for newline.
- Deferred: @ autocomplete, / commands, steer vs followUp.

### 6.4 Visual Direction
- **Aesthetic:** Linear-inspired — obsession over small details, dense but spacious line-height for chat, bordered not shadowed, intentional minimalism.
- **Theme:** Dark-first for V1. Light mode deferred.
- **Process:** No fixed metrics in spec. Tune fonts, spacing, radius, and density iteratively via hot reload until it feels right.

## 7. Feature Phases
### V1 (ship)
- Sidebar grouped by cwd + search + recency sort
- New / Resume / Rename / Delete
- Chat stream with streaming text + thinking + inline tool lines (expandable)
- Composer + model picker + image paste + abort
- Inline errors + toasts (see §9)

### V1.5
- Export to HTML (reuse Pi's `/export`)
- Flat Recent toggle, collapse state persistence

### V2
- @ file autocomplete, / command palette (extension commands)
- Fork / Clone / Tree navigation with branch summaries
- proper steer/followUp queue UI if needed

## 8. Data Flow (via Express sidecar)
- **List:** `GET /api/sessions?cwd=...` → sidecar `SessionManager.list()` / `listAll()` → decode cwd → render grouped sidebar (recency sort). No cwd decoding in frontend.
- **Open:** `POST /api/sessions/switch { file }` → sidecar `runtime.switchSession(file)` → SSE stream re-attached → render `session.agent.state.messages`.
- **New / Rename / Delete:** `POST /api/sessions/new` → `runtime.newSession()` / `POST /api/sessions/:id/rename` → `appendSessionInfo(name)` / `DELETE /api/sessions/:id` → trash/unlink with confirm dialog.
- **Prompt:** `POST /api/prompt { text, sessionFile, images }` → sidecar `session.prompt(text, { images, streamingBehavior })` → SSE `message_update` deltas → frontend reassembles markdown + thinking + tool lines.
- **Abort / Model:** `POST /api/abort` → `session.abort()` / `POST /api/model` → `setModel()` / `setThinkingLevel()` / `GET /api/models` → `modelRuntime.getAvailable()`.
- **Contract:** All endpoints on `127.0.0.1` only (Vite proxies `/api` in dev; prod uses dynamic port passed as sidecar arg). No Rust IPC for agent data.

## 9. States & Error Handling
- No blocking modals. Preserve fast feel.
- Streaming error: red inline block at end of stream with retry action.
- Auth error: amber banner above composer ("model needs auth — run pi auth") — non-blocking.
- Corrupted/missing session: toast + exclude from list.
- Tool error: red dot on tool line, expanded output shows error.

## 10. Performance Principles
- Fast = feel. Typing, switching sessions, and streaming must be instant; TUI is the baseline, only UI can be blamed.
- **Single local hop:** WebView → `127.0.0.1` Express sidecar (1–5ms) → SDK in-process. No Rust HTTP layer. The 3-hop opencode pattern is the anti-pattern, not 1 hop.
- Plain Tailwind, no heavy component lib.
- Virtualize sidebar list if >200 sessions; buffer `message_update` deltas with `requestAnimationFrame`.
- No spinners on streaming; optimistic updates.

## 11. Distribution
- V1 is local personal tool — sidecar reads `~/.pi` directly, single user, no auth screen, no remote daemon. No `externalBin` bundling yet — dev runs `bun run dev:all` (Vite + Node sidecar, browser iteration).
- Later: stabilize, then publish with website + auto-update (Tauri updater) and bundled sidecar binary (`pkg`/`sea` + `bundle.externalBin` + `plugin-shell`). No scope creep before V1 feels right.

## 12. Open Questions for Build
- Confirm SSE vs. WebSocket for prod (SSE suffices for Alpha — V1 defers steer/followUp; WS needed later for bidirectional abort while streaming).
- Confirm SDK event batching rate → `requestAnimationFrame` buffer to avoid React thrash on fast `text_delta` bursts.
- Decide markdown renderer (e.g. react-markdown + highlight.js to match Pi's own highlighting).
- Verify `SessionManager` cwd encode/decode — delegate entirely to sidecar, don't re-implement in frontend.

## 13. Success Criteria for V1
- Can list and resume any existing Pi session created via CLI (via sidecar `SessionManager`).
- Can start new session, send prompt, see streaming text/thinking/tools inline via SSE, and abort.
- Switching sessions feels instant on a typical `~/.pi/agent/sessions` with <500 sessions (single localhost hop, buffered deltas).
- No Rust backend; minimal JS bundle; sidecar is plain Node + Express in dev, bundled only at publish time.
