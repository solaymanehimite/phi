import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ext = process.platform === "win32" ? ".exe" : "";
const triple = execSync("rustc --print host-tuple").toString().trim();
const binariesDir = path.join("src-tauri", "binaries");
fs.mkdirSync(binariesDir, { recursive: true });

// Support both pkg output locations: either ./server or ./server-<triple> or ./binaries/server
const candidates = [
  `server${ext}`,
  `server-${triple}${ext}`,
  path.join(binariesDir, `server${ext}`),
  path.join(binariesDir, `server-${triple}${ext}`),
];

let found = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    found = p;
    break;
  }
}

if (!found) {
  console.error(`[bundle-sidecar] no server binary found. Tried: ${candidates.join(", ")}`);
  process.exit(1);
}

const dest = path.join(binariesDir, `server-${triple}${ext}`);
if (found !== dest) {
  console.log(`[bundle-sidecar] renaming ${found} -> ${dest}`);
  fs.renameSync(found, dest);
} else {
  console.log(`[bundle-sidecar] already at ${dest}`);
}

fs.chmodSync(dest, 0o755);
console.log(`[bundle-sidecar] ready: ${dest} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
