# How to Bundle Phi — Sidecar → Tauri Prod

> Dev does **not** need bundling. Run `bun run dev:all` (Vite + Express sidecar) and iterate in the browser. This doc is only for `tauri build`.

Phi is two processes in dev, one app in prod:

* Frontend: Vite + React (Tauri WebView)
* Sidecar: `server/index.ts` (Express + `@earendil-works/pi-coding-agent` SDK)

In prod the sidecar must ship as a self-contained binary so users don't need Node installed. Tauri calls this an `externalBin`.

---

## 1. What Changes Between Dev and Prod

| Phase | How sidecar runs | Port | Tauri needs |
|-------|------------------|------|-------------|
| **Dev (now)** | `bun --watch server/index.ts` via `concurrently` | Fixed `127.0.0.1:3001` via `vite.proxy /api` | Nothing extra |
| **Prod** | Binary in `src-tauri/binaries/` spawned by Rust | Random free port passed as `args[0]` | `plugin-shell` + `bundle.externalBin` |

No frontend API changes — `fetch('/api/...')` works in both; Vite proxy handles it in dev, dynamic port handles it in prod.

---

## 2. Prod Prerequisites (install once)

```sh
bun add @tauri-apps/plugin-shell
bunx tauri plugin add shell          # adds Rust crate + capabilities

# Tool to compile Node -> binary (pick one)
bun add -D @yao-pkg/pkg
# alternative: Node 22 SEA (node --experimental-sea-config) — pkg is simpler
```

---

## 3. Build the Sidecar Binary

Tauri requires binaries at `src-tauri/binaries/<name>-<target-triple>` (triple from `rustc --print host-tuple`).

```jsonc
// server/package.json example script
{
  "scripts": {
    "build:sidecar": "pkg server/index.ts --output src-tauri/binaries/server --targets node22-linux-x64,node22-macos-arm64,node22-win-x64"
  }
}
```

Or with a rename helper (recommended — matches Tauri docs):

```js
// scripts/bundle-sidecar.js
import { execSync } from "node:child_process";
import fs from "node:fs";
const ext = process.platform === "win32" ? ".exe" : "";
const triple = execSync("rustc --print host-tuple").toString().trim();
fs.mkdirSync("src-tauri/binaries", { recursive: true });
fs.renameSync(`server${ext}`, `src-tauri/binaries/server-${triple}${ext}`);
```

```sh
bunx pkg server/index.ts --output server --target node22-$(uname -m)
node scripts/bundle-sidecar.js
ls src-tauri/binaries/
# server-aarch64-apple-darwin
# server-x86_64-unknown-linux-gnu
# server-x86_64-pc-windows-msvc.exe
```

You must produce one binary per target you ship for (CI builds each triple separately — don't rename locally for cross-arch).

---

## 4. Configure Tauri to Embed + Spawn It

**`src-tauri/tauri.conf.json`:**
```json
{
  "bundle": {
    "externalBin": ["binaries/server"]
  }
}
```

**`src-tauri/capabilities/default.json`:**
```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [{ "name": "binaries/server", "sidecar": true, "args": [{ "validator": "\\d+" }] }]
    },
    {
      "identifier": "shell:allow-spawn",
      "allow": [{ "name": "binaries/server", "sidecar": true, "args": [{ "validator": "\\d+" }] }]
    }
  ]
}
```

**Make sidecar accept dynamic port (already done in `server/index.ts`):**
```ts
const PORT = parseInt(process.argv[2] || process.env.PORT || "3001", 10);
app.listen(PORT, "127.0.0.1");
```

**Spawn from Rust or JS (pick one):**

```rust
// src-tauri/src/lib.rs — on app setup
use tauri_plugin_shell::ShellExt;
tauri::Builder::default()
  .plugin(tauri_plugin_shell::init())
  .setup(|app| {
    let port = portpicker::pick_unused_port().expect("no free port");
    let sidecar = app.shell().sidecar("server")?.args([port.to_string()]);
    let (mut rx, _child) = sidecar.spawn()?;
    // optional: pipe stdout -> log, store port in managed state for frontend
    app.manage(AppState { sidecar_port: port });
    Ok(())
  })
```

Or from frontend (simpler, no Rust):
```ts
import { Command } from "@tauri-apps/plugin-shell";
// frontend asks Rust for free port via invoke, then:
const cmd = Command.sidecar("binaries/server", [String(freePort)]);
await cmd.spawn();
```

Expose `freePort` to the frontend via `invoke("get_sidecar_port")` or bake into `window.__PHI_SIDECAR_PORT__` at startup. Frontend then does `fetch(`http://127.0.0.1:${port}/api/...`)` instead of `/api`. In dev, `fetch('/api/...')` via Vite proxy continues to work — branch on `__TAURI__`.

---

## 5. Build Pipeline

```sh
# dev — no bundling
bun run dev:all              # http://localhost:1420

# prod — full bundle
bun run build:sidecar        # -> src-tauri/binaries/server-<triple>
bun run build                # vite build -> dist/
bunx tauri build             # embeds sidecar, produces .dmg/.deb/.msi
```

CI: run `build:sidecar` *on each runner triple* before `tauri build` (GitHub Actions `matrix: { os: [macos-latest, ubuntu-latest, windows-latest] }`).

---

## 6. Common Pitfalls

* **Forgot triple suffix:** `externalBin: ["binaries/server"]` requires `server-aarch64-apple-darwin`, not `server`. Build will error `binary not found`.
* **Hardcoded 3001 in prod:** Will fail if port occupied. Always pass dynamic port as `args[0]`.
* **CORS:** Sidecar in prod must allow `tauri://localhost` / `https://tauri.localhost` origin. Dev uses Vite proxy so no CORS. Add `cors({ origin: [/tauri\.localhost/, /localhost:\d+/] })`.
* **Binary size:** `pkg` binary is ~70–90MB (Node runtime embedded). This is expected. SEA can be smaller but more complex.
* **Watch `server/`:** Do not set Vite `watch.ignored` to `server/` — dev needs restart. `bun --watch` already watches it.
* **Auth:** Sidecar reads `~/.pi/agent/auth.json` directly — no env forwarding needed. Ensure bundled app has filesystem permission to `home` (Tauri default allows).

---

## 7. Current status

Phi is configured for both development and packaged builds.

Use `bun run dev:all` for browser development. Use `bun run build:sidecar`, `bun run build`, and `bunx tauri build` for a packaged application. The packaged app starts the bundled sidecar on a free localhost port and connects to it through the port exposed by Rust.

Before publishing releases, build the sidecar separately for every target platform and verify the packaged app can read the user's Pi configuration and session directory.
