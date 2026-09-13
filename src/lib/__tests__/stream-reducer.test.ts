// Unit tests for the pure stream reducer (`src/lib/stream-reducer.ts`,
// docs/incremental-rewrite.md section 4). No fetch/SSE mocking: events are
// plain objects fed to `reduceStreamEvent`, and the returned `streamUpdate`
// is applied to a fixture stream.

import { describe, expect, test } from "bun:test";
import {
    createPendingStream,
    emptyStreamState,
    finishStream,
    flushPendingToStream,
    isLocalNoticeFallback,
    reduceStreamEvent,
    responseContainsNotices,
    withNoticesAppended,
    type StreamDraft,
    type StreamingState,
} from "../stream-reducer";
import type { SseEvent } from "../../types/sse";
import type { SessionMessagesResponse } from "../../types/session";

const NOW = 1_000_000;

function apply(state: StreamingState, draft: StreamDraft, event: SseEvent, now = NOW) {
    const outcome = reduceStreamEvent(draft, event, now);
    return {
        outcome,
        draft: outcome.draft,
        state: outcome.streamUpdate ? outcome.streamUpdate(state) : state,
    };
}

function responseWith(messages: unknown[]): SessionMessagesResponse {
    return {
        file: "f",
        header: null,
        entries: [],
        cwd: "/tmp",
        context: { messages: messages as SessionMessagesResponse["context"]["messages"], thinkingLevel: "medium", model: null },
    } as SessionMessagesResponse;
}

describe("createPendingStream", () => {
    test("starts with no text, no thinking, and reset indices", () => {
        expect(createPendingStream()).toEqual({
            text: "",
            thinking: [],
            assistantMessageIndex: -1,
            currentThinkingContentIndex: null,
            fallbackContentIndex: 1_000_000,
        });
    });
});

describe("text deltas", () => {
    test("buffer in the draft and commit on flush", () => {
        let draft = createPendingStream();
        let state = emptyStreamState();
        const first = reduceStreamEvent(draft, { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "hel" } }, NOW);
        expect(first.streamUpdate).toBeNull();
        expect(first.buffered).toBe(true);
        draft = first.draft;
        expect(draft.text).toBe("hel");
        expect(state.text).toBe("");

        const second = reduceStreamEvent(draft, { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "lo" } }, NOW);
        draft = second.draft;
        const flushed = flushPendingToStream(draft, state);
        expect(flushed.stream.text).toBe("hello");
        expect(flushed.draft.text).toBe("");
    });
});

describe("thinking blocks", () => {
    test("thinking_start opens a block, deltas accumulate, end closes it", () => {
        let draft = createPendingStream();
        let state = emptyStreamState();
        ({ draft } = apply(state, draft, { type: "message_start", message: { role: "assistant" } }));
        expect(draft.assistantMessageIndex).toBe(0);

        let r = apply(state, draft, {
            type: "message_update",
            assistantMessageEvent: { type: "thinking_start", contentIndex: 2 },
        });
        draft = r.draft;
        expect(draft.currentThinkingContentIndex).toBe(2);

        r = apply(state, draft, {
            type: "message_update",
            assistantMessageEvent: { type: "thinking_delta", contentIndex: 2, delta: "hmm " },
        });
        draft = r.draft;
        r = apply(state, draft, {
            type: "message_update",
            assistantMessageEvent: { type: "thinking_delta", contentIndex: 2, delta: "ok" },
        });
        draft = r.draft;
        expect(draft.thinking).toHaveLength(1);
        expect(draft.thinking[0].text).toBe("hmm ok");

        r = apply(state, draft, {
            type: "message_update",
            assistantMessageEvent: { type: "thinking_end" },
        });
        draft = r.draft;
        expect(draft.currentThinkingContentIndex).toBeNull();

        state = finishStream(draft, state);
        expect(state.workItems).toHaveLength(1);
        const block = state.workItems[0];
        expect(block.kind).toBe("thinking");
        if (block.kind === "thinking") expect(block.text).toBe("hmm ok");
    });

    test("missing contentIndex falls back and resets per assistant message", () => {
        let draft = createPendingStream();
        let state = emptyStreamState();
        // message_start flushes prior buffers into the stream (same as the
        // hook's flushStream), so track state across steps.
        let r = apply(state, draft, { type: "message_start", message: { role: "assistant" } });
        draft = r.draft; state = r.state;
        r = apply(state, draft, {
            type: "message_update",
            assistantMessageEvent: { type: "thinking_delta", delta: "a" },
        });
        draft = r.draft; state = r.state;
        const firstIndex = draft.currentThinkingContentIndex;
        expect(draft.thinking.map((t) => t.id)).toEqual([`thinking:0:${firstIndex}`]);

        r = apply(state, draft, { type: "message_start", message: { role: "assistant" } });
        draft = r.draft; state = r.state;
        // Prior thinking block flushed to the stream; fallback index reset.
        expect(state.workItems.map((i) => i.id)).toEqual([`thinking:0:${firstIndex}`]);
        expect(draft.thinking).toEqual([]);
        expect(draft.fallbackContentIndex).toBe(1_000_000);

        r = apply(state, draft, {
            type: "message_update",
            assistantMessageEvent: { type: "thinking_delta", delta: "b" },
        });
        draft = r.draft;
        expect(draft.thinking.map((t) => t.id)).toEqual([
            `thinking:1:${draft.currentThinkingContentIndex}`,
        ]);
    });
});

describe("tool lifecycle", () => {
    test("toolcall_start inserts an ordered tool item and flushes buffered text first", () => {
        let draft = createPendingStream();
        let state = emptyStreamState();
        let r = apply(state, draft, { type: "message_start", message: { role: "assistant" } });
        draft = r.draft;
        r = apply(state, draft, {
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "working" },
        });
        draft = r.draft;
        r = apply(state, draft, {
            type: "message_update",
            assistantMessageEvent: { type: "toolcall_start", contentIndex: 1, toolCall: { id: "c1", name: "read", arguments: { f: "a" } } },
        });
        draft = r.draft;
        state = r.state;
        expect(state.text).toBe("working");
        expect(state.workItems).toHaveLength(1);
        const inserted = state.workItems[0];
        expect(inserted.kind).toBe("tool");
        if (inserted.kind === "tool") {
            expect(inserted.id).toBe("c1");
            expect(inserted.name).toBe("read");
        }
    });

    test("tool_execution start/update/end tracks partial, result, and duration", () => {
        let draft = createPendingStream();
        let state = emptyStreamState();
        let r = apply(state, draft, { type: "tool_execution_start", toolCallId: "t1", toolName: "bash", args: { cmd: "ls" } }, NOW);
        draft = r.draft;
        state = r.state;
        const tool = state.workItems[0] as Extract<(typeof state.workItems)[number], { kind: "tool" }>;
        expect(tool.startedAt).toBe(NOW);

        r = apply(state, draft, { type: "tool_execution_update", toolCallId: "t1", partialResult: "half" }, NOW + 5);
        draft = r.draft;
        state = r.state;
        expect((state.workItems[0] as { partial?: string }).partial).toBe("half");

        r = apply(state, draft, { type: "tool_execution_end", toolCallId: "t1", result: "done" }, NOW + 40);
        state = r.state;
        const done = state.workItems[0] as Extract<(typeof state.workItems)[number], { kind: "tool" }>;
        expect(done.done).toBe(true);
        expect(done.result?.text).toBe("done");
        expect(done.durationMs).toBe(40);
    });
});

describe("notices, agent presence, and errors", () => {
    test("custom notices buffer and report the notice", () => {
        let draft = createPendingStream();
        const state = emptyStreamState();
        const r = apply(state, draft, { type: "message_start", message: { role: "custom", content: "hi" } });
        expect(r.outcome.notice).toBe("hi");
        expect(r.outcome.buffered).toBe(true);
        expect(r.draft.text).toBe("hi");
        expect(r.state.text).toBe("");

        // A second message_start flushes the first notice into the stream
        // before buffering the next one (same as the hook's flushStream).
        const r2 = apply(r.state, r.draft, { type: "message_start", message: { role: "custom", content: "again" } });
        expect(r2.outcome.notice).toBe("again");
        expect(r2.draft.text).toBe("again");
        expect(r2.state.text).toBe("hi");
    });

    test("a trailing custom notice joins buffered text with a separator", () => {
        let draft = createPendingStream();
        let state = emptyStreamState();
        let r = apply(state, draft, {
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "hello" },
        });
        draft = r.draft;
        r = apply(state, draft, { type: "message_end", message: { role: "custom", content: "bye" } });
        expect(r.outcome.notice).toBe("bye");
        expect(r.state.text).toBe("hello\n\nbye");
    });

    test("message_end flushes a trailing custom notice into the stream", () => {
        let draft = createPendingStream();
        let state = emptyStreamState();
        const r = apply(state, draft, { type: "message_end", message: { role: "custom", content: "bye" } });
        expect(r.outcome.notice).toBe("bye");
        state = r.state;
        expect(state.text).toBe("bye");
        expect(r.draft.text).toBe("");
    });

    test("agent_start reports presence without touching draft or stream", () => {
        const draft = createPendingStream();
        const state = emptyStreamState();
        const r = apply(state, draft, { type: "agent_start" });
        expect(r.outcome.sawAgent).toBe(true);
        expect(r.outcome.streamUpdate).toBeNull();
        expect(r.draft).toBe(draft);
    });

    test("error events set the stream error and report it", () => {
        const draft = createPendingStream();
        const state = emptyStreamState();
        const r = apply(state, draft, { type: "error", error: "boom" });
        expect(r.outcome.error).toBe("boom");
        expect(r.state.error).toBe("boom");
    });

    test("unknown events are no-ops", () => {
        const draft = createPendingStream();
        const state = emptyStreamState();
        const r = apply(state, draft, { type: "something_new" });
        expect(r.outcome.streamUpdate).toBeNull();
        expect(r.draft).toBe(draft);
        expect(r.state).toBe(state);
    });
});

describe("shared prompt/continuation path", () => {
    test("identical event sequences converge from independent drafts", () => {
        const sequence: SseEvent[] = [
            { type: "agent_start" },
            { type: "message_start", message: { role: "assistant" } },
            { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "hi" } },
            { type: "tool_execution_start", toolCallId: "t1", toolName: "read", args: {} },
            { type: "tool_execution_end", toolCallId: "t1", result: "ok" },
            { type: "message_end", message: { role: "assistant" } },
        ];
        const run = () => {
            let draft = createPendingStream();
            let state = emptyStreamState();
            const effects: unknown[] = [];
            for (const event of sequence) {
                const outcome = reduceStreamEvent(draft, event, NOW);
                draft = outcome.draft;
                effects.push([outcome.notice, outcome.sawAgent, outcome.error]);
                if (outcome.streamUpdate) state = outcome.streamUpdate(state);
            }
            state = finishStream(draft, state);
            return { state, effects };
        };
        // Prompt and continuation feed the same reducer: same events in,
        // same stream out.
        expect(run()).toEqual(run());
        const { state } = run();
        expect(state.text).toBe("hi");
        expect(state.workItems).toHaveLength(1);
    });
});

describe("post-stream notice reconciliation", () => {
    test("detects notices already present in history", () => {
        const response = responseWith([{ role: "assistant", content: [{ text: "hi" }] }]);
        expect(responseContainsNotices(response, ["hi"])).toBe(true);
        expect(responseContainsNotices(response, ["missing"])).toBe(false);
    });

    test("appends missing notices as an assistant message", () => {
        const response = responseWith([]);
        const next = withNoticesAppended(response, ["hi"], NOW);
        expect(next.context.messages).toHaveLength(1);
        expect(response.context.messages).toHaveLength(0);
    });

    test("slash with empty history and no agent stays local-only", () => {
        expect(isLocalNoticeFallback(responseWith([]), true, false)).toBe(true);
        expect(isLocalNoticeFallback(responseWith([]), false, false)).toBe(false);
        expect(isLocalNoticeFallback(responseWith([]), true, true)).toBe(false);
        expect(
            isLocalNoticeFallback(responseWith([{ role: "user", content: "x" }]), true, false),
        ).toBe(false);
    });
});
