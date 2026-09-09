import { useCallback, useEffect, useState } from "react";

export type QueuedImage = {
  type: "image";
  data: string;
  mimeType: string;
};

export type QueuedMessage = {
  id: string;
  text: string;
  images?: QueuedImage[];
  createdAt: number;
};

const PREFIX = "phi:queue:";
const EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

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
    return parsed.items
      .filter((item) => item && typeof item.text === "string" && (item.text.trim() || (item.images?.length ?? 0) > 0));
  } catch {
    return [];
  }
}

function writeQueue(sessionFile: string, items: QueuedMessage[]) {
  try {
    const key = keyFor(sessionFile)!;
    if (items.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify({ items, at: Date.now() }));
  } catch {}
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
 * tab switch never loses queued steering messages. Uncapped by design.
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
      const trimmed = text.trim();
      if (!trimmed && (!images || images.length === 0)) return null;
      // Read synchronously so the full-check and the return value are exact.
      // (Never side-effect inside a setState updater — StrictMode double-invokes it.)
      const current: QueuedMessage[] = queues[file] ?? readQueue(file);
      const item: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        images: images?.length ? [...images] : undefined,
        createdAt: Date.now(),
      };
      const next = [...current, item];
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
      if (current.length === 0) return null;
      const [head, ...rest] = current;
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
        const next = current.filter((item) => item.id !== id);
        if (next.length === current.length) return prev;
        persist(file, next);
        return { ...prev, [file]: next };
      });
    },
    [persist],
  );

  const update = useCallback(
    (file: string, id: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setQueues((prev) => {
        const current = prev[file] ?? readQueue(file);
        const next = current.map((item) => (item.id === id ? { ...item, text: trimmed } : item));
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
