import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "./ui/button";
import { ArrowUpIcon, ChevronDownIcon, StopIcon } from "./ui/icons";

type ComposerProps = {
    onSend: (message: string) => void;
    onAbort?: () => void;
    isStreaming?: boolean;
    disabled?: boolean;
};

export function Composer({
    onSend,
    onAbort,
    isStreaming,
    disabled,
}: ComposerProps) {
    const [message, setMessage] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    function submit(event?: FormEvent) {
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
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (isStreaming) onAbort?.();
            else submit();
        }
    }

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
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!!disabled}
                onInput={(event) => {
                    event.currentTarget.style.height = "auto";
                    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`;
                }}
                className="block max-h-[180px] min-h-16 w-full resize-none bg-transparent px-2.5 py-2 text-[14px] leading-6 text-phi-text-primary outline-none placeholder:text-phi-text-muted disabled:opacity-60"
            />

            <div className="flex items-center justify-between gap-3 px-0.5 pb-0.5">
                <label className="relative inline-flex h-8 items-center rounded-lg text-[12px] text-phi-text-tertiary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-secondary focus-within:ring-2 focus-within:ring-phi-accent/40">
                    <select
                        aria-label="Model"
                        defaultValue="auto"
                        className="h-full cursor-pointer appearance-none bg-transparent py-0 pl-2.5 pr-7 outline-none"
                    >
                        <option value="auto">Auto</option>
                        <option value="sonnet">Claude Sonnet</option>
                        <option value="gpt">GPT-5</option>
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-1.5 size-3.5" />
                </label>

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
}
