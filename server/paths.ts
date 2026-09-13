// Pure path-safety helpers, extracted verbatim from `server/index.ts`.
// `existsSync` is injectable so nested-repo detection is testable without
// touching the filesystem.

import { existsSync as defaultExistsSync } from "node:fs";
import { dirname, join as joinPath, resolve as resolvePath } from "node:path";

export function isPathSafe(repoRoot: string, rel: string): boolean {
    if (!rel || rel.startsWith("/") || rel.includes("\0")) return false;
    const parts = rel.split("/");
    if (parts.some((p) => p === "" || p === "." || p === ".." || p === ".git")) return false;
    const abs = resolvePath(repoRoot, rel);
    const root = resolvePath(repoRoot);
    return abs === root || abs.startsWith(`${root}/`);
}

/** File-level deletes only; refuse anything under a nested repository. */
export function isUnderNestedRepo(
    repoRoot: string,
    rel: string,
    exists: (p: string) => boolean = defaultExistsSync,
): boolean {
    const root = resolvePath(repoRoot);
    let dir = dirname(resolvePath(root, rel));
    while (dir === root || dir.startsWith(`${root}/`)) {
        if (dir !== root && exists(joinPath(dir, ".git"))) return true;
        if (dir === root) break;
        dir = dirname(dir);
    }
    return false;
}
