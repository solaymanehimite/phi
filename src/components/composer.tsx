import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
    type DragEvent,
    type ClipboardEvent,
} from "react";
import { Button } from "./ui/button";
import { ArrowUpIcon, StopIcon } from "./ui/icons";
import { PaperClipIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { SlashMenu } from "./composer/slash-menu";
import { AtMenu } from "./composer/at-menu";
import { useSlashCommands } from "../hooks/useSlashCommands";
import { useProjectFiles } from "../hooks/useProjectFiles";
import type { ProjectFile, SlashCommand } from "../lib/api";

export type ComposerImagePayload = {
    type: "image";
    data: string;
    mimeType: string;
};

type ComposerProps = {
    onSend: (message: string, images?: ComposerImagePayload[]) => void;
    onAbort?: () => void;
    isStreaming?: boolean;
    isCompacting?: boolean;
    compactAttached?: boolean;
    disabled?: boolean;
    cwd?: string;
    draftKey?: string | null;
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

/** Find @ query at cursor. Returns query after "@" or null if not in @ context. */
function getAtQuery(text: string, cursor: number): string | null {
    const before = text.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");
    if (lastAt === -1) return null;
    // @ must be at start or after whitespace/newline (avoid emails)
    if (lastAt !== 0 && !/\s/.test(before[lastAt - 1])) return null;
    const afterAt = before.slice(lastAt + 1);
    // whitespace closes the token
    if (/\s/.test(afterAt)) return null;
    // allow a-z, 0-9, _, -, ., /
    // empty "@" -> show all
    return afterAt;
}

function getTrigger(
    text: string,
    cursor: number,
): { type: "slash" | "at"; query: string; pos: number } | null {
    const before = text.slice(0, cursor);
    const slashPos = before.lastIndexOf("/");
    const atPos = before.lastIndexOf("@");
    const slashQ = getSlashQuery(text, cursor);
    const atQ = getAtQuery(text, cursor);
    // pick the trigger closest to cursor (higher pos)
    let candidate: { type: "slash" | "at"; query: string; pos: number } | null =
        null;
    if (slashQ !== null)
        candidate = { type: "slash", query: slashQ, pos: slashPos };
    if (atQ !== null) {
        if (!candidate || atPos > candidate.pos)
            candidate = { type: "at", query: atQ, pos: atPos };
    }
    return candidate;
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
    isCompacting,
    compactAttached,
    disabled,
    cwd,
    draftKey,
}: ComposerProps) {
    const draftStorageKey = draftKey ? `phi:draft:${draftKey}` : "phi:draft:new";
    const [message, setMessage] = useState(() => {
        try {
            const raw = localStorage.getItem(draftStorageKey);
            if (!raw) return "";
            const parsed = JSON.parse(raw) as { text: string; at: number };
            const EXPIRY = 14 * 24 * 60 * 60 * 1000;
            if (Date.now() - parsed.at > EXPIRY || !parsed.text?.trim()) return "";
            return parsed.text;
        } catch {
            return "";
        }
    });
    const draftTimerRef = useRef<number | null>(null);
    // persist draft with debounce 350ms
    const persistDraft = useCallback((text: string, key: string) => {
        if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = window.setTimeout(() => {
            try {
                if (!text.trim()) localStorage.removeItem(key);
                else
                    localStorage.setItem(key, JSON.stringify({ text, at: Date.now() }));
                window.dispatchEvent(new CustomEvent("phi:draft-change"));
            } catch { }
        }, 350) as unknown as number;
    }, []);
    // when draftKey changes, load draft
    useEffect(() => {
        try {
            const raw = localStorage.getItem(draftStorageKey);
            if (!raw) {
                setMessage("");
                return;
            }
            const parsed = JSON.parse(raw) as { text: string; at: number };
            const EXPIRY = 14 * 24 * 60 * 60 * 1000;
            if (Date.now() - parsed.at > EXPIRY || !parsed.text?.trim()) {
                setMessage("");
                localStorage.removeItem(draftStorageKey);
                return;
            }
            setMessage(parsed.text);
        } catch {
            setMessage("");
        }
    }, [draftStorageKey]);
    const [images, setImages] = useState<AttachedImage[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- slash palette state ---
    const { commands } = useSlashCommands(cwd);
    const [slashQuery, setSlashQuery] = useState<string | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);

    const compactCmd: import("../lib/api").SlashCommand = useMemo(() => ({ name: "compact", description: "Compact transcript with optional instructions", source: "prompt" as const, argumentHint: "[instructions]" }), []);
    const filteredSlash = useMemo(() => {
        if (slashQuery === null) return [];
        const q = slashQuery.toLowerCase().trim();
        const base: import("../lib/api").SlashCommand[] = [compactCmd, ...commands.filter((c) => c.source === "skill")];
        if (!q) return base.slice(0, 30);
        return base
            .filter(
                (c) =>
                    c.name.toLowerCase().includes(q) ||
                    (c.description ?? "").toLowerCase().includes(q),
            )
            .slice(0, 30);
    }, [commands, slashQuery, compactCmd]);

    const isSlashOpen = slashQuery !== null && filteredSlash.length > 0;

    // --- @ file palette state ---
    const { files } = useProjectFiles(cwd);
    const [atQuery, setAtQuery] = useState<string | null>(null);
    const [atIndex, setAtIndex] = useState(0);

    const filteredAt = useMemo(() => {
        if (atQuery === null) return [];
        const q = atQuery.toLowerCase();
        // empty "@" -> show all (up to 40)
        if (!q) {
            const all = [...files];
            all.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.path.localeCompare(b.path);
            });
            return all.slice(0, 50);
        }
        // folder-qualified: "folder/" or "folder/sub" -> prefix + recursive children
        if (q.includes("/")) {
            // strip trailing slash for matching but keep prefix semantics
            const prefix = q;
            // show everything that startsWith prefix OR contains prefix recursively
            // For "@src/" we want all children under src (including nested) — prefix match
            // For "@src/compo" we want substring of path
            const isPrefixMode =
                q.endsWith("/") ||
                files.some((f) => f.path.toLowerCase().startsWith(q));
            let candidates: ProjectFile[];
            if (isPrefixMode) {
                candidates = files.filter((f) =>
                    f.path.toLowerCase().startsWith(prefix),
                );
                // if no prefix hit, fallback to includes
                if (candidates.length === 0)
                    candidates = files.filter((f) => f.path.toLowerCase().includes(q));
            } else {
                candidates = files.filter((f) => f.path.toLowerCase().includes(q));
            }
            candidates.sort((a, b) => {
                const al = a.path.toLowerCase();
                const bl = b.path.toLowerCase();
                const ap = al.startsWith(prefix) ? 0 : 1;
                const bp = bl.startsWith(prefix) ? 0 : 1;
                if (ap !== bp) return ap - bp;
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.path.localeCompare(b.path);
            });
            return candidates.slice(0, 50);
        }
        // bare filename search -> substring on path or name
        const candidates = files.filter(
            (f) =>
                f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q),
        );
        candidates.sort((a, b) => {
            const ap = a.path.toLowerCase().indexOf(q);
            const bp = b.path.toLowerCase().indexOf(q);
            if (ap !== bp) return ap - bp;
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.path.localeCompare(b.path);
        });
        return candidates.slice(0, 50);
    }, [files, atQuery]);

    const isAtOpen =
        atQuery !== null && (filteredAt.length > 0 || files.length === 0);

    const updateFromValue = useCallback((val: string, cursor: number) => {
        const trigger = getTrigger(val, cursor);
        if (!trigger) {
            setSlashQuery(null);
            setSlashIndex(0);
            setAtQuery(null);
            setAtIndex(0);
            return;
        }
        if (trigger.type === "slash") {
            setSlashQuery(trigger.query);
            setSlashIndex(0);
            setAtQuery(null);
            setAtIndex(0);
        } else {
            setAtQuery(trigger.query);
            setAtIndex(0);
            setSlashQuery(null);
            setSlashIndex(0);
        }
    }, []);

    const closeSlash = useCallback(() => {
        setSlashQuery(null);
        setSlashIndex(0);
    }, []);

    const closeAt = useCallback(() => {
        setAtQuery(null);
        setAtIndex(0);
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
            persistDraft(next, draftStorageKey);
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
        [message, closeSlash, persistDraft, draftStorageKey],
    );

    const acceptAt = useCallback(
        (file: ProjectFile) => {
            const el = textareaRef.current;
            const cursor = el?.selectionStart ?? message.length;
            const before = message.slice(0, cursor);
            const after = message.slice(cursor);
            const atPos = before.lastIndexOf("@");
            if (atPos === -1) return;
            const insertPath = file.isDirectory ? `${file.path}/` : file.path;
            const suffix = file.isDirectory ? "" : " ";
            const next = `${before.slice(0, atPos)}@${insertPath}${suffix}${after}`;
            setMessage(next);
            persistDraft(next, draftStorageKey);
            if (file.isDirectory) {
                // keep palette open filtered to this folder's children
                setAtQuery(`${insertPath}`);
                setAtIndex(0);
                setSlashQuery(null);
                requestAnimationFrame(() => {
                    if (!el) return;
                    const pos = atPos + 1 + insertPath.length;
                    el.focus();
                    el.setSelectionRange(pos, pos);
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
                });
            } else {
                closeAt();
                setSlashQuery(null);
                requestAnimationFrame(() => {
                    if (!el) return;
                    const pos = atPos + 1 + insertPath.length + 1;
                    el.focus();
                    el.setSelectionRange(pos, pos);
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
                });
            }
        },
        [message, closeAt, persistDraft, draftStorageKey],
    );

    // clamp indices
    useEffect(() => {
        if (slashQuery !== null && slashIndex >= filteredSlash.length)
            setSlashIndex(0);
    }, [filteredSlash.length, slashIndex, slashQuery]);
    useEffect(() => {
        if (atQuery !== null && atIndex >= filteredAt.length) setAtIndex(0);
    }, [filteredAt.length, atIndex, atQuery]);

    const hasContent = message.trim().length > 0 || images.length > 0;

    const addFiles = useCallback(
        async (fileList: FileList | File[]) => {
            const filesArr = Array.from(fileList);
            const imageFiles = filesArr.filter((f) => f.type.startsWith("image/"));
            if (imageFiles.length === 0) return;
            // cap at 8 images to avoid payload blowup
            const remaining = 8 - images.length;
            const toAdd = imageFiles.slice(0, Math.max(0, remaining));
            const results = await Promise.all(toAdd.map(fileToAttached));
            const valid = results.filter(Boolean) as AttachedImage[];
            if (valid.length > 0)
                setImages((prev) => [...prev, ...valid].slice(0, 8));
        },
        [images.length],
    );

    const removeImage = useCallback((id: string) => {
        setImages((prev) => prev.filter((img) => img.id !== id));
    }, []);

    const focusTextarea = useCallback(() => {
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, []);

    const submit = useCallback(
        (event?: FormEvent) => {
            event?.preventDefault();
            if (isCompacting) return;
            if (isStreaming) {
                onAbort?.();
                focusTextarea();
                return;
            }
            const content = message.trim();
            if ((!content && images.length === 0) || disabled) return;
            const payload: ComposerImagePayload[] | undefined = images.length
                ? images.map(({ data, mimeType }) => ({
                    type: "image",
                    data,
                    mimeType,
                }))
                : undefined;
            onSend(content, payload);
            setMessage("");
            setImages([]);
            try {
                localStorage.removeItem(draftStorageKey);
                window.dispatchEvent(new CustomEvent("phi:draft-change"));
            } catch { }
            if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
            closeSlash();
            closeAt();
            if (textareaRef.current) textareaRef.current.style.height = "auto";
            focusTextarea();
        },
        [
            isStreaming,
            onAbort,
            message,
            disabled,
            onSend,
            images,
            focusTextarea,
            closeSlash,
            closeAt,
            draftStorageKey,
        ],
    );

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLTextAreaElement>) => {
            // At palette takes priority when open
            if (isAtOpen) {
                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setAtIndex((i) => (i + 1) % Math.max(filteredAt.length, 1));
                    return;
                }
                if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setAtIndex(
                        (i) =>
                            (i - 1 + Math.max(filteredAt.length, 1)) %
                            Math.max(filteredAt.length, 1),
                    );
                    return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                    if (filteredAt[atIndex]) {
                        event.preventDefault();
                        acceptAt(filteredAt[atIndex]);
                        return;
                    }
                    if (filteredAt.length === 0) {
                        event.preventDefault();
                        closeAt();
                        return;
                    }
                }
                if (event.key === "Escape") {
                    event.preventDefault();
                    closeAt();
                    return;
                }
            }
            // Slash palette
            if (isSlashOpen) {
                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSlashIndex((i) => (i + 1) % filteredSlash.length);
                    return;
                }
                if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSlashIndex(
                        (i) => (i - 1 + filteredSlash.length) % filteredSlash.length,
                    );
                    return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
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
                event.preventDefault();
                if (isStreaming) {
                    onAbort?.();
                    focusTextarea();
                } else submit();
            }
            if (event.key === "Escape" && (isSlashOpen || isAtOpen)) {
                event.preventDefault();
                closeSlash();
                closeAt();
            }
        },
        [
            isAtOpen,
            isSlashOpen,
            filteredAt,
            filteredSlash,
            atIndex,
            slashIndex,
            acceptAt,
            acceptSlash,
            isStreaming,
            onAbort,
            submit,
            focusTextarea,
            closeSlash,
            closeAt,
        ],
    );

    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            const val = event.target.value;
            setMessage(val);
            persistDraft(val, draftStorageKey);
            const cursor = event.target.selectionStart ?? val.length;
            updateFromValue(val, cursor);
        },
        [updateFromValue, persistDraft, draftStorageKey],
    );
    const handleInput = useCallback(
        (event: React.FormEvent<HTMLTextAreaElement>) => {
            const el = event.currentTarget as HTMLTextAreaElement;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
            const cursor = el.selectionStart ?? message.length;
            updateFromValue(el.value, cursor);
        },
        [message.length, updateFromValue],
    );
    const handleSelect = useCallback(
        (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
            const el = e.currentTarget as HTMLTextAreaElement;
            updateFromValue(el.value, el.selectionStart ?? el.value.length);
        },
        [updateFromValue],
    );
    const handleKeyUp = useCallback(
        (e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                const el = e.currentTarget as HTMLTextAreaElement;
                updateFromValue(el.value, el.selectionStart ?? el.value.length);
            }
        },
        [updateFromValue],
    );

    const handlePaste = useCallback(
        (e: ClipboardEvent<HTMLTextAreaElement>) => {
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
                void addFiles(imageFiles);
            }
        },
        [addFiles],
    );

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
    const handleDrop = useCallback(
        (e: DragEvent) => {
            e.preventDefault();
            dragCounter.current = 0;
            setIsDragging(false);
            const files = e.dataTransfer.files;
            if (files && files.length > 0) void addFiles(files);
        },
        [addFiles],
    );

    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files;
            if (files && files.length > 0) void addFiles(files);
            e.target.value = "";
        },
        [addFiles],
    );

    const isMenuOpen = isSlashOpen || isAtOpen;

    const attached = Boolean(compactAttached ?? isCompacting);
    return (
        <form
            onSubmit={submit}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-compacting={attached ? "true" : "false"}
            className={`phi-composer-focus relative mx-auto w-full max-w-3xl border border-phi-border-strong bg-phi-bg-surface p-2 shadow-[0_14px_45px_var(--color-phi-shadow),inset_0_1px_0_var(--color-phi-border)] transition-[border-color,box-shadow] focus-within:border-phi-border-strong focus-within:shadow-[0_16px_50px_var(--color-phi-shadow-strong),0_0_0_1px_var(--color-phi-border)] ${attached ? "rounded-b-none rounded-t-none border-t-0 border-b-0" : "rounded-[17px] rounded-b-none border-b-0"}`}
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

            {/* slash palette */}
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

            {/* at file palette */}
            {isAtOpen && (
                <div className="absolute bottom-full left-2 right-2 z-20 mb-2">
                    <AtMenu
                        files={filteredAt}
                        selectedIndex={atIndex}
                        onSelect={acceptAt}
                        onHover={setAtIndex}
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
                                className="absolute right-1 top-1 inline-grid size-5 place-items-center rounded-full bg-phi-scrim text-phi-white opacity-0 backdrop-blur transition-opacity hover:bg-phi-scrim-strong group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
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
                aria-autocomplete={isMenuOpen ? "list" : undefined}
                aria-expanded={isMenuOpen ? true : undefined}
                placeholder={
                    isCompacting
                        ? "Compacting…"
                        : isStreaming
                            ? "Streaming… press Stop or Enter to abort"
                            : "What do you want to build today?"
                }
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onSelect={handleSelect}
                onClick={handleSelect}
                onPaste={handlePaste}
                disabled={!!disabled || !!isCompacting}
                onInput={handleInput}
                onBlur={() => {
                    setTimeout(() => {
                        const el = document.activeElement;
                        if (el && el.closest('[role=\"listbox\"]')) return;
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
                        disabled={!!disabled || isStreaming || !!isCompacting}
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
                        disabled={!hasContent || !!disabled || !!isCompacting}
                        aria-label="Send message"
                        title="Send message"
                    >
                        <ArrowUpIcon />
                    </Button>
                )}
            </div>
        </form>
    );
});
