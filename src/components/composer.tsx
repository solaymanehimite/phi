import { memo, useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "./ui/button";
import { ArrowUpIcon, StopIcon } from "./ui/icons";
import { ModelSelector } from "./model-selector";
import type { ModelInfo, ThinkingLevel } from "../types/session";

type ComposerProps = {
    onSend: (message: string) => void;
    onAbort?: () => void;
    isStreaming?: boolean;
    disabled?: boolean;
    models?: ModelInfo[];
    modelsLoading?: boolean;
    modelsError?: string | null;
    selectedModelKey?: string;
    thinkingLevel?: string;
    onSelectModel?: (provider: string, id: string) => void | Promise<void>;
    onThinkingChange?: (level: ThinkingLevel) => void | Promise<void>;
};

export const Composer = memo(function Composer({
    onSend,
    onAbort,
    isStreaming,
    disabled,
    models,
    modelsLoading,
    modelsError,
    selectedModelKey,
    thinkingLevel,
    onSelectModel,
    onThinkingChange,
}: ComposerProps) {
    const [message, setMessage] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const submit = useCallback((event?: FormEvent) => {
        event?.preventDefault();
        if (isStreaming) {
            onAbort?.();
            return;
        }
        const content = message.trim();
        if (!content || disabled) return;
        onSend(content);
        setMessage("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
    }, [isStreaming, onAbort, message, disabled, onSend]);

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (isStreaming) onAbort?.();
            else submit();
        }
    }, [isStreaming, onAbort, submit]);

    const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(event.target.value), []);
    const handleInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
        const el = event.currentTarget as HTMLTextAreaElement;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }, []);

    return (
        <form
            onSubmit={submit}
            className="mx-auto w-full max-w-3xl rounded-[17px] rounded-b-none border border-phi-border-strong bg-phi-bg-surface p-2 shadow-[0_14px_45px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.025)] transition-[border-color,box-shadow] focus-within:border-phi-border-strong focus-within:shadow-[0_16px_50px_rgba(0,0,0,0.36),0_0_0_1px_rgba(255,255,255,0.018)]"
        >
            <textarea
                ref={textareaRef}
                value={message}
                rows={2}
                aria-label="Message Pi"
                placeholder={
                    isStreaming
                        ? "Streaming… press Stop or Enter to abort"
                        : "Message Pi…"
                }
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                disabled={!!disabled}
                onInput={handleInput}
                className="block max-h-[180px] min-h-16 w-full resize-none bg-transparent px-2.5 py-2 text-[14px] leading-6 text-phi-text-primary outline-none placeholder:text-phi-text-muted disabled:opacity-60"
            />

            <div className="flex items-center justify-between gap-3 px-0.5 pb-0.5">
                <ModelSelector
                    models={models}
                    value={selectedModelKey}
                    thinkingLevel={thinkingLevel}
                    onSelect={onSelectModel}
                    onThinkingChange={onThinkingChange}
                    disabled={!!disabled}
                    isStreaming={!!isStreaming}
                    loading={!!modelsLoading}
                    error={modelsError ?? null}
                />

                {isStreaming ? (
                    <Button
                        type="submit"
                        variant="primary"
                        aria-label="Stop"
                        title="Stop"
                        className="!bg-phi-error !text-phi-white hover:!bg-phi-error/80"
                    >
                        <StopIcon />
                    </Button>
                ) : (
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={!message.trim() || !!disabled}
                        aria-label="Send message"
                        title="Send message"
                    >
                        <ArrowUpIcon />
                    </Button>
                )}
            </div>
        </form>
    );
})
