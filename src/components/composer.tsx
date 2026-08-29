import { memo, useCallback, useRef, useState, type FormEvent, type KeyboardEvent, type DragEvent, type ClipboardEvent } from "react";
import { Button } from "./ui/button";
import { ArrowUpIcon, StopIcon } from "./ui/icons";
import { ModelSelector } from "./model-selector";
import type { ModelInfo, ThinkingLevel } from "../types/session";
import { Paperclip, X } from "lucide-react";

export type ComposerImagePayload = { type: "image"; data: string; mimeType: string };

type ComposerProps = {
    onSend: (message: string, images?: ComposerImagePayload[]) => void;
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

type AttachedImage = {
    id: string;
    data: string; // base64 without prefix
    mimeType: string;
    preview: string; // data URL for <img>
    name: string;
};

function fileToAttached(file: File): Promise<AttachedImage | null> {
    if (!file.type.startsWith("image/")) return Promise.resolve(null);
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string; // data URL
            const base64 = result.split(",")[1] ?? "";
            if (!base64) return resolve(null);
            resolve({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                data: base64,
                mimeType: file.type || "image/png",
                preview: result,
                name: file.name,
            });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

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
    const [images, setImages] = useState<AttachedImage[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasContent = message.trim().length > 0 || images.length > 0;

    const addFiles = useCallback(async (fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        const imageFiles = files.filter((f) => f.type.startsWith("image/"));
        if (imageFiles.length === 0) return;
        // cap at 8 images to avoid payload blowup
        const remaining = 8 - images.length;
        const toAdd = imageFiles.slice(0, Math.max(0, remaining));
        const results = await Promise.all(toAdd.map(fileToAttached));
        const valid = results.filter(Boolean) as AttachedImage[];
        if (valid.length > 0) setImages((prev) => [...prev, ...valid].slice(0, 8));
    }, [images.length]);

    const removeImage = useCallback((id: string) => {
        setImages((prev) => prev.filter((img) => img.id !== id));
    }, []);

    const submit = useCallback((event?: FormEvent) => {
        event?.preventDefault();
        if (isStreaming) {
            onAbort?.();
            return;
        }
        const content = message.trim();
        if ((!content && images.length === 0) || disabled) return;
        const payload: ComposerImagePayload[] | undefined = images.length
            ? images.map(({ data, mimeType }) => ({ type: "image", data, mimeType }))
            : undefined;
        // allow image-only: send a single space if text empty so server/history has a marker
        // but keep original trimmed text; if empty and has images, send "" and let server handle
        onSend(content, payload);
        setMessage("");
        setImages([]);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
    }, [isStreaming, onAbort, message, disabled, onSend, images]);

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

    const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        const imageFiles: File[] = [];
        for (const item of Array.from(items)) {
            if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
            }
        }
        if (imageFiles.length > 0) {
            // prevent default paste of image as broken text? don't prevent, just add
            void addFiles(imageFiles);
        }
    }, [addFiles]);

    const handleDragEnter = useCallback((e: DragEvent) => {
        e.preventDefault();
        dragCounter.current += 1;
        if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
    }, []);
    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
    }, []);
    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setIsDragging(false);
        }
    }, []);
    const handleDrop = useCallback((e: DragEvent) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) void addFiles(files);
    }, [addFiles]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) void addFiles(files);
        // reset so same file can be picked again
        e.target.value = "";
    }, [addFiles]);

    return (
        <form
            onSubmit={submit}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="relative mx-auto w-full max-w-3xl rounded-[17px] rounded-b-none border border-phi-border-strong bg-phi-bg-surface p-2 shadow-[0_14px_45px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.025)] transition-[border-color,box-shadow] focus-within:border-phi-border-strong focus-within:shadow-[0_16px_50px_rgba(0,0,0,0.36),0_0_0_1px_rgba(255,255,255,0.018)]"
        >
            {/* drag overlay */}
            {isDragging && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[17px] rounded-b-none bg-phi-bg-surface/80 backdrop-blur-[1px] border-x-2 border-t-2 border-dashed border-phi-accent/60">
                    <div className="flex items-center gap-2 rounded-full bg-phi-bg-elevated px-4 py-2 text-[13px] font-medium text-phi-text-primary shadow-lg border border-phi-border">
                        <Paperclip size={16} />
                        Drop images to attach
                    </div>
                </div>
            )}

            {/* image previews above textarea */}
            {images.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1 pb-2">
                    {images.map((img) => (
                        <div
                            key={img.id}
                            className="group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-phi-border bg-phi-bg-elevated"
                        >
                            <img
                                src={img.preview}
                                alt={img.name}
                                className="h-full w-full object-cover"
                                draggable={false}
                            />
                            <button
                                type="button"
                                aria-label={`Remove ${img.name}`}
                                onClick={() => removeImage(img.id)}
                                className="absolute right-1 top-1 inline-grid size-5 place-items-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/85 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
                            >
                                <X size={12} strokeWidth={2.5} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <textarea
                ref={textareaRef}
                value={message}
                rows={2}
                aria-label="Message Pi"
                placeholder={
                    isStreaming
                        ? "Streaming… press Stop or Enter to abort"
                        : images.length > 0
                            ? "Describe the images…"
                            : "Message Pi…"
                }
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={!!disabled}
                onInput={handleInput}
                className="block max-h-[180px] min-h-16 w-full resize-none bg-transparent px-2.5 py-2 text-[14px] leading-6 text-phi-text-primary outline-none placeholder:text-phi-text-muted disabled:opacity-60"
            />

            <div className="flex items-center justify-between gap-3 px-0.5 pb-0.5">
                <div className="flex items-center gap-1.5">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        className="hidden"
                        onChange={handleFileInput}
                        tabIndex={-1}
                    />
                    <Button
                        type="button"
                        variant="icon"
                        aria-label="Attach images"
                        title="Attach images (drag & drop or paste too)"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!!disabled || isStreaming}
                        className="disabled:opacity-40"
                    >
                        <Paperclip size={16} strokeWidth={2} />
                    </Button>
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
                </div>

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
                        disabled={!hasContent || !!disabled}
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
