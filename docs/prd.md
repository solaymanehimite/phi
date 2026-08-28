# PRD — Pi GUI Client

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
- **Agent:** Pi SDK directly (`@earendil-works/pi-coding-agent`) — `AgentSession`, `AgentSessionRuntime`, `SessionManager`, `ModelRuntime`
- **No custom backend:** No Rust HTTP server, no Node sidecar. React calls SDK directly to avoid hop latency.

> Lesson from opencode attempt: extra layers (Rust → HTTP → server → SDK) compound latency. Direct SDK → React is required.

## 5. Architecture
- Frontend imports SDK. `SessionManager.create(cwd)` is source of truth for listing sessions.
- Sessions stored where Pi stores them: `~/.pi/agent/sessions/<encoded-cwd>/` as JSONL tree files. No custom DB, no mirror index.
- `AgentSessionRuntime` owns lifecycle: `newSession()`, `switchSession()`, `prompt()`, `abort()`. Re-subscribe to events after session switches.
- Subscribe to SDK events: `message_update` (text_delta, thinking_delta), `tool_execution_start/update/end`, `turn_start/end`, `agent_start/end`.
- Rust only for Tauri window config. No session indexing in Rust unless proven slow at 1000+ sessions.

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

## 8. Data Flow
- List: `SessionManager` → decode cwd → render groups.
- Open: `runtime.switchSession(id)` → subscribe to new `session` events → render `session.agent.state.messages`.
- Prompt: `session.prompt(text, { images? })` → stream via `subscribe`.
- Abort: `session.abort()`.

## 9. States & Error Handling
- No blocking modals. Preserve fast feel.
- Streaming error: red inline block at end of stream with retry action.
- Auth error: amber banner above composer ("model needs auth — run pi auth") — non-blocking.
- Corrupted/missing session: toast + exclude from list.
- Tool error: red dot on tool line, expanded output shows error.

## 10. Performance Principles
- Fast = feel. Typing, switching sessions, and streaming must be instant; TUI is the baseline, only UI can be blamed.
- Direct SDK → React, no backend hops.
- Plain Tailwind, no heavy component lib.
- Virtualize sidebar list if >200 sessions.
- No spinners on streaming; optimistic updates.

## 11. Distribution
- V1 is local personal tool — reads `~/.pi` directly, single user, no auth screen, no remote daemon.
- Later: stabilize, then publish with website + auto-update (Tauri updater). No scope creep before V1 feels right.

## 12. Open Questions for Build
- Confirm SDK event batching rate to avoid React render thrashing during fast deltas.
- Decide markdown renderer (e.g. react-markdown + highlight.js to match Pi's own highlighting).
- File for `getAgentDir()` discovery when grouping — ensure decode matches Pi's encoding exactly.

## 13. Success Criteria for V1
- Can list and resume any existing Pi session created via CLI.
- Can start new session, send prompt, see streaming text/thinking/tools inline, and abort.
- Switching sessions feels instant on a typical `~/.pi/agent/sessions` with <500 sessions.
- No Rust backend, no HTTP layer, minimal JS bundle.
