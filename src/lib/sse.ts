export type SseEvent = Record<string, unknown>;

export async function streamPrompt(
  body: { text: string; sessionFile?: string; cwd?: string; images?: unknown[] },
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by \n\n
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = frame.split("\n");
      for (const line of lines) {
        if (line.startsWith(": ping") || line.startsWith(":") || line.trim() === "") continue;
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6);
          try {
            const ev = JSON.parse(jsonStr) as SseEvent;
            onEvent(ev);
          } catch {
            // ignore malformed
          }
        }
      }
    }
  }

  // flush remaining
  if (buffer.trim()) {
    const lines = buffer.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch {}
      }
    }
  }
}
