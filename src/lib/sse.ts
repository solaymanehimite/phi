import { postSse } from "./api";
import type { SseEvent } from "../types/sse";

// Canonical event type lives in `src/types/sse.ts`; re-exported here so
// existing `import { ..., type SseEvent } from "../lib/sse"` call sites
// keep working. New code should import the type from `../types/sse`.
export type { SseEvent } from "../types/sse";
// Single SSE transport owner (`src/lib/api.ts`). Re-exported here so stream
// callers can import everything from one module.
export { postSse } from "./api";

export async function streamPrompt(
  body: { text: string; sessionFile?: string; cwd?: string; images?: unknown[] },
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return postSse(`/prompt`, body, onEvent, signal);
}
