// Characterization tests: worktree path safety.
// Covers `server/paths.ts` (used by selective restore): rejects absolute
// paths outside the repo root, `.git` segments, nested repos, null bytes.

import { describe, expect, test } from "bun:test";
import { isPathSafe, isUnderNestedRepo } from "../paths";

const ROOT = "/repo/root";

describe("isPathSafe", () => {
    test("accepts ordinary nested paths", () => {
        expect(isPathSafe(ROOT, "src/app.ts")).toBe(true);
        expect(isPathSafe(ROOT, "a/b/c.txt")).toBe(true);
    });

    test("rejects absolute paths", () => {
        expect(isPathSafe(ROOT, "/etc/passwd")).toBe(false);
    });

    test("rejects parent traversal, even when it resolves back inside", () => {
        expect(isPathSafe(ROOT, "../root/src/a.ts")).toBe(false);
        expect(isPathSafe(ROOT, "a/../../etc/x")).toBe(false);
    });

    test("rejects .git segments, dots, empties, and null bytes", () => {
        expect(isPathSafe(ROOT, ".git/config")).toBe(false);
        expect(isPathSafe(ROOT, "a/.git/hooks/x")).toBe(false);
        expect(isPathSafe(ROOT, "./a.ts")).toBe(false);
        expect(isPathSafe(ROOT, "a//b.ts")).toBe(false);
        expect(isPathSafe(ROOT, "")).toBe(false);
        expect(isPathSafe(ROOT, "a\0b.ts")).toBe(false);
    });
});

describe("isUnderNestedRepo", () => {
    test("flags files inside a nested repository", () => {
        const exists = (p: string) => p === "/repo/root/vendor/lib/.git";
        expect(isUnderNestedRepo(ROOT, "vendor/lib/src/a.ts", exists)).toBe(true);
    });

    test("top-level files and plain dirs are fine", () => {
        const exists = (_p: string) => false;
        expect(isUnderNestedRepo(ROOT, "src/a.ts", exists)).toBe(false);
    });

    test("a .git at the root itself does not count as nested", () => {
        const exists = (p: string) => p === "/repo/root/.git";
        expect(isUnderNestedRepo(ROOT, "src/a.ts", exists)).toBe(false);
    });
});
