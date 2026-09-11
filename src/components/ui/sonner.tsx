import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconAlertCircleFilled, IconCircleCheckFilled, IconX } from "@tabler/icons-react";
import { Button } from "./button";

export type SonnerVariant = "done" | "error";

export type SonnerItem = {
    id: string;
    /** Session display name — the distinguishing line when several stack. */
    title: string;
    description?: string;
    variant: SonnerVariant;
    /** Persisted session file. When set, the card offers a View action. */
    sessionFile?: string;
};

type PushInput = Omit<SonnerItem, "id"> & { id?: string };

/**
 * Bottom-right sonner stack. Toasts auto-dismiss, cap at `max`, and never
 * persist — they are a nudge toward a session, not a record of anything.
 */
export function useSonners({ timeout = 8000, max = 4 }: { timeout?: number; max?: number } = {}) {
    const [sonners, setSonners] = useState<SonnerItem[]>([]);
    const timersRef = useRef(new Map<string, number>());

    const dismiss = useCallback((id: string) => {
        const timer = timersRef.current.get(id);
        if (timer != null) {
            window.clearTimeout(timer);
            timersRef.current.delete(id);
        }
        setSonners((prev) => (prev.some((s) => s.id === id) ? prev.filter((s) => s.id !== id) : prev));
    }, []);

    const push = useCallback((input: PushInput): string => {
        const id = input.id ?? `sonner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        setSonners((prev) => [...prev.filter((s) => s.id !== id).slice(-(max - 1)), { ...input, id }]);
        const prevTimer = timersRef.current.get(id);
        if (prevTimer != null) window.clearTimeout(prevTimer);
        timersRef.current.set(
            id,
            window.setTimeout(() => dismiss(id), timeout),
        );
        return id;
    }, [dismiss, max, timeout]);

    const clear = useCallback(() => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
        timersRef.current.clear();
        setSonners([]);
    }, []);

    useEffect(() => () => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
        timersRef.current.clear();
    }, []);

    return { sonners, push, dismiss, clear };
}

function SonnerCard({
    item,
    onOpen,
    onDismiss,
}: {
    item: SonnerItem;
    onOpen?: (item: SonnerItem) => void;
    onDismiss: (id: string) => void;
}) {
    const openable = item.sessionFile != null && onOpen != null;
    const Icon = item.variant === "error" ? IconAlertCircleFilled : IconCircleCheckFilled;
    return (
        <div
            role="status"
            data-sonner={item.id}
            data-variant={item.variant}
            className="phi-sonner-enter pointer-events-auto flex min-w-0 items-start gap-2.5 rounded-xl border border-phi-border-strong bg-phi-bg-elevated p-3 shadow-[0_12px_40px_var(--color-phi-shadow-strong)]"
        >
            <Icon
                aria-hidden="true"
                className={`mt-0.5 size-4 shrink-0 ${item.variant === "error" ? "text-phi-error" : "text-phi-thinking-low"}`}
            />
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-5 text-phi-text-primary" title={item.title}>
                    {item.title}
                </p>
                {item.description && (
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.4] text-phi-text-muted" title={item.description}>
                        {item.description}
                    </p>
                )}
                {openable && (
                    <Button
                        variant="secondary"
                        size="xs"
                        className="mt-2"
                        onClick={() => onOpen(item)}
                    >
                        View session
                    </Button>
                )}
            </div>
            <button
                type="button"
                aria-label={`Dismiss: ${item.title}`}
                title="Dismiss"
                onClick={() => onDismiss(item.id)}
                className="flex size-5 shrink-0 items-center justify-center rounded-md text-phi-text-muted hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/50"
            >
                <IconX className="size-3.5" />
            </button>
        </div>
    );
}

export function SonnerViewport({
    sonners,
    onOpen,
    onDismiss,
}: {
    sonners: SonnerItem[];
    onOpen?: (item: SonnerItem) => void;
    onDismiss: (id: string) => void;
}) {
    // FLIP layout animation: the stack is anchored bottom-right, so inserting
    // or removing a card shifts every sibling's rect. On membership change,
    // glide displaced cards from their old position instead of teleporting.
    // Newly mounted cards skip this — they run the CSS enter animation.
    // Two guards keep this from looping: the effect only runs when the id set
    // changes (streaming re-renders must not restart glides), and positions
    // come from offsetTop, which ignores in-flight transforms — rects would
    // re-measure the mid-glide position and re-trigger forever.
    const rootRef = useRef<HTMLDivElement>(null);
    const prevTopsRef = useRef(new Map<string, number>());
    const flipsRef = useRef(new Map<string, Animation>());
    const membershipKey = sonners.map((s) => s.id).join("\n");
    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) {
            prevTopsRef.current = new Map();
            flipsRef.current.clear();
            return;
        }
        const reduceMotion = typeof window !== "undefined"
            && typeof window.matchMedia === "function"
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const cards = new Map<string, HTMLElement>();
        root.querySelectorAll<HTMLElement>("[data-sonner]").forEach((el) => {
            const id = el.dataset.sonner;
            if (id) cards.set(id, el);
        });
        // Drop flips for removed cards.
        flipsRef.current.forEach((anim, id) => {
            if (!cards.has(id)) {
                try { anim.cancel(); } catch { /* noop */ }
                flipsRef.current.delete(id);
            }
        });
        if (!reduceMotion) {
            cards.forEach((el, id) => {
                const top = el.offsetTop;
                const prev = prevTopsRef.current.get(id);
                if (prev == null || prev === top) return;
                // Restarting pre-paint: the cancel snaps to the natural
                // position but no paint happens before the new glide's
                // from-keyframe applies, so there is no flash.
                try { flipsRef.current.get(id)?.cancel(); } catch { /* noop */ }
                try {
                    const anim = el.animate(
                        [{ transform: `translateY(${prev - top}px)` }, { transform: "translateY(0)" }],
                        // Matches --phi-ease-out.
                        { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
                    );
                    flipsRef.current.set(id, anim);
                    anim.onfinish = () => {
                        if (flipsRef.current.get(id) === anim) flipsRef.current.delete(id);
                    };
                } catch { /* WAAPI unavailable — cards just settle */ }
            });
        }
        const next = new Map<string, number>();
        cards.forEach((el, id) => next.set(id, el.offsetTop));
        prevTopsRef.current = next;
    }, [membershipKey]);
    if (sonners.length === 0) return null;
    return (
        <div
            ref={rootRef}
            aria-live="polite"
            aria-label="Session notifications"
            className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(calc(100vw-2rem),340px)] flex-col gap-2"
        >
            {sonners.map((item) => (
                <SonnerCard key={item.id} item={item} onOpen={onOpen} onDismiss={onDismiss} />
            ))}
        </div>
    );
}
