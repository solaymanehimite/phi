// Shared server-sent event shapes for the prompt / continue / compact streams.
// Canonical home for `SseEvent` (see docs/incremental-rewrite.md section 3):
// `src/lib/api.ts` and `src/lib/sse.ts` used to define it loosely and
// separately. Import from here instead.
export type SseEvent = Record<string, unknown>;
