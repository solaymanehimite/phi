# Phi

Fast desktop GUI for the Pi coding agent. Replaces the terminal TUI for daily browsing, resuming, and prompting sessions. Same session files (`~/.pi/agent/sessions`), no second source of truth.

## Language

### Session
A persisted conversation rooted in a workspace directory, stored as a JSONL file under `~/.pi/agent/sessions/<encoded-cwd>/`.
_Avoid_: chat, thread, history

### Workspace
The decoded cwd a session is bound to (e.g., `~/projects/foo`). A session never changes workspace.
_Avoid_: project, directory, folder, cwd (in UI copy)

### Abort
An intentional user stop of an in-flight turn via Stop.
_Avoid_: cancel, kill, stop (as noun)

### Interruption
An unintentional loss of an in-flight turn — quit, crash, or sidecar disconnect — that auto-aborts the session.
_Avoid_: abort (for accidental cases), crash

### Continuation
Resuming an aborted or interrupted turn from its checkpoint, like `pi continue`.
_Avoid_: retry, resume, continue (as generic verb), regeneration

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
