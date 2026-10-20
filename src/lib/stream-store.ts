import { useCallback, useSyncExternalStore } from "react";
import { emptyStreamState, type StreamingState } from "./stream-reducer";

// A stable snapshot for sessions with no live stream. getSnapshot must not
// allocate: useSyncExternalStore compares snapshots by identity.
const EMPTY_STREAM = emptyStreamState();

/** Live stream snapshots live outside App so token updates only render the
 * viewport subscribed to that session. Background sessions have no subscriber. */
export function createStreamStore() {
  const streams = new Map<string, StreamingState>();
  const listeners = new Map<string, Set<() => void>>();

  const get = (file: string | null): StreamingState =>
    (file ? streams.get(file) : undefined) ?? EMPTY_STREAM;

  const subscribe = (file: string | null, listener: () => void): (() => void) => {
    if (!file) return () => {};
    let subscribers = listeners.get(file);
    if (!subscribers) {
      subscribers = new Set();
      listeners.set(file, subscribers);
    }
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
      if (subscribers.size === 0) listeners.delete(file);
    };
  };

  const notify = (file: string) => {
    for (const listener of listeners.get(file) ?? []) listener();
  };

  const update = (file: string, change: (current: StreamingState) => StreamingState) => {
    const current = get(file);
    const next = change(current);
    if (next === current) return;
    streams.set(file, next);
    notify(file);
  };

  const remove = (file: string) => {
    if (streams.delete(file)) notify(file);
  };

  return { get, subscribe, update, remove };
}

export type StreamStore = ReturnType<typeof createStreamStore>;

export function useStreamSnapshot(store: StreamStore, file: string | null): StreamingState {
  const subscribe = useCallback((listener: () => void) => store.subscribe(file, listener), [store, file]);
  const getSnapshot = useCallback(() => store.get(file), [store, file]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STREAM);
}
