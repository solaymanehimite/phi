import { useCallback, useEffect, useRef, useState } from "react";

type Serializer<T> = (value: T) => string;
type Deserializer<T> = (value: string) => T;

export type UseLocalStorageOptions<T> = {
  /** Custom serializer — defaults to JSON.stringify */
  serialize?: Serializer<T>;
  /** Custom deserializer — defaults to JSON.parse */
  deserialize?: Deserializer<T>;
  /** If true, sync value across tabs via storage event (default: true) */
  syncAcrossTabs?: boolean;
};

function defaultSerialize<T>(v: T): string {
  return JSON.stringify(v);
}

function defaultDeserialize<T>(v: string): T {
  return JSON.parse(v) as T;
}

/**
 * Reusable localStorage hook with SSR safety, JSON fallback, and cross-tab sync.
 *
 * @example
 * const [collapsed, setCollapsed] = useLocalStorage<Set<string>>(
 *   "phi:sidebar:collapsed",
 *   new Set(),
 *   {
 *     serialize: v => JSON.stringify([...v]),
 *     deserialize: s => new Set(JSON.parse(s)),
 *   }
 * );
 *
 * @example
 * // Primitives / objects work out of the box with JSON
 * const [theme, setTheme] = useLocalStorage("theme", "light");
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions<T> = {}
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const {
    serialize = defaultSerialize,
    deserialize = defaultDeserialize,
    syncAcrossTabs = true,
  } = options;

  // Keep serializer/deserializer + initialValue refs stable so inline `new Set()` etc. don't churn deps
  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);
  const initialValueRef = useRef(initialValue);
  useEffect(() => {
    serializeRef.current = serialize;
    deserializeRef.current = deserialize;
    initialValueRef.current = initialValue;
  }, [serialize, deserialize, initialValue]);

  const readValue = useCallback((): T => {
    if (typeof window === "undefined") return initialValueRef.current;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initialValueRef.current;
      return deserializeRef.current(raw);
    } catch (err) {
      console.warn(`useLocalStorage: failed to read "${key}"`, err);
      return initialValueRef.current;
    }
  }, [key]);

  const [storedValue, setStoredValue] = useState<T>(() => readValue());

  // Write to localStorage whenever value changes (skip initial mount read noise by comparing)
  const prevKeyRef = useRef(key);
  useEffect(() => {
    // If key changed, re-read instead of writing stale value under new key
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      setStoredValue(readValue());
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const serialized = serializeRef.current(storedValue);
      window.localStorage.setItem(key, serialized);
    } catch (err) {
      console.warn(`useLocalStorage: failed to write "${key}"`, err);
    }
  }, [key, storedValue, readValue]);

  // Cross-tab sync
  useEffect(() => {
    if (!syncAcrossTabs || typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        if (e.newValue === null) {
          setStoredValue(initialValueRef.current);
        } else {
          setStoredValue(deserializeRef.current(e.newValue));
        }
      } catch (err) {
        console.warn(`useLocalStorage: failed to sync "${key}"`, err);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, syncAcrossTabs]);

  return [storedValue, setStoredValue];
}

/**
 * Helper: JSON Set serializer pairing for `Set<string>` collapsed-state use case.
 * Keeps call-sites tidy.
 */
export function setStringSerializer() {
  return {
    serialize: (v: Set<string>) => JSON.stringify([...v]),
    deserialize: (s: string): Set<string> => {
      try {
        const parsed = JSON.parse(s);
        return new Set(Array.isArray(parsed) ? parsed : []);
      } catch {
        return new Set();
      }
    },
  } satisfies UseLocalStorageOptions<Set<string>>;
}
