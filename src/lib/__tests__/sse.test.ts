// Characterization tests: consolidated SSE transport.
// Covers `postSse` in `src/lib/api.ts` (single owner for the prompt /
// continue / compact streams, per docs/incremental-rewrite.md section 3):
// frame splitting across chunk boundaries, ping/blank-line skipping,
// malformed JSON tolerance, trailing buffer flush, non-OK error parsing,
// request shape, and the thin streamPrompt/streamContinue/streamCompact
// wrappers supplying only path, body, and callback.

import { afterEach, describe, expect, test } from "bun:test";
import { postSse, streamCompact, streamContinue } from "../api";
import { postSse as postSseViaSse, streamPrompt } from "../sse";
import type { SseEvent } from "../../types/sse";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

function sseResponse(chunks: string[], status = 200): Response {
    const stream = new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
            controller.close();
        },
    });
    return new Response(stream, { status, headers: { "Content-Type": "text/event-stream" } });
}

function stubFetch(res: Response, seen: { url?: string; init?: RequestInit }) {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
        seen.url = String(url);
        seen.init = init;
        return res;
    }) as typeof fetch;
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
    const seen: { url?: string; init?: RequestInit } = {};
    stubFetch(sseResponse(chunks), seen);
    const events: SseEvent[] = [];
    await postSse("/prompt", { text: "hi" }, (ev) => events.push(ev));
    return events;
}

describe("postSse framing", () => {
    test("splits frames on \\n\\n, even across chunk boundaries", async () => {
        const events = await collect(['data: {"type":"a"}\n\ndata: {"type":"b', '"}\n\n']);
        expect(events).toEqual([{ type: "a" }, { type: "b" }]);
    });

    test("delivers multiple frames packed in one chunk in order", async () => {
        const events = await collect(['data: {"n":1}\n\ndata: {"n":2}\n\ndata: {"n":3}\n\n']);
        expect(events.map((e) => e.n)).toEqual([1, 2, 3]);
    });

    test("skips ping, comment, and blank lines", async () => {
        const events = await collect([": ping\n\n: a comment\n\n\n\ndata: {\"type\":\"ok\"}\n\n"]);
        expect(events).toEqual([{ type: "ok" }]);
    });

    test("tolerates malformed JSON and keeps streaming", async () => {
        const events = await collect(["data: {oops\n\ndata: {\"type\":\"good\"}\n\n"]);
        expect(events).toEqual([{ type: "good" }]);
    });

    test("flushes a trailing frame without a terminator", async () => {
        const events = await collect(['data: {"type":"early"}\n\ndata: {"type":"late"}']);
        expect(events).toEqual([{ type: "early" }, { type: "late" }]);
    });

    test("ignores a trailing non-data buffer", async () => {
        const events = await collect(['data: {"type":"ok"}\n\n: ping']);
        expect(events).toEqual([{ type: "ok" }]);
    });
});

describe("postSse errors", () => {
    test("throws the server's parsed error on non-OK", async () => {
        const seen: { url?: string; init?: RequestInit } = {};
        stubFetch(new Response(JSON.stringify({ error: "boom" }), { status: 500 }), seen);
        let err: unknown;
        try { await postSse("/prompt", {}, () => {}); } catch (e) { err = e; }
        expect((err as Error)?.message).toBe("boom");
    });

    test("falls back to HTTP status when the body is not JSON", async () => {
        const seen: { url?: string; init?: RequestInit } = {};
        stubFetch(new Response("bad gateway", { status: 502 }), seen);
        let err: unknown;
        try { await postSse("/prompt", {}, () => {}); } catch (e) { err = e; }
        expect((err as Error)?.message).toBe("HTTP 502");
    });

    test("maps 401 to the host-token message", async () => {
        const seen: { url?: string; init?: RequestInit } = {};
        stubFetch(new Response(JSON.stringify({ error: "nope" }), { status: 401 }), seen);
        let err: unknown;
        try { await postSse("/prompt", {}, () => {}); } catch (e) { err = e; }
        expect((err as Error)?.message).toBe("unauthorized — check host token");
    });
});

describe("postSse request shape", () => {
    test("POSTs JSON with no auth header for the local host", async () => {
        const seen: { url?: string; init?: RequestInit } = {};
        stubFetch(sseResponse([]), seen);
        const body = { text: "hi", sessionFile: "f" };
        await postSse("/prompt", body, () => {});
        expect(seen.url).toBe("/api/prompt");
        expect(seen.init?.method).toBe("POST");
        const headers = new Headers(seen.init?.headers);
        expect(headers.get("Content-Type")).toBe("application/json");
        expect(headers.has("Authorization")).toBe(false);
        expect(seen.init?.body).toBe(JSON.stringify(body));
    });

    test("the sse.ts re-export is the same transport", () => {
        expect(postSseViaSse).toBe(postSse);
    });
});

describe("thin stream wrappers", () => {
    test("streamPrompt posts to /prompt", async () => {
        const seen: { url?: string; init?: RequestInit } = {};
        stubFetch(sseResponse(['data: {"type":"agent_start"}\n\n']), seen);
        const events: SseEvent[] = [];
        await streamPrompt({ text: "hi" }, (ev) => events.push(ev));
        expect(seen.url).toBe("/api/prompt");
        expect(events).toEqual([{ type: "agent_start" }]);
    });

    test("streamContinue posts to /continue", async () => {
        const seen: { url?: string; init?: RequestInit } = {};
        stubFetch(sseResponse(['data: {"type":"agent_start"}\n\n']), seen);
        await streamContinue({ sessionFile: "f" }, () => {});
        expect(seen.url).toBe("/api/continue");
    });

    test("streamCompact posts to /compact", async () => {
        const seen: { url?: string; init?: RequestInit } = {};
        stubFetch(sseResponse(['data: {"type":"done"}\n\n']), seen);
        await streamCompact({ sessionFile: "f" }, () => {});
        expect(seen.url).toBe("/api/compact");
    });
});
