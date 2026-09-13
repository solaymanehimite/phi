// Pure stream reducer shared by the prompt and continuation paths in
// `src/hooks/useChat.ts` (docs/incremental-rewrite.md section 4).
//
// Before this module, prompt handling (~line 527) and continuation handling
// (~line 383) each carried their own copy of the same event branches, with
// the continuation copy compressed into hard one-liners. Both now delegate
// to `reduceStreamEvent`.
//
// Rules for this file:
// - No React state, no refs, no rAF, no fetch. Inputs are plain data,
//   outputs are plain data plus a `streamUpdate` closure the hook applies
//   via its functional `updateStream` setter. That keeps the reducer
//   unit-testable without mocking fetch or SSE.
// - The hook keeps controllers, cache, running flags, notices/seen refs,
//   rAF batching (`scheduleFlush`), and the final `getMessages` refresh.
//   Buffering vs committing stays explicit: text/thinking deltas return
//   `buffered: true` (hook schedules a flush); structural branches compose
//   the pending-text flush into `streamUpdate` so the hook makes one call.

import {
  asRecord,
  extractCustomNotice,
  extractToolResultText,
  insertWorkItem,
  patchWorkItem,
  toolCallFromAssistantEvent,
} from "./stream-events";
import type { SseEvent } from "../types/sse";
import type { SessionMessagesResponse } from "../types/session";
import type { WorkItem, WorkOrder } from "../types/work";

// Re-exported so prompt/continuation call sites (and tests) can import the
// whole stream vocabulary from one module. Canonical implementations stay in
// `stream-events.ts`.
export { extractCustomNotice, extractToolResultText };

export type StreamingState = {
  text: string;
  workItems: WorkItem[];
  error?: string;
  startedAt?: number | null;
};

export type PendingThinking = {
  id: string;
  order: WorkOrder;
  text: string;
};

export type StreamDraft = {
  text: string;
  thinking: PendingThinking[];
  assistantMessageIndex: number;
  currentThinkingContentIndex: number | null;
  fallbackContentIndex: number;
};

export type StreamUpdate = (stream: StreamingState) => StreamingState;

export type StreamEventOutcome = {
  draft: StreamDraft;
  /** Null when the event only buffered (text/thinking) or was a no-op. */
  streamUpdate: StreamUpdate | null;
  /** Custom-notice text the hook should record alongside the transcript. */
  notice?: string;
  sawAgent?: boolean;
  error?: string;
  /** Text/thinking accumulated in the draft; hook should schedule a flush. */
  buffered?: boolean;
};

export function emptyStreamState(): StreamingState {
  return { text: "", workItems: [], startedAt: null };
}

export function createPendingStream(): StreamDraft {
  return {
    text: "",
    thinking: [],
    assistantMessageIndex: -1,
    currentThinkingContentIndex: null,
    fallbackContentIndex: 1_000_000,
  };
}

/**
 * Commit buffered text + thinking blocks into a stream view. Pure half of
 * the hook's rAF `flushStream`: same merge, no refs or state.
 */
function commitBuffers(stream: StreamingState, text: string, thinking: PendingThinking[]): StreamingState {
  if (!text && thinking.length === 0) return stream;
  let workItems = stream.workItems;
  for (const update of thinking) {
    const index = workItems.findIndex((item) => item.id === update.id);
    const item = index >= 0 ? workItems[index] : undefined;
    if (item?.kind === "thinking") {
      workItems = [...workItems];
      workItems[index] = {
        ...item,
        text: item.text + update.text,
      };
    } else {
      workItems = insertWorkItem(workItems, {
        kind: "thinking",
        id: update.id,
        text: update.text,
        order: update.order,
      });
    }
  }
  return {
    ...stream,
    text: stream.text + text,
    workItems,
  };
}

/**
 * Intermediate commit: drain draft buffers into the stream, draft stays
 * usable for subsequent events. The hook's rAF flush applies the stream
 * half via its functional setter and resets the draft half in its ref.
 * The stream half delegates to `finishStream` so there is one commit path.
 */
export function flushPendingToStream(
  draft: StreamDraft,
  stream: StreamingState,
): { draft: StreamDraft; stream: StreamingState } {
  if (!draft.text && draft.thinking.length === 0) return { draft, stream };
  return {
    draft: { ...draft, text: "", thinking: [] },
    stream: finishStream(draft, stream),
  };
}

/**
 * Terminal drain: commit whatever is left buffered and return the final
 * view. `flushPendingToStream` delegates here, so this stays load-bearing;
 * the hook's terminal view then comes from the server refresh, not from
 * keeping the drained stream.
 */
export function finishStream(draft: StreamDraft, stream: StreamingState): StreamingState {
  return commitBuffers(stream, draft.text, draft.thinking);
}

function noChange(draft: StreamDraft): StreamEventOutcome {
  return { draft, streamUpdate: null };
}

/**
 * Single code path for prompt and continuation events. `now` is injectable
 * (tool id fallback, `startedAt`, `durationMs`) so tests pin time.
 */
export function reduceStreamEvent(
  draft: StreamDraft,
  event: SseEvent,
  now: number = Date.now(),
): StreamEventOutcome {
  const type = String(event.type ?? "");

  if (type === "agent_start") {
    return { draft, streamUpdate: null, sawAgent: true };
  }

  if (type === "message_start" || type === "message_end") {
    const message = asRecord(event.message);
    if (type === "message_start") {
      // Flush what came before, then track the new assistant message and
      // buffer any custom notice on top of the cleared buffers.
      const prevText = draft.text;
      const prevThinking = draft.thinking;
      const hadBuffered = prevText !== "" || prevThinking.length > 0;
      let next: StreamDraft =
        message.role === "assistant"
          ? {
              ...draft,
              assistantMessageIndex: draft.assistantMessageIndex + 1,
              currentThinkingContentIndex: null,
              fallbackContentIndex: 1_000_000,
            }
          : draft;
      if (hadBuffered) {
        next = { ...next, text: "", thinking: [] };
      }
      let notice: string | undefined;
      if (message.role === "custom" && message.display !== false) {
        const found = extractCustomNotice(message);
        if (found) {
          notice = found;
          next = { ...next, text: next.text ? `${next.text}\n\n${found}` : found };
        }
      }
      return {
        draft: next,
        streamUpdate: hadBuffered ? (stream) => commitBuffers(stream, prevText, prevThinking) : null,
        ...(notice !== undefined ? { notice } : {}),
        ...(notice !== undefined ? { buffered: true } : {}),
      };
    }
    // message_end: buffer a trailing custom notice, then flush everything.
    let next = draft;
    let notice: string | undefined;
    if (message.role === "custom" && message.display !== false) {
      const found = extractCustomNotice(message);
      if (found) {
        notice = found;
        next = { ...next, text: next.text ? `${next.text}\n\n${found}` : found };
      }
    }
    if (!next.text && next.thinking.length === 0) {
      return { draft: next, streamUpdate: null, ...(notice !== undefined ? { notice } : {}) };
    }
    const flushedText = next.text;
    const flushedThinking = next.thinking;
    return {
      draft: { ...next, text: "", thinking: [] },
      streamUpdate: (stream) => commitBuffers(stream, flushedText, flushedThinking),
      ...(notice !== undefined ? { notice } : {}),
    };
  }

  if (type === "message_update") {
    const assistantEvent = asRecord(event.assistantMessageEvent ?? event.event);
    const assistantEventType = String(assistantEvent.type ?? "");

    if (assistantEventType === "text_delta" && typeof assistantEvent.delta === "string") {
      return {
        draft: { ...draft, text: draft.text + assistantEvent.delta },
        streamUpdate: null,
        buffered: true,
      };
    }

    if (assistantEventType === "thinking_start" || assistantEventType === "thinking_delta") {
      const messageIndex = draft.assistantMessageIndex < 0 ? 0 : draft.assistantMessageIndex;
      const contentIndex =
        typeof assistantEvent.contentIndex === "number"
          ? assistantEvent.contentIndex
          : (draft.currentThinkingContentIndex ?? draft.fallbackContentIndex);
      // Reserve a fallback slot only when the event carries no index and no
      // thinking block is currently open.
      const fallbackContentIndex =
        typeof assistantEvent.contentIndex === "number" || draft.currentThinkingContentIndex !== null
          ? draft.fallbackContentIndex
          : draft.fallbackContentIndex + 1;
      let next: StreamDraft = {
        ...draft,
        assistantMessageIndex: messageIndex,
        currentThinkingContentIndex: contentIndex,
        fallbackContentIndex,
      };
      if (assistantEventType === "thinking_delta" && typeof assistantEvent.delta === "string") {
        const id = `thinking:${messageIndex}:${contentIndex}`;
        const existing = next.thinking.find((item) => item.id === id);
        next = {
          ...next,
          thinking: existing
            ? next.thinking.map((item) => (item.id === id ? { ...item, text: item.text + (assistantEvent.delta as string) } : item))
            : [...next.thinking, { id, order: { message: messageIndex, content: contentIndex }, text: assistantEvent.delta as string }],
        };
        return { draft: next, streamUpdate: null, buffered: true };
      }
      return { draft: next, streamUpdate: null };
    }

    if (assistantEventType === "thinking_end") {
      if (draft.currentThinkingContentIndex === null) return noChange(draft);
      return { draft: { ...draft, currentThinkingContentIndex: null }, streamUpdate: null };
    }

    if (assistantEventType === "toolcall_start" || assistantEventType === "toolcall_end") {
      const call = toolCallFromAssistantEvent(assistantEvent);
      if (!call) return noChange(draft);
      const messageIndex = draft.assistantMessageIndex < 0 ? 0 : draft.assistantMessageIndex;
      const contentIndex =
        typeof assistantEvent.contentIndex === "number"
          ? assistantEvent.contentIndex
          : draft.fallbackContentIndex;
      const fallbackContentIndex =
        typeof assistantEvent.contentIndex === "number"
          ? draft.fallbackContentIndex
          : draft.fallbackContentIndex + 1;
      const prevText = draft.text;
      const prevThinking = draft.thinking;
      const next: StreamDraft = {
        ...draft,
        text: "",
        thinking: [],
        assistantMessageIndex: messageIndex,
        fallbackContentIndex,
      };
      return {
        draft: next,
        streamUpdate: (stream) => {
          const flushed = commitBuffers(stream, prevText, prevThinking);
          return {
            ...flushed,
            workItems: insertWorkItem(flushed.workItems, {
              kind: "tool",
              id: call.id,
              name: call.name,
              args: call.args,
              order: { message: messageIndex, content: contentIndex },
            }),
          };
        },
      };
    }

    return noChange(draft);
  }

  if (type === "tool_execution_start") {
    const messageIndex = draft.assistantMessageIndex < 0 ? 0 : draft.assistantMessageIndex;
    const toolCallId = String(event.toolCallId ?? event.id ?? `${now}`);
    const toolName = String(event.toolName ?? event.name ?? "tool");
    const args = asRecord(event.args ?? event.toolArgs);
    const fallbackOrder = { message: messageIndex, content: draft.fallbackContentIndex };
    const prevText = draft.text;
    const prevThinking = draft.thinking;
    const next: StreamDraft = {
      ...draft,
      text: "",
      thinking: [],
      assistantMessageIndex: messageIndex,
      fallbackContentIndex: draft.fallbackContentIndex + 1,
    };
    return {
      draft: next,
      streamUpdate: (stream) => {
        const flushed = commitBuffers(stream, prevText, prevThinking);
        const existing = flushed.workItems.find((item) => item.id === toolCallId);
        return {
          ...flushed,
          workItems: insertWorkItem(flushed.workItems, {
            kind: "tool",
            id: toolCallId,
            name: toolName,
            args,
            startedAt:
              (existing as Extract<WorkItem, { kind: "tool" }> | undefined)?.startedAt ?? now,
            order: existing?.order ?? fallbackOrder,
          }),
        };
      },
    };
  }

  if (type === "tool_execution_update") {
    const toolCallId = String(event.toolCallId ?? "");
    const partial = event.partialResult ?? event.output ?? "";
    const partialText =
      typeof partial === "string"
        ? partial
        : partial && typeof partial === "object"
          ? JSON.stringify(partial).slice(0, 500)
          : "";
    const prevText = draft.text;
    const prevThinking = draft.thinking;
    if (!prevText && prevThinking.length === 0) {
      return {
        draft,
        streamUpdate: (stream) => ({
          ...stream,
          workItems: patchWorkItem(stream.workItems, toolCallId, { partial: partialText }),
        }),
      };
    }
    const next: StreamDraft = { ...draft, text: "", thinking: [] };
    return {
      draft: next,
      streamUpdate: (stream) => {
        const flushed = commitBuffers(stream, prevText, prevThinking);
        return {
          ...flushed,
          workItems: patchWorkItem(flushed.workItems, toolCallId, { partial: partialText }),
        };
      },
    };
  }

  if (type === "tool_execution_end") {
    const toolCallId = String(event.toolCallId ?? "");
    const resultRecord = asRecord(event.result);
    const resultText = extractToolResultText(event.result);
    const resultDetails = asRecord(resultRecord.details);
    const resultDiff = typeof resultDetails.diff === "string" ? resultDetails.diff : undefined;
    const isError = Boolean(event.isError);
    const prevText = draft.text;
    const prevThinking = draft.thinking;
    const next: StreamDraft = { ...draft, text: "", thinking: [] };
    return {
      draft: next,
      streamUpdate: (stream) => {
        const flushed = commitBuffers(stream, prevText, prevThinking);
        return {
          ...flushed,
          workItems: patchWorkItem(flushed.workItems, toolCallId, {
            result: { text: resultText, isError, diff: resultDiff },
            isError,
            done: true,
            durationMs:
              now -
              ((flushed.workItems.find((item) => item.id === toolCallId) as
                | Extract<WorkItem, { kind: "tool" }>
                | undefined)?.startedAt ?? now),
          }),
        };
      },
    };
  }

  if (type === "error") {
    const message = String(event.error ?? "error");
    return {
      draft,
      streamUpdate: (stream) => ({ ...stream, error: message }),
      error: message,
    };
  }

  return noChange(draft);
}

// --- Post-stream transcript reconciliation -------------------------------
// Pure half of the `finally` blocks in `prompt` / `continueStreaming`: both
// used to inline the same notices-into-history merge with only `isSlash`
// differing (prompt: starts with "/", continuation: always false).

export function responseContainsNotices(
  response: SessionMessagesResponse,
  notices: string[],
): boolean {
  if (notices.length === 0) return true;
  return response.context.messages.some((message) => {
    const messageContent = (message as Record<string, unknown>).content;
    return (
      Array.isArray(messageContent) &&
      messageContent.some((part) => notices.includes(String((part as Record<string, unknown>).text ?? "")))
    );
  });
}

export function withNoticesAppended(
  response: SessionMessagesResponse,
  notices: string[],
  now: number = Date.now(),
): SessionMessagesResponse {
  if (notices.length === 0) return response;
  return {
    ...response,
    context: {
      ...response.context,
      messages: [
        ...response.context.messages,
        {
          role: "assistant",
          content: notices.map((notice) => ({ type: "text", text: notice })),
          timestamp: now,
        } as unknown as SessionMessagesResponse["context"]["messages"][number],
      ],
    },
  };
}

/** Slash command that produced no history and never started the agent:
 * notices render as a local-only fallback instead of a stored refresh. */
export function isLocalNoticeFallback(
  response: SessionMessagesResponse,
  isSlash: boolean,
  sawAgent: boolean,
): boolean {
  return isSlash && !sawAgent && response.context.messages.length === 0;
}
