# AGENTS.md — Phi

Phi is a desktop GUI (React 19 + Vite + Tailwind 4 + Electron) for the Pi coding agent.
Replaces the terminal TUI for browsing, resuming, and prompting sessions.
Same session files (`~/.pi/agent/sessions/<encoded-cwd>/`) — no second source of truth.

## Commands

Requires Bun. Use `bun`, not npm.

```bash
bun install
bun run electron:dev  # vite :5173 + sidecar :3001 + Electron, all at once
bun run dev:all       # vite + sidecar only, no Electron
bun run build         # tsc && vite build
bun run build:sidecar # compile server/ -> binaries/
```

- Renderer talks to sidecar via Vite `/api` proxy → `http://127.0.0.1:3001`.
- Overrides: `PHI_SERVER_PORT`, `PHI_API_TARGET`.
- `vite.config.ts` `base: "./"` must stay — packaged app loads `dist/index.html` via `file://`.

## Architecture

- `src/` — renderer: `components/`, `hooks/use*.ts`, `lib/api.ts + sse.ts`, `types/session.ts`.
- `server/index.ts` — sidecar Express server. Compiled to `binaries/`.
- `electron/` — Electron shell, built to `dist-electron/` via `scripts/build-electron.mjs`.
- App-local state: projects / drafts / custom themes in `localStorage`, providers in OS keychain.
- Sessions and project files come from the sidecar, never from local guesses.

## Domain language — follow CONTEXT.md exactly

`CONTEXT.md` is normative. Do not reintroduce avoided terms in code or UI copy.

Key distinctions agents get wrong:

- Session (persisted JSONL conversation) ≠ chat / thread / history.
- Workspace (decoded cwd a session is bound to, immutable) ≠ Project (`{ name, path }` in localStorage).
- Abort (intentional Stop) ≠ Interruption (quit / crash / disconnect).
- Continuation (`pi continue` from checkpoint) ≠ retry / resume / regenerate.
- Undo (back to pre-turn + restore files; new message forks) / Redo (ephemeral, lost on restart).
- Inline Error (tail node + Continue action) ≠ Fatal State (`/api/health` fails, full-window gate).
- Sonner (background-finish toast + View action) ≠ banner / alert / notification.

## Theming — stock vs custom vs playground

- `Theme` = Dark / Light / System (follows OS) + saved Custom themes pinned to a light or dark base. Stock themes are hand-designed, not auto-inverted.
- `Token` = semantic CSS var `--color-phi-*`. Only allowed source of color. Hardcoded colors are a bug. Canonical list is `THEME_TOKEN_NAMES` in `src/lib/theme-tokens.ts`.
- `Custom Theme` = `{ name, base, tokens }` in `localStorage`, applied as inline overrides on top of its base. Managed in Settings Appearance, created from the Playground.
- `Playground` = floating editor (`src/components/dev/ThemeEditor.tsx`) with live preview. Unsaved tweaks reset on reload. Actions: Save New / Update active / Copy for App.css.

Rules:

- Never touch `document.documentElement.style` directly for themes. Use `src/lib/custom-themes.ts`: `applyCustomTokens / clearCustomTokens / readLiveTokens / formatThemeForAppCss`.
- State via `src/hooks/useCustomThemes.ts` (`useSyncExternalStore`, `refreshCustomThemeApplication()`, `setActiveCustomThemeId()`, `clearActiveCustomTheme()`). Keys: `phi:custom-themes-v1`, `phi:active-custom-theme-v1`, `phi:theme`.
- Overlay rule: inline overrides win over `App.css` `data-theme` rules. A custom theme only applies when `stock === base`. Switching stock to the other base must clear overrides and reveal the bundled theme. Boot re-applies via `refreshCustomThemeApplication()` in `App.tsx`.
- Upstreaming: `Copy for App.css` output goes to `@theme` for dark-base, `html[data-theme="light"]` for light-base. Never swap them.

## Conventions

- TypeScript `strict` + `noFallthroughCasesInSwitch`. `tsc` must pass.
- Reuse `src/components/ui/*`. Check existing `src/hooks/use*.ts` before adding a new one.
- Read `src/types/session.ts` and `src/lib/api.ts` before adding endpoints.
- Stock theme switch clears custom overrides (`setTheme(t); clearActiveCustomTheme()` pattern in `settings.tsx`).

## Workflow

- Keep changes minimal and scoped. Don't refactor unrelated UI.
- Do not edit: `binaries/`, `dist/`, `dist-electron/`, `release/`, `*.tsbuildinfo`, `bun.lock`.
- Electron main changes: edit `electron/`, rebuild via `scripts/build-electron.mjs`.
- Docs: `docs/prd-milestone-1.md` for scope, `docs/sdk_usage.md` for Pi SDK. `docs/archive/` is historical — don't follow it blindly.
