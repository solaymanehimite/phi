import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Phi — Electron main process (replaces src-tauri/src/lib.rs + main.rs).
//
// Responsibilities mirror the old Rust host:
//  1. own the sidecar lifecycle (pick a free port, spawn server binary, kill on quit)
//  2. own the app window (frameless 1200x750, like decorations:false in Tauri)
//  3. expose a minimal privileged bridge over IPC (see preload.ts)
// ---------------------------------------------------------------------------

// __dirname is provided natively in the bundled CJS output (do NOT use
// import.meta.url here — esbuild CJS has no import.meta).
declare const __dirname: string;

const isDev = !app.isPackaged;
const RENDERER_DEV_URL = process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5173";
const DEV_SERVER_PORT = Number.parseInt(process.env.PHI_SERVER_PORT ?? "3001", 10) || 3001;

let mainWindow: BrowserWindow | null = null;
let sidecar: ChildProcess | null = null;
let sidecarPort: number = DEV_SERVER_PORT;
let streamingCount = 0;
let forceClose = false;

function pickFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.once("error", reject);
        srv.listen(0, "127.0.0.1", () => {
            const addr = srv.address();
            const port = typeof addr === "object" && addr ? addr.port : 0;
            srv.close(() => resolve(port));
        });
    });
}

function findSidecarBinary(): string | null {
    // electron-builder ships these via extraResources (see electron-builder.yml).
    const candidates: string[] = [];
    if (app.isPackaged) {
        const res = process.resourcesPath;
        // Tauri-style triple names first, then plain names.
        candidates.push(
            path.join(res, `server-${process.platform}-${process.arch}`),
            path.join(res, "server"),
            path.join(res, "binaries", `server-${process.platform}-${process.arch}`),
            path.join(res, "binaries", "server"),
        );
        if (process.platform === "win32") {
            candidates.push(path.join(res, "server.exe"), path.join(res, "binaries", "server.exe"));
        }
        // Legacy Tauri triple e.g. server-x86_64-unknown-linux-gnu
        const triples: Record<string, string[]> = {
            "linux-x64": ["server-x86_64-unknown-linux-gnu"],
            "linux-arm64": ["server-aarch64-unknown-linux-gnu"],
            "darwin-x64": ["server-x86_64-apple-darwin"],
            "darwin-arm64": ["server-aarch64-apple-darwin"],
            "win32-x64": ["server-x86_64-pc-windows-msvc.exe"],
        };
        for (const t of triples[`${process.platform}-${process.arch}`] ?? []) {
            candidates.push(path.join(res, t), path.join(res, "binaries", t));
        }
    } else {
        // Dev: reuse the sidecar binary in binaries/ if present
        // (built via `bun run build:sidecar`).
        const root = path.resolve(__dirname, "..");
        candidates.push(
            path.join(root, "binaries", "server-x86_64-unknown-linux-gnu"),
            path.join(root, "binaries", "server"),
        );
    }
    return candidates.find((p) => existsSync(p)) ?? null;
}

function waitForHealth(port: number, timeoutMs = 25000): Promise<void> {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const req = http.get(
                { host: "127.0.0.1", port, path: "/api/health", timeout: 2000 },
                (res) => {
                    res.resume();
                    if (res.statusCode && res.statusCode < 500) return resolve();
                    retry();
                },
            );
            req.on("error", retry);
            req.on("timeout", () => {
                req.destroy();
                retry();
            });
            function retry() {
                if (Date.now() - started > timeoutMs) {
                    reject(new Error(`sidecar health check timed out on port ${port}`));
                } else {
                    setTimeout(attempt, 300);
                }
            }
        };
        attempt();
    });
}

function waitForRenderer(url: string, timeoutMs = 60000): Promise<void> {
    // Dev nicety: `electron:dev` boots Vite + server + Electron together, so
    // the renderer may not be up yet when main starts. Poll instead of
    // requiring wait-on or a manual launch order.
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const req = http.get(url, (res) => {
                res.resume();
                resolve();
            });
            req.on("error", retry);
            req.on("timeout", () => {
                req.destroy();
                retry();
            });
            function retry() {
                if (Date.now() - started > timeoutMs) {
                    reject(new Error(`renderer not reachable at ${url}`));
                } else {
                    setTimeout(attempt, 400);
                }
            }
        };
        attempt();
    });
}

async function startSidecar(): Promise<number> {
    if (isDev) {
        // Dev flow mirrors `tauri:dev`: the Express server runs separately
        // (`bun run dev:server` on 3001). Main just points the renderer at it.
        sidecarPort = DEV_SERVER_PORT;
        console.log(`[phi] dev mode — using external server on port ${sidecarPort}`);
        return sidecarPort;
    }
    const bin = findSidecarBinary();
    if (!bin) {
        console.error("[phi] no sidecar binary found — renderer will show FatalState until a server is reachable");
        sidecarPort = DEV_SERVER_PORT;
        return sidecarPort;
    }
    sidecarPort = await pickFreePort();
    console.log(`[phi] spawning sidecar ${bin} on port ${sidecarPort}`);
    sidecar = spawn(bin, [String(sidecarPort)], { stdio: ["ignore", "pipe", "pipe"] });
    sidecar.stdout?.on("data", (d) => process.stdout.write(`[sidecar] ${d}`));
    sidecar.stderr?.on("data", (d) => process.stderr.write(`[sidecar] ${d}`));
    sidecar.on("exit", (code, signal) => {
        console.error(`[phi] sidecar exited code=${code} signal=${signal}`);
        sidecar = null;
    });
    sidecar.on("error", (err) => {
        console.error(`[phi] sidecar spawn failed: ${err.message}`);
        sidecar = null;
    });
    try {
        await waitForHealth(sidecarPort);
        console.log(`[phi] sidecar healthy on port ${sidecarPort}`);
    } catch (err) {
        console.error(`[phi] ${(err as Error).message}`);
    }
    return sidecarPort;
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        title: "Phi",
        width: 1200,
        height: 750,
        backgroundColor: "#101012",
        // Matches Tauri `decorations: false` — the React app draws its own
        // titlebar/tabs (see data-tauri-drag-region + App.css -webkit-app-region).
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    if (isDev) {
        // Forward renderer console to the terminal — proves the React app boots
        // inside Electron and surfaces API/port errors without opening devtools.
        mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
            console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
        });
        mainWindow.webContents.on("did-fail-load", (_e, code, desc) =>
            console.error(`[phi] renderer load failed ${code}: ${desc}`),
        );
        mainWindow.webContents.on("did-finish-load", () => console.log("[phi] renderer loaded"));
        void mainWindow.loadURL(RENDERER_DEV_URL);
        if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") mainWindow.webContents.openDevTools({ mode: "detach" });
    } else {
        mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
            console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
        });
        mainWindow.webContents.on("did-fail-load", (_e, code, desc) =>
            console.error(`[phi] renderer load failed ${code}: ${desc}`),
        );
        mainWindow.webContents.on("did-finish-load", () => console.log("[phi] renderer loaded"));
        void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    }

    // Quit guard: mirrors the old Tauri onCloseRequested flow in App.tsx.
    // Main owns the dialog (native), renderer owns the abort (owns the streams).
    mainWindow.on("close", (event) => {
        if (forceClose || streamingCount <= 0 || isDev) return;
        event.preventDefault();
        void (async () => {
            const { response } = await dialog.showMessageBox(mainWindow!, {
                type: "warning",
                title: "Phi",
                message: `${streamingCount} session(s) streaming — abort and quit?`,
                buttons: ["Quit", "Stay"],
                defaultId: 1,
                cancelId: 1,
            });
            if (response !== 0 || !mainWindow) return;
            // Tell the renderer to abort in-flight streams, then force close.
            mainWindow.webContents.send("phi:abort-all");
            forceClose = true;
            setTimeout(() => mainWindow?.close(), 2000);
        })();
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    // Headless smoke test: `electron . --phi-smoke=/tmp/shot.png` waits for the
    // renderer to settle, screenshots the window, prints the path, and quits.
    // Used by CI / migration verification — never triggered in normal runs.
    const smokeArg = process.argv.find((a) => a.startsWith("--phi-smoke="));
    if (smokeArg) {
        const out = smokeArg.slice("--phi-smoke=".length) || "/tmp/phi-smoke.png";
        mainWindow.webContents.on("did-finish-load", () => {
            setTimeout(() => {
                void (async () => {
                    try {
                        // Let React finish first paint + health poll.
                        await new Promise((r) => setTimeout(r, 4000));
                        const img = await mainWindow!.capturePage();
                        const { writeFileSync } = await import("node:fs");
                        writeFileSync(out, img.toPNG());
                        console.log(`[phi] smoke screenshot -> ${out}`);
                    } catch (err) {
                        console.error(`[phi] smoke failed: ${(err as Error).message}`);
                    } finally {
                        forceClose = true;
                        app.quit();
                    }
                })();
            }, 500);
        });
    }
}

function registerIpc(): void {
    ipcMain.handle("phi:get-server-port", () => sidecarPort);

    ipcMain.handle("phi:pick-directory", async (_event, defaultPath?: string) => {
        const win = BrowserWindow.getFocusedWindow() ?? undefined;
        const result = await dialog.showOpenDialog(win!, {
            title: "Choose project",
            defaultPath: defaultPath || undefined,
            properties: ["openDirectory"],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0] ?? null;
    });

    ipcMain.handle(
        "phi:show-confirm",
        async (_event, opts: { message: string; title?: string }) => {
            const win = BrowserWindow.getFocusedWindow() ?? undefined;
            const { response } = await dialog.showMessageBox(win!, {
                type: "warning",
                title: opts.title ?? "Phi",
                message: opts.message,
                buttons: ["Confirm", "Cancel"],
                defaultId: 0,
                cancelId: 1,
            });
            return response === 0;
        },
    );

    ipcMain.on("phi:set-streaming-count", (_event, n: number) => {
        streamingCount = typeof n === "number" && n > 0 ? Math.floor(n) : 0;
    });

    ipcMain.on("phi:window-control", (event, action: "minimize" | "maximize" | "close") => {
        const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
        if (!win) return;
        if (action === "minimize") win.minimize();
        else if (action === "maximize") (win.isMaximized() ? win.unmaximize() : win.maximize());
        else if (action === "close") win.close();
    });

    ipcMain.on("phi:open-external", (_event, url: string) => {
        if (typeof url === "string" && /^https?:\/\//.test(url)) void shell.openExternal(url);
    });
}

async function init(): Promise<void> {
    // Hide the default application menu (frameless custom chrome).
    Menu.setApplicationMenu(null);
    registerIpc();
    await startSidecar();
    if (isDev) {
        try {
            await waitForRenderer(RENDERER_DEV_URL);
        } catch (err) {
            console.error(`[phi] ${(err as Error).message} — opening window anyway`);
        }
    }
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
}

// Single instance, like a well-behaved desktop app.
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
    void app.whenReady().then(init);
}

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
    forceClose = true;
    if (sidecar) {
        try {
            sidecar.kill();
        } catch {
            /* already gone */
        }
        sidecar = null;
    }
});
