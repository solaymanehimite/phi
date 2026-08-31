# Multi-session runtime support

## Goal

Allow multiple sessions to run prompts at the same time.

Each session may have one active prompt. Queueing and steering within the same session are out of scope for this change.

Example:

```text
Session A: prompt running in ~/project-a
Session B: prompt running in ~/project-b
Session C: idle
```

Switching sessions must not abort background work. The Stop action must only affect the selected session.

## Current architecture

The frontend can display many persisted sessions, but the sidecar owns one mutable runtime:

```ts
let runtime;
```

That runtime contains the active SDK session, its directory-bound services, tools, extensions, and session manager. `getRuntime(cwd)` creates or reuses that runtime. When a different directory is requested, the global runtime can be replaced.

The model endpoint and abort endpoint also operate on whichever session is attached to that global runtime. This allows directory loading, model changes, prompts, and session switches to target different sessions when requests overlap.

`ModelRuntime` is separate. It contains the shared model catalogue and provider configuration and can remain process-wide.

## Domain terms

- **Persisted session:** A JSONL session file stored by Pi.
- **Live session:** A persisted session currently represented by an SDK runtime in the sidecar.
- **Session runtime:** The SDK runtime and services associated with one live session.
- **Active prompt:** The one prompt currently running for a live session.

The registry must use the session file as its key. A directory is not enough because multiple sessions can use the same directory.

## Backend plan

### 1. Add a session runtime registry

Replace the single global runtime with a registry keyed by `sessionFile`.

Each entry should own:

- Session file
- Working directory
- SDK runtime
- Agent session
- Active prompt status
- Abort handling
- Last-used time

Create a helper that loads an existing session runtime or creates one for a new session. The runtime must use services configured for the session's directory.

Keep the shared `ModelRuntime` global.

### 2. Make model changes session-specific

Update `/api/model` to require the target `sessionFile`.

The endpoint must resolve that session's runtime and apply the model and thinking level there. It must not use a process-wide `runtime.session` fallback.

The frontend model hook and API helper must pass the active session file.

### 3. Make prompts session-specific

Update `/api/prompt` so it resolves the runtime from `sessionFile` and uses that runtime for the complete prompt.

The request should include:

- `sessionFile`
- `cwd`
- Prompt text
- Images, when present

The backend should resolve the directory once, verify it matches the session context, and never fall back to the process working directory for an existing session.

The prompt must reject if that session already has an active prompt. Other sessions must continue running.

### 4. Make abort session-specific

Update `/api/abort` to receive `sessionFile`.

Abort only the prompt owned by that session. Do not call abort on whichever runtime happens to be global.

### 5. Isolate command discovery

`/api/commands` currently calls `getRuntime(cwd)`, which can replace the active runtime.

Change command discovery so it uses directory-bound services without replacing any live session runtime. It may use a short-lived resource context or a matching session runtime when one already exists.

### 6. Clean up live runtimes

Add a cleanup policy for runtimes that have been idle for a defined period. Do not dispose a runtime while its prompt is active.

The cleanup policy should be safe when a session is selected again after being evicted. The session must be reloaded from its persisted file.

## Frontend plan

### 1. Make chat state session-keyed

`useChat` currently stores one global streaming state and one abort controller.

Move live state into a map keyed by `sessionFile`:

- Streaming text
- Thinking text
- Tool activity
- Errors
- Started time
- Abort controller
- Prompt status

The selected session should determine which entry the conversation view renders.

### 2. Keep background streams alive

When the user switches sessions:

- Do not abort the previous session.
- Keep its SSE connection open.
- Continue updating that session's state.
- Render the newly selected session's state.

When the user returns, show the latest live state or the completed persisted response.

### 3. Scope model state

Model and thinking selections must be associated with the selected session.

For a new chat, keep draft choices until the session is created. After creation, apply them to the new session's runtime before starting its first prompt.

The first prompt must use the same session runtime that received the model change.

### 4. Update session switching

Remove the current confirmation that says switching will abort a streaming response.

Session switching should only change the selected session in the UI. The backend session runtime for the previous session must keep running.

### 5. Update the sidebar

Show a small running indicator for sessions with active prompts, including sessions running in the background.

The sidebar should not need to load the full stream into every row. It only needs prompt status and possibly an error state.

### 6. Preserve the one-prompt rule

If the selected session is already running:

- Keep the composer disabled for a new prompt.
- Keep Stop available.
- Do not add queueing or steering behavior.

Other sessions must remain available and may continue running.

## Suggested implementation order

1. Add backend session runtime entries and explicit session lookup.
2. Update model, prompt, and abort endpoints to use `sessionFile`.
3. Isolate `/commands` from live runtime replacement.
4. Add backend tests for two simultaneous sessions.
5. Convert `useChat` streaming and abort state to session-keyed maps.
6. Remove abort-on-navigation behavior.
7. Add sidebar running indicators.
8. Test different directories, models, and same-directory sessions.
9. Add runtime cleanup after the main flow works.

## Acceptance criteria

- Session A and Session B can stream prompts concurrently.
- A and B can use different directories.
- A and B can use different models and thinking levels.
- Switching sessions does not stop either prompt.
- Stopping A does not stop B.
- The first prompt uses the model selected for its session.
- The persisted `cwd` matches the directory selected for the session.
- Loading commands for one directory cannot replace another session's runtime.
- A second prompt in a running session is rejected or disabled without affecting other sessions.
- Restarting the app still loads completed session history normally.
