# Plan: Streaming abort when navigating to another session

> **Request:** “when sending a message and while the message is being responded to I enter a new session the current session stops” — is this by design or a bug, and how hard is it to fix?

Status: **Analysis only — no code changed.** Created 2026-08-28.

---

## 1. Verdict (TL;DR)

**It is by design given the current architecture, but it reads as a bug to users.**

- **Backend is intentionally single-session.** `server/index.ts` holds a singleton `AgentSessionRuntime` (`let runtime`). `runtime.switchSession()` / `runtime.newSession()` both call `teardownCurrent()` → `await this.session.abort()` (`node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session-runtime.js:103-105`). That aborts the in-flight `session.prompt()` and persists the turn as `stopReason: "aborted"`.
- **Frontend compounds it.** `src/hooks/useChat.ts` has a single `AbortController` (`abortRef`), single `isStreaming` + `streaming` buffer, and `handleSelect` in `src/App.tsx:29-38` switches without checking `isStreaming`. Navigating clobbers `activeFile` and the SSE reader is torn down; the pending `requestAnimationFrame` deltas are flushed or dropped.

Result: **any** navigation while streaming = abort. This is consistent internally, but violates the ChatGPT/Claude-style expectation that a response continues in the background.

**Two different fixes exist with very different cost:**

| Fix | Effort | User-visible result |
|-----|--------|---------------------|
| **A. Guard / make the abort explicit** (confirm dialog or block click while streaming) | **~0.5–1 day, low risk** | Stops *accidental* loss; abort is still the behavior but now intentional |
| **B. True background streaming** (session keeps running after you leave it) | **~1.5–3 weeks, high risk** | Matches expectation — needs multi-runtime architecture + persistent SSE jobs |

Choose A if you want a “quick win” for V1. Choose B only if “background agents” is a product priority for V1.

---

## 2. Reproduction

1. Open any existing session (or New Chat).
2. Send a prompt that takes >5s (e.g. asks for a long synthesis + tools).
3. While `isStreaming === true` (Streaming dot pulsing, `Composer` shows Stop), do either:
   - **a)** Click another session in `Sidebar` (`onSelect` → `handleSelect`).
   - **b)** Click **New chat** (`handleNewChat` → `chat.clear()`).

**Observed:** original session’s stream stops immediately. If you navigate back, history shows a truncated assistant message with `stopReason: "aborted"` — not the full answer.

**Expected by reporter:** original session should continue streaming in background, deliver its result, and be visible when you return (like Claude/Codex).

Files to reproduce with logging:
- `src/hooks/useChat.ts:160-260` — `prompt()` SSE loop
- `src/App.tsx:29-38` — `handleSelect` (does not guard on `chat.isStreaming`)
- `server/index.ts:143-233` — `POST /api/prompt` lifecycle + `POST /api/sessions/switch`

---

## 3. Root Cause — Layer by layer

### 3.1 Frontend — `useChat` is single-slot

`src/hooks/useChat.ts`:
- One `activeFile`, one `loading`, one `isStreaming`, one `streaming` snapshot.
- One `AbortController` on `abortRef.current`. `clear()` aborts it; `openFile()` does **not**.
- `prompt()` optimistically appends the user message to `data.context.messages`, then opens an SSE `fetch(..., { signal: ac.signal })` to `POST /api/prompt`.
- On success it does `getMessages(file)` to replace optimistic history; on abort it sets `error` but the `finally` still nukes `streaming` state.

`src/App.tsx`:
- `handleSelect` calls `sessions.switchTo(file)` (→ `POST /api/sessions/switch`) then `chat.openFile(file)`. No `if (chat.isStreaming) abort/confirm` guard.
- `handleNewChat` calls `chat.clear()` which *does* abort — but that *is* the problem: it explicitly kills the in-flight fetch.
- `scrollerRef` auto-scroll is keyed only to current `chat.streaming` — once you leave, the Streaming component unmounts and deltas are lost.

**Frontend alone would already look “broken”** even if the backend kept running, because state is overwritten.

### 3.2 SSE transport — `src/lib/sse.ts`

`streamPrompt()` creates a single `res.body.getReader()` tied to the caller’s `AbortSignal`. When React swaps `activeFile` and the old `Streaming` unmounts, nothing re-attaches to that reader. An `AbortError` is thrown, caught, and surfaced as `streaming.error`.

### 3.3 Backend — singleton `AgentSessionRuntime`

`server/index.ts`:
```ts
let runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>> | undefined;
async function getRuntime(cwd) { if (runtime) return runtime; ... }
```

- `GET /api/sessions/new` → `runtime.newSession()`
- `POST /api/sessions/switch` → `runtime.switchSession(file)`
- `POST /api/prompt` → uses `runtime.session` (the *current* session).

From `pi` SDK (`dist/core/agent-session-runtime.js`):

```ts
async teardownCurrent(reason, targetFile) {
  await this.session.abort(); // <-- persists aborted turn before replacing
  await emitSessionShutdownEvent(...);
  this.session.dispose();
}
async switchSession(path) { await this.teardownCurrent("resume", path); this.apply(await this.createRuntime(...)); }
async newSession()      { await this.teardownCurrent("new", ...); }
```

The runtime **can only own one session at a time** — it *must* abort to free the agent. Concurrent `prompt()` calls on different files are not queued; the second `switchSession` wins and the first prompt is cancelled.

`POST /api/prompt` also subscribes via `session.subscribe(...)` and tears down on `req.on("close")`. When the frontend’s SSE fetch is aborted by navigation, `req.on("close")` fires → `off()` → loop ends → `session.prompt()` is aborted server-side as well (second abort signal, but idempotent).

So **even if the frontend did nothing**, switching via `POST /api/sessions/switch` would still abort from the server.

### 3.4 Why it was built this way

Matches TUI `pi` semantics: one terminal = one active session. V1 PRD §7 explicitly scopes “New / Resume / Rename / Delete” and defers `steer/followUp` queue UI. The single-runtime keeps the sidecar stateless, trivial to debug, and matches the CLI source-of-truth (`~/.pi/agent/sessions/<encoded-cwd>/*.jsonl`).

---

## 4. By design or bug?

- **Engineer’s view:** by design — documented limitation of `AgentSessionRuntime`.
- **User’s view:** bug — violates principle of least surprise. Most chat products background the turn. No warning is shown before destruction; data is lost (truncated answer).
- **Product view:** design bug — the contract leaked. Should be either (a) explicitly guarded (“you’ll cancel this response — keep going in background or stop?”) or (b) upgraded to real background jobs.

No error is thrown visibly today (`switchSession failed` is just `console.warn` in `App.tsx:33-35`), sousers get silent data loss.

---

## 5. Can it be fixed? How hard?

**Yes, but the honest answer is “two fixes” with different hardness.**

### 5.1 Fix A — Guard / explicit abort (easy, reversible)

Goal: stop accidental abort; make remaining abort intentional and visible.

Complexity: **S** (0.5–1d, no SDK/arch change). Risk: low. No migration.

### 5.2 Fix B — True background concurrency (hard)

Goal: multiple sessions can stream simultaneously; navigating away does not cancel.

Complexity: **L** (1.5–3w + SDK surface work + testing). Risk: high — file locking on JSONL, model auth, per-session extension runners, resource leaks.

Why B is hard:
- SDK today assumes one `AgentSession` owns the model, tools, extensions, and cwd. Spawning N sessions = N `ModelRuntime` tenants + N cwd services + N `AgentSession` instances.
- You must manage a `Map<sessionFile, { session, abortController, sseClients }>`, lifecycle (LRU eviction, dispose on delete), and broadcast SSE to any frontend re-attachment.
- `SessionManager` appends to JSONL — concurrent writes are fine if sessions are distinct files, but `listAll` / `getAvailable` must not race.
- Tool `bash` / `read` / `edit` side effects run in session cwd — two sessions in same cwd could race on filesystem.
- Testing matrix explodes (abort A while B runs, switch A→B→A, New Chat while streaming, reload while streaming).

---

## 6. Detailed Options

### Option A1 — Block navigation while streaming (minimal)

**Changes:**
- `src/App.tsx`: in `handleSelect`/`handleNewChat`, if `chat.isStreaming` → `if (!confirm("A response is still streaming. Switching will abort it. Continue?")) return;` or disable Sidebar rows + New chat button while `isStreaming`.
- `src/components/sidebar.tsx`: `SessionRow` `disabled={isStreaming}` + tooltip; `Sidebar` passes `isStreaming`.
- Optionally `src/hooks/useChat.ts`: `openFile` should call `abortRef.current?.abort()` explicitly before switching so the abort is traceable (not just overwritten).

**Pros:** 20 lines. No backend change. Fixes accidental part of bug. Good V1 hygiene.
**Cons:** Still aborts if user confirms — doesn’t deliver “background” expectation.
**Effort:** ~2–4h.

### Option A2 — Warn + offer “Keep running” that just blocks (same but nicer copy)

Same as A1 but copy is “Stop response and switch?” vs “Keep streaming — stay here and use Stop to cancel.” Add a toast after abort: “Response stopped — truncated message saved.” Persist `stopReason` visibly in `Conversation` (already rendered via `entries` after reload).

**Pros:** clearer mental model; reuses existing `chat.abort()` + `POST /api/abort`.
**Cons:** still not background.
**Effort:** ~0.5d.

### Option B1 — Frontend-only “hide but don’t kill” (trap)

Attempt: keep `chat.streaming` state per file in a `Map` in `useChat`, don’t call `clear`/`openFile` teardown while streaming; just hide `Streaming` component. Frontend keeps the same fetch alive hidden.

**Why it fails alone:** server still aborts on `POST /api/sessions/switch`. You’d have to *stop calling* `switchSession` while streaming (so backend never tears down). But then `GET /api/sessions/messages?file=` would still show stale data, and the SSE would still be tied to the old `runtime.session` which you just left. The moment you later call `switchSession` you’d still abort. This option without backend work only delays the abort, doesn’t avoid it.

**Verdict:** do not pursue alone.

### Option B2 — Multi-runtime sidecar (real fix)

**Server work (`server/index.ts`):**
- Replace singleton `runtime` with `Map<string, RuntimeEntry>` keyed by `sessionFile` (or cwd+id).
- Introduce `RunningPrompt` registry: `Map<sessionFile, { session, controller, subscribers: Set<res> }>`
- `POST /api/prompt`:
  - Resolve or create entry for `sessionFile` (no global switch).
  - Lazily instantiate `AgentSessionRuntime` per distinct cwd/session if not in map (reuse `createAgentSessionServices` + `createAgentSessionFromServices`).
  - Store `session.prompt(text)` promise; stream via `session.subscribe`.
  - On `req.on("close")` (client navigated away), **do NOT abort** — just remove that HTTP subscriber from `subscribers`. Keep session alive. Allow re-attach via `GET /api/prompt/stream?file=...` (new SSE endpoint that re-subscribes to the already-running session).
  - `POST /api/abort` gains `{ file }` param; only aborts targeted session.
- `POST /api/sessions/switch` / `new` must **not** call `teardownCurrent` globally — just ensure the target entry exists; leave other entries untouched.
- GC: evict idle runtimes on LRU (>N or >M minutes) calling `dispose()`; ensure `deleteSession` disposes entry.

**SDK dependency:** verify `createAgentSessionServices({cwd})` is cheap enough to hold N instances; check `ModelRuntime` can be shared (it already is — singleton `modelRuntime`). Confirm `SessionManager.listAll` is safe concurrent.

**Frontend work:**
- `src/hooks/useChat.ts`: store `Map<file, StreamingState>` + `Map<file, AbortController>` so leaving a session doesn’t drop its deltas; or keep a `useChatRegistry` hook that survives `activeFile` changes.
- `src/App.tsx`: on `handleSelect`, don’t abort; just swap visible `file` and re-subscribe to ongoing stream if entry still in `isStreaming` set (poll `GET /api/prompt/status` or keep SSE EventSource per session).
- `src/lib/sse.ts`: add `streamPromptStatus(file)` / `reattachStream(file, onEvent)` helper.
- `src/components/sidebar.tsx`: show streaming indicator (pulsing dot) on any session in `runningFiles`, not just `activeFile`.
- Composer: `isStreaming` becomes per-file (`runningFiles.has(activeFile)`), so Stop only aborts activeFile.

**Pros:** true background — answers complete even after you browse away; return shows updated message.
**Cons:** largest change; new concurrency bugs; higher memory/CPU (multiple model calls + tools parallel); JSONL writes from multiple sessions in same cwd could interleave; need new API contract.

**Effort breakdown:**
- Spikes: 2d to validate multi-runtime via SDK (does `createAgentSessionFromServices` per file conflict with global `getAgentDir()` lock? Can two `AgentSession`s share one `ModelRuntime` concurrently?).
- Server refactor: 4–6d.
- Frontend refactor: 3–4d.
- Stress/E2E testing (concurrent prompts, abort one but not other, delete while running, offline): 2–3d.
- Docs + migration: 0.5d.
**Total: ~12–16d for a single dev; 8–10d with pairing on SDK.**

### Option B3 — Queue-and-replay (middle ground)

Single runtime remains, but `POST /api/prompt` enqueues to a job queue instead of `switchSession`-abort. Navigating away **pauses subscription** but does not abort; the job continues to run attached only to server-side `session.prompt()` promise. When you return, `GET /api/sessions/messages?file=` shows final state after done (no live re-attach). Visually it looks like “went away and came back to a finished answer” but without live deltas while away.

**Simpler than B2** because you still hold one runtime — you just stop coupling HTTP lifecycle to prompt lifecycle. However “switchSession” still must abort *only* if the queued job targets a different file. So you either queue behind switch (slow) or keep one job per file with one runtime serializing (still loses true parallelism).

**Effort:** ~3–5d, but UX is half-baked (no live background indicator).

---

## 7. Recommendation

For Phi V1 (“palishable personal tool” per PRD §11):

1. **Ship Option A1/A2 immediately** — 1 PR, <100 LOC, zero regression risk. It turns silent data loss into explicit user intent. This alone resolves the bug report’s pain.
2. **Decide B2 scope via answers below.** If “background agents” is a launch differentiator, schedule B2 as V1.5 with a spike first. Do not block V1 on B2.

**Suggested sequence if B2 is desired:**
- Week 1: Spike — can we hold 2 `AgentSession` instances against same `ModelRuntime` and stream both to separate SSE responses without file corruption? If spike fails → fallback to A and document limitation.
- Week 2: Implement server `RuntimeRegistry` + `GET /api/prompt/stream` re-attach + `POST /api/abort {file}`.
- Week 3: Frontend multi-slot `useChatRegistry` + Sidebar running dots + Composer per-file Stop + E2E.

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users still expect background after A fix | Perceived incomplete fix | Copy in confirm dialog: “Phi runs one session at a time today — response will stop. Background streaming is planned for V1.5.” + link to issue |
| B2: file lock on `~/.pi/agent/sessions/*.jsonl` | Corrupted JSONL | Keep strictly one session object per file; never mutate same file from two entries. Lock by `sessionFile` in registry. |
| B2: Model auth rate limit | Two sessions → 2x API calls → quota | Reuse single `ModelRuntime`; throttle concurrent `prompt()` to N (e.g. 2) |
| B2: Leaked runtimes | Memory/extension handlers accumulate | LRU with `dispose()` on evict + on `DELETE /api/sessions` + on server idle timeout |
| B2: `SessionManager` inMemory vs persisted divergence | New session while streaming leaves orphan | Align `listAll` refresh to registry view, not just disk |

---

## 9. Test Plan (for any fix)

- Manual repro from §2 — verify confirm blocks or streaming continues (depending on A vs B).
- Automated:
  - `fetch POST /api/prompt` with 10s delay (mock model) → `POST /api/sessions/switch` in parallel → assert A: first prompt’s `done` never arrives / history has `aborted`; B: history has `completed`.
  - Frontend Vitest for `useChat`: call `prompt()` then `openFile(other)` → assert `abortRef.signal.aborted` state.
  - E2E (Playwright): send, click another session within 500ms, return — assert banner or full message per variant.

---

## 10. Open Questions for Product

1. Should switching *always* abort even after B2 if the user clicked **Stop** before switching, or keep abort as explicit only?
2. Is true parallelism (2 models at once) desired, or is “keep one running while I browse” sufficient (serial queue behind running job)? Parallelism cost is API billing x2.
3. Should background sessions show a global progress toast (like Codex) so user knows work finished while away?
4. Do we need to persist “running” state across app reload (sidecar restart)? If yes, B2 needs disk marker for orphaned prompts.

---

## 11. Files & Next Steps

**Files touched by A (easy):**
- `src/App.tsx` — guard `handleSelect`/`handleNewChat` on `chat.isStreaming`
- `src/hooks/useChat.ts` — make `openFile` abort-safe, expose `isStreamingFile` set
- `src/components/sidebar.tsx` — disabled state + indicator
- `src/lib/api.ts` / `server/index.ts` — no change required

**Files touched by B (hard):**
- `server/index.ts` — `RuntimeRegistry`, `GET /api/prompt/stream`, `POST /api/abort {file}`
- `src/hooks/useChat.ts`, `src/lib/sse.ts`, `src/App.tsx`, `src/components/sidebar.tsx`, `src/components/composer.tsx` — per-file streaming map

**Next action:** PM to pick A vs B. If A, I can produce a 1-PR spec + copy for the confirm dialog on request. If B, approve the 2-day SDK spike first before committing schedule.

