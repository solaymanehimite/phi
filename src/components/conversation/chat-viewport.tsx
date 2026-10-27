import { memo, useEffect, useRef, useState } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { IconArrowDown } from "@tabler/icons-react";
import { Alert } from "../ui/alert";
import { InlineErrorBlock, InterruptedBlock, isInterruption, type InlineError } from "../inline-error";
import { useStreamSnapshot, type StreamStore } from "../../lib/stream-store";
import { Conversation } from "./conversation";
import { Streaming } from "./streaming";

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const ScrollToBottomButton = memo(function ScrollToBottomButton() {
    const { isAtBottom, scrollToBottom } = useStickToBottomContext();
    const visible = !isAtBottom;
    return (
        <button
            type="button"
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
            aria-hidden={!visible}
            tabIndex={visible ? 0 : -1}
            onClick={() => void scrollToBottom(prefersReducedMotion() ? "instant" : undefined)}
            data-visible={visible ? "true" : "false"}
            className="absolute bottom-4 left-1/2 z-10 inline-flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-phi-border-strong bg-phi-bg-elevated text-phi-text-secondary shadow-[0_4px_16px_var(--color-phi-shadow-strong)] transition-all duration-200 hover:bg-phi-overlay-active hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 data-[visible=false]:pointer-events-none data-[visible=false]:translate-y-2 data-[visible=false]:opacity-0"
        >
            <IconArrowDown className="size-4" />
        </button>
    );
});

const ConversationScrubber = memo(function ConversationScrubber() {
    const { scrollRef } = useStickToBottomContext();
    const [progress, setProgress] = useState(1);
    const [hoverProgress, setHoverProgress] = useState<number | null>(null);
    const [hasOverflow, setHasOverflow] = useState(false);
    const [ridgeCount, setRidgeCount] = useState(4);
    const trackRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scrollElement = scrollRef.current;
        if (!scrollElement) return;

        let frame = 0;
        const sync = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
                setHasOverflow(maxScroll > 1);
                setProgress(maxScroll > 0 ? scrollElement.scrollTop / maxScroll : 1);
                setRidgeCount(Math.min(36, Math.max(4, Math.ceil(scrollElement.scrollHeight / 240))));
            });
        };

        sync();
        scrollElement.addEventListener("scroll", sync, { passive: true });
        const resizeObserver = new ResizeObserver(sync);
        resizeObserver.observe(scrollElement);
        if (scrollElement.firstElementChild) resizeObserver.observe(scrollElement.firstElementChild);
        return () => {
            cancelAnimationFrame(frame);
            scrollElement.removeEventListener("scroll", sync);
            resizeObserver.disconnect();
        };
    }, [scrollRef]);

    const scrubberHeight = Math.max(32, (ridgeCount - 1) * 8 + 2);

    const progressAt = (clientY: number) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        const inset = 7;
        return Math.max(0, Math.min(1, (clientY - rect.top - inset) / (rect.height - inset * 2)));
    };

    const scrollToProgress = (nextProgress: number) => {
        const scrollElement = scrollRef.current;
        if (!scrollElement) return;
        const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
        scrollElement.scrollTo({ top: Math.max(0, Math.min(1, nextProgress)) * maxScroll, behavior: "auto" });
    };

    if (!hasOverflow) return null;

    return (
        <div
            ref={trackRef}
            role="slider"
            aria-label="Conversation position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-valuetext={`${Math.round(progress * 100)}% through conversation`}
            tabIndex={0}
            onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                const nextProgress = progressAt(event.clientY);
                setHoverProgress(nextProgress);
                scrollToProgress(nextProgress);
            }}
            onPointerMove={(event) => {
                const nextProgress = progressAt(event.clientY);
                setHoverProgress(nextProgress);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) scrollToProgress(nextProgress);
            }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onPointerLeave={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) setHoverProgress(null);
            }}
            onWheel={(event) => {
                event.preventDefault();
                scrollRef.current?.scrollBy({ top: event.deltaY, behavior: "auto" });
            }}
            onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    scrollToProgress(progress - 0.05);
                } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    event.preventDefault();
                    scrollToProgress(progress + 0.05);
                } else if (event.key === "PageUp") {
                    event.preventDefault();
                    scrollToProgress(progress - 0.2);
                } else if (event.key === "PageDown") {
                    event.preventDefault();
                    scrollToProgress(progress + 0.2);
                } else if (event.key === "Home") {
                    event.preventDefault();
                    scrollToProgress(0);
                } else if (event.key === "End") {
                    event.preventDefault();
                    scrollToProgress(1);
                }
            }}
            className="absolute right-0 top-1/2 z-20 w-12 -translate-y-1/2 cursor-grab touch-none outline-none active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-phi-accent/50"
            style={{ height: scrubberHeight }}
        >
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-0 inset-y-0 flex flex-col items-center justify-center gap-2">
                    {Array.from({ length: ridgeCount }, (_, index) => (
                        <span key={index} className="h-px w-4 bg-phi-text-muted/70" />
                    ))}
                </div>
                <span
                    aria-hidden="true"
                    className="absolute left-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 bg-phi-accent"
                    style={{ top: `${progress * 100}%` }}
                />
                {hoverProgress !== null && (
                    <span
                        aria-hidden="true"
                        className="absolute left-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 bg-phi-accent/35"
                        style={{ top: `${hoverProgress * 100}%` }}
                    />
                )}
            </div>
        </div>
    );
});

const StickOnUserMessage = memo(function StickOnUserMessage({ messages }: { messages: unknown[] }) {
    const { scrollToBottom } = useStickToBottomContext();
    const prevLengthRef = useRef(messages.length);
    useEffect(() => {
        const prevLength = prevLengthRef.current;
        prevLengthRef.current = messages.length;
        if (messages.length <= prevLength) return;
        const last = messages[messages.length - 1] as Record<string, unknown> | undefined;
        if (last && String(last.role ?? "") === "user") {
            void scrollToBottom(prefersReducedMotion() ? "instant" : undefined);
        }
    }, [messages, scrollToBottom]);
    return null;
});

export const ChatViewport = memo(function ChatViewport({
    activeFile,
    loading,
    error,
    messages,
    isStreaming,
    streamStore,
    inlineError,
    onContinue,
    onDismiss,
    onUndo,
}: {
    activeFile: string | null;
    loading: boolean;
    error: string | null;
    messages: unknown[];
    isStreaming: boolean;
    streamStore: StreamStore;
    inlineError?: InlineError | null;
    onContinue?: () => void;
    onDismiss?: () => void;
    onUndo?: () => void;
}) {
    const streaming = useStreamSnapshot(streamStore, activeFile);
    if (!activeFile) return null;
    if (loading) {
        return (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <p className="py-10 text-center text-[13px] text-phi-text-muted">Loading messages…</p>
            </div>
        );
    }
    if (error && messages.length === 0) {
        return (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <Alert variant="error" className="mx-auto mt-6 max-w-xl text-[13px]">{error}</Alert>
            </div>
        );
    }
    if (messages.length === 0) {
        return (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-6 pt-6">
                <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                    <p className="text-[13px] text-phi-text-muted">No messages in this session yet.</p>
                    <p className="mt-1 text-[12px] text-phi-text-muted">Prompt streaming lands in Phase C.</p>
                    {inlineError && (isInterruption(inlineError.reason)
                        ? <InterruptedBlock onContinue={onContinue} />
                        : <InlineErrorBlock error={inlineError} onContinue={onContinue} onDismiss={onDismiss!} />)}
                </div>
            </div>
        );
    }
    const showLive = isStreaming;
    const hideLastWork = showLive && streaming.workItems.length > 0;
    const resizeAnimation: "instant" | "smooth" = prefersReducedMotion() ? "instant" : "smooth";
    return (
        <StickToBottom
            key={activeFile}
            className="relative min-h-0 w-full flex-1"
            resize={resizeAnimation}
            initial="instant"
            mass={0.9}
            stiffness={0.08}
            damping={0.75}
        >
            <StickToBottom.Content
                scrollClassName="overflow-y-auto scrollbar-none px-6 pt-6"
                className="flex flex-col items-center"
            >
                <div className="w-3xl flex h-full max-w-full flex-col">
                    <Conversation messages={messages} hideLastWork={hideLastWork} isStreaming={isStreaming} onUndo={onUndo} />
                    {showLive && (
                        <div className="pt-2">
                            <Streaming text={streaming.text} workItems={streaming.workItems} error={streaming.error} isStreaming={isStreaming} startedAt={streaming.startedAt} />
                        </div>
                    )}
                    {inlineError && (isInterruption(inlineError.reason)
                        ? <InterruptedBlock onContinue={onContinue} />
                        : <InlineErrorBlock error={inlineError} onContinue={onContinue} onDismiss={onDismiss!} />)}
                    {error && !isStreaming && !inlineError && (
                        <Alert variant="error" className="mx-auto mt-3 w-full max-w-4xl text-[13px]">{error}</Alert>
                    )}
                </div>
            </StickToBottom.Content>
            <ConversationScrubber />
            <ScrollToBottomButton />
            <StickOnUserMessage messages={messages} />
        </StickToBottom>
    );
});
