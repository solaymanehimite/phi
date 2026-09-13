# Incremental rewrite

Living plan for paying down structure debt without a full rewrite. Work top to bottom. Each item is scoped so it can land on its own. Nothing here changes product behavior unless noted.

Status: audit only. No code changed for this doc.

## How to use this doc

1. Start with section 1. Add tests before structural work.
2. Do one numbered section at a time.
3. Keep behavior unchanged unless the item says otherwise.
4. Update this file when an item lands: mark done, note what changed.

## Verdict

The codebase is workable, not bad. Product concepts are clear, the renderer builds, and hard cases like streaming, undo, and session resume have real handling.

The main risk is confidence. Session, streaming, undo, queue, tab, and persistence logic sits in a few large files with no automated tests. That makes ordinary changes brittle.

Good enough for active development. Not yet safe for fast production changes. Refactor in place. No rewrite needed.

## Order of work

1. Safety net and type gates
2. Small correctness fixes
3. SSE and stream reducer consolidation
4. Tab state extraction from App
5. Server split
6. Shared contracts
7. Persistence standard
8. Lazy loading
9. File moves and renames
10. Dead code and repo hygiene
11. Terminology and accessibility

## 1. Safety net before structural work

There are no tests and no lint script. The build is the only gate.

### Add characterization tests first

Cover current behavior, not ideal behavior:

- Stream event reduction: text deltas, thinking blocks, tool start/update/end, custom notices, error events.
- Tab promotion and closure: draft tab becomes session tab in place, closing last chat tab creates a fresh draft.
- Project normalization: tilde expansion, trailing slash, empty input, duplicate paths.
- Queue ordering: enqueue, drain head first, edit, remove, send now.
- Undo turn selection: latest turn on visible branch, ancestor match, fallback to parent of last user message.
- Path safety: reject absolute paths outside repo root, `.git`, nested repos, null bytes.
- Thinking level clamp: unsupported levels fall back per model map.
- Provider input: missing id/baseUrl/key, bad URL scheme.

Even 15 focused tests change how safely the rest can land.

### Add missing scripts

`package.json` has build and dev scripts but no `test`, `lint`, or `typecheck`.

Suggested:

- `test`: unit tests for lib, hooks reducers, and server helpers.
- `typecheck`: strict check for `src`, `server`, `electron`, and `scripts`.
- `lint`: at least unused exports, banned terms in UI copy, and token violations.

## 2. Small correctness fixes

These are cheap and show why tests matter. Each is independent.

1. Absolute workspace fallback in `src/App.tsx:1068` and `src/App.tsx:1086`.
   Uses `/home/solaymanehimite/Dev/ship/Phi` as fallback cwd for optimistic sessions. Replace with `selectedCwd`, `realCwd`, or empty string. Never ship a machine-specific path.

2. Stale stylesheet link in `index.html:35`.
   References `index-D0ioivR4.css`. Build warns it does not exist at build time. Remove the hardcoded link and let Vite inject assets.

3. Missing packaged icons.
   `electron-builder.yml` points at `build/icon.png`, `build/icon.ico`, `build/icon.icns`. None exist. Either add them or remove the references so packaging fails loudly instead of silently.

4. Project creation return value in `src/hooks/useProjects.ts:55-74`.
   Depends on a React state updater running synchronously. React does not guarantee that. Read from sanitized current state first, compute the result, then store it. The fallback can otherwise return a different ID than what was stored.

5. Unstable compaction options object in `src/App.tsx:195`.
   `useCompaction({ revalidate: chat.revalidate })` creates a new object every render. `useCompaction.ts:107` lists whole `opts` as a dep, so `compact` is recreated every render. Pass `revalidate` directly or memoize the options object.

6. Always-true compact check in `src/App.tsx:1030`.
   `after.length >= 0` is always true. Simplify to exact match plus known prefixes.

7. Search shortcut ownership in `src/App.tsx:1195`.
   Passes `onOpenSearch: () => {}` and relies on `SessionCommand` for the real shortcut. Move ownership to one place.

8. Provider Show/Hide control in `src/components/settings.tsx:634-635`.
   Server only returns a masked key. "Show" reveals nothing new. Either return full keys only to local trusted UI, or change the control to copy/test/delete without a fake reveal.

9. Uncapped queue persistence in `src/hooks/useMessageQueue.ts`.
   Queued messages can include base64 images. Storage is explicitly uncapped and write failures are ignored. Cap count and bytes, skip images in persistence or store them separately, and surface failures.

10. Dialog overlay role in `src/components/settings.tsx:608`.
    `DialogOverlay role="presentation"` overrides the modal semantics from `src/components/ui/dialog.tsx`. Remove the override or make the dialog component own dismissal.

## 3. Consolidate SSE transport

Same logic exists three times:

- `src/lib/sse.ts:6`, `streamPrompt`
- `src/lib/api.ts:167`, `streamCompact`
- `src/lib/api.ts:291`, `streamContinue`

Create one `postSse(path, body, onEvent, signal)` helper that owns:

- base URL resolution
- auth headers
- non-OK response parsing
- frame splitting on `\n\n`
- ping and blank line skipping
- malformed JSON tolerance
- trailing buffer flush

Then prompt, continuation, and compaction only supply path, body, and callback.

Also move `SseEvent` into `src/types/session.ts` or a shared `src/types/sse.ts`. Both `lib/api.ts` and `lib/sse.ts` define it loosely today.

## 4. Extract stream reducer from useChat

`src/hooks/useChat.ts` is 785 lines. Prompt handling around line 527 and continuation handling around line 383 duplicate the same branches. The continuation copy is compressed into hard one-liners.

Extract pure functions:

- `reduceStreamEvent`
- `extractCustomNotice`
- `extractToolResultText`
- `createPendingStream`
- `finishStream`

Goals:

- No React state inside the reducer.
- Same code path for prompt and continuation.
- Unit tests without mocking fetch or SSE.
- `useChat` keeps controllers, cache, running flags, and final refresh.

This is the highest value renderer refactor.

## 5. Move tab state out of App

`src/App.tsx` is 1,408 lines with 18 effects and heavy memo use. It owns tabs, session selection, models, thinking levels, errors, sonners, queue draining, continuation, compaction, undo/redo commands, quit handling, and shortcuts.

Start with `useTabs` or `useOpenTabs`:

- open tab ids plus ref mirror
- active draft tab
- per-draft workspace map
- create, promote, select, cycle, close
- settings and demo special tabs
- always-one-chat-tab invariant

Use a reducer for transitions. Tab promotion and close-next selection are deterministic and testable.

Do not split JSX by size alone. Move coherent state machines first. `ChatViewport`, `ScrollToBottomButton`, and composer wiring can follow.

## 6. Split the sidecar by responsibility

`server/index.ts` is 1,887 lines with 24 routes plus runtime registry, Git snapshots, undo/redo, providers, command discovery, file walking, SSE plumbing, caching, and stats.

First mechanical split, no behavior change:

- `server/runtime-registry.ts`
- `server/sse.ts`
- `server/checkpoints.ts`
- `server/git-snapshots.ts`
- `server/routes/sessions.ts`
- `server/routes/streaming.ts`
- `server/routes/nav.ts`
- `server/routes/providers.ts`
- `server/routes/files.ts`
- `server/routes/stats.ts`
- `server/routes/commands.ts`

The file already has clear section comments, so boundaries are visible. Keep route paths stable. Share `ApiError`, auth, and validation helpers from one module.

Longer term, separate transcript nav from file restore. Undo currently couples both. Files-first then conversation is correct, but the code paths should be independently testable.

## 7. Share request and response contracts

The client and server drift because types are loose:

- About 80 `any` uses in `server/index.ts`.
- About 32 in renderer source.
- `src/types/session.ts` keeps Phase 1 loose shapes.
- Routes cast `req.body` without runtime checks.

Create shared contracts for:

- session create/switch/rename/delete
- prompt/continue/compact bodies
- undo/redo bodies and results
- model set bodies
- provider CRUD
- files and commands responses
- SSE events

Type every request body and SSE event. Add runtime validation at the sidecar edge. TypeScript cannot validate remote-host responses or HTTP input, so validation matters more than types alone.

This removes many casts in `App.tsx`, `useChat.ts`, `useModels.ts`, and server route handlers.

## 8. Standardize persisted renderer state

Persistence uses too many patterns:

- `useLocalStorage`
- module-level external stores
- direct `localStorage` calls
- custom browser events
- ad hoc expiry
- duplicated draft load logic in `Composer`

Affected state:

- hosts in `src/hooks/useHosts.ts`
- custom themes in `src/hooks/useCustomThemes.ts`
- drafts in `Composer` and `src/hooks/useDraft.ts`
- queues in `src/hooks/useMessageQueue.ts`
- projects in `src/hooks/useProjects.ts`
- flags in `src/hooks/useSessionFlags.ts`

Pick one external-store pattern with:

- versioned keys
- sanitize on load
- safe write failures
- cross-tab sync where needed
- no custom DOM events for same-tab updates

`useHosts` is the best template. It already uses `useSyncExternalStore` and explicit storage readers for non-React callers. Draft change events like `phi:draft-change` should go away.

## 9. Lazy load heavy UI

Production JS is 1.52 MB minified, 471 KB gzip. Vite warns about chunk size.

Good candidates for `React.lazy`:

- `src/components/settings.tsx`
- `src/components/ui-demo.tsx`
- `src/components/dev/ThemeEditor.tsx`
- Prism grammar bundle in `src/lib/prism-languages.ts`

The app loads more than 30 Prism grammars at startup. Most sessions never use most of them. Load common grammars eagerly and the rest on demand by detected language.

## 10. Naming conventions

Use this for new files. Apply to old files during the moves in section 11.

### General rules

- Files are kebab-case: `session-command.tsx`, `use-message-queue.ts`, `theme-tokens.ts`.
- Components are PascalCase: `SessionCommand`, `ThemeEditor`, `ContextIndicator`.
- Hooks start with `use` and live in `src/hooks`: `useChat`, `useSessions`, `useTabs`.
- Types live with their feature or in `src/types`. No duplicate event and model types across `lib`.
- Keep CONTEXT.md terms in file, symbol, and UI names. Session is not chat. Workspace is not project. Abort is not cancel. Continuation is not retry. Sonner is not notification.

### Renderer

- `src/components/ui/`: only reusable primitives. No session, workspace, provider, or theme-domain logic.
- `src/components/session/`: session list, rows, search, command palette.
- `src/components/composer/`: composer plus slash and mention menus.
- `src/components/conversation/`: transcript, streaming, tool lines, working state.
- `src/components/settings/`: one file per settings section.
- `src/hooks/`: state and side effects only. No JSX.
- `src/lib/`: pure helpers, API transport, storage adapters. No React state.

### Sidecar

- `server/index.ts`: app setup and route mounting only.
- `server/routes/`: HTTP layer only. Parse, validate, call service, respond.
- `server/services/`: runtime registry, sessions, models, providers, stats.
- `server/git/`: snapshots and restore.
- `server/sse.ts`: headers, heartbeat, frame writer.

### Tests

Mirror source paths:

- `src/lib/__tests__/projects.test.ts`
- `src/hooks/__tests__/tabs.test.ts`
- `server/services/__tests__/paths.test.ts`

## 11. File moves, renames, and removals

### Misplaced or confusingly named today

1. `src/lib/sse.ts` and streaming functions in `src/lib/api.ts`.
   Problem: two homes for transport. Move all SSE into `src/lib/sse-client.ts` or keep `api.ts` for JSON and `sse.ts` for streams. Do not keep both patterns.

2. `src/lib/directories.ts`, `src/lib/paths.ts`, `src/lib/projects.ts`.
   Problem: three small path/project helpers with overlapping scope. Merge path formatting into `src/lib/paths.ts`. Keep project membership in `src/lib/projects.ts`. Fold `directories.ts` Electron helpers into `src/lib/electron.ts` or `src/lib/picker.ts`.

3. `src/components/session-command.tsx`.
   Problem: name hides that it is global search plus command palette. Rename to `src/components/session/search-palette.tsx` or `global-search.tsx`.

4. `src/components/tabs.tsx`.
   Problem: generic name for session and draft tabs. Move to `src/components/session/tabs.tsx` and rename types from chat tabs to session tabs.

5. `src/components/settings.tsx`, 651 lines.
   Problem: appearance, providers, and hosts in one file. Split to:
   - `src/components/settings/settings-panel.tsx`
   - `src/components/settings/appearance-tab.tsx`
   - `src/components/settings/providers-tab.tsx`
   - `src/components/settings/hosts-tab.tsx`

6. `src/components/composer.tsx`, 853 lines.
   Problem: draft persistence, image uploads, slash detection, mention search, keyboard handling, and layout in one component. Extract:
   - `src/components/composer/use-composer-draft.ts`
   - `src/components/composer/use-image-attachments.ts`
   - `src/components/composer/slash-trigger.ts`
   - `src/components/composer/mention-search.ts`
   Keep `composer.tsx` as layout and wiring.

7. `src/components/sidebar.tsx`, 1,095 lines.
   Problem: project groups, pinned/archived lists, scroll fades, marquee titles, icons, and rows together. Extract:
   - `src/components/session/sidebar.tsx`
   - `src/components/session/session-row.tsx`
   - `src/components/session/marquee-title.tsx`
   - `src/components/session/scroll-fades.tsx`

8. `src/components/dev/ThemeEditor.tsx`, 939 lines.
   Problem: dev playground ships in the same bundle path as production UI. Keep the file, but lazy load it and consider `src/components/theme/playground.tsx` as a clearer home outside `dev`.

9. `src/components/ui-demo.tsx`.
   Problem: demo panel is useful but not app UI. Move to `src/components/dev/ui-demo.tsx` and lazy load it. It should never load in normal startup.

10. `src/components/code-theme.tsx`.
    Problem: name is ambiguous next to app themes. Rename to `code-highlight-theme.tsx` or move to `src/components/conversation/code-theme.tsx` if it is only used for transcript code.

11. `src/hooks/useHasDraft.ts` and `src/hooks/useDraft.ts`.
    Problem: split draft read/write hooks with a custom event between them. Merge into one `useDrafts` store per section 8.

12. `src/hooks/useSessionFlags.ts`.
    Problem: generic "flags" name for pinned/archived state. Rename to `useSessionPins.ts` or `useSessionCollections.ts`.

13. `src/hooks/useShortcuts.ts`.
    Problem: fine location, unclear scope. Rename to `useGlobalShortcuts.ts` if it stays app-wide.

14. `scripts/bundle-sidecar.js`.
    Problem: Tauri-era helper. `package.json` still has `build:sidecar:pkg` pointing at `src-tauri/binaries/server`, but `src-tauri` no longer exists. Remove the script and helper if Bun compile is the only path. If pkg support is still needed, rename to `scripts/bundle-sidecar-pkg.mjs` and document when to use it.

15. `src/prism-components.d.ts`.
    Problem: root-level ambient declaration for one lib. Move to `src/types/prism.d.ts`.

16. `src/types/work.ts` and `src/types/session.ts`.
    Problem: work items are part of conversation state. Keep both, but move shared SSE and streaming types into `src/types/sse.ts` instead of repeating `Record<string, unknown>`.

### Likely useless or removable

Verify before deleting. None of these look load-bearing, but check imports and runtime use first.

- `useModels` `providers` state and `switchModel` export. Server models response handling uses local provider state elsewhere. `useSessions.createNew` also looks unused from the current App flow.
- Compaction `results` in `useCompaction.ts`. Stored but never visibly consumed outside the hook return.
- `putCache` and `setActiveFile` re-exports from `useChat`. Useful internally, but exporting both invites bypassing `openFile` and cache invariants.
- `getStoredHosts` and `getStoredActiveHostId` in `useHosts.ts`. Only `getStoredActiveHost` is used by API transport. Keep the narrower export unless settings needs the others.
- `formatThemeJson` and `parseThemeJson` in `src/lib/custom-themes.ts`.
- `SessionStats` type export in `src/hooks/useSessionStats.ts` if no importer uses it.
- `getActiveCustomTheme` in `src/hooks/useCustomThemes.ts` if components only use the hook result.
- `Counter` export in `src/components/settings.tsx` if it is demo leftover.
- `react-colorful`. No source import found. Remove dependency if theme editing uses another picker.
- `package-lock.json`. Project requires Bun and tracks `bun.lock`. Remove npm lockfile unless npm support is intentional.
- `tsconfig.node.tsbuildinfo`. Build output should not be tracked.
- `public/mockup.jpg~`. Editor backup file.
- Large `public/*.kra` working files. Move out of `public` so they are not copied into packaged output.
- Tauri comments and dead paths in `vite.config.ts`, Electron main, and package scripts. Harmless but confusing during refactors.

### Target layout

Renderer:

- `src/components/session/`
- `src/components/composer/`
- `src/components/conversation/`
- `src/components/settings/`
- `src/components/theme/`
- `src/components/dev/`
- `src/components/ui/`
- `src/hooks/`
- `src/lib/`
- `src/types/`

Sidecar:

- `server/index.ts`
- `server/routes/`
- `server/services/`
- `server/git/`
- `server/sse.ts`
- `server/errors.ts`
- `server/validation.ts`

## 12. Security and trust boundaries

Do before treating remote hosts as production-ready.

1. Provider storage contradicts docs.
   `AGENTS.md` says OS keychain. Implementation writes plaintext JSON to `~/.config/phi/auth.json` with mode `0600`. Either implement keychain storage or update the documented contract.

2. Remote sidecars expose filesystem operations.
   Configurable host, permissive CORS, optional auth, arbitrary session/file paths, agent execution. Require auth for non-loopback binding. Constrain file and workspace paths to approved roots. Remove query-string auth because URLs leak into logs.

3. Electron sandbox is off.
   `electron/main.ts` uses `sandbox: false`. Preload bridge is narrow and context isolation is on, which helps, but enable the sandbox unless a concrete dependency blocks it.

4. Provider test endpoint can proxy arbitrary base URLs.
   Validate scheme, host, and port. Add timeouts and response size limits. It already has an 8s abort, keep that behavior in the refactor.

## 13. Domain language drift

`CONTEXT.md` is normative. Current UI still uses avoided terms:

- "New chat" across App, sidebar, tabs, and shortcuts.
- "Open chats" tab list label.
- "start chatting in a directory" empty states.
- "working directory" user-facing error.
- "Session notifications" accessibility label for Sonners.
- "Continue to resume" interruption copy.

Decide the replacement for "New chat" first. "New session" is accurate but may read poorly in composer flow. Then do a focused terminology pass over UI copy, aria labels, comments, and symbol names.

## 14. Repo and build hygiene

- Remove duplicate lockfile if Bun is canonical.
- Untrack build output including `*.tsbuildinfo`.
- Remove backup files and move design working files out of `public`.
- Fix README license badge pointing at Next.js.
- Remove Tauri-era scripts, paths, and comments.
- Check unused deps: especially `react-colorful`.
- Split Prism grammars for lazy loading.
- Add `test`, `lint`, and `typecheck` to CI if present.

## 15. UI implementation notes

Better than application-state code, but with gaps.

Working well:

- Extensive semantic token system.
- Consistent token use.
- Clear custom theme ownership.
- Reduced-motion handling in many components.
- Shared button, menu, popover, alert, and navigation primitives.
- Detector found only gradient text and `margin-left` layout animation.

Fix:

- Hand-built dialog in `src/components/ui/dialog.tsx` has no focus trap, restoration, or Escape handling. Headless UI is installed. Use it.
- Global reduced-motion rule sets everything to `0.01ms`. Prefer component-level alternatives that preserve state feedback.
- Many controls are 20 to 32px. Fine for mouse, weak for touch and zoom.
- Settings secondary sidebar is fixed down to 320px viewport.
- Sidebar transition animates `margin-left`, forcing layout work. Prefer transform.

## Suggested first batch

1. Add characterization tests.
2. Fix absolute fallback path and stale asset link.
3. Extend strict typecheck to server and Electron.
4. Consolidate SSE transport.
5. Extract stream reducer.
6. Extract tab state.
7. Split server along existing sections.
8. Harden remote auth and paths.
9. Lazy load settings, demo, playground, Prism grammars.
10. Do renames, dead-code removal, terminology, and accessibility last.
