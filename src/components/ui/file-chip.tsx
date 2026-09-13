import { memo, type MouseEvent } from "react";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";

export type ParsedFilePath = {
    /** Clean path without @ mention prefix, line suffix, or trailing punctuation. */
    path: string;
    /** Basename shown on the chip (includes extension). */
    name: string;
    /** Lowercase extension without dot, "" for directories and dotfiles. */
    ext: string;
    isDirectory: boolean;
};

/**
 * File-type glyph from the Symbols icon set (the VS Code Symbols theme).
 * Unknown extensions fall back to the library's default file icon, and
 * special filenames (`Dockerfile`, `package.json`, …) resolve via
 * `autoAssign` — so there is no local extension map or brand-color table
 * to maintain. The SVGs carry their own colors.
 */
function ChipIcon({ name, isDirectory }: { name: string; isDirectory: boolean }) {
    if (isDirectory) {
        return (
            <FolderIcon
                folderName={name}
                width={14}
                height={14}
                className="shrink-0"
                aria-hidden="true"
            />
        );
    }
    return (
        <FileIcon
            fileName={name}
            autoAssign
            width={14}
            height={14}
            className="shrink-0"
            aria-hidden="true"
        />
    );
}

/** Dispatch a path to the composer (adds `@path`). Placeholder until the file editor lands. */
export function addPathToComposer(path: string) {
    window.dispatchEvent(
        new CustomEvent("phi:add-to-composer", { detail: { path } }),
    );
}

const PATH_RE = /^([~.]?\/|\/)?[A-Za-z0-9_~.+-]+(\/[A-Za-z0-9_~.+-]+)*\/?$/;

// Dotted JS globals (`console.log`) look like bare filenames — never chips.
const BARE_STEM_DENY = new Set([
    "console", "process", "math", "json", "object", "array", "string",
    "number", "boolean", "promise", "buffer", "window", "document",
    "navigator", "intl", "url", "regexp", "error", "map", "set", "symbol",
    "reflect", "proxy", "globalthis",
]);

// Extensionless filenames that are still files.
const KNOWN_FILENAMES = new Set([
    "dockerfile", "makefile", "gnumakefile", "gemfile", "rakefile",
    "vagrantfile", "brewfile", "podfile",
]);

/**
 * Decide whether backticked text is a file path. Rejects commands,
 * sentences, URLs, flags, and version numbers. Strips a leading @ mention,
 * trailing :line[:col], and trailing punctuation before matching.
 */
export function parseInlineFilePath(raw: unknown): ParsedFilePath | null {
    if (typeof raw !== "string") return null;
    let text = raw.trim();
    if (!text || text.length > 200 || /[\s`'"]/.test(text)) return null;
    if (text.includes("://")) return null;
    if (/^(https?|mailto|ftp):/i.test(text)) return null;
    if (/^[-$>]/.test(text)) return null;

    // One leading @ mention (composer syntax) is not part of the path.
    if (text.startsWith("@")) text = text.slice(1);
    // Trailing :line / :line:col references (`src/a.ts:12:5`).
    text = text.replace(/:\d+(?::\d+)?$/, "");
    // Trailing sentence punctuation from prose (`see src/a.ts.`).
    text = text.replace(/[.,;:!?)\]}]+$/, "");
    // Matching leading wrappers.
    text = text.replace(/^[(\[{]+/, "");
    if (!text || text.length > 200 || /\s/.test(text)) return null;
    if (!PATH_RE.test(text)) return null;
    if (!/[A-Za-z]/.test(text)) return null;

    const isDirectory = text.endsWith("/");
    const clean = isDirectory ? text.slice(0, -1) : text;
    const slash = clean.lastIndexOf("/");
    const name = slash === -1 ? clean : clean.slice(slash + 1);
    if (!name) return null;

    if (isDirectory) return { path: clean, name, ext: "", isDirectory: true };

    const hasSlash = clean.includes("/");
    // Extensionless but well-known (`Dockerfile`).
    if (KNOWN_FILENAMES.has(name.toLowerCase())) {
        return { path: text, name, ext: "", isDirectory: false };
    }

    // Dotfiles (`.gitignore`) count as files without an extension.
    if (name.startsWith(".") && name.indexOf(".", 1) === -1) {
        return name.length > 1
            ? { path: text, name, ext: "", isDirectory: false }
            : null;
    }
    const dot = name.lastIndexOf(".");
    if (dot <= 0 || dot === name.length - 1) return null;
    const ext = name.slice(dot + 1).toLowerCase();
    if (!/^[a-z0-9]{1,10}$/.test(ext) || !/[a-z]/.test(ext)) return null;
    // Bare `word.ext` without a slash is only a chip when the stem isn't a
    // dotted JS global (`console.log`) and single-letter extensions (`e.g`)
    // require a directory (`src/main.c` chips, bare `e.g` doesn't).
    if (!hasSlash) {
        if (BARE_STEM_DENY.has(name.slice(0, dot).toLowerCase())) return null;
        if (ext.length === 1) return null;
    }
    return { path: text, name, ext, isDirectory: false };
}

type FileChipProps = {
    path: string;
    className?: string;
};

/**
 * Chip button for a file path — Symbols icon plus basename.
 * Click adds `@path` to the composer; later this opens the file editor.
 */
export const FileChip = memo(function FileChip({ path, className = "" }: FileChipProps) {
    const parsed = parseInlineFilePath(path);
    const name = parsed?.name ?? path.split("/").pop() ?? path;
    const title = parsed?.path ?? path;
    const isDirectory = parsed?.isDirectory ?? false;

    const onClick = (event: MouseEvent) => {
        event.stopPropagation();
        addPathToComposer(title);
    };

    return (
        <button
            type="button"
            onClick={onClick}
            title={`${title} — add to composer`}
            aria-label={`Add ${title} to composer`}
            className={`inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-phi-border bg-phi-overlay px-1.5 py-px align-middle text-[12px] font-medium leading-5 text-phi-text-primary transition-colors hover:bg-phi-overlay-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-phi-accent/60 ${className}`}
        >
            <ChipIcon name={name} isDirectory={isDirectory} />
            <span className="min-w-0 max-w-[220px] truncate">{name}</span>
        </button>
    );
});
