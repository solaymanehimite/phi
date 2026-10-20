# Performance backlog after the first streaming pass

The first pass removes the 9ms typewriter timer, batches streamed text and thinking every 40ms, and keeps high-frequency stream snapshots out of `App`. The items below remain. Profile before and after each change; do not treat an unmeasured hypothesis as a confirmed bottleneck.

## P0: isolate the shell and command palette

- [ ] **Stabilize props crossing expensive memo boundaries.** In `src/App.tsx`, avoid recreating `SessionCommand.onSelect`, `Composer.onAbort`, `ChatViewport.onDismiss` and `onUndo`, the `beforeSend` fragment, and `Tabs.sidebarActions` on every parent render. Extract stable children or memoize only where a profiler shows real avoided work. Check that Sidebar, Tabs, Composer, and Conversation no longer reconcile for unrelated updates.
- [ ] **Stop reinstalling global shortcuts.** `src/App.tsx` constructs a fresh handlers object on each render; `src/hooks/useShortcuts.ts` subscribes using that object. Keep a stable listener and read current callbacks through refs. Verify shortcut behavior while typing, streaming, and opening dialogs.
- [ ] **Separate the command palette from the app shell.** `SessionCommand` in `src/App.tsx` currently owns the whole app via a render prop. Make the palette controller and app shell siblings; opening Cmd/Ctrl+K should mount or update only the dialog. Keep all existing palette access points and shortcut behavior.
- [ ] **Keep palette updates independent of streaming.** `src/components/session-command.tsx` should update when the search query, command actions, Session summaries, or open state changes, not when text/work arrives. Keep the current result cap. Profile Cmd/Ctrl+K and search typing during an active stream.

## P1: reduce repeated paint and background work

- [ ] **Measure and remove costly backdrop blur.** Test opaque token-based backgrounds in `src/components/ui/popover.tsx`, `src/components/ui/dropdown-menu.tsx`, the composer menus, and `.session-command-content` in `src/App.css`. Compare idle and streaming traces; retain blur only where it earns its rendering cost.
- [ ] **Make menus appear immediately.** The shared popover and dropdown wrappers animate scale and opacity over 100ms. Test removing the scale animation and reducing or removing the opacity reveal. Confirm keyboard focus and close behavior stay correct, including reduced-motion mode.
- [ ] **Profile layout-driven animations.** Check sidebar margin movement, Session side-panel width, Project-group and work-section grid rows, queue, and compaction expansion. Replace frequently used expensive transitions with transform/opacity, or remove nonessential motion. Do not change unmeasured animations indiscriminately.
- [ ] **Measure streaming decoration cost.** Compare active orbs and animated filters in the work section, tabs, and Session rows with reduced motion. Simplify only if traces show meaningful paint/composite time; preserve clear running-state feedback.
- [ ] **Replace per-row draft polling.** `src/hooks/useHasDraft.ts` creates an 800ms interval and localStorage read for each Sidebar Session and tab. Use one event-driven draft store, preferably `useSyncExternalStore`, driven by draft writes and cross-window storage events. Remove row-level intervals and verify draft badges update after editing, switching, clearing, and reload.
- [ ] **Consolidate health polling.** `src/hooks/useHealth.ts` currently starts two intervals. Use one poller, guard against overlapping requests, and keep fatal recovery working.

## P2: make long Sessions and lists inexpensive

- [ ] **Bound the initial conversation DOM.** In `src/components/conversation/conversation.tsx`, start with the latest 50–100 turns and add a "Load earlier turns" action in stable batches. Preserve scroll position when prepending. Test images, expanded tool outputs, code blocks, and `StickToBottom` before considering dynamic-height virtualization.
- [ ] **Keep history stable during a live stream.** Historical Markdown and tool rows should not rerender for each stream update. Use stable callbacks and separate the live response from persisted turns until completion. Confirm the `hideLastWork` behavior still prevents duplicate work display.
- [ ] **Test offscreen rendering containment.** Consider `content-visibility: auto` plus an intrinsic size for older turns only after checking scrolling, jumping to bottom, expanded work, and image loading. Revert if scroll anchoring suffers.
- [ ] **Scale the Sidebar only when needed.** With hundreds of Sessions, avoid mounting rows in collapsed Project groups or hidden Archived sections. Cap/progressively mount or virtualize large visible lists if measurement warrants it. The current library of about 36 Sessions is not a reason to virtualize first.
- [ ] **Bound model-list DOM if it grows.** `src/components/model-selector.tsx` mounts all filtered models. Cap or virtualize only if real provider lists and profiling show a problem. Keep search and keyboard selection working.

## P2: reduce sidecar and Session-summary work

- [ ] **Omit unused `allMessagesText` from `/api/sessions`.** The renderer does not use this field. Update `server/index.ts` and `src/types/session.ts`; retain the actual Session JSONL data. Add dedicated indexed server search only if full-text search is later needed.
- [ ] **Bound `firstMessage` previews.** Send only enough text for Sidebar, tab titles, and palette search; do not truncate the persisted Session. Test unnamed Sessions and long first messages.
- [ ] **Cache Session summaries by file identity and mtime/size.** Avoid having Pi's Session-list routine rescan unchanged JSONL files. Rebuild changed/new summaries, remove deleted entries, and account for changes made by the Pi CLI outside Phi.
- [ ] **Avoid an unconditional full rescan after the three-second TTL.** Keep explicit invalidation for writes through Phi, detect external changes with a watcher or stat checks, and use a longer fallback refresh. Measure startup and post-stream refresh.
- [ ] **Make ETags useful after server caching improves.** Preserve the last ETag in `src/lib/api.ts`, send `If-None-Match`, and reuse the current Session array for 304. ETags alone will not save the server-side scan when the cache is cold.
- [ ] **Preserve unchanged Session object identities.** In `src/hooks/useSessions.ts`, reconcile refreshed summaries by path and revision/mtime so unchanged rows retain their props. Verify renames, pin/archive status, and new Sessions still update promptly.

## Automated profiling for an agent

- [ ] **Create a repeatable CDP runner.** Launch isolated headed Electron with `--remote-debugging-port` and a temporary `--user-data-dir`; connect via Chrome DevTools Protocol. Have the agent verify Vite and sidecar health, warm up interactions, dispatch trusted input, record input-to-paint and main-thread traces, run around 20 trials, and report median/p95 with screenshots and traces. Store temporary artifacts outside the repository. Profile the production renderer before setting release thresholds.
- [ ] **Cover idle and streaming interactions.** Cmd/Ctrl+K open/search, Session row menu, model/thinking popovers, composer typing, conversation scrolling, cached Session switching, and a long Session. Test normal and reduced motion, short and long Sessions, plus temporary CSS blur overrides to isolate compositing cost.
- [ ] **Add deterministic SSE replay when useful.** Reproduce text, thinking, tool updates, errors, and completion at a fixed rate without provider latency or token costs. Preserve the real provider integration separately. This is helpful for regression testing but not required to get an initial profile.

## Existing validation blockers

- [ ] **Restore a passing typecheck.** The unchanged `src/components/sidebar.tsx` passes an unsupported `title` prop to the Headless UI `DropdownMenuTrigger` at line 246. This error was already present in `HEAD` before the streaming changes.
- [ ] **Restore a passing lint.** The untouched generated `src/components/provider-marks.ts` contains 15 hardcoded SVG colors flagged by the token lint script. Do not change generated marks by hand; decide whether the lint rule should exclude vendor artwork or the generator should handle it.

## Not an alpha priority

Framework rewrites, broad memoization, blanket virtualization, a worker before finding suitable CPU work, bundle-size tuning ahead of interaction latency, and disabling StrictMode as a substitute for a production fix. Do not restore complexity until the core Session loop is responsive.
