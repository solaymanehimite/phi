import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type DragEvent, type ClipboardEvent } from "react";
import { Button } from "./ui/button";
import { ArrowUpIcon, StopIcon } from "./ui/icons";
import { PaperClipIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { SlashMenu } from "./composer/slash-menu";
import { useSlashCommands } from "../hooks/useSlashCommands";
import type { SlashCommand } from "../lib/api";

export type ComposerImagePayload = { type: "image"; data: string; mimeType: string };

type ComposerProps = {
    onSend: (message: string, images?: ComposerImagePayload[]) => void;
    onAbort?: () => void;
    isStreaming?: boolean;
    disabled?: boolean;
    cwd?: string;
};

/** Find slash query at cursor. Returns query after "/" or null if not in slash context. */
function getSlashQuery(text: string, cursor: number): string | null {
    const before = text.slice(0, cursor);
    const lastSlash = before.lastIndexOf("/");
    if (lastSlash === -1) return null;
    // slash must be at start or after whitespace/newline
    if (lastSlash !== 0 && !/\s/.test(before[lastSlash - 1])) return null;
    const afterSlash = before.slice(lastSlash + 1);
    // "/" alone -> empty query (show all)
    if (afterSlash.length === 0) return "";
    // any whitespace (space, tab, newline) means the slash token ended -> close palette
    if (/\s/.test(afterSlash)) return null;
    return afterSlash;
}

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
    cwd,
}: ComposerProps) {
    const [message, setMessage] = useState("");
    const [images, setImages] = useState<AttachedImage[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- slash palette state ---
    const { commands } = useSlashCommands(cwd);
    const [slashQuery, setSlashQuery] = useState<string | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);

    const filteredSlash = useMemo(() => {
        if (slashQuery === null) return [];
        const skillsOnly = commands.filter((c) => c.source === "skill");
        const q = slashQuery.toLowerCase().trim();
        if (!q) return skillsOnly.slice(0, 30);
        return skillsOnly
            .filter(
                (c) =>
                    c.name.toLowerCase().includes(q) ||
                    (c.description ?? "").toLowerCase().includes(q),
            )
            .slice(0, 30);
    }, [commands, slashQuery]);

    const isSlashOpen = slashQuery !== null && filteredSlash.length > 0;

    const updateSlashFromValue = useCallback(
        (val: string, cursor: number) => {
            const q = getSlashQuery(val, cursor);
            setSlashQuery(q);
            setSlashIndex(0);
        },
        [],
    );

    const closeSlash = useCallback(() => {
        setSlashQuery(null);
        setSlashIndex(0);
    }, []);

    const acceptSlash = useCallback(
        (cmd: SlashCommand) => {
            const el = textareaRef.current;
            const cursor = el?.selectionStart ?? message.length;
            const before = message.slice(0, cursor);
            const after = message.slice(cursor);
            const slashPos = before.lastIndexOf("/");
            if (slashPos === -1) return;
            const next = `${before.slice(0, slashPos)}/${cmd.name} ${after}`;
            setMessage(next);
            closeSlash();
            requestAnimationFrame(() => {
                if (!el) return;
                const pos = slashPos + 1 + cmd.name.length + 1; // after "/name "
                el.focus();
                el.setSelectionRange(pos, pos);
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
            });
        },
        [message, closeSlash],
    );

    // close slash on blur outside? keep open until query null
    useEffect(() => {
        if (slashQuery === null) return;
        // clamp index
        if (slashIndex >= filteredSlash.length) setSlashIndex(0);
    }, [filteredSlash.length, slashIndex, slashQuery]);

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

    const focusTextarea = useCallback(() => {
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, []);

    const submit = useCallback((event?: FormEvent) => {
        event?.preventDefault();
        if (isStreaming) {
            onAbort?.();
            focusTextarea();
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
        closeSlash();
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        focusTextarea();
    }, [isStreaming, onAbort, message, disabled, onSend, images, focusTextarea, closeSlash]);

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
        // Slash palette takes priority
        if (isSlashOpen) {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                setSlashIndex((i) => (i + 1) % filteredSlash.length);
                return;
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                setSlashIndex((i) => (i - 1 + filteredSlash.length) % filteredSlash.length);
                return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
                // Tab/Enter accepts selected
                if (filteredSlash[slashIndex]) {
                    event.preventDefault();
                    acceptSlash(filteredSlash[slashIndex]);
                    return;
                }
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closeSlash();
                return;
            }
        }
        if (event.key === "Enter" && !event.shiftKey) {
            // if slash open but no selection, let Enter submit normal message (which may be a slash command)
            // To avoid ambiguity, if slash open and there's a valid filter, Enter already handled above.
            event.preventDefault();
            if (isStreaming) {
                onAbort?.();
                focusTextarea();
            } else submit();
        }
        if (event.key === "Escape" && isSlashOpen) {
            event.preventDefault();
            closeSlash();
        }
    }, [isSlashOpen, filteredSlash, slashIndex, acceptSlash, isStreaming, onAbort, submit, focusTextarea, closeSlash]);

    const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = event.target.value;
        setMessage(val);
        const cursor = event.target.selectionStart ?? val.length;
        updateSlashFromValue(val, cursor);
    }, [updateSlashFromValue]);
    const handleInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
        const el = event.currentTarget as HTMLTextAreaElement;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
        // also update slash on input (covers paste/immediate)
        const cursor = el.selectionStart ?? message.length;
        updateSlashFromValue(el.value, cursor);
    }, [message.length, updateSlashFromValue]);
    const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
        const el = e.currentTarget as HTMLTextAreaElement;
        updateSlashFromValue(el.value, el.selectionStart ?? el.value.length);
    }, [updateSlashFromValue]);
    const handleKeyUp = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
        // keep slash query in sync with cursor moves (arrow keys without palette)
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            const el = e.currentTarget as HTMLTextAreaElement;
            updateSlashFromValue(el.value, el.selectionStart ?? el.value.length);
        }
    }, [updateSlashFromValue]);

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
                        <PaperClipIcon className="size-4" />
                        Drop images to attach
                    </div>
                </div>
            )}

            {/* slash palette — above textarea, inside composer */}
            {isSlashOpen && (
                <div className="absolute bottom-full left-2 right-2 z-20 mb-2">
                    <SlashMenu
                        commands={filteredSlash}
                        selectedIndex={slashIndex}
                        onSelect={acceptSlash}
                        onHover={setSlashIndex}
                    />
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
                                <XMarkIcon className="size-3" />
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
                aria-autocomplete={isSlashOpen ? "list" : undefined}
                aria-expanded={isSlashOpen ? true : undefined}
                placeholder={
                    isStreaming
                        ? "Streaming… press Stop or Enter to abort"
                        : images.length > 0
                            ? "Describe the images…"
                            : "Message Pi… — type / for commands"
                }
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onSelect={handleSelect}
                onClick={handleSelect}
                onPaste={handlePaste}
                disabled={!!disabled}
                onInput={handleInput}
                onBlur={() => {
                    // delay close to allow menu mousedown
                    setTimeout(() => {
                        const el = document.activeElement;
                        if (el && el.closest('[role="listbox"]')) return;
                        // don't auto-close on blur — keep until query changes
                    }, 150);
                }}
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
                        <PaperClipIcon className="size-4" />
                    </Button>
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
