// Bundles electron/main.ts + electron/preload.ts -> dist-electron/*.cjs
// Uses the repo's existing esbuild binary — no new dependencies.
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync(new URL("../dist-electron", import.meta.url), { recursive: true });

const shared = {
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    // electron is provided by the host runtime, never bundled.
    external: ["electron"],
    logLevel: "info",
};

await build({
    ...shared,
    entryPoints: ["electron/main.ts"],
    outfile: "dist-electron/main.cjs",
});

await build({
    ...shared,
    entryPoints: ["electron/preload.ts"],
    outfile: "dist-electron/preload.cjs",
});

console.log("[phi] electron main+preload bundled to dist-electron/");
