# Phi

Fast desktop GUI for the Pi coding agent. Replaces the terminal TUI for daily browsing, resuming, and prompting sessions. Same session files (`~/.pi/agent/sessions`), no second source of truth.

## Language

### Session
A persisted conversation rooted in a workspace directory, stored as a JSONL file under `~/.pi/agent/sessions/<encoded-cwd>/`.
_Avoid_: chat, thread, history

### Workspace
The decoded cwd a session is bound to (e.g., `~/projects/foo`). A session never changes workspace.
_Avoid_: directory, folder, cwd (in UI copy)

### Project
A user-curated `{ name, path }` pointing at a workspace directory, stored app-local in localStorage. Sessions join a project via exact cwd match; the sidebar lists projects by name, not raw paths. A session directory with no entry appears as an implicit project using its folder name. Home (`~`) is never injected — it only appears if it has sessions.
_Avoid_: workspace (a project points at one; it isn't one), directory, folder

### Abort
An intentional user stop of an in-flight turn via Stop.
_Avoid_: cancel, kill, stop (as noun)

### Interruption
An unintentional loss of an in-flight turn — quit, crash, or sidecar disconnect — that auto-aborts the session.
_Avoid_: abort (for accidental cases), crash

### Continuation
Resuming an aborted or interrupted turn from its checkpoint, like `pi continue`.
_Avoid_: retry, resume, continue (as generic verb), regeneration

### Undo
Returning the conversation to before the last turn and restoring workspace files to their pre-turn snapshot. Sending a new message afterwards forks the session and clears redo.
_Avoid_: revert, rewind

### Redo
Re-applying the most recently undone turn. Ephemeral per session — lost on sidecar restart or session eviction — while undo still works from the session tree.
_Avoid_: continue, retry

### Inline Error
An error block persisted as the tail node of a session's conversation (abort, auth, rate limit, provider down) with a Continue action.
_Avoid_: banner, toast (for session errors), fatal

### Fatal State
A full-window gate when the app cannot reach the sidecar (`/api/health` fails). No session UI renders underneath.
_Avoid_: error page, offline screen

### Provider
An OpenAI-compatible model endpoint defined by `{ baseUrl, apiKey }`, app-local and stored in the OS keychain.
_Avoid_: integration, connection, credential, API config

### Theme
A complete token set for one appearance (Dark, Light, or System which follows the OS). Hand-designed, not auto-inverted.
_Avoid_: skin, style, color scheme (in code)

### Token
A semantic CSS variable (`--color-phi-*`) that is the only allowed source of color. Hardcoded colors are a bug.
_Avoid_: variable, color, constant

### Playground
The temporary theme editor that mutates currently-applied tokens for preview. Resets on reload, exportable as JSON, not persisted as a theme.
_Avoid_: theme editor, customizer, theme builder

### Draft
Unsent composer text auto-saved per session (or per new-chat) to localStorage, indicated by a cursor icon next to the session name.
_Avoid_: autosave, unsent message

### Tab
An open session handle in the header bar, including the special New Chat draft tab.
_Avoid_: window, session tab

### Context Indicator
The composer ring showing session context usage, opening cost stats on click.
_Avoid_: token ring, usage badge
