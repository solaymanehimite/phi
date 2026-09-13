// Characterization tests: project normalization and grouping.
// Covers current behavior in `src/lib/projects.ts` — tilde expansion,
// trailing slashes, empty input, duplicate paths.

import { describe, expect, test } from "bun:test";
import {
    basenameOfPath,
    implicitProjectName,
    normalizeProjectPath,
    resolveProjectOptions,
    sessionsForProject,
    type Project,
} from "../projects";

const HOME = "/home/tester";

function project(id: string, path: string, name?: string): Project {
    return { id, name: name ?? path, path, createdAt: 1 };
}

describe("normalizeProjectPath", () => {
    test("expands a bare tilde to the home directory", () => {
        expect(normalizeProjectPath("~", HOME)).toBe(HOME);
    });

    test("expands ~/ prefix to the home directory", () => {
        expect(normalizeProjectPath("~/projects/foo", HOME)).toBe(`${HOME}/projects/foo`);
    });

    test("strips trailing slashes but keeps root", () => {
        expect(normalizeProjectPath("/home/tester/foo///")).toBe("/home/tester/foo");
        expect(normalizeProjectPath("/")).toBe("/");
    });

    test("empty or whitespace input yields empty string", () => {
        expect(normalizeProjectPath("")).toBe("");
        expect(normalizeProjectPath("   ")).toBe("");
    });

    test("trims surrounding whitespace", () => {
        expect(normalizeProjectPath("  /tmp/x  ")).toBe("/tmp/x");
    });
});

describe("resolveProjectOptions", () => {
    test("explicit projects keep stored order first, implicit follow in recency order", () => {
        const out = resolveProjectOptions(
            [project("a", "/repo/a"), project("b", "/repo/b")],
            ["/repo/c", "/repo/a"],
            HOME,
        );
        expect(out.map((o) => o.path)).toEqual(["/repo/a", "/repo/b", "/repo/c"]);
        expect(out[2].implicit).toBe(true);
        expect(out[0].implicit).toBe(false);
    });

    test("duplicate explicit paths collapse to the first entry", () => {
        const out = resolveProjectOptions(
            [project("a", "/repo/a", "first"), project("a2", "/repo/a", "second")],
            [],
            HOME,
        );
        expect(out).toHaveLength(1);
        expect(out[0].name).toBe("first");
    });

    test("non-absolute cwds are skipped", () => {
        const out = resolveProjectOptions([], ["(unknown)", "/repo/a"], HOME);
        expect(out.map((o) => o.path)).toEqual(["/repo/a"]);
    });

    test("home cwd renders as ~", () => {
        expect(implicitProjectName(HOME, HOME)).toBe("~");
        expect(implicitProjectName("/repo/a", HOME)).toBe("a");
        expect(basenameOfPath("/repo/a/")).toBe("a");
    });
});

describe("sessionsForProject", () => {
    test("filters by exact cwd match, newest first", () => {
        const sessions = [
            { cwd: "/repo/a", modified: "2024-01-01T00:00:00Z" },
            { cwd: "/repo/a", modified: "2024-02-01T00:00:00Z" },
            { cwd: "/repo/b", modified: "2024-03-01T00:00:00Z" },
        ] as Parameters<typeof sessionsForProject>[0];
        const out = sessionsForProject(sessions, "/repo/a");
        expect(out).toHaveLength(2);
        expect(out[0].modified).toBe("2024-02-01T00:00:00Z");
    });
});
