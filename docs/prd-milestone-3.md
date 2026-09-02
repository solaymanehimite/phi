# Milestone 3 PRD — Control, Awareness & Curation

> **Delta PRD.** Assumes Milestone 1 (§1–13) and Milestone 2 (polish, resilience, settings) unchanged. Only deltas and new scope are specified below. Stack, architecture, and distribution (§4–5, §11 of M1) stay as in M1/M2 unless noted in §4–5 here.

> **Status: Draft — ready for build.** No waivers. All sections are build-required. Steering rule from M2 still applies: small QoL or animation tweaks may replace within the motion budget; no big feature may be added without triage. One new exception: **queuing & steering (§11) may touch the prompt path and add one local queue store** — this is explicitly in-scope.

---

## 1. Overview

M3 turns Phi from a polished single-stream viewer into a **controlled cockpit**. Three bets:

1. **Awareness** — you always know what the agent is doing, how much context you have burned, and what work just cost.
2. **Inspectability** — every tool call is a first-class object: its intent is readable at a glance, its output is expandable, copyable, and its paths are actionable.
3. **Control** — you never lose a thought mid-stream. Queuing & steering, compaction, and sane scroll/search let you drive the model instead of waiting for it.

The most important single feature is **Queuing & Steering (§11)**. Everything else is sequenced around it but ships together as one milestone. Home is redesigned to teach the product on first load.

Timebox: **4–6 weeks**. If time is tight, cut in this order (last cut first): starter prompts (§12.3) → global full-text (`:` in palette, §9.2) → cost indicator (§7.2) — never cut queuing, inspectability, auto-scroll, or local full-text.

---

## 2. Goals

- The user never thinks "I lost that prompt because it was streaming" — queued messages feel attached to the composer and send at the right moment without re-typing.
- Every tool call is legible without opening it and fully inspectable when opened — running/success/failed are unambiguous, args are human, output is scrollable and copyable, paths become prompts in one click.
- Context pressure and cost are ambient, not alarming — a tiny bottom-left indicator that earns trust, not anxiety.
- Scroll never steals context when reading history; search never requires leaving Phi.
- Background work announces itself quietly via completion sonners.
- `New Chat` teaches the product: shortcuts and starter prompts under the logo, not an empty void.
- Compaction is manual, intentional, and visible — `/compact` plus the SDK primitive, with clear feedback.

Bar for speed is still the **TUI**; bar for design is still **Linear** — bordered not shadowed, dense but legible, obsessed with micro-details.

---

## 3. Non-Goals

Explicitly deferred — do **not** build in M3:

- Automatic background compaction or scheduled compaction (M3 is manual only via `/compact` and an explicit button; no threshold auto-trigger)
- Persisted custom themes or keybinding editor (still deferred from M2)
- File explorer, diff view, embedded browser, Fork/Clone/Tree navigation
- Multi-workspace batch prompts or bulk session operations
- Remote daemon, multi-user, or keychain migration beyond M2's `~/.config/phi/auth.json`
- Rust session indexing (sidecar remains the only process that touches `~/.pi`)

---

## 4. Tech Stack Delta

- No new runtime. Same **Tauri + Vite + React + plain Tailwind + Node/Express sidecar + Pi SDK `0.84.x`** as M1/M2.
- New **local** UI state only:
  - `useAutoScroll` hook (IntersectionObserver + scroll listener) — no new dep.
  - `useQueue` / `queuedByFile` Zustand or `useState<Map>` slice — local only, no server queue store in M3. Server queuing goes through SDK's `steer` / `followUp` once the local queue drains.
  - `useSearch` hook with debounced fetches to new sidecar search endpoints.
  - Sonner/toast surface — if no toast lib exists, add one minimal dep (`sonner` or hand-roll ~80 lines). Prefer hand-roll to keep bundle thin; if `sonner` is chosen, isolate to `components/ui/sonner.tsx`.
- No new heavy component lib. `cmdk` stays for palettes; extend it for search rather than replacing.

---

## 5. Architecture Delta

```
Tauri WebView (React) --fetch/SSE--> Node sidecar (Express) --in-process--> Pi SDK
                                           |                                  |
                                           |-- SessionManager.listAll()       |-- compact() / abortCompaction()
                                           |-- SessionManager.open()          |-- prompt({streamingBehavior})
                                           |   (scan JSONL for search)        |-- steer()/followUp()
                                           |                                  |-- context usage & cost
```

- **Sidecar stays the only reader of `~/.pi/agent/sessions`** — search, context/cost, and compaction all live there. Frontend never reads JSONL.
- **Source of truth for queues:** frontend local queue is the UI queue; SDK's `steer` / `followUp` is the delivery mechanism. The sidecar does **not** persist queued prompts — if Phi quits, the queue is lost (same as M2 drafts, local only). Document this.
- **Single-hop invariant preserved:** all agent data still via `127.0.0.1` REST + SSE (1–5 ms). No Rust IPC for agent data.

---

## 6. Language Delta (additions to `CONTEXT.md`)

| Term | Definition | Avoid |
|------|------------|-------|
| **Compaction** | Replacing the active transcript branch with a model-generated summary to reclaim context window, via `session.compact()`. | compress, summarize (as noun) |
| **Context Usage** | Fraction of the model's `contextWindow` consumed by `buildContextEntries()`-resolved messages + tool results. Shown as a percentage + token count. | context limit, token limit |
| **Cost** | Estimated spend for the session derived from `model.cost` × input/output/cache tokens. Ambient, not a billing source of truth. | price, charge |
| **Tool Activity** | The inspectable lifecycle of a tool call: `running` → `success` / `failed`, with readable args, expandable output, copy, and path-to-prompt affordance. | tool log, tool trace |
| **Queue** | A local prompt staged above the composer while streaming, auto-sent when the agent settles. | buffer, backlog |
| **Steer** | Enqueueing with `streamingBehavior: "steer"` — delivered after the current assistant turn's tool calls, before the next LLM call. | interrupt |
| **Follow-up** | Enqueueing with `streamingBehavior: "followUp"` — delivered only when the agent fully stops. | queue (generic) |
| **Sonner** | A transient completion toast for background sessions. | notification, alert |

---

## 7. Compaction

### 7.1 Capability Mapping

| Need | SDK |
|------|-----|
| Compact | `session.compact(customInstructions?: string) => Promise<CompactionResult>` |
| Abort compaction mid-stream | `session.abortCompaction()` |
| Observe | `compaction_start` / `compaction_end` events via `session.subscribe()` |
| Persisted evidence | `compactionSummary` entry + `compaction` entry with `{ summary, tokensBefore, retainedTail, usage }` in JSONL |

### 7.2 Product Surface

- **Trigger:**
  1. `/compact` command in the composer slash menu (see §7.3). Accepts optional trailing instructions: `/compact focus only on the auth flow`.
  2. Future: explicit `Compact` affordance in a session `…` menu — **not** in M3 to keep scope tight. Only `/compact`.
- **Behavior:**
  - While no session is active, `/compact` is hidden/disabled.
  - While streaming or while a compaction is already running, `/compact` is disabled with tooltip `"Cannot compact while streaming"`.
  - On invoke, show a **compaction banner** inline at the tail of the conversation (above the composer, below archived errors) with state: `Compacting… {spinner} ·  Compacting transcript — {tokensBefore → estimating…}` + `Abort` ghost button (calls `abortCompaction`). Banner uses `phi-overlay` styling, bordered, not a modal.
  - On `compaction_end`, replace banner with an inline `compactionSummary` node: `Compacted · {tokensBefore} → {tokensAfter} tokens · {summary snippet}` with `Show summary` expand. Snippet is first 160 chars of `summary` with chevron. Full summary rendered as collapsed markdown (like Thinking, but always collapsed by default).
  - On `abortCompaction` or error, show an inline error block (reuse `InlineErrorBlock` from M2) with `reason: "Compaction aborted"` and `Continue` disabled.
  - After successful compaction, `revalidate(file)` the active session so `Conversation` reflects the new `context.messages` (compaction shrinks history visually).
- **Instructions:** when `/compact custom text` is typed, `customInstructions` is `text.trim()`. Empty → `undefined` (default SDK prompt). No second input needed.
- **Idempotence:** one compaction at a time per session. Sidecar rejects `409` if compaction already active for that session.

### 7.3 Sidecar Contract

```
POST /api/compact
body: { sessionFile: string; cwd?: string; customInstructions?: string }
response: SSE stream
  events forwarded: compaction_start, compaction_end, message_update (if any),
                    tool_execution_* (rare), error, done
  on done: invalidates sessions cache

POST /api/compact/abort
body: { sessionFile: string }
response: { ok: true, aborted: boolean }
```

- Sidecar impl: `const entry = await getSessionRuntime(sessionFile, cwd)` → `if (isPromptActive(entry) || entry.compacting) throw 409` → set `entry.compacting = true` → `suspendCleanupFor(entry)` → `suspendSonnerFor(entry)` → `session.subscribe(sendSSE)` with `sSetInterval ping` → `await session.compact(customInstructions)` → `invalidateSessionsCache()` → `send done`. On `/abort`, `entry.runtime.session.abortCompaction()`.
- No new session file is created — compaction mutates the existing tree (the SDK does).

### 7.4 Composer Integration

- Register `/compact` as an **extension-style command** in `useSlashCommands` fallback when no SDK command matches: `{ name: "compact", description: "Compact transcript to reclaim context", argumentHint: "[instructions]", source: "phi" }`.
- Slash menu (`SlashMenu`) shows it whenever `slashQuery === "compact".startsWith(...)` — even before `commands` fetch resolves.
- Accepting `/compact` in the at/slash palette does **not** send it as a prompt. It intercepts in `Composer.submit`:
  ```ts
  if (trimmed === "/compact" || trimmed.startsWith("/compact ")) {
    const instructions = trimmed.slice(8).trim() || undefined;
    onCompact(instructions); // prop from App
    return; // do not call onSend
  }
  ```
  `App.handleCompact` owns the SSE stream for compaction (separate from `chat.prompt` / `chat.continueStreaming`). It can reuse `useChat.compactionStateByFile` (new).

### 7.5 States & Edge Cases

- No session open → `/compact` not in palette.
- Streaming → `/compact` item disabled, `aria-disabled`.
- `contextWindow` unknown → still allow `/compact`; banner shows `Compacting transcript…` without token arrow.
- Offline or sidecar down → fatal gate already covered (M2); no extra copy.
- Corrupted session header → compaction button disabled; show tooltip `"Cannot compact this session"`.

### 7.6 Telemetry (local only)

- Compaction banner exposes `tokensBefore/After` and `summary` length for quick human sanity check. No analytics event.

---

## 8. Context Usage & Cost Indicators — Bottom Left of Chat

### 8.1 Placement

- **Container:** a small, muted row **anchored to the bottom-left of the chat interface**, visually attached to the composer but outside the composer's bordered card. In `App.tsx`, between `{ChatViewport}` and the `{DirectoryPicker + ModelSelector}` row, add a flex row:
  ```
  [Context · Cost]                                    [DirectoryPicker] [ModelSelector]
  ```
  On narrow viewports (`< 640px`), stack: indicators above pickers, still left-aligned.
- **When hidden:** `!chat.activeFile` (home/New Chat empty state) → indicators hidden. They only render for a persisted session after `hydrate`.
- **Styling:** Linear-grade: `text-[11px] leading-none tracking-wide text-phi-text-muted`, bordered pill segments `rounded-full border border-phi-border bg-phi-overlay px-2.5 py-1`. No strong color. Hover reveals tooltip with exact counts.

### 8.2 What It Shows

Two pills, read left-to-right:

1. **Context Usage**
   - Label: `Context {percent}% · {used}/{window} tokens`
   - Example: `Context 42% · 84k/200k tokens`
   - Compact form under ~360px width: `42% · 84k/200k`
   - Calculation (sidecar): `used = sumTokens(buildContextEntries())` where `sumTokens` uses SDK `usage` when available; fallback is `round(messages.length * 320)` heuristic — clearly document fallback. `window = model.contextWindow ?? 200_000`. Clamp `percent` 0–100. Show `—` when neither available.
   - Visual: subtle inline progress bar **inside** the pill (2px high, `bg-phi-overlay-strong`, fill `bg-phi-text-tertiary`, no animation). Not a chart.

2. **Cost**
   - Label: `Cost ${amount}` with tooltip `Est. ${input} in / ${output} out / ${cache} · ${model.name}`
   - Example: `$0.42`
   - Calculation: sidecar derives from `model.cost` × `usage` (`input/output/cacheRead/cacheWrite` aggregated from session entries). If `usage` absent, show `Cost —` with tooltip `"Cost unavailable for this provider"`. Never show a made-up number.
   - Formatting: `Intl.NumberFormat` 2 decimals until $10, then 1 decimal. `$0.00` is allowed; do not hide zero cost.

- **Refresh:** on every `revalidate(file)` and on `compaction_end`. Also poll via `GET /api/sessions/messages` response piggyback (reuse `usage` there) so no extra endpoint until `GET /api/session/usage?file=` is needed for live streaming deltas.
- **During streaming:** usage pill shows `Context {percent}% · streaming…` with a 150ms pulse dot (`Orb S3`). Replace with final count on `agent_end`.

### 8.3 Sidecar Contract

```
GET /api/session/usage?file=<encodedPath>
response: {
  file: string,
  model: { provider, id, name, contextWindow },
  usage: { inputTokens, outputTokens, cacheRead, cacheWrite, totalTokens },
  window: number,
  percent: number,
  cost: { total, input, output, cache },
  truncated: boolean  // when heuristic used
}
```

- Impl: reuse `sessionPayload(file)` + `buildSessionContext()` + `context.usage` if present; otherwise heuristic. Cheap — no extra SDK primitive.
- Cache: `usageCache: Map<file, {at, payload}>` TTL `2s` + invalidate on `prompt done` and `compaction_end`.

### 8.4 Accessibility & States

- Pills are `role="status"` `aria-live="polite"` but throttle updates to `500ms` to avoid chatter.
- Loading: render `Context —` with `animate-pulse` skeleton inside pill for ≤150ms, then real value.
- Error: on `GET` failure, keep last value and add `title="Couldn't refresh usage"` — never replace with error red.

---

## 9. Tool Activity — Fully Inspectable

### 9.1 Goal

Today's `WorkingBlock` is scan-friendly but shallow: collapsed header + flat arg code. M3 makes every tool call a **readable, expandable, copyable, actionable object** without turning the transcript into a log viewer.

### 9.2 Visual Contract

**Collapsed row (default):** single line per tool, compact:

```
●  read  src/hooks/useChat.ts            320ms          ›
●  bash  npm test -- runInBand            1.2s  ✕        ›
●  edit  src/components/composer.tsx      48ms           ›
```

- **Status dot:** `amber pulsing` (running), `green solid` (success), `red solid` (failed). Dot is `6px` `rounded-full`; running pulses via `phi-dot-matrix` (already in `App.css`).
- **Icon:** optional 12px file/terminal/grep/find glyph left of `label` — use existing `ToolLine` icon set; do not add new deps.
- **Label:** tool name `text-[12px] font-medium` `text-phi-text-secondary` (running: `text-phi-text-primary`).
- **Args summary:** `readable arguments` — human-first:
  - `read` / `write` / `edit` → `path` only (`src/foo.ts`, not `{"path":"..."}`).
  - `bash` / `powershell` → `command` truncated to 72 chars with ellipsis; full on expand.
  - `grep` → `pattern  path` (`"useChat"  src/`).
  - `find`/`ls`/`grep` with no path → `pattern`.
  - Fallback: first non-empty string arg value truncated to 64 chars. Never show raw JSON as the summary.
  - **Arguments are `font-mono text-[11px]`** inside a `rounded border bg-phi-bg-sunken` code chip when it's a path, plain `text-phi-text-tertiary` when it's a command. One chip per row max.
- **Meta:** on the right: `duration` (`48ms` / `1.2s`) for done; `running` badge with subtle animated ellipsis for live. Failed rows also show `✕` in `text-phi-error` next to duration.
- **Chevron:** `›` `size-3` `text-phi-text-muted` always visible (not hover-only) — discoverability. Rotates `90deg` when expanded.

**Expanded block (on click):**

```
read  src/hooks/useChat.ts
Args
  {
    "path": "src/hooks/useChat.ts"
  }                          [Copy args]
Output  ·  1.14 kB  ·  truncated at 4k
┌─────────────────────────────────────────┐
│  // scrollable, max-h 360px,            │
│  // syntax-highlighted when possible    │  [Copy output]  (top-right of code block)
└─────────────────────────────────────────┘
[Add src/hooks/useChat.ts to prompt]        (only when args contain a path — §9.4)
```

- **Args panel:** pretty-printed JSON `2`-indent inside `pre` with `max-h 160px overflow-auto` `rounded bg-phi-bg-sunken border border-phi-border-faint`. `Copy args` button copies `JSON.stringify(args,null,2)`.
- **Output panel:** scrollable `max-h-[360px]` `overflow-auto` `rounded border`. Content is `resultText` from `tool_execution_end`. If `partial` is large, prefer final `result`; if `isError`, render `text-phi-error-text bg-phi-error-bg`. Long outputs (>4k chars) show `Show more` that expands to `max-h-[70vh]`. **`result` is never JSON-stringified envelope** — render `content[].text` joined.
- **Sizing:** collapsed row `h-7`, expanded block `pt-2 pb-1`. Group of sequential tool rows stays a flat scannable list with `gap-1`, no extra grouping box.

### 9.3 Interaction Spec

- **Expand/collapse:** click the row. Not the whole `WorkingBlock` header — each tool row is individually expandable. Header `Show work` still collapses the whole block (existing behavior).
- **Copy output:** `Copy output` button top-right of expanded code block copies the raw output text. Success: button briefly shows `Copied` (1.2s) as in `InlineErrorBlock`. Uses `navigator.clipboard.writeText`.
- **Copy args:** analogous, next to args `pre`.
- **Selection:** text selection inside output must not collapse the row (stop propagation on `mousedown` inside `pre`).
- **Live updates:** `tool_execution_update` patches `partial` — while running, expanded view shows `partial` streaming inside the same `pre` with a blinking cursor. On `tool_execution_end`, swap `partial` → `result` with no unmount flicker.

### 9.4 Add Path to Prompt (Clicking Tools That Use Paths)

- For any tool where `args.path` (or `args.file`, `args.filePath`, `args.file_path`, `args.cwd + path`) is a non-empty string that looks like a path (contains `/` or `.`), render an affordance:
  - **Inline affordance when collapsed:** the path chip is `hover:underline cursor-pointer` with `title="Add to prompt"`.
  - **Explicit action when expanded:** button `Add {basename} to prompt` at the bottom of the expanded block.
- **Action:** inserts `@path` (with `@` file-mention syntax already in the composer) at the composer cursor position, or appends ` @path` at the end if composer is not focused. Reuse `Composer.insertMention(path)` (new) — do not manipulate DOM outside React. Focus returns to `textarea` after insert, cursor after the inserted token.
- **Multi-path tools (rare):** if `args` contains multiple path-like keys, show up to 2 chips each clickable; expanded view shows all.
- **No-op if already in composer:** if `composer.value.includes(@path)`, still allow insertion but deduplicate silently? No — allow duplicates; the prompt needs the mention even if typed already.

### 9.5 Data Shape & Frontend Plumbing

- **SDK events consumed:** `tool_execution_start` (id, name, args, order), `tool_execution_update` (partialResult), `tool_execution_end` (result, isError). Also keep `message_update.toolcall_*` as fallback for ordering, but tool line lifecycle is driven by `tool_execution_*` (already in `useChat`).
- **State:** extend `WorkItem` in `src/types/work.ts`:
  ```ts
  type ToolWorkItem = {
    kind: "tool";
    id: string; name: string;
    args: Record<string, unknown>;
    order: WorkOrder;
    status: "running" | "success" | "failed";
    durationMs?: number;
    startedAt?: number;
    partial?: string;
    result?: string; // text joined
    isError?: boolean;
    hasOutput?: boolean;
  };
  ```
  `useChat.toolCallFromAssistantEvent` and `updateStream` already handle insert/patch — patch to populate `status` and `durationMs` (capture `Date.now()` on `start`, calc on `end`).
- **Render pipeline:** `Conversation` and `Streaming` share the same `ToolActivityList` component. Extract `ToolActivityRow` to avoid duplication. Props: `item`, `expanded?: boolean`, `onToggle`, `onAddPath`.

### 9.6 Failure States

- `isError: true` → dot red, duration retains red `✕`, label `text-phi-error-text` (not full-row red). Error output `bg-phi-error-bg border-phi-error-border`.
- Missing `args` → show `⟨no args⟩` in `text-phi-text-muted italic`.
- Missing `result` at `end` → show `No output` muted line, still copy-safe.
- Extremely large output (>200kB) → virtualize inner `pre` if needed (defer; just cap copy to first 100k + `… truncated`).

### 9.7 Migration

- `WorkingBlock` no longer renders tool args inline as raw JSON chip only — preserve the existing minimal row for history compatibility. Net change is additive styling + expand panel + copy/path affordances. Keep `hideLastWork` semantics (-streaming history hides last work block).

---

## 10. Auto-Scrolling & Scroll-to-Bottom

### 10.1 Principle

Scroll is **user-owned**. Phi only auto-scrolls when the user is already at the bottom. Reading history never jumps. New content above still announces via sonner (§11.3) but never steals scroll.

### 10.2 Behavior

- **Threshold:** user is considered "at bottom" when `scrollViewport.scrollHeight - scrollViewport.scrollTop - scrollViewport.clientHeight < 80`. `80px` accounts forComposer docking and avoids jitter near bottom.
- **While streaming or after new messages:**
  - If at bottom → auto-scroll to bottom **smoothly** (`scrollTo({ top: scrollHeight, behavior: "smooth" })`) at most once per `raf` (16ms). For burst `text_delta`, batch via `requestAnimationFrame` already in `useChat`; scroll call coalesces there.
  - If **not** at bottom → do **not** auto-scroll. Show `Scroll to bottom` button (see §10.3). Badge unread indicator `+{count} new messages` when count > 0.
- **User scroll intent:** `wheel` / `touchmove` / `ArrowUp` / `PageUp` away from bottom sets `isPinnedToBottom = false` until user re-pins. Programmatic scrolls do not set it.
- **Re-pin:** clicking `Scroll to bottom` or scrolling manually to within threshold sets `isPinnedToBottom = true` and smoothly scrolls to bottom. Re-pin also resets unread count.
- **Session switch / history load:** on `hydrateFromSwitch` / `openFile`, **always** scroll to bottom if `messages.length > 0`, regardless of previous pin — user just navigated to a session; expectation is tail.
- **New prompts while viewing middle:** local queue card (§11) docks above composer, not inside scroll viewport (see §11) — never confuses scroll.

### 10.3 UI — Scroll-to-Bottom Button

- **Placement:** floating, centered, `bottom: 84px` (16px above composer card's top border), `z-index: 8`, anchored to the chat viewport's scroll container via `position: absolute` inside a `relative` wrapper (so it doesn't escape the main panel).
- **Visual:** pill `rounded-full bg-phi-bg-elevated border border-phi-border-strong shadow-[0_8px_24px_var(--color-phi-shadow)]` `px-3.5 py-2 text-[12px] font-medium text-phi-text-primary gap-2` with downward chevron `↓` and optional badge:
  ```
  ↓  Scroll to bottom  (3 new)
  ```
  Badge only when `newSinceNotAtBottom > 0`.
- **Motion:** `enter: fade+translateY(4px)` 160ms `ease-out`, respects `prefers-reduced-motion` (no translate, just fade). `exit` symmetric. Test against existing `--phi-motion-*` tokens.
- **Accessibility:** `aria-label="Scroll to bottom"` `role="button"` focusable. `Escape` while focused dismisses but does **not** pin.

### 10.4 Frontend Contract

- **Component:** new `src/components/conversation/scroll-viewport.tsx` wrapping the existing scrollable `div` returned by `ChatViewport`. It exposes: `isPinned`, `unreadCount`, `scrollToBottom`, `onScrollPinnedChange`.
- **Hook:** `useAutoScroll(ref, { deps: [messages.length, streaming.text.length], threshold: 80 })`. Internally uses `IntersectionObserver` on a sentinel `div` at the bottom (`data-sentinel`) plus `scroll` listener throttled to `50ms`.
- **Integration:** `ChatViewport` already isolates streaming renders via `memo` — add the sentinel and hook there so `App` doesn't re-render on every streaming token. Keep existing memo boundary.

### 10.5 Edge Cases

- Rapid burst appends while not pinned → badge increments but viewport never jumps.
- Tab background streams: no auto-scroll (inactive tab viewport is not in dom). When user switches to that tab, on hydrate scroll to bottom.
- Height changes from image loads inside markdown — sentinel observer handles recheck.

---

## 11. Full-Text Search

### 11.1 Scope & Entry Points

Two scopes, **one** palette:

1. **Current session (default)** — full-text across `context.messages` of the active session.
2. **All sessions** — full-text across every session file under `~/.pi/agent/sessions`.

**Entry:** extend the existing session search palette (`Cmd+K` / `SearchSessionsButton` → `SessionCommand`). Default view stays **session-metadata search** (name, firstMessage, cwd). Prefix dictates scope:

| User types | Scope | Placeholder shows |
|------------|-------|-------------------|
| _(empty or plain text)_ | session-metadata (current M2 behavior) | `Search sessions…` |
| `:query` or `: query` | global full-text across all sessions | `Full-text: query` |
| `/query` or free text while a session is open with non-empty query | current-session full-text | _toggle_ — see below |

The spec phrase is: **"full-text search across the current session (and across all sessions when using `:` symbol in the session search palette)"**.

To satisfy "across the current session" without overloading Cmd+K prefix ambiguity, also add a **local search** affordance:

- **Local search bar** inside the conversation viewport header — a magnifying glass button top-right of `ChatViewport` (`aria-label="Search in this session"`) opens an inline search strip (`Find in session`) anchored under the `Tabs` bar (full-width inside main panel). This is the primary local surface; the `:` global surface stays in `SessionCommand`.
- Keyboard: `Cmd+F` (and `/` when composer is not focused) focuses local strip. `Escape` closes strip. `Enter`/`Shift+Enter` cycles matches.

This dual surface avoids teaching two prefix schemes for the same palette.

### 11.2 Local Full-Text — Current Session

- **UI strip:**
  ```
  [ ⌕  Find in session — 3/12 · "useChat" ]   [↑] [↓] [×]
  ```
  - Input: same header styling as `DirectoryPicker` search, `h-8` `text-[13px]` `rounded border` `bg-phi-bg-surface`. Debounce `160ms`.
  - Counters: `currentMatch / totalMatches` · `"{query}"`.
  - Prev/next buttons keyboard `Enter / Shift+Enter`, mouse click, and `Cmd+G` / `Cmd+Shift+G`.
  - No results → `0 matches` in `text-phi-text-muted`.
  - Strip is absolutely positioned below `Tabs` so it doesn't shift conversation height; `z-index: 5`.

- **Matching & highlighting:**
  - Case-insensitive substring on `message.content[].text` joined per message + `role` labels (`User`, `Assistant`) + `toolResult` text.
  - Hit snippets: message text with `mark` highlighting (`bg-phi-accent/20 border border-phi-accent/30 rounded px-0.5`).
  - Scroll viewport scrolls the **first** match into view on query change (`scrollIntoView({ block: "center" })`). Cycling prev/next focuses that message and pulses highlight 300ms.

- **Data source:** no new server call needed for local. Frontend already has `chat.data.context.messages` (and future `context.messages` from cache). Implement search as a derived memo + `useSearchInSession(messages, query)`. Keep it synchronous; sessions with >2k messages still scan in <16ms.

- **Behavior while streaming:** local search index is live — as `streaming.text` grows, debounced re-scan includes streaming content. Visible indicator `Streaming — results update live`.

### 11.3 Global Full-Text — All Sessions (`:` in SessionCommand)

- **Trigger:** inside `SessionCommand.Dialog`, when `search.trim().startsWith(":")`, switch mode.

- **Mode switch visual:** top bar changes from
  `⌕ Search sessions…` → `⌕ Full-text: <queryWithoutColon>` plus a subtle segmented hint `All sessions` on the right. Add a small footer help: `Tip: start with : to search message contents across all sessions`.
  Backspace to empty `:` returns to metadata mode. Esc clears global.

- **Data flow:**
  ```
  GET /api/search/all?q=<queryWithoutColon>&limit=40&offset=0
  response: {
    q: string,
    results: Array<{
      file: string;
      cwd: string;
      displayCwd: string;
      sessionName: string;
      matchedMessageIndex: number;
      role: string;
      snippet: string;          // 120 chars around match, with << and >> marking for highlight — or raw and frontend highlights
      preview: string;          // broader 300 char preview
      timestamp: string;
      messageCount: number;
    }>,
    total: number,
    truncated: boolean
  }
  ```

- **Sidecar impl:**
  - Walk `~/.pi/agent/sessions/**/**/*.jsonl` — reuse `SessionManager.listAll()` to get file list, then **stream-read** each file line-by-line (not load full JSONL into memory). For each `type: "message"` entry, case-insensitive `includes` on `entry.message.content[].text` + `entry.message.text`. Skip `thinking` blocks from matching unless query clearly targets internal reasoning — keep to visible content first.
  - Snippet window: `80` chars before match, `40` after. Ellipsis with `…` on truncation. Never break surrogate pairs.
  - Cap scan at `limit * 8` files or `12k` total entries whichever first; set `truncated: true` if cap hit and add footer `"Showing first 40 matches — refine query"`.
  - Cache: `searchCache: Map<qLower, {at, results}>` TTL `8s`, size `20`. Invalidate via `invalidateSessionsCache` hook (same signal).
  - Perf: must respond <400ms on 500-session dir. Profile with 500 files; if slow, add `worker_threads` or `p-limit` Throttled `Promise.all(8)` chunked reads.

- **Palette row rendering (global mode):**
  ```
  [ChatIcon]  SessionTitle — ~/ship/Phi
              matched snippet with <mark>highlight</mark>
              3 messages · 2h ago · 1 match in this session
  ```
  - Row `value` still `file` for `onSelect`. On select, `handleSelect(file)` → hydrate that session **and** scroll to the matched message index + highlight it for `900ms` via `scrollToMessageIndex` (new prop on `Conversation`).

### 11.4 Local `:` alias

- If a session is active and the user types `:` **without** opening Cmd+K (i.e., in local strip), strip leading `:` before search — so `:foo` works in both places without teaching two syntaxes.

### 11.5 States

- Empty query (both modes): show `No sessions found` / `No matches`.
- No local session open: local strip hidden; global results still work.
- Long session (>5k messages): show `Scanning…` with no spinner — border pulse only.

---

## 12. Completion Sonners — Background Sessions

### 12.1 When They Fire

- A **background** session is any session file `f` where `chat.runningFiles.has(f)` was `true` and `chat.activeFile !== f`. On transition `running → not running` **and** the session **was never brought to foreground during the run**, fire a sonner.
- Also fire when the **active** session completes but the window is **blurred** (`document.visibilityState !== "visible"` or Tauri window not focused — check via `getCurrentWindow().isFocused()`). This covers "user switched app".
- Do **not** fire when the active, focused session completes in foreground — inline completion is already visible (stream ends, `InlineErrorBlock: done` / history appends). Sonner would be noise.
- Do **not** fire on `abort` or `error` — those already persist as `InlineErrorBlock`. Only `done` with `willRetry === false`.

### 12.2 Visual

- **Stack:** bottom-right of `phi-main`, above composer corner, `z-index: 40`. Stacks up to `3` visible; older evicted FIFO. Auto-dismiss `6s`. Hover pauses timer.
- **Card:**
  ```
  ✓  SessionName · ~/ship/Phi — Finished
     "first 48 chars of last assistant text…"
                                          [Open]  [×]
  ```
  - Icon `✓` in `text-phi-thinking-low` for success; no status dot.
  - Title: `sessionName` or truncated first message `42 chars`. Fallback: `Session · usp-31lb` (filename slug).
  - Preview: first 56 chars of last assistant `text` delta — not thinking/tool.
  - Actions: `Open` (switches to that session + dismisses sonner), dismiss `×`.
  - Styling: `rounded-xl border border-phi-border-strong bg-phi-bg-elevated shadow-[0_16px_48px_var(--color-phi-shadow-strong)]` `px-3.5 py-3 min-w-[280px] max-w-[360px]`.
  - Motion: `slide-in from right` 180ms + `fade`, `prefers-reduced-motion: fade` only.

### 12.3 Sonner State & Hook

- New `src/hooks/useCompletionSonner.ts` owning `sonners: SonnerItem[]`. Subscribe to `chat.runningFiles` + `chat.data` changes plus Tauri `isFocused` polling 1s when any running.
- Store a `didShowSonnerFor: Set<file_runId>` to dedupe rapid state flaps. `runId` is monotonic `Date.now()` per prompt start (extend `streamsByFile.startedAt`).

### 12.4 Server Side: Nothing

- No new endpoint. This is pure UI on top of existing `useChat` `runningFiles` + `errorsByFile`. Ensure `streamPrompt`'s `finally` correctly marks `markRunning(false)` before the next tick — done.

### 12.5 Edge Cases

- Rapid two completions → stack, 160ms stagger.
- Sidecar down while running → no sonner (fatal gate covers).
- Session finished while user already navigated to it in the 200ms window → suppressed (check `activeFile` at settlement time).

---

## 13. Queuing & Steering — The Main Feature

> Attach, don't block. While the agent streams, your next message lives **above the composer** like it's taped to it.

### 13.1 Mental Model

| SDK concept | Phi verb | When |
|-------------|----------|------|
| `prompt(text, { streamingBehavior: "steer" })` / `session.steer(text)` | **Steer** | Delivered after the current assistant turn's tool calls finish, before the next LLM call. Use to **correct mid-turn** ("actually use `zod` not `yup`"). |
| `prompt(text, { streamingBehavior: "followUp" })` / `session.followUp(text)` | **Follow-up** (default) | Delivered only when the agent **fully stops**. Use when you just want the next prompt to run after. |
| `abort()` | **Stop** | Hard stop. Drains nothing queued — user must re-attach. |

Phi collapses this into **one local queue with two send strategies**. Most users will just press Enter and let auto-send run; power users choose `Steer now` to cut in early.

### 13.2 UI — Queued Card Above Composer

- **Placement:** a card **directly above the composer**, attached to it: no gap, shared border radius where they meet. Composer's `rounded-[17px] rounded-b-none` stays; queued card sits on top with `rounded-t-[14px] border border-b-0 border-phi-border-strong bg-phi-bg-surface` and the composer card's top border is hidden when a queue card exists (so they read as one unit). Visually "taped on".
- **Content:**
  ```
  ┌───────────────────────────────────────────────────────────┐
  │  Queued · follow-up   (or: Steer — after this tool call) │  ← tiny header row: text-[10px] leading-none tracking-[0.12em] uppercase
  │                                                           │
  │  Fix the tests to use vitest, not jest — keep coverage  │  ← message preview: text-[13px] leading-6 line-clamp-3
  │  + @src/app.test.ts                                       │  ← attached files / images preview row (if any)
  │                                                           │
  │  [Steer now]  [Send after]  ·  [Edit]  [Discard]          │  ← actions row: two primary strategies + secondary
  └───────────────────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────────────────┐
  │  Composer textarea ...                                    │
  └───────────────────────────────────────────────────────────┘
  ```
  - **Header:** `Queued · Follow-up` or `Steer — after this tool call` dynamic per queued item's `streamingBehavior`. If multiple queued (see §13.3), header shows `Queued 2 · oldest is Follow-up`.
  - **Message body:** truncated 3 lines, `whitespace-pre-wrap break-words`. Clicking body = `Edit` (focus composer with queued content).
  - **Mode indicator pills:** tiny inset toggle or segmented control? Keep minimal: two pills (`Steer` / `After`) that set the queued item's `streamingBehavior`. Default is `followUp`. Changing updates header live.
  - **Actions:**
    - `Steer now` — `variant: primary` small (`h-7 px-2.5 text-[12px]`), immediately drains this item via SDK `steer` (see §13.5). Disabled while no streaming (then it just becomes immediate send).
    - `Send after` / `Enqueue` — ghost/small, marks as `followUp` (already default). Only shown when current mode is not `followUp`.
    - `Edit` — copies queued text (+ images) back into composer for editing, **removes** the queued card (single queue — edit consumes). Composer gets focus, cursor at end. Draft indicators updated.
    - `Discard` — ghost/small `text-phi-text-muted hover:text-phi-text-primary`. Removes the queued card with `confirm` only if message >200 chars (use inline "Hold to discard" 600ms hover guard instead of confirm dialog to stay non-blocking).
  - **Stack:** one card visible, rest as collapsed chips below header: `+1 more queued` with chevron to expand a popover list. M3 ships `maxQueue=2` (one visible card + one overflow) to keep implementation sane — additional `Enter` while two queued replaces the overflow with newest (toasts `Replaced queued follow-up` 1.6s).

- **Empty composer behavior:** queued card exists only when `activeFile` is streaming and user has submitted while streaming. It renders in `App.tsx` inside the same `shrink-0 px-4 sm:px-7` block that contains `{modelError}` / `{DirectoryPicker}` / `Composer`, positioned just before `Composer`.

#### Draft-like affordance

- Queued prompts are **local only** (same as drafts). Survive session switch (queued by `file`, not globally). Survive reload? Yes — persist to `localStorage` `phi:queue:{file}` with same 14-day TTL pattern as drafts, so a quit mid-stream doesn't lose the queued follow-up. On reload, if `chat.runningFiles.has(file)` and `localStorage phi:queue:{file}` exists, restore the card. Clear on discard / successful drain.

### 13.3 Interaction Flow

| User action | System response |
|-------------|-----------------|
| **Type in composer + Enter while streaming** | Instead of `chat.prompt` error, intercept in `handleSend` (see §13.5): if `isStreaming(activeFile)`, create a `QueuedItem { id, text, images, streamingBehavior: "followUp", createdAt }` in `queuedByFile.set(file, [...prev, item].slice(-2))`. Attach UI. Composer clears and is ready for next input (new queue slot). |
| **Enter on empty composer while queue exists** | No-op. |
| **Click `Steer now`** | If `isStreaming(file)`, drain this single item via `session.steer(text)` (or `streamPrompt` with `streamingBehavior:"steer"`). Remove from queue immediately (optimistic). If streaming already ended, drain as normal `prompt`. |
| **Do nothing (leave queue attached)** | On `agent_end` / `markRunning(file,false)` settlement, **auto-drain** all queued items sequentially: first `steer` items (if any) via `steer` path, then `followUp` via `prompt` with `followUp` semantics. After each drains and settles, pop it and start the next one automatically (chain). This reproduces continuous conversation without the user pressing Send again. |
| **Click `Edit`** | Pop queued text back into composer, remove queue card, focus composer. Images also restored as previews. |
| **Click `Discard`** | Remove from queue. |
| **Change pill to `Steer`** | Updates `streamingBehavior` for that item. No server call until drain. |
| **Not streaming + Enter** | Normal `prompt` path (unchanged). Queue path is not hit. |
| **Extension command `/compact` while streaming** | Still blocked (intentional) — `/compact` not queueable. |

- **Backpressure:** if queue has `2` items and user presses Enter again, replace second with newest and sonner `Queued follow-up updated` (reuse sonner surface but inside composer vicinity, not global sonner — a small inline toast above the card).

### 13.4 Frontend Plumbing

- **New hook:** `src/hooks/useQueue.ts`

  ```ts
  type QueuedItem = {
    id: string;
    text: string;
    images?: { type:"image"; data:string; mimeType:string }[];
    streamingBehavior: "steer" | "followUp";
    createdAt: number;
  };
  type QueueState = {
    byFile: Map<string, QueuedItem[]>;
    enqueue(file: string, item: QueuedItem): void;
    discard(file: string, id: string): void;
    edit(file: string, id: string): QueuedItem | null; // pops & returns
    swapBehavior(file: string, id: string, b: "steer"|"followUp"): void;
    drainAll(file: string): Promise<void>; // auto-drain sequentially
    drainOne(file: string, id: string, via: "steer"|"followUp"): Promise<void>;
    clear(file: string): void;
  };
  ```

  Persist `byFile` to `localStorage` on change (debounce `200ms`, caps 14d, clean empty).

- **Composer integration:** `Composer` takes **no direct knowledge** of queue. `App.handleSend` is the routing point — it decides prompt vs enqueue based on `chat.runningFiles.has(targetFile)` and `isStreaming`.
- **Drain wiring:** after `useChat` settles a session (in `prompt` / `continueStreaming` `finally` after `markRunning(false)`), call `queueDrainHook.onAgentSettled(file)` if `byFile.get(file)?.length > 0`. That hook sequentially calls `streamPrompt` with appropriate `streamingBehavior` mapped via SDK: reuse `streamPrompt` with `body: { text, sessionFile, cwd, images, streamingBehavior }` (extend `streamPrompt` body) — or call dedicated `streamSteer` / `streamFollowUp` wrappers that hit new sidecar endpoints (see §13.5).

- **Visual sync to streaming state:** `ChatViewport` streaming block and queue card are in the same vertical stack but distinct DOM parents — the `WorkingBlock` is inside the viewport, the queue card is outside scroll. Add a subtle `border-t-2 border-phi-accent/30` top-accent on the queue card while streaming to reinforce "attached to running work".

### 13.5 Sidecar Contract — Streaming Steer/FollowUp

Two new SSE endpoints (backed by SDK primitives). They are **mutually exclusive** with `POST /api/prompt`'s `409` guard — these succeed while `isPromptActive(entry)` is `true`, which `/api/prompt` does not.

```
POST /api/steer
body: { sessionFile: string; cwd?: string; text: string; images?: ImageContent[] }
response: SSE stream (same framing as /api/prompt)
behavior: entry.runtime.session.steer(text, { images }) or
          session.prompt(text, { streamingBehavior: "steer", images })
guards: 401 if no sessionFile; 404 if file missing; 409 if not currently streaming
         (steer only valid while streaming)
         sidecar returns 409 with message "not streaming — use prompt with followUp" and
         frontend falls back to normal followUp enqueue.

POST /api/followup
body: { sessionFile: string; cwd?: string; text: string; images?: ImageContent[] }
response: SSE stream (same framing)
behavior: session.followUp(text, { images }) or prompt with streamingBehavior:"followUp"
guards: similar — requires streaming OR agent is between turns (agent_start seen but no agent_end).
        If not streaming and no pending agent turn, sidecar returns 409 and frontend falls
        back to plain prompt.

POST /api/prompt — extend to accept streamingBehavior for enqueue path:
body: { text, sessionFile, cwd, images, streamingBehavior?: "steer"|"followUp" }
behavior: if streamingBehavior present while streaming, delegate to steer/followUp
          internally instead of failing 409. This allows one unified SSE path
          if steer/followUp endpoints are delayed.
```

- **SSE reuse:** all three share `sseHeaders`, `heartbeat`, `session.subscribe` wiring already built for `/api/prompt`. Log `[phi sidecar] steer accepted for ${file}` for diagnostics.
- **Queue forwarding:** frontend `queue.drainOne(file, id, via)` decides which endpoint to call: `via === "steer"` → `/api/steer`, else `/api/followup` (fallback to `/api/prompt` with `streamingBehavior` if steer endpoint `409`).
- **Serial drain:** drain never runs two SSE streams concurrently for the same `file`; auto-drain chains `await drainOne(...); // next` . Frontends that see `streamingBehavior` competition rely on SDK `preflightResult` — surface `preflightResult(false)` as inline queue error `"Steer rejected — queued as follow-up"` and re-enqueue as `followUp`.

---

## 14. Home Session (New Chat) — UI Redesign

### 14.1 Current Baseline

`!chat.activeFile` branch in `App.tsx` renders a centered `phi-empty-logo` plus one muted "No sessions found" line. Functional but empty; product is undiscoverable.

### 14.2 Target Layout

```
┌────────────────────────────────────────────────────────┐
│                   (spacious, centered)                  │
│                                                         │
│               [logo_small.svg]  (keep, 20% larger)       │
│                  Build, Fix and Ship                    │  ← hero title
│                                                         │
│              ┌─────────────────────────────────────┐   │
│              │  Starter prompts  (2x2 grid)          │   │
│              │  [ Fix a failing test in this repo ]  │   │
│              │  [ Plan a feature with AGENTS.md  ]   │   │
│              │  [ Review an open PR diff          ]  │   │
│              │  [ Explain the session file format ]  │   │
│              └─────────────────────────────────────┘   │
│                                                         │
│              Keyboard shortcuts                         │
│              ⌘K  Search sessions        ⌘N  New chat     │
│              ⌘P  Switch workspace       ⌘,  Settings     │
│              ⌘⇧⌫  Delete session        Esc  Stop        │
│                                                         │
│              [ no sessions hint muted, bottom ]         │
└────────────────────────────────────────────────────────┘
```

- **Structure:** keep the existing `mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-6` wrapper. Inside `flex-1 flex-col items-center justify-center pb-16 text-center`, after the `<img>`, insert:
  1. **Hero title:** `Build, Fix and Ship` — `text-[15px] font-semibold tracking-tight text-phi-text-primary mt-6`. This restores the M2 empty-state title that somehow drifted to image-only in current `App.tsx`.
  2. **Starter prompts:** 4 cards, responsive grid. Visible on `md+`; single column on `sm`. Clicking a prompt **populates the composer** (not auto-sends) — `setMessage(template)` + focus. Draft is written via existing `phi:draft:new` path so reload preserves. Templates are pure text, no `@` unless illustrating.
  3. **Keyboard shortcuts:** compact two-column list per M2 §7.1, `text-[11px] leading-5 text-phi-text-muted`. Use `kbd` elements with `rounded border bg-phi-overlay px-1.5 py-0.5 font-mono text-[10px]`. Two columns: search/new/focus; delete/quit/abort row.
  4. **No-sessions hint:** existing line, moved to absolute bottom `mt-auto pt-8` so prompts remain hero.

### 14.3 Starter Prompts Content (V1 set)

Ship 4, copy exactly (edit only for tone):

| Card label | Composer text on click |
|------------|------------------------|
| Fix a failing test in this repo | `Investigate the failing tests in this repo and fix them. Start by listing recent test output and the files involved.` |
| Plan a feature from AGENTS.md | `Read AGENTS.md and the current workspace. Draft a short plan for the next feature, including files to touch and risks.` |
| Review a diff I pasted | `I'll paste a diff next. Review it for correctness, edge cases, and missing tests. Call out any risky patterns.` |
| Explain how Phi stores sessions | `Explain how Phi stores its sessions on disk (encoded cwd, JSONL format, tree and branch concepts) and how to locate one manually.` |

- **Card styling:** `text-left rounded-xl border border-phi-border bg-phi-bg-surface px-4 py-3.5 hover:bg-phi-overlay-hover hover:border-phi-border-strong transition-colors cursor-pointer` with `text-[13px] leading-5 text-phi-text-secondary` title + `text-[11px] text-phi-text-muted` sublabel if needed. No icons to keep quiet.
- **Behavior:** on click, `composerRef.setValue(template)` + focus end + `textarea.style.height = auto` reflow. Do not auto-send — user must press Enter.
- **No server call:** starter prompts are client-only. No slash or skill needs to exist to make them work.

### 14.4 File & State

- New `src/components/home.tsx` exporting `HomeHero({ onPickPrompt })`. Keeps `App.tsx` lean.
- `App.tsx` `!chat.activeFile` branch imports `HomeHero`; wire `onPickPrompt` to the same `handlePickStarterPrompt` that manipulates `phi:draft:new` via `localStorage` and dispatches `phi:draft-change` so `Composer` picks it up (since `Composer` reads storage key on mount/draftKey change and listens to drafts). For immediacy, also call `document.querySelector('textarea[aria-label="Message Pi"]')` to set value if present — same pattern as `focusComposer`.

### 14.5 States

- No sessions yet (zero groups): still show hero + prompts. Prompt chips are still usable — they'll attach `cwd` from `newChatCwd`.
- Sidecar down: fatal gate (M2) takes over — home not shown.

---

## 15. Session Search Palette — `:` Global Full-Text Hook

*(Detailed behavior already in §11.3 — this section only adds the SessionCommand wiring so the build checklist is complete.)*

- `SessionCommand` takes two new props in M3: `onSelectWithHighlight` (called with `(file, matchedMessageIndex)`) and `searchMode: "sessions" | "fulltext"`.
- Local `search` state: when `search.startsWith(":")` and `search.trim().length > 1`, set `mode = "fulltext"`, `fulltextQuery = search.slice(1).trimStart()`. Debounce `fulltextQuery` by `220ms` → `GET /api/search/all?q=...`.
- Render path diverges: `Command.List` for session-metadata uses `Command.Group` grouping; `fulltext` mode renders `FullTextGroup` with `snippet` + `displayCwd`.
- Defer global list virtualization — 40 rows is small. If `total > 40`, footer shows `Showing 40 of {total} — narrow the query`.
- **Preserve keyboard navigation:** `ArrowDown/ArrowUp` + `Enter` works identically in both modes (via `onSelect`).

---

## 16. Data Flow Deltas (via Express sidecar)

M1/M2 contract is `127.0.0.1` REST + SSE. M3 adds:

| Endpoint | Method | Purpose | Invalidation |
|----------|--------|---------|--------------|
| `POST /api/compact` | SSE | `session.compact(instructions)` | `invalidateSessionsCache` + `usageCache.delete(file)` on `done` |
| `POST /api/compact/abort` | JSON | `session.abortCompaction()` | — |
| `GET /api/session/usage` | JSON | Context usage + cost for bottom-left pills | `2s` TTL + invalidate on `prompt done` |
| `POST /api/steer` | SSE | `session.steer(text, {images})` | same as prompt |
| `POST /api/followup` | SSE | `session.followUp(text, {images})` | same as prompt |
| `GET /api/search/all` | JSON | Cursor-less global full-text (extends listAll) | `8s` TTL |
| `GET /api/search/session` | JSON | _Not needed_ — local search is client-side | — |
| `GET /api/auth/providers` etc | — | unchanged M2 | — |

All new endpoints log under `[phi sidecar]` at `debug` level. All reject with `400/404/409` + JSON `{ error }` like existing endpoints. No new auth path — `GET /api/search/all` reads session files only; no credential forwarding.

- **SSE reuse:** extract existing `sseHeaders` / `sendSSE` / `heartbeat` / `session.subscribe` / `entry.activePrompt` bookkeeping into `startSseStreamFor(entry, res, runFn)` helper to avoid copy-paste across three streaming endpoints.
- **Runtimes view:** `GET /api/runtimes` already exists — add `compacting: boolean` field for the banner.

**Frontend env consumers (no new Rust IPC):** queue persistence in `localStorage` (`phi:queue:{file}`), auto-scroll `useAutoScroll`, local search `useSearchInSession`. All bundled with Vite/Tailwind. `externalBin` still deferred for `tauri build` — dev stays `bun run dev:all`.

---

## 17. UI Structure — Net Changes

```
phi-layout
├─ phi-sidebar-wrap  (unchanged)
└─ phi-main
   ├─ Tabs (unchanged) + Tab sidebar slot (unchanged)
   └─ .rounded-xl.border.bg-phi-bg-main.flex-1  (existing)
      ├─ section.flex-1  (new: relative wrapper for sonners/sentinel)
      │  ├─ ChatViewport (now: ScrollViewport wrapper + sentinel + search strip)
      │  │  ├─ Conversation (stream + history) with expanded ToolActivityRow
      │  │  ├─ InlineErrorBlock / archivedErrors (existing)
      │  │  ├─ scrollSentinel (new) + ScrollToBottom pill (new)
      │  │  └─ local search strip (new, absolute under Tabs)
      │  ├─ queued card attached to composer (new, §13.2)
      │  └─ Composer (existing) + indicators row + DirectoryPicker/ModelSelector (existing+indicators pill left)
      └─ sonner stack (new, absolute bottom-right of phi-main)
```

- **Home branch:** `!chat.activeFile` renders `HomeHero` instead of the two-line placeholder. `ChatViewport` header search button still visible via `SessionCommand` toggles.
- **No drawer changes:** Linear-grade polish: keep `phi-layout` density; indicators uses existing border tokens; tool rows reuse overlay tokens.

---

## 18. Motion & Accessibility Deltas

- Budgeted new motions: **Scroll-to-bottom pill enter/exit**, **queue card dock (140ms ease-out)**, **sonner slide-in (180ms)**, **tool row expand (grid-rows + opacity, 160ms)**. Each respects `prefers-reduced-motion` — handled globally via `App.css` reduce block plus hook-level guard `if (prefersReducedMotion) { transition:none }`.
- Tool output scrolling must retain **focus ring** per WCAG — `pre` has `tabIndex=0` so keyboard users can arrow through output.
- All new buttons labelled (`aria-label`) and discoverable without hover.

---

## 19. States & Empty States

| State | Copy | Action |
|-------|------|--------|
| No session open (home) | see §14.2 | `HomeHero` + 4 prompts + shortcut list |
| No full-text results (local) | `No matches for "useChat"` | Clear input, keep strip open |
| No full-text results (global `:`) | `No messages matched "…". Try fewer words.` | Suggest removing `:` to search session names |
| Tool with no output | `No output` muted | Still `Copy output` shows disabled |
| Compaction in progress | `Compacting — 84k → …` | `Abort` |
| Compaction aborted/error | inline `Compaction aborted` error block | Dismiss / retry (retry re-invokes with same instructions) |
| Scroll at top, stream alive | Scroll pill + badge | `Scroll to bottom` |
| Queue full (2) + extra Enter | `Queued follow-up updated` toast | inline above composer, 1.6s |
| Background sonner | `SessionName — Finished` | `Open` / dismiss |

---

## 20. Performance Principles

Same as M1 §10 / M2 §10. Tightened for M3:

- Local full-text scan is synchronous but thinned: memoize by `messages.length` — only re-derive on change.
- Global `GET /api/search/all` must return `<400ms` on `500` sessions — pre-warm `sessions` file list (reuse `sessionsCache`), stream-read JSONL with `readline`, cap scans. If slower, ship a `truncated` warning rather than slow the palette.
- `queueByFile` persistence is debounced — never write on every keystroke (writes only on enqueue/discard/drain).
- Context/cost pill updates throttled `500ms` during streaming to avoid chatter.
- Tool output `pre` uses `contain: content` and `max-h` not `height` to avoid layout thrash on streaming `partial`.
- Scroll debouncing: `scroll` listener throttled `50ms` via `requestAnimationFrame`, not per `scroll` event `setState`.

---

## 21. Distribution

Same as M1 §11 / M2 §11: local personal tool, single yser, no remote daemon, no auth screen. Sidecar bundling via `externalBin` stays deferred; `bun run dev:all` iteration path remains. No `externalBin` work in this milestone — it would be scope bleed.

---

## 22. Open Questions for Build

1. **Token counting fidelity:** do we have SDK `usage.totalTokens` on `context`, or do we need to approximate from `messages.length`? Verify with a live Phi run against `phi` CLI + a known SDK session file — pick the more accurate source before wiring the pill.
2. **Compaction event fidelity:** does SDK emit `compaction_start/end` on the same `session.subscribe` channel as `message_update`, or via separate `agent` events? Confirm by spying `session.subscribe` in a sandbox `compact()` call; adjust sidecar forwarding if channel differs.
3. **Steer delivery window:** SDK docs say steer is "after current assistant turn's tool calls, before next LLM call". If the model is in a raw `text_delta` burst with no tool calls, does steer buffer until tool idle or does streaming continue to append? Test with a long prompt that forces a wordy response (no tools) and enqueue a steer — observe gating.
4. **Global search auth scope:** should sessions with no `header.cwd` (unknown) be searchable? Decide to include them with `displayCwd: "(unknown)"` — matches palette behavior.
5. **Tool path detection false positives:** `bash` args may contain strings with `/` that aren't workspace paths. Threshold: only treat `args.path` / `args.file` / `args.filePath` typed as path, plus `bash` `command` substrings matching `workspaceFilesSet` (from `GET /api/files`) to avoid spurious "Add to prompt" on arbitrary slashes.

---

## 23. Build Order

Sequenced to unblock parallel work and keep each PR reviewable:

1. **Scaffolding:** extend `WorkItem` types, `ToolActivityRow`, `ScrollViewport` skeleton, queue `localStorage` helpers — no user-visible change.
2. **Compaction E2E:** sidecar `POST /api/compact` + frontend `useCompaction` + `/compact` slash intercept + banner. Verify with a mid-size (~120k token) session.
3. **Context & cost pills:** `GET /api/session/usage` + bottom-left indicator. Verify with streamed and compacted sessions.
4. **Tool inspectability pass:** expandable rows, copy, `Add @path` affordance. Do before auto-scroll to minimize follow-on WorkingBlock rewrites.
5. **Auto-scroll + Scroll-to-bottom pill:** `useAutoScroll` + sentinel + floating button. Validate with streaming bursts while reading middle of history.
6. **Local & global search:** `useSearchInSession` (client) + `GET /api/search/all` (server) + `SessionCommand` `:` branch. Perf test on 500-session tree.
7. **Completion sonners:** `useCompletionSonner` + bottom-right stack.
8. **Queuing & steering (largest):** `useQueue` + queue card above composer + `POST /api/steer`/`/followup` + auto-drain on settlement. Test matrix in §25.
9. **Home redesign:** `HomeHero` + starter prompts — last because smallest blast radius, can even ship out-of-band.

Each step ships behind no feature flag — M3 lands as one milestone with incremental merges to `main`.

---

## 24. Acceptance — Success Criteria for M3

- **Compaction:** `/compact` appears in slash palette when a session is open and not streaming. Invoking it shows a `Compacting…` banner with `Abort`; success shows `Compacted · N → M tokens` with collapsible summary. `/compact extra instructions` forwards as `customInstructions`. `Abort` stops compaction. Switching sessions after compaction shows the compacted history via `revalidate`. Unit: sidecar SSE stream returns `compaction_start` → `compaction_end` → `done`.
- **Tool inspectability:** every tool row shows `name + readable arg + duration + chevron`. Running pulses amber, failed is red with `✕`, success is green. Clicking expands `Args` (pretty JSON + `Copy args`) and `Output` (scrollable `max-h-360` + `Copy output`). When `args.path` exists, expanded block shows `Add {path} to prompt` and clicking inserts `@path` at composer cursor. `Copy output` copies exact `result` text and flashes `Copied`.
- **Context & cost:** bottom-left of chat shows `Context X% · Ak/Bk tokens` pill with 2px inner progress bar and `Cost $n.nn` pill when streaming or settled; tooltip shows input/output/cache and model name. Pills only render when a session is active. Values refresh after each prompt and compaction. Never show hallucinated cost — `—` when unavailable.
- **Auto-scroll:** while streaming at bottom, conversation stays pinned; wheel/touch-away from bottom stops auto-scroll and reveals `Scroll to bottom` pill centered `above` the composer. Clicking pill re-pins and smooth-scrolls to tail. Not-at-bottom + new tokens increments `+N new` badge but never jumps.
- **Full-text search:** local strip: `⌘F` opens `Find in session` with count `i/N`, cycling with `Enter`/`Shift+Enter` + highlight. Global: typing `:query` in `SessionCommand` filters across all sessions' message contents with snippets; selecting a result opens that session and highlights the matched message. Local scan is client-side; global scan via sidecar.
- **Completion sonners:** starting a prompt in tab A while viewing tab B, when A finishes, shows a sonner `✓ SessionName — Finished` with `Open`. Clicking `Open` switches to A. Sonner auto-dismisses `6s`, stacks to 3, does not fire for foregrounded completion.
- **Queuing & steering:** pressing Enter while streaming does **not** show `A prompt is already running` — instead a `Queued` card appears above the composer with the staged text, `Steer now` + `Discard` + `Edit`. `Steer now` sends via `steer` while still streaming. Leaving the card attached auto-sends as `followUp` after settlement. `Edit` returns text to composer and removes the card. Queue persists per-file in `localStorage` and rehydrates after reload. Max visible `2` (one card + one `+1 more`) — additional Enter replaces the second. Drains sequentially without overlapping SSE.
- **Home redesign:** `New Chat` empty state shows `Build, Fix and Ship` title, a 2×2 grid of starter prompt cards, and a two-column keyboard shortcut legend below the logo. Clicking a prompt fills the composer (not auto-sends). Existing "No sessions found" line moves to muted footer.

---

## 25. Test Matrix (manual)

| Scenario | Expected |
|----------|----------|
| `/compact` typed with no session | not in palette |
| `/compact` while streaming | item disabled with tooltip |
| `/compact foo` | sidecar receives `{ customInstructions: "foo" }`, summary shown after |
| Abort compaction | inline abort block, session still usable |
| Context pill: model without `contextWindow` | shows `Context — · streaming…` then `—` |
| Cost: provider without `usage` | shows `Cost —` with tooltip |
| Tool row: `read src/x.ts` collapsed | shows `read` + `src/x.ts` chip + duration |
| Tool row expanded → `Copy args` / `Copy output` | clipboard contains pretty JSON / raw result, button flashes `Copied` |
| Tool row path click → Add to prompt | composer shows `… @src/x.ts` focused |
| Auto-scroll at bottom streaming | stays at bottom smoothly |
| Scroll to middle, let streaming run | pin breaks, pill appears, badge `+3 new`, no jump |
| Click pill | smooth scroll to bottom, badge resets |
| `Cmd+F` with session open | strip appears; typing "useChat" highlights matches; Enter cycles |
| Empty local strip result | `No matches` |
| `Cmd+K` → `:useChat` | global mode shows snippets across all sessions |
| `:nopexyz` | `No messages matched` + tip |
| Global select result | switches session and highlights matched message |
| Completion: background run finishes | sonner appears with `Open` |
| Completion: foregrounded run finishes | no sonner |
| Window blurred + active run finishes | sonner appears |
| Queue: Enter while streaming | `Queued` card attached above composer, composer clears |
| Queue: `Steer now` while streaming | message delivered via steer, agent continues without hard stop |
| Queue: do nothing, let agent settle | auto-drains as `followUp` → next streaming starts |
| Queue: `Edit` | text returns to composer, card gone |
| Queue: `Discard` | card gone immediately |
| Queue: reload while streaming + queued | card restored from `localStorage` |
| Queue: two queued, third Enter | second replaced, inline toast `Queued follow-up updated` |
| Home: `New Chat` with zero sessions | 4 prompt cards visible + `⌘K ⌘N …` legend; clicking card fills composer |
| Home: `New Chat` with sessions existing | hero still shown; sessions hint muted footer |

---

## 26. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `steer` delivery semantics are subtle — frontend `Steer now` could be perceived as interrupt/abort | Label clearly `Steer — after this tool call`, not `Interrupt`. Add tooltip `"Deliver after the current tool call, before the next model call"` |
| Global full-text over 1000 sessions is slow | Cap scan, stream-read, 8-way concurrency, `truncated` messaging — ship fast with honest truncation |
| Queue persistence lost on crash | Already acceptable (M2 drafts same). Document in help text: "Queued prompts don't survive app quit while streaming" if l14d TTL ever unclear — keep to `localStorage` only |
| Token counting heuristic misleading | Show `—` + tooltip when heuristic; prefer `usage` from SDK when available; test against live sessions |
| Tool output very large (megabytes) | Cap `Copy output` to `100k`, add `… truncated` copy guard |

---

## 27. Files Touched (indicative)

- `server/index.ts` — new endpoints + `startSseStreamFor` helper, `searchCache`, `usageCache`.
- `src/lib/api.ts` + `src/lib/sse.ts` — add `compactSession`, `abortCompaction`, `getSessionUsage`, `streamSteer`, `streamFollowUp`, `searchAll`.
- `src/hooks/useChat.ts` — extend `WorkItem` status/duration, expose `compactionStateByFile`.
- `src/hooks/useQueue.ts` *(new)*, `src/hooks/useAutoScroll.ts` *(new)*, `src/hooks/useCompletionSonner.ts` *(new)*.
- `src/components/composer.tsx` — intercept `/compact`, expose `insertMention`.
- `src/components/composer/slash-menu.tsx` — add Phi `/compact`.
- `src/components/conversation/scroll-viewport.tsx` *(new)*, `src/components/conversation/tool-activity.tsx` *(new)*, `src/components/conversation/conversation.tsx`, `src/components/conversation/working-block.tsx`.
- `src/components/conversation/search-strip.tsx` *(new)*.
- `src/components/session-command.tsx` — `:` global mode.
- `src/components/home.tsx` *(new)* — hero + starter prompts + shortcuts.
- `src/components/ui/sonner.tsx` *(new)*.
- `src/App.tsx` — placement: indicators row, queued card, sonner stack, scroll viewport.
- `src/App.css` — pill / card / skeleton tokens; no new color tokens needed.
- `src/types/session.ts`, `src/types/work.ts` — `usage`, `cost`, `ToolWorkItem` extensions.
- `docs/prd-milestone-3.md` — this file.

No Rust, no new env var, no migration. The sidebar, settings, and fatal gate stay as in M2.
