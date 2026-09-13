import { useCallback, useEffect, useState } from "react";
import {
  appendQueuedMessage,
  createQueuedMessage,
  removeQueuedMessage,
  sanitizeQueuedItems,
  shiftQueuedMessage,
  updateQueuedMessageText,
  type QueuedImage,
  type QueuedMessage,
} from "../lib/queue";

export type { QueuedImage, QueuedMessage };

const PREFIX = "phi:queue:";
const EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
// Persistence caps. Queued messages can carry base64 images, and localStorage
// is shared with drafts, themes, and projects, so the persisted copy stays
// small: images never persist, only the head of the queue is kept, and the
// JSON envelope has a byte ceiling. The in-memory queue is unaffected.
const MAX_PERSISTED_ITEMS = 20;
const MAX_PERSISTED_BYTES = 100_000;

function keyFor(sessionFile: string | null): string | null {
  if (!sessionFile) return null;
  return `${PREFIX}${sessionFile}`;
}

function readQueue(sessionFile: string | null): QueuedMessage[] {
  if (!sessionFile) return [];
  try {
    const raw = localStorage.getItem(keyFor(sessionFile)!);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items: QueuedMessage[]; at: number };
    if (!Array.isArray(parsed.items)) return [];
    if (Date.now() - parsed.at > EXPIRY_MS) {
      localStorage.removeItem(keyFor(sessionFile)!);
      return [];
    }
    return sanitizeQueuedItems(parsed.items);
  } catch {
    return [];
  }
}

function toPersistedItems(items: QueuedMessage[]): QueuedMessage[] {
  // Strip images (base64 payloads) and keep the head of the queue, which is
  // what drains next. Then shrink from the tail until the envelope fits.
  let out = items.slice(0, MAX_PERSISTED_ITEMS).map((item) => {
    if (!item.images?.length) return item;
    const { images: _dropped, ...rest } = item;
    return rest as QueuedMessage;
  });
  while (out.length > 1 && JSON.stringify({ items: out, at: 0 }).length > MAX_PERSISTED_BYTES) {
    out = out.slice(0, out.length - 1);
  }
  return out;
}

function writeQueue(sessionFile: string, items: QueuedMessage[]): boolean {
  try {
    const key = keyFor(sessionFile)!;
    if (items.length === 0) {
      localStorage.removeItem(key);
      return true;
    }
    localStorage.setItem(key, JSON.stringify({ items: toPersistedItems(items), at: Date.now() }));
    return true;
  } catch (err) {
    // Quota or access failure: never lose the in-memory queue silently.
    // Warn and let the UI surface it via the phi:queue-persist-error event.
    console.warn(`queue persistence failed for session`, err);
    try {
      window.dispatchEvent(new CustomEvent("phi:queue-persist-error", { detail: { sessionFile } }));
    } catch {}
    return false;
  }
}

// Evict expired queues on load
let evicted = false;
function evictExpired() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const p = JSON.parse(raw) as { items: unknown; at: number };
        if (Date.now() - p.at > EXPIRY_MS || !Array.isArray(p.items) || p.items.length === 0) {
          localStorage.removeItem(k);
        }
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

/**
 * Per-session follow-up queue. Persisted to localStorage so a reload or
 * tab switch never loses queued steering messages. Persistence is capped
 * (head items, text only, byte ceiling) and write failures warn plus emit
 * a phi:queue-persist-error event; the in-memory queue always wins.
 */
export function useMessageQueue(activeFile: string | null) {
  const [queues, setQueues] = useState<Record<string, QueuedMessage[]>>(() => {
    if (!evicted) {
      evicted = true;
      evictExpired();
    }
    if (!activeFile) return {};
    const items = readQueue(activeFile);
    return items.length > 0 ? { [activeFile]: items } : {};
  });

  // Load the active session's persisted queue on switch.
  useEffect(() => {
    if (!activeFile) return;
    setQueues((prev) => {
      if (prev[activeFile] !== undefined) return prev;
      const items = readQueue(activeFile);
      if (items.length === 0) return prev;
      return { ...prev, [activeFile]: items };
    });
  }, [activeFile]);

  const persist = useCallback((file: string, items: QueuedMessage[]) => {
    writeQueue(file, items);
  }, []);

  const enqueue = useCallback(
    (file: string, text: string, images?: QueuedImage[]): QueuedMessage | null => {
      const item = createQueuedMessage(text, images);
      if (!item) return null;
      // Read synchronously so the full-check and the return value are exact.
      // (Never side-effect inside a setState updater — StrictMode double-invokes it.)
      const current: QueuedMessage[] = queues[file] ?? readQueue(file);
      const next = appendQueuedMessage(current, item);
      persist(file, next);
      setQueues((prev) => ({ ...prev, [file]: next }));
      return item;
    },
    [persist, queues],
  );

  /** Remove and return the head of the queue (for sequential draining). */
  const shift = useCallback(
    (file: string): QueuedMessage | null => {
      const current = queues[file] ?? readQueue(file);
      const { head, rest } = shiftQueuedMessage(current);
      if (!head) return null;
      setQueues((prev) => ({ ...prev, [file]: rest }));
      persist(file, rest);
      return head;
    },
    [persist, queues],
  );

  const remove = useCallback(
    (file: string, id: string) => {
      setQueues((prev) => {
        const current = prev[file] ?? readQueue(file);
        const next = removeQueuedMessage(current, id);
        if (next.length === current.length) return prev;
        persist(file, next);
        return { ...prev, [file]: next };
      });
    },
    [persist],
  );

  const update = useCallback(
    (file: string, id: string, text: string) => {
      if (!text.trim()) return;
      setQueues((prev) => {
        const current = prev[file] ?? readQueue(file);
        const next = updateQueuedMessageText(current, id, text);
        persist(file, next);
        return { ...prev, [file]: next };
      });
    },
    [persist],
  );

  const clear = useCallback(
    (file: string) => {
      setQueues((prev) => {
        if (!(file in prev)) {
          // Still wipe any persisted entry.
          persist(file, []);
          return prev;
        }
        persist(file, []);
        const { [file]: _removed, ...rest } = prev;
        return rest;
      });
    },
    [persist],
  );

  const queueFor = useCallback(
    (file: string | null): QueuedMessage[] => {
      if (!file) return [];
      return queues[file] ?? [];
    },
    [queues],
  );

  return {
    queues,
    queueFor,
    enqueue,
    shift,
    remove,
    update,
    clear,
  };
}

export function clearQueueFor(file: string | null) {
  if (!file) return;
  try {
    localStorage.removeItem(`${PREFIX}${file}`);
  } catch {}
}
