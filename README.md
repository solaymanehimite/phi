# Phi
Fast desktop GUI for [Pi](https://github.com/earendil-works/pi) — built with Electron, React, and the Pi SDK.

<img width="1647" height="1010" alt="Screenshot 2026-08-29 at 16-18-54 Phi" src="https://github.com/user-attachments/assets/badd38ef-c2f3-4474-9802-aea32e42f6a8" />

## Dev (Electron)

Requires [Bun](https://bun.sh). No Rust toolchain needed.

```bash
bun install

# renderer (5173) + sidecar server (127.0.0.1:3001) + Electron, all at once
bun run electron:dev
```

`electron/main.ts` spawns nothing in dev — it points the window at the
external dev server on port 3001 (override with `PHI_SERVER_PORT`).
The renderer reaches it through Vite's `/api` proxy; in packaged builds main
picks a free port, spawns the sidecar binary, and hands the port to the
renderer over the `window.phi` preload bridge.

## Bundle (Electron)

```bash
bun run electron:build   # tsc + vite build + sidecar binary + main/preload bundle
bun run electron:dist-dir  # unpacked binary in release/linux-unpacked (fastest to test)
bun run electron:dist      # installers (AppImage/nsis/dmg per OS)
```

Layout: `dist/` (renderer) + `dist-electron/main.cjs|preload.cjs` in the asar,
Bun-compiled sidecar from `src-tauri/binaries/server-*` as an extraResource.
`src-tauri/` Rust sources are legacy and are not packaged.

Headless smoke test (loads the app, screenshots, quits):

```bash
release/linux-unpacked/phi --phi-smoke=/tmp/phi-smoke.png
```

## Dev (Tauri, legacy)

`src-tauri/` is kept on disk but is no longer the primary host. Its scripts
(`tauri:dev`, `tauri build`) still work; the renderer supports both hosts via
`window.phi` (Electron) with fallback to `invoke("get_sidecar_port")` (Tauri).

```bash
bun run tauri:dev
```

## Docs

- `docs/prd-milestone-1.md` — Milestone 1 product spec
- `docs/sdk_usage.md` — Pi SDK reference for Phi
