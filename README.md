# Phi
Fast desktop GUI for [Pi](https://github.com/earendil-works/pi) — built with Tauri, React, and the Pi SDK.

<img width="1647" height="1010" alt="Screenshot 2026-08-29 at 16-18-54 Phi" src="https://github.com/user-attachments/assets/badd38ef-c2f3-4474-9802-aea32e42f6a8" />

## Dev

Requires [Bun](https://bun.sh) and Rust (for Tauri).

```bash
bun install

# web client + node server (127.0.0.1:3001)
bun run dev:all

# OR
# tauri app
bun run tauri:dev
```

## Bundle

For `tauri build` 

```bash
bun run build:sidecar   # -> src-tauri/binaries/server-<target-triple>

# then
bunx tauri build        
```

See `docs/howtobundle.md`

## Docs

- `docs/prd.md` — product spec
- `docs/sdk_usage.md` — Pi SDK reference for Phi
