import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";

// process is typed via @types/node.
const tauriHost = process.env.TAURI_DEV_HOST;
const apiTarget = process.env.PHI_API_TARGET || "http://127.0.0.1:3001";

// https://vite.dev/config/
export default defineConfig(async () => ({
    // Packaged app loads dist/index.html via file:// — absolute /assets URLs
    // 404 there, so emit relative paths.
    base: "./",
    plugins: [react(), tailwindcss(), svgr()],

    // Dual-host dev config:
    // - Electron dev (`bun run electron:dev`): default Vite port 5173, main loads
    //   it via ELECTRON_RENDERER_URL. /api proxies to the external dev server.
    // - Tauri dev (`bun run tauri:dev`, legacy): fixed 1420 + HMR dance.
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: tauriHost ? 1420 : 5173,
        strictPort: !!tauriHost,
        host: tauriHost || false,
        hmr: tauriHost
            ? {
                protocol: "ws",
                host: tauriHost,
                port: 1421,
            }
            : undefined,
        watch: {
            // 3. tell Vite to ignore watching build output
            ignored: ["**/electron/**", "**/dist-electron/**", "**/release/**", "**/binaries/**"],
        },
        proxy: {
            // Dev sidecar — Vite forwards /api to the Express Node process
            "/api": {
                target: apiTarget,
                changeOrigin: true,
            },
        },
    },
}));
