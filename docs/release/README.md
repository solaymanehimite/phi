# Product backlog

This replaces the earlier release recommendation set. It is a menu for choosing the next small, high-leverage improvements, not a release commitment.

## Current priorities

### 1. Make the interface fast before making it broader

The app should feel immediate when opening a Session, switching tabs, opening a menu, collapsing a Project group, scrolling a long conversation, and receiving streamed output.

- Add a repeatable performance baseline for the sidebar, Session switching, conversation scrolling, menus, and animations.
- Profile before changing code; identify unnecessary App-level rerenders, unstable props, expensive list work, and layout-triggering animation.
- Virtualize or cap large Session lists and search results where measurement shows it is needed.
- Keep Session loading progressive: show cached content immediately, then refresh quietly.
- Prefer transform and opacity animation; remove animated layout work that causes visible jank.
- Respect reduced motion and make it a genuinely calmer, cheaper rendering path.
- Review every blur, shadow, backdrop filter, and animated gradient for GPU cost.
- Make slow states understandable instead of inert: loading skeletons, a clear current action, and stable scroll position.

### 2. Make the sidebar scale

The sidebar should stay calm and quick with a handful of Sessions or hundreds.

- Keep the hierarchy narrow: New Session, Search, Pinned Sessions when present, Project groups, Archived Sessions when present, and Settings.
- Keep the active Session easy to locate and preserve collapsed Project groups.
- Use search for orphaned Sessions rather than adding a permanent catch-all group.
- Keep row actions hidden until hover or keyboard focus; retain accessible names and keyboard access.
- Ensure long Project and Session names truncate by default and reveal full content on hover/focus without causing list reflow.
- Avoid mounting or measuring every Session during ordinary navigation.
- Add keyboard movement between Project groups and Session rows.

### 3. Show only model-supported thinking effort

Thinking effort should never expose unavailable choices or fail only after selection.

- Fetch or resolve the selected model’s thinking-level map before rendering the control.
- Render only supported levels, with a clear model-default state when there is one choice.
- Update the available levels immediately when the model changes.
- Keep a previously selected effort only when the new model supports it; otherwise choose that model’s sensible default.
- Surface a small, local explanation only when a model does not support configurable thinking—not an unrelated inline Session error.

### 4. Redesign the working and tool-output section

The conversation should emphasize the answer and the actual work, without a permanent wall of reasoning blocks.

- Remove the current reasoning-block presentation.
- Show the most recent reasoning text as a compact live summary at the top of the active work section.
- Present tool calls in chronological order, one after another, with clear running, success, and failure states.
- Keep successful tool details compact by default; preserve error summaries and an explicit expand action.
- Maintain stable height and scroll behavior while streamed reasoning and tool calls update.
- Decide the final information architecture after implementing the underlying event model; do not lock visual behavior prematurely.

### 5. Establish a more distinctive visual system

Phi needs stronger hierarchy and more warmth while retaining a focused desktop-tool feel.

- Increase contrast between app background, panel surfaces, selected rows, controls, and conversation content—especially in Light theme.
- Give each stock theme its own intentional surface system rather than relying on white panels with outlines.
- Introduce restrained semantic color: provider/model state, active work, success, warning, error, and selected navigation.
- Use gradients purposefully for depth, emphasis, or live state—not as decoration on every control.
- Reassess backdrop blur: keep it only where it communicates layering and performs well; replace the rest with opaque/translucent tokenized surfaces.
- Audit Custom themes against the revised token hierarchy so a custom theme does not flatten important state.
- Test both stock themes at normal, zoomed, and low-contrast display settings.

## Other candidates to choose from

### Core workflow

- A focused first-launch flow: choose a Project, configure a Provider, accept a default model, send a first prompt.
- Better empty Project and empty Session prompts with optional example actions.
- A compact combined model/thinking control only if it remains faster and clearer than separate controls.
- Per-Project default model and thinking effort.
- Remember recently used models per Project.
- Clear disabled-send explanations for missing Provider, model, or Workspace.
- Better image-attachment preview, removal, and failure states.
- More discoverable slash commands and file mentions without crowding the composer.

### Session trust and recovery

- Warn or reassure users when closing a tab with a draft; make recovery explicit.
- Restore useful tabs after restart only when that behavior is reliable.
- Improve missing/corrupt Session handling with an inline explanation and copyable diagnostics.
- Make rename, archive, pin, and delete feedback more obvious without noisy toasts.
- Add Session export as Markdown or JSONL-derived readable text.
- Add a Session details view for Workspace, model, timestamps, and safe actions.
- Add a clear continuation affordance when a checkpoint exists.

### Conversation quality

- Independent copy actions for assistant prose, code blocks, tool input, and tool output.
- Better code-block headers: language, copy, and optional line wrapping.
- Render diffs and file changes as compact reviewable units.
- Add a per-turn elapsed time and concise work summary.
- Keep long tool output searchable within its expanded view.
- Improve follow-up prompt suggestions after completion, without auto-inserting them.
- Add a durable “jump to latest” affordance when reading older conversation content.

### Navigation and command access

- Improve command-palette ranking with recent Sessions, Project names, and first prompts.
- Add a recent-Sessions section or quick switcher.
- Add explicit Project management from the Project picker: rename, change Workspace path, remove safely.
- Add a compact Session filter for pinned, archived, running, and draft Sessions.
- Improve tab overflow behavior for many open Sessions.
- Add keyboard shortcuts reference and shortcut customization only after defaults are stable.

### Settings and diagnostics

- Add About: Phi version, Pi version, sidecar version, documentation, and issue links.
- Add one-click redacted diagnostics copy.
- Show Provider status and model availability without exposing credentials.
- Make Skills discovery and enablement easier to understand for the current Workspace.
- Add clearly scoped reset actions for appearance, drafts, and local app state.

### Accessibility and desktop quality

- Full keyboard audit: focus order, Escape behavior, focus return from menus/popovers, and visible focus states.
- Announce meaningful stream/error changes to screen readers without announcing every token.
- Audit contrast in Dark, Light, System, and Custom themes.
- Test 125%, 150%, and 200% zoom; narrow windows; long names; Unicode paths; and reduced motion.
- Verify dragging, resizing, maximize, minimize, and quit guard behavior on each supported desktop platform.

### Packaging and beta readiness

- Packaged-app smoke test: launch, sidecar health, Project creation, Provider/model selection, prompt streaming, restart persistence, and quit guard.
- Clean-machine installation test with no development tools installed.
- Platform icons, signing/notarization, release notes, and checksums.
- A small feedback loop: in-app issue link, optional diagnostics attachment, and a short beta survey.

## Suggested selection rule

Choose one item that makes the current path faster, one that makes it easier to understand, and one that improves trust or recovery. Do not add a broader feature until the core Session loop is fast and dependable.
