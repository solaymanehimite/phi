# Milestone 2 PRD — Polish, Resilience & Settings

> **Delta PRD.** Assumes Milestone 1 (§1–13) unchanged. Only deltas and new scope are specified below. Stack, architecture, and distribution (§4–5, §11) stay as in M1 unless noted in §6.

## 1. Overview
M2 turns Phi from a functional M1 into a shippable daily driver. Three bets: **Linear-grade polish & fluidity**, **resilience to errors and accidental quit**, and a **Settings surface** that unlocks light theme, theme playground, and self-serve provider auth. Plus two QoL gaps that M1 left open: **keyboard shortcuts** and **draft autosave**.

Timebox: **3–4 weeks**. Small QoL/animation steering is allowed inside §2; no big feature may be added without triage. Bar for speed is the **TUI** (switch, input, streaming must feel instant), bar for design is **Linear** (austere, bordered not shadowed, obsessed with details — Linear-like, not a Linear clone).

## 2. Goals
- Feel as fast as the TUI while looking Linear-grade (no "web app sluggish" tell).
- Survive the two most painful failures today: sidecar unreachable and accidental quit mid-stream.
- Let the user configure Phi without touching the terminal: theme + auth.
- Close the keyboard-driven loop (new/close/delete, focus pickers) and never lose a draft.

## 3. Non-Goals
Explicitly deferred — do **not** build in M2:

- Keybindings editor (ships fixed shortcuts only; editable bindings only when shortcuts >15)
- Persisted custom themes (playground is preview-only; no "Save as theme")
- File explorer, diff view, embedded browser, Fork/Clone/Tree
- @-file autocomplete, /-command palette
- Rust session indexing (sidecar remains the only process that touches `~/.pi`)

Steering rule: **small animations or QoL tweaks may steer inside §2** (they replace, not add to, the motion budget). **Big features above may not.**

## 4. Design & Fluidity — Linear-Grade Polish

### 4.1 Token Audit (first task)
M1's `@theme` in `src/App.css` has ~38 `--color-phi-*` tokens (Background 8, Text 9, Border 4, Overlay 7, Input 4, Status 5, Thinking 6). Audit before adding light:

- **GC pass:** spin a one-off agent to find every hardcoded color (hex/rgb/hsl outside `App.css`) and replace with the nearest semantic token. Zero hardcoded colors is exit criteria.
- **Merge pass:** collapse tokens that serve the same purpose (e.g., `bg-app/bg-main/bg-sidebar` if visually indistinguishable, `border` 4→2, `overlay` 6→3). Target **~24–28 tokens** after merge, keep `phi-*` prefix, add aliases where ergonomic. Document merges in a PR description, not in this PRD.
- Then hand-design the **light** set 1:1 for the reduced set (WCAG AA). Do not auto-invert dark.

### 4.2 Motion & Microinteractions
Today only 3 `Disclosure` components animate. Add a **small motion system**, intentionally limited:

- **Budgeted motions:** Sidebar collapse/expand, tab add/close, streaming work-item stagger/cursor, composer focus. Each respects `prefers-reduced-motion`. No separate spec for durations/easings in this PRD — tune via hot reload against Linear inspiration; record final values in `App.css` comments.
- **Message send:** keep optimistic insertion; streaming itself is the motion — no extra send animation needed, but microinteractions (hover bg/border shifts, not scale) are allowed if they replace rather than pile on.
- **Principle:** animate layout, not content. 150–220ms is the expected range but not a contract.

### 4.3 Polish Exit Criteria
- No hardcoded colors (`rg` search clean).
- Light/Dark/System all pass contrast, no flash on switch.
- Session switch, typing, and streaming still feel instant (TUI parity, no regression vs M1).
- No animation jank in the 4 budgeted motions; reduced-motion respected.

## 5. Error Handling & Session Resilience

### 5.1 Two-Tier Error Model
- **Inline (session) errors** — persisted as the **tail node** of the affected session's conversation. Covers: `Abort`, `Interruption`, `Auth` (bad key), `Rate limit`, `Provider down`. Rendered as an **inline error block** (`⚠ {reason} · {time}` + `Continue` primary + `Dismiss` ghost + `Copy error`). Clicking `Continue` resumes the aborted turn (see §6.1). Sending a new prompt archives the block (stays in history, visually de-emphasized). Auth errors **move** from the current top banner into this inline block so the user sees which message failed.
- **Fatal (app/server) errors** — when `GET /api/health` or any sidecar hop fails, the app **does not render the session UI**. Show a **full-window Fatal State** (before or instead of `App`) with copy `Cannot reach Phi sidecar`, `Retry`, and `Show diagnostics` (port, `~/.pi` path). Poll every ~3s + manual Retry. No sidebar, no composer underneath.

Tool errors stay as today: red dot on `ToolLine`, expanded output.

### 5.2 Accidental Quit & Continuation
- **Quit guard:** intercept Tauri `close-requested` + `beforeunload`. If `runningFiles.size > 0` (any tab streaming), show native confirm: `"{n} session(s) streaming — abort and quit?"`. On confirm, `abort()` all running then allow close. Force quit / SIGKILL cannot be blocked — best effort; sidecar's idle GC (20m) reclaims the draft runtime.
- **Auto-abort + inline memory:** guard confirm → abort path persists as an inline `Interruption` block, so returning to the session shows what was lost.
- **Continue:** new `Continue` button on inline abort/interruption blocks. Behavior matches `pi continue` — resumes generation from checkpoint, not re-sends the prompt. If the SDK cannot continue a given stop reason, `Continue` is disabled with tooltip.

## 6. Settings

### 6.1 IA
Settings is a **dedicated route/modal with tabs**, opened via `Cmd/Ctrl+,`. M2 ships **two tabs only**:

- **Appearance**
- **Providers / Auth**

No General/Advanced bloat in M2. Persist to `localStorage` + `prefers-color-scheme` fallback. No Rust store.

### 6.2 Appearance
- **Theme switcher:** segmented control `[Light][Dark][System]` at top, persisted to `localStorage` via `data-theme` attr on `html`. System follows `prefers-color-scheme`. No flash on load (read before React mount).
- **Playground (temporary preview):** collapsible `Advanced → Open Theme Playground` = promoted `src/components/dev/ThemeEditor.tsx`. Mutates currently-applied tokens via `document.documentElement.style` for **preview only**. Labeled `Preview — resets on reload`. Actions: `Reset` + `Export JSON` + `Copy`. **No "Save as custom theme"** in M2. Keeps light/dark canonical.

### 6.3 Providers / Auth
- **Scope M2:** only **OpenAI-compatible providers** defined as `{ id, label, baseUrl, apiKey }` (reuses `URL + API key`). Later milestones add Anthropic/others.
- **Storage:** OS keychain via Tauri `plugin-stronghold`/`keychain` where available, fallback to `~/.config/phi/auth.json` with `0400` perms. **Never** `localStorage` for keys.
- **UX:** per-provider row with masked key, Show/Hide, `Test connection` (validates via `GET {baseUrl}/models` with bearer), inline error. App-local, **additive** to `pi` CLI auth — does not write back to `~/.pi` auth files in M2. `ModelRuntime` merges GUI providers with CLI-available models.
- **Validation:** on Save, test connection must pass before the provider appears in `ModelSelector`. `GET /api/models` cache TTL (30s) is invalidated on provider change.

## 7. Shortcuts & Drafts

### 7.1 Keyboard Shortcuts (fixed, no editor)
Ship 6 shortcuts + existing `Cmd+K` session command:

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+N` | New chat |
| `Cmd/Ctrl+W` | Close current tab (respects single-new-chat guard) |
| `Cmd/Ctrl+Shift+Backspace` | Delete current session (with confirm) |
| `Cmd/Ctrl+P` | Focus project `DirectoryPicker` |
| `Cmd/Ctrl+K` | Open session command (existing) |
| `Cmd/Ctrl+,` | Open Settings |
| `Esc` | Abort if streaming, otherwise no-op (do not clear composer) |

`Enter` to send stays as today; no `Cmd+Enter` needed. Avoid conflicts with browser/Tauri defaults. Shortcuts are discoverable via tooltip + Settings footer.

### 7.2 Draft Autosave
- **Scope:** per-session (`phi:draft:{sessionFile}`) + single new-chat (`phi:draft:new`). Debounce **~350ms** on composer change.
- **Indicator:** subtle **text cursor icon** (e.g., `⌶`/`▎`) immediately next to the session name in the **tab** and corresponding **sidebar row**. Not obstructive, no italic, no dot.
- **Lifecycle:** clear on successful `prompt`, keep on abort/interruption. Expire after **14 days**, ignore empty/whitespace-only. Never sync to `~/.pi` — local only. Must survive reload and session switch.

## 8. Data Flow Deltas (via Express sidecar)

M1 contract is `127.0.0.1` REST + SSE via `server/index.ts`. M2 adds:

- **Health gate:** `GET /api/health` polled by the fatal gate before `App` mounts. Existing endpoint, new consumer.
- **Continue:** `POST /api/continue { sessionFile }` → `session.continue()` (or re-`prompt` with SDK's continue flag). Validate `sessionFile` + cwd match as for `POST /api/prompt`. New SSE stream, same `message_update` buffering. If SDK lacks a continue primitive, PRD task is to add it behind this endpoint — do not mock in frontend.
- **Providers:** `GET /api/auth/providers` (list without keys) / `POST /api/auth/providers` (upsert, writes keychain) / `DELETE /api/auth/providers/:id` / `POST /api/auth/providers/:id/test` → `GET {baseUrl}/models` with bearer. Invalidate `modelsCache` on mutation.
- **Theme:** no backend — `localStorage` only. Playground mutations are DOM-only.

No Rust IPC for agent data. Sidecar bundling via `externalBin` (`src-tauri/binaries/server-*` + `tauri-plugin-shell`) is already implemented — keep and use for production builds.

## 9. States & Empty States
- New-chat empty state keeps centered `Build, Fix and Ship` hero.
- Fatal state (see §5.1) is the only full-window replacement.
- Sidebar draft icon (cursor) is the only new row adornment; keep row layout as in M1 (name/firstMessage + time + model dot).

## 10. Performance Principles
Same as M1 §10: single local hop (1–5ms), plain Tailwind, virtualize sidebar if >200, buffer `message_update` with `requestAnimationFrame`, optimistic composer updates. Light theme must not regress these.

## 11. Distribution
Same as M1 §11: local personal tool, no auth screen, no remote daemon. Sidecar bundling via `externalBin` is already implemented (`src-tauri/binaries/server-*`) — use it for production builds; dev still iterates via `bun run dev:all` at `http://localhost:1420`.

## 12. Success Criteria for M2
- Token audit clean: zero hardcoded colors, reduced set shipped, light/dark/system all AA and toggle without flash.
- 4 budgeted motions ship, respect reduced-motion, no jank.
- Fatal gate renders on sidecar down with retry; inline abort/interruption block persists with working `Continue`.
- Quit guard intercepts close when streaming, aborts and shows inline block on return.
- Settings route with Appearance (theme switcher + preview playground with Export) and Providers/Auth (URL+key, keychain, Test connection) ships; no placeholder tabs.
- 6 fixed shortcuts + Esc-abort work; draft autosaves per session/new-chat, shows cursor icon in tab+sidebar, survives reload, expires after 14d.
- No regression on M1 criteria: list/resume any Pi CLI session, streaming via SSE, instant switch on <500 sessions.
