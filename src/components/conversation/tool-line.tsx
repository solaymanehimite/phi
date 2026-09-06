import { useEffect, useState, type ReactNode } from "react";
import { IconCheckFilled, IconCopyFilled, IconXFilled } from "@tabler/icons-react";
import { Highlight, type PrismTheme, type Token, type TokenInputProps, type TokenOutputProps } from "prism-react-renderer";
import type { WorkItem } from "../../types/work";
import { InlineShell, LazyHighlightedCode, detectLanguage, grammarFor, useCodeTheme } from "../code-theme";
import { useInView } from "../../hooks/useInView";

type ToolLineProps = {
    item: Extract<WorkItem, { kind: "tool" }>;
};

function toolMeta(name: string, args: Record<string, unknown>) {
    const a = args as Record<string, string>;
    const pretty = name.replace(/[-_]/g, " ");
    if (name === "read") return { label: "Read", detail: a.path ?? null };
    if (name === "write") {
        const lines = a.content ? String(a.content).split("\n").length : null;
        return { label: lines ? `Write ${lines} lines` : "Write", detail: a.path ?? null };
    }
    if (name === "edit") return { label: "Edit", detail: a.path ?? null };
    if (name === "bash") return { label: "Run command", detail: a.command ?? null };
    if (name === "grep") return { label: "Search", detail: a.pattern ?? null };
    if (name === "find" || name === "ls") return { label: name === "find" ? "Find files" : "List files", detail: a.path ?? a.pattern ?? null };
    return { label: pretty.charAt(0).toUpperCase() + pretty.slice(1), detail: null };
}

function addPath(path: string) {
    window.dispatchEvent(new CustomEvent("phi:add-to-composer", { detail: { path } }));
}

type DiffEntry = { kind: "add" | "remove" | "context"; number?: string; text: string };

function parseDiff(diff: string): DiffEntry[] {
    return diff.split("\n").map((line) => {
        const match = line.match(/^([+-])\s*(\d+)?\s?(.*)$/);
        if (match) return { kind: match[1] === "+" ? "add" : "remove", number: match[2], text: match[3] };
        const context = line.match(/^\s?(\d+)\s(.*)$/);
        if (context) return { kind: "context", number: context[1], text: context[2] };
        return { kind: "context", text: line.replace(/^\s/, "") };
    });
}

type ChangeMark = { start: number; end: number } | null;

function changeRange(left: string, other: string): { start: number; end: number } {
    let prefix = 0;
    while (prefix < left.length && prefix < other.length && left[prefix] === other[prefix]) prefix++;
    let suffix = 0;
    while (suffix < left.length - prefix && suffix < other.length - prefix && left[left.length - 1 - suffix] === other[other.length - 1 - suffix]) suffix++;
    return { start: prefix, end: left.length - suffix || left.length };
}

// Render one diff line's tokens, wrapping the word-level change range in <mark>.
// Tokens overlapping the range boundary are split so both colors survive.
function splitMarkedLine(
    line: Token[],
    getTokenProps: (input: TokenInputProps) => TokenOutputProps,
    mark: ChangeMark,
    markClassName: string,
    keyPrefix: string,
): ReactNode[] {
    const out: ReactNode[] = [];
    const hasMark = mark != null && mark.end > mark.start;
    let offset = 0;
    line.forEach((token, ti) => {
        const text = token.content;
        const end = offset + text.length;
        if (!text) {
            // empty token — identical visually, skip
        } else if (!hasMark || end <= mark.start || offset >= mark.end) {
            out.push(<span key={`${keyPrefix}-${ti}`} {...getTokenProps({ token })} />);
        } else {
            const localStart = Math.max(0, mark.start - offset);
            const localEnd = Math.min(text.length, mark.end - offset);
            const slices: Array<{ text: string; marked: boolean }> = [];
            if (localStart > 0) slices.push({ text: text.slice(0, localStart), marked: false });
            slices.push({ text: text.slice(localStart, localEnd), marked: true });
            if (localEnd < text.length) slices.push({ text: text.slice(localEnd), marked: false });
            slices.forEach((slice, si) => {
                if (!slice.text) return;
                const props = getTokenProps({ token: { ...token, content: slice.text } });
                const { children, className, ...rest } = props;
                if (slice.marked) {
                    out.push(<mark key={`${keyPrefix}-${ti}-${si}`} {...rest} className={`${className} ${markClassName}`.trim()}>{children}</mark>);
                } else {
                    out.push(<span key={`${keyPrefix}-${ti}-${si}`} {...rest} className={className}>{children}</span>);
                }
            });
        }
        offset = end;
    });
    return out;
}

function DiffLineText({ text, language, theme, mark, markClassName, lineKey }: {
    text: string;
    language?: string;
    theme: PrismTheme;
    mark: ChangeMark;
    markClassName: string;
    lineKey: string;
}) {
    const grammar = grammarFor(language);
    const hasMark = mark != null && mark.end > mark.start;
    if (!grammar) {
        if (!hasMark) return <>{text}</>;
        return <>{text.slice(0, mark.start)}<mark className={markClassName}>{text.slice(mark.start, mark.end)}</mark>{text.slice(mark.end)}</>;
    }
    return (
        <Highlight theme={theme} code={text} language={grammar}>
            {({ tokens, getTokenProps }) => (
                <>{splitMarkedLine(tokens[0] ?? [], getTokenProps, hasMark ? mark : null, markClassName, lineKey)}</>
            )}
        </Highlight>
    );
}

function DiffOutput({ diff, isError, language }: { diff: string; isError: boolean; language?: string }) {
    const { theme } = useCodeTheme();
    const entries = parseDiff(diff);
    // One observer for the whole diff — never one per line. Offscreen diffs
    // render identical-layout plain text until scrolled near the viewport.
    const { ref, inView } = useInView<HTMLDivElement>();
    return (
        <div ref={ref} className={`phi-diff max-h-64 overflow-auto rounded-md bg-phi-bg-sunken py-1 font-mono text-[11px] leading-5 ${isError ? "text-phi-error-text" : "text-phi-text-primary"}`}>
            {!inView ? entries.map((entry, index) => (
                <div key={`${index}-${entry.kind}`} className={`phi-diff-line relative flex min-w-max items-stretch px-1.5 ${entry.kind === "remove" ? "phi-diff-remove" : entry.kind === "add" ? "phi-diff-add" : entry.text.trim() === "..." ? "phi-diff-truncation" : ""}`}>
                    <span aria-hidden="true" className={`mr-1.5 w-[3px] shrink-0 ${entry.kind === "remove" ? "bg-phi-error" : entry.kind === "add" ? "bg-phi-thinking-low" : "bg-transparent"}`} />
                    <span className="w-3 shrink-0 select-none font-semibold">{entry.kind === "remove" ? "-" : entry.kind === "add" ? "+" : ""}</span>
                    <span className="mr-2 w-7 shrink-0 select-none text-right opacity-70">{entry.number ?? ""}</span>
                    <span className="whitespace-pre">{entry.text}</span>
                </div>
            )) : entries.map((entry, index) => {
                const next = entries[index + 1];
                const previous = entries[index - 1];
                const paired = entry.kind === "remove" && next?.kind === "add";
                const prevPaired = entry.kind === "add" && previous?.kind === "remove";
                const pairOther = paired ? next.text : prevPaired ? previous.text : null;
                const mark = pairOther != null ? changeRange(entry.text, pairOther) : null;
                const markClassName = entry.kind === "remove" ? "phi-diff-word-remove" : "phi-diff-word-add";
                return (
                    <div key={`${index}-${entry.kind}`} className={`phi-diff-line relative flex min-w-max items-stretch px-1.5 ${entry.kind === "remove" ? "phi-diff-remove" : entry.kind === "add" ? "phi-diff-add" : entry.text.trim() === "..." ? "phi-diff-truncation" : ""}`}>
                        <span aria-hidden="true" className={`mr-1.5 w-[3px] shrink-0 ${entry.kind === "remove" ? "bg-phi-error" : entry.kind === "add" ? "bg-phi-thinking-low" : "bg-transparent"}`} />
                        <span className="w-3 shrink-0 select-none font-semibold">{entry.kind === "remove" ? "-" : entry.kind === "add" ? "+" : ""}</span>
                        <span className="mr-2 w-7 shrink-0 select-none text-right opacity-70">{entry.number ?? ""}</span>
                        <span className="whitespace-pre"><DiffLineText text={entry.text} language={language} theme={theme} mark={mark} markClassName={markClassName} lineKey={`${index}-${entry.kind}`} /></span>
                    </div>
                );
            })}
        </div>
    );
}

export function ToolLine({ item }: ToolLineProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    // Collapsed output mounts nothing: Highlight tokenization must not run
    // for tool results the user never expanded (the common history case).
    // Retained after first open so collapse doesn't discard work.
    const [hasOpened, setHasOpened] = useState(false);
    useEffect(() => {
        if (open && !hasOpened) setHasOpened(true);
    }, [open, hasOpened]);
    const result = item.result;
    const output = result?.text || item.partial || "";
    const copyText = item.name === "edit" && result?.diff ? result.diff : output;
    const isError = result?.isError ?? false;
    const { label, detail } = toolMeta(item.name, item.args);
    const filePath = typeof item.args.path === "string" ? item.args.path : undefined;
    // File-content outputs (read/write/edit) highlight by file extension.
    // Error output stays plain so the error color survives.
    const outputLanguage =
        filePath && (item.name === "read" || item.name === "write" || item.name === "edit")
            ? detectLanguage({ path: filePath })
            : undefined;
    const finished = Boolean(result || item.done);
    const StatusIcon = isError ? IconXFilled : IconCheckFilled;

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* clipboard permissions are optional */ }
    };

    return (
        <div className="phi-tool-line group/tool">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="group flex min-h-7 w-full min-w-0 items-center gap-2 rounded-xl px-1.5 text-left text-[12px] transition-colors hover:bg-phi-overlay-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-phi-accent/50"
            >
                <span className={`relative grid size-4 shrink-0 place-items-center rounded-full ${finished ? (isError ? "bg-phi-error text-phi-bg-app" : "bg-phi-thinking-low text-phi-bg-app") : "border border-phi-text-muted text-transparent"}`}>
                    {finished && <StatusIcon className="size-2.5" aria-hidden="true" />}
                </span>
                <span className={`shrink-0 font-medium ${isError ? "text-phi-error" : "text-phi-text-secondary"}`}>{label}</span>
                {detail && (
                    <span className="group/path relative min-w-0 max-w-[58%]">
                        <code className={`block truncate rounded bg-phi-overlay-code px-1.5 py-0.5 pr-7 font-mono text-[11px] ${item.name === "bash" ? "text-phi-text-primary" : "text-phi-text-tertiary"}`}>{item.name === "bash" && detail ? <InlineShell code={detail} /> : detail}</code>
                        {["read", "write", "edit", "ls"].includes(item.name) && typeof item.args.path === "string" && (
                            <button type="button" aria-label="Copy path to prompt" title="Copy to prompt" onClick={(event) => { event.stopPropagation(); addPath(String(item.args.path)); }} className="absolute right-0.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center text-phi-text-muted opacity-0 transition-opacity hover:text-phi-text-primary group-hover/path:opacity-100 group-focus-within/path:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-phi-accent/60">
                                <IconCopyFilled className="size-3" aria-hidden="true" />
                            </button>
                        )}
                    </span>
                )}
            </button>
            <div className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="min-h-0 overflow-hidden">
                    <div className="ml-1 border-l border-phi-border-strong py-1 pl-2">
                        <div className="relative">
                            {!hasOpened ? null : item.name === "edit" && result?.diff ? (
                                <DiffOutput diff={result.diff} isError={isError} language={isError ? undefined : outputLanguage} />
                            ) : (
                                <pre className={`max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-phi-bg-sunken px-1.5 py-2 pr-9 font-mono text-[11px] leading-5 ${isError ? "text-phi-error-text" : "text-phi-text-primary"}`}>{output ? <LazyHighlightedCode code={output} language={isError ? undefined : outputLanguage} /> : "No output"}</pre>
                            )}
                            {copyText && <button type="button" aria-label="Copy output" title={copied ? "Copied" : "Copy output"} onClick={() => void copy(copyText)} className="absolute right-1.5 top-1.5 grid size-5 place-items-center text-phi-text-muted opacity-70 transition-opacity hover:text-phi-text-primary hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-phi-accent/60">{copied ? <IconCheckFilled className="size-3.5" /> : <IconCopyFilled className="size-3.5" />}</button>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
