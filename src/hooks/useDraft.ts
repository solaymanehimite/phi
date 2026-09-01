import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "phi:draft:";
const NEW_KEY = "phi:draft:new";
const EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 350;

type StoredDraft = { text: string; at: number };

function keyFor(sessionFile: string | null): string {
  return sessionFile ? `${PREFIX}${sessionFile}` : NEW_KEY;
}

function readDraft(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: StoredDraft = JSON.parse(raw);
    if (!parsed.text?.trim()) return null;
    if (Date.now() - parsed.at > EXPIRY_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.text;
  } catch {
    return null;
  }
}

function writeDraft(key: string, text: string) {
  try {
    if (!text.trim()) {
      localStorage.removeItem(key);
      return;
    }
    const payload: StoredDraft = { text, at: Date.now() };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {}
}

function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

// Evict expired drafts on load
function evictExpired() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || (!k.startsWith(PREFIX) && k !== NEW_KEY)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const p: StoredDraft = JSON.parse(raw);
        if (Date.now() - p.at > EXPIRY_MS || !p.text?.trim()) localStorage.removeItem(k);
      } catch { localStorage.removeItem(k); }
    }
  } catch {}
}

let evicted = false;

export function useDraft(sessionFile: string | null, externalValue?: string) {
  const [draft, setDraftState] = useState<string>(() => {
    if (!evicted) { evicted = true; evictExpired(); }
    return readDraft(keyFor(sessionFile)) ?? "";
  });
  const timerRef = useRef<number | null>(null);
  const sessionRef = useRef(sessionFile);

  // when session changes, load its draft
  useEffect(() => {
    sessionRef.current = sessionFile;
    setDraftState(readDraft(keyFor(sessionFile)) ?? "");
  }, [sessionFile]);

  // if externalValue provided (controlled), keep drafts in sync? not needed
  useEffect(() => {
    if (externalValue !== undefined && externalValue !== draft) {
      // external reset (e.g., clear on send) -> persist immediately
    }
  }, [externalValue]);

  const setDraft = useCallback((text: string) => {
    setDraftState(text);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const k = keyFor(sessionRef.current);
      writeDraft(k, text);
    }, DEBOUNCE_MS);
  }, []);

  const clear = useCallback(() => {
    setDraftState("");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    clearDraft(keyFor(sessionRef.current));
  }, []);

  const hasDraft = useCallback((file: string | null) => {
    const t = readDraft(keyFor(file));
    return Boolean(t && t.trim());
  }, []);

  // expose hasDraft for sidebar/tab indicators
  return { draft, setDraft, clear, hasDraft, readDraft: (f: string | null) => readDraft(keyFor(f)) };
}

// Standalone helper for checking draft existence without hook (for tabs/sidebar)
export function hasDraftFor(file: string | null): boolean {
  const k = keyFor(file);
  const t = readDraft(k);
  return Boolean(t && t.trim());
}

export function clearDraftFor(file: string | null) {
  clearDraft(keyFor(file));
}
