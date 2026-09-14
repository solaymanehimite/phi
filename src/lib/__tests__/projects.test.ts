// Characterization tests: project normalization and grouping.
// Covers current behavior in `src/lib/projects.ts` — tilde expansion,
// trailing slashes, empty input, target bindings, implicit entries.

import { describe, expect, test } from "bun:test";
import {
    basenameOfPath,
    boundHostIds,
    implicitProjectName,
    normalizeProjectPath,
    projectPathFor,
    resolveProjectOptions,
    sanitizeProjects,
    sessionsForProject,
    type Project,
    type ProjectOption,
} from "../projects";

const HOME = "/home/tester";

function project(id: string, targets: Record<string, string>, name?: string): Project {
    const first = Object.values(targets)[0] ?? id;
    return { id, name: name ?? first, targets, createdAt: 1 };
}

function session(cwd: string, hostId: string, modified: string) {
    return { cwd, hostId, modified } as Parameters<typeof sessionsForProject>[0][number];
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

describe("sanitizeProjects", () => {
    test("migrates legacy single-path projects to a local binding", () => {
        const out = sanitizeProjects([{ id: "a", name: "A", path: "/repo/a", createdAt: 1 }]);
        expect(out).toHaveLength(1);
        expect(out[0].targets).toEqual({ local: "/repo/a" });
    });
});

describe("resolveProjectOptions", () => {
    test("explicit projects keep stored order first, implicit follow in recency order", () => {
        const out = resolveProjectOptions(
            [project("a", { local: "/repo/a" }), project("b", { local: "/repo/b" })],
            [
                { hostId: "local", cwd: "/repo/c" },
                { hostId: "local", cwd: "/repo/a" },
            ],
            HOME,
        );
        expect(out.map((o) => (o.implicit ? o.path : Object.values(o.targets)[0]))).toEqual([
            "/repo/a",
            "/repo/b",
            "/repo/c",
        ]);
        expect(out[2].implicit).toBe(true);
        expect(out[0].implicit).toBe(false);
    });

    test("the same path on two hosts yields two implicit entries", () => {
        const out = resolveProjectOptions(
            [],
            [
                { hostId: "local", cwd: "/repo/a" },
                { hostId: "vps", cwd: "/repo/a" },
            ],
            HOME,
        );
        expect(out).toHaveLength(2);
        expect(out.every((o) => o.implicit)).toBe(true);
    });

    test("non-absolute cwds are skipped", () => {
        const out = resolveProjectOptions([], [{ hostId: "local", cwd: "(unknown)" }, { hostId: "local", cwd: "/repo/a" }], HOME);
        expect(out).toHaveLength(1);
        const only = out[0];
        expect(only.implicit && only.path).toBe("/repo/a");
    });

    test("home cwd renders as ~", () => {
        expect(implicitProjectName(HOME, HOME)).toBe("~");
        expect(implicitProjectName("/repo/a", HOME)).toBe("a");
        expect(basenameOfPath("/repo/a/")).toBe("a");
    });
});

describe("projectPathFor / boundHostIds", () => {
    const opt: ProjectOption = { id: "a", name: "A", implicit: false, targets: { local: "/repo/a", vps: "/srv/a" } };
    test("resolves the bound path per host", () => {
        expect(projectPathFor(opt, "local")).toBe("/repo/a");
        expect(projectPathFor(opt, "vps")).toBe("/srv/a");
        expect(projectPathFor(opt, "elsewhere")).toBeNull();
    });

    test("lists bound hosts", () => {
        expect(boundHostIds(opt).sort()).toEqual(["local", "vps"]);
    });
});

describe("sessionsForProject", () => {
    test("explicit projects match any binding, newest first", () => {
        const sessions = [
            session("/repo/a", "local", "2024-01-01T00:00:00Z"),
            session("/srv/a", "vps", "2024-02-01T00:00:00Z"),
            session("/repo/b", "local", "2024-03-01T00:00:00Z"),
        ];
        const opt: ProjectOption = { id: "a", name: "A", implicit: false, targets: { local: "/repo/a", vps: "/srv/a" } };
        const out = sessionsForProject(sessions, opt);
        expect(out).toHaveLength(2);
        expect(out[0].modified).toBe("2024-02-01T00:00:00Z");
    });

    test("implicit options match a single host and directory", () => {
        const sessions = [
            session("/repo/a", "local", "2024-01-01T00:00:00Z"),
            session("/repo/a", "vps", "2024-02-01T00:00:00Z"),
        ];
        const opt: ProjectOption = { id: "implicit:vps:/repo/a", name: "a", implicit: true, hostId: "vps", path: "/repo/a" };
        const out = sessionsForProject(sessions, opt);
        expect(out).toHaveLength(1);
        expect(out[0].hostId).toBe("vps");
    });
});
