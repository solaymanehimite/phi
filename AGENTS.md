# Phi

This branch is a fresh Electron shell. The previous app and its implementation are on `archived`.

- Use Bun, not npm.
- Run `bun install` to install Electron, then `bun run dev` to launch the app.
- Electron starts from `electron/main.cjs` and loads `index.html` directly.
- There is no sidecar, frontend framework, or build pipeline yet.
- Do not copy old architecture or dependencies back from `archived` without a specific need.
- Preserve existing Pi session files. They are outside this repository.
