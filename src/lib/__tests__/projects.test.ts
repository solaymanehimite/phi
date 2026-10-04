import { describe, expect, test } from "bun:test";
import { basenameOfPath, implicitProjectName, normalizeProjectPath, resolveProjectOptions, sanitizeProjects, sessionsForProject, type Project } from "../projects";

const HOME = "/home/tester";
const project = (id: string, path: string, name = path): Project => ({ id, name, path, createdAt: 1 });
const session = (cwd: string, modified: string) => ({ cwd, modified } as Parameters<typeof sessionsForProject>[0][number]);

describe("normalizeProjectPath", () => {
    test("expands tilde and normalizes trailing slashes", () => {
        expect(normalizeProjectPath("~", HOME)).toBe(HOME);
        expect(normalizeProjectPath("~/projects/foo", HOME)).toBe(`${HOME}/projects/foo`);
        expect(normalizeProjectPath("/home/tester/foo///")).toBe("/home/tester/foo");
    });
});

describe("sanitizeProjects", () => {
    test("retains local projects and their existing local paths", () => {
        expect(sanitizeProjects([{ id: "a", name: "A", path: "/repo/a", createdAt: 1 }])[0].path).toBe("/repo/a");
        expect(sanitizeProjects([{ id: "b", name: "B", targets: { local: "/repo/b" } }])[0].path).toBe("/repo/b");
    });
});

describe("resolveProjectOptions", () => {
    test("keeps explicit projects first and derives unclaimed local workspaces", () => {
        const out = resolveProjectOptions([project("a", "/repo/a")], ["/repo/b", "/repo/a"], HOME);
        expect(out.map((item) => item.path)).toEqual(["/repo/a", "/repo/b"]);
        expect(out[1].implicit).toBe(true);
        expect(implicitProjectName(HOME, HOME)).toBe("~");
        expect(basenameOfPath("/repo/a/")).toBe("a");
    });
});

describe("sessionsForProject", () => {
    test("matches a local workspace and sorts newest first", () => {
        const out = sessionsForProject([session("/repo/a", "2024-01-01T00:00:00Z"), session("/repo/a", "2024-02-01T00:00:00Z"), session("/repo/b", "2024-03-01T00:00:00Z")], { ...project("a", "/repo/a"), implicit: false });
        expect(out).toHaveLength(2);
        expect(out[0].modified).toBe("2024-02-01T00:00:00Z");
    });
});
