// Phi lint gate (v1) — `bun run lint` / `bun scripts/lint.mjs`.
// Three checks, per docs/incremental-rewrite.md section 1:
//
// 1. Token violations (FAILING): hardcoded color literals in renderer code.
//    CONTEXT.md is normative — `--color-phi-*` tokens are the only allowed
//    source of color. Baseline exceptions are allowlisted below with reasons;
//    any new hardcoded color fails the gate.
// 2. Banned UI terms (warning): CONTEXT.md avoided terms still present in UI
//    copy. Known drift, tracked by section 13 of the rewrite plan. Reported,
//    not failing — promote to failing when the terminology pass lands.
// 3. Unused exports (warning): heuristic import-graph check over the new pure
//    modules. Reported, not failing.
//
// Also syntax-checks scripts/*.mjs + *.js via `node --check`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist" || name === "dist-electron" || name === "release" || name === "binaries") continue;
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
}

let failures = 0;
const warnings = [];

// ---- 1. Token violations ----
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
// Baseline allowlist: [file suffix, line pattern, reason]. Everything else fails.
const COLOR_ALLOW = [
    ["src/components/dev/ThemeEditor.tsx", /./, "dev color-picker internals (never in shipped UI path)"],
    ["src/components/settings.tsx", /./, "theme preview swatches read --color-phi-* first, hex is fallback only"],
    ["src/components/sidebar.tsx", /mask/, "mask-image gradient stops, not paint"],
    ["src/components/thinking-effort.tsx", /drop-shadow/, "white glow on the effort dot"],
    ["src/hooks/useTheme.ts", /./, "meta theme-color + token fallback, not paint"],
    ["src/lib/theme-tokens.ts", /./, "canonical token definitions"],
    ["src/App.css", /./, "bundled theme definitions"],
];

const rendererFiles = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx|css)$/.test(f) && !f.includes("__tests__"));
for (const file of rendererFiles) {
    const rel = relative(ROOT, file);
    const src = stripComments(readFileSync(file, "utf8"));
    const lines = src.split("\n");
    lines.forEach((line, i) => {
        const m = line.match(COLOR_RE);
        if (!m) return;
        // url(...) and font/shadow names can false-positive; only flag paint-ish contexts
        const allowed = COLOR_ALLOW.some(([suffix, re]) => rel.endsWith(suffix.replace(/^src\//, "")) || rel === suffix.replace(/^src\//, "") ? re.test(line) : false);
        if (!allowed) {
            failures++;
            console.error(`token violation: ${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
    });
}

// ---- 2. Banned UI terms (warning) ----
const BANNED = [
    "New chat",
    "Open chats",
    "start chatting",
    "working directory",
    "Session notifications",
    "Continue to resume",
];
const uiFiles = walk(join(ROOT, "src")).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__") && !f.includes("/dev/"),
);
for (const term of BANNED) {
    for (const file of uiFiles) {
        const rel = relative(ROOT, file);
        const src = readFileSync(file, "utf8");
        let idx = -1;
        while ((idx = src.indexOf(term, idx + 1)) !== -1) {
            const line = src.slice(0, idx).split("\n").length;
            warnings.push(`banned term "${term}" at ${rel}:${line}`);
        }
    }
}

// ---- 3. Unused exports (warning, heuristic) ----
const pureModules = [
    ...walk(join(ROOT, "src", "lib")).filter((f) => f.endsWith(".ts") && !f.includes("__tests__")),
    ...["thinking.ts", "paths.ts", "nav.ts", "providers.ts"].map((n) => join(ROOT, "server", n)),
];
const allSources = [
    ...walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f)),
    ...walk(join(ROOT, "server")).filter((f) => f.endsWith(".ts")),
].map((f) => ({ path: f, src: readFileSync(f, "utf8") }));
for (const mod of pureModules) {
    const rel = relative(ROOT, mod);
    const src = readFileSync(mod, "utf8");
    const exportRe = /export\s+(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/g;
    let m;
    while ((m = exportRe.exec(src))) {
        const name = m[1];
        const ownUses = (src.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
        const used =
            ownUses > 1 ||
            allSources.some((s) => s.path !== mod && new RegExp(`\\b${name}\\b`).test(s.src));
        if (!used) warnings.push(`possibly unused export ${name} in ${rel}`);
    }
}

// ---- 4. Script syntax (node --check; the gate never checks itself) ----
for (const script of walk(join(ROOT, 'scripts')).filter((f) => /\.(mjs|js)$/.test(f) && !f.endsWith('lint.mjs'))) {
    try {
        execFileSync("node", ["--check", script], { stdio: "pipe" });
    } catch {
        failures++;
        console.error(`syntax error: ${relative(ROOT, script)}`);
    }
}

if (warnings.length > 0) {
    console.log(`\nwarnings (${warnings.length}):`);
    for (const w of warnings.slice(0, 40)) console.log(`  warn: ${w}`);
    if (warnings.length > 40) console.log(`  ... and ${warnings.length - 40} more`);
}

if (failures > 0) {
    console.error(`\nlint failed: ${failures} violation(s)`);
    process.exit(1);
}
console.log("\nlint ok (warnings are non-failing; see header)");
