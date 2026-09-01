import { useEffect } from "react";

type Handlers = {
  onNewChat: () => void;
  onCloseTab: () => void;
  onDeleteSession: () => void;
  onFocusProject: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onAbort: () => void;
};

function isEditable(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useShortcuts(handlers: Handlers, opts: { enabled?: boolean; isStreaming: boolean }) {
  const { enabled = true, isStreaming } = opts;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target;

      // Cmd/Ctrl+,  -> Settings
      if (meta && e.key === ",") {
        e.preventDefault();
        handlers.onOpenSettings();
        return;
      }
      // Cmd/Ctrl+N -> New chat
      if (meta && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handlers.onNewChat();
        return;
      }
      // Cmd/Ctrl+W -> Close tab (avoid browser close)
      if (meta && e.key.toLowerCase() === "w") {
        e.preventDefault();
        handlers.onCloseTab();
        return;
      }
      // Cmd/Ctrl+Shift+Backspace -> Delete session
      if (meta && e.shiftKey && e.key === "Backspace") {
        e.preventDefault();
        handlers.onDeleteSession();
        return;
      }
      // Cmd/Ctrl+P -> Focus project picker
      if (meta && e.key.toLowerCase() === "p") {
        // avoid override when already in input? still focus picker
        if (!isEditable(target) || (target as HTMLElement).getAttribute("aria-label") !== "Message Pi") {
          // only intercept if not typing slash? we intercept always but allow default if needed?
        }
        e.preventDefault();
        handlers.onFocusProject();
        return;
      }
      // Cmd/Ctrl+K is handled by SessionCommand cmdk, don't intercept
      if (meta && e.key.toLowerCase() === "k") {
        return;
      }
      // Esc -> Abort if streaming
      if (e.key === "Escape") {
        if (isStreaming) {
          e.preventDefault();
          handlers.onAbort();
        }
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, isStreaming, handlers]);
}
