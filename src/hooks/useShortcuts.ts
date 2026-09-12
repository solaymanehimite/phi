import { useEffect } from "react";

type Handlers = {
  onNewChat: () => void;
  onCloseTab: () => void;
  onDeleteSession: () => void;
  onFocusProject: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onAbort: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  onSelectTabByIndex: (index: number) => void;
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

      // Ctrl+Tab / Ctrl+Shift+Tab -> next / previous tab (works while typing).
      // Ctrl-only (not Cmd) so Cmd+Tab stays with the OS app switcher.
      if (e.ctrlKey && !e.metaKey && e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) handlers.onPrevTab();
        else handlers.onNextTab();
        return;
      }
      // Ctrl+PageDown / Ctrl+PageUp -> next / previous tab (browser-style alias)
      if (e.ctrlKey && !e.metaKey && (e.key === "PageDown" || e.key === "PageUp")) {
        e.preventDefault();
        if (e.key === "PageDown") handlers.onNextTab();
        else handlers.onPrevTab();
        return;
      }
      // Ctrl/Cmd+1..8 -> jump to tab N, Ctrl/Cmd+9 -> last tab
      if (meta && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const n = Number(e.key);
        handlers.onSelectTabByIndex(n === 9 ? -1 : n - 1);
        return;
      }

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
      // Esc -> Abort if streaming (two-step: first press arms, second confirms).
      // Skip if already handled (e.g. closing a slash/@ palette in the composer).
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
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
