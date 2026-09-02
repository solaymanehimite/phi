import { useState, type ReactNode } from "react";
import {
} from "@heroicons/react/24/outline";
import { CheckIcon, Square2StackIcon, XMarkIcon } from "@heroicons/react/24/solid";
import type { WorkItem } from "../../types/work";

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

function inlineChange(oldText: string, newText: string, kind: "add" | "remove"): ReactNode {
    const left = kind === "remove" ? oldText : newText;
    const other = kind === "remove" ? newText : oldText;
    let prefix = 0;
    while (prefix < left.length && prefix < other.length && left[prefix] === other[prefix]) prefix++;
    let suffix = 0;
    while (suffix < left.length - prefix && suffix < other.length - prefix && left[left.length - 1 - suffix] === other[other.length - 1 - suffix]) suffix++;
    return <>{left.slice(0, prefix)}<mark className={kind === "remove" ? "phi-diff-word-remove" : "phi-diff-word-add"}>{left.slice(prefix, left.length - suffix || undefined)}</mark>{suffix ? left.slice(left.length - suffix) : null}</>;
}

function DiffOutput({ diff, isError }: { diff: string; isError: boolean }) {
    const entries = parseDiff(diff);
    return (
        <div className={`phi-diff max-h-64 overflow-auto rounded-md bg-phi-bg-sunken py-1 font-mono text-[11px] leading-5 ${isError ? "text-phi-error-text" : "text-phi-text-tertiary"}`}>
            {entries.map((entry, index) => {
                const next = entries[index + 1];
                const previous = entries[index - 1];
                const paired = entry.kind === "remove" && next?.kind === "add";
                const content = paired
                    ? inlineChange(entry.text, next.text, "remove")
                    : entry.kind === "add" && previous?.kind === "remove"
                        ? inlineChange(previous.text, entry.text, "add")
                        : entry.text;
                return (
                    <div key={`${index}-${entry.kind}`} className={`phi-diff-line relative flex min-w-max px-1.5 ${entry.kind === "remove" ? "phi-diff-remove" : entry.kind === "add" ? "phi-diff-add" : entry.text.trim() === "..." ? "phi-diff-truncation" : ""}`}>
                        {entry.kind !== "context" && <span className={`absolute inset-y-0 left-0 w-[3px] ${entry.kind === "remove" ? "bg-phi-error" : "bg-phi-thinking-low"}`} />}
                        <span className="mr-2 w-5 shrink-0 select-none text-right opacity-70">{entry.number ?? ""}</span>
                        <span className="mr-2 w-2 shrink-0 select-none font-semibold">{entry.kind === "remove" ? "-" : entry.kind === "add" ? "+" : " "}</span>
                        <span className="whitespace-pre">{content}</span>
                    </div>
                );
            })}
        </div>
    );
}

export function ToolLine({ item }: ToolLineProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const result = item.result;
    const output = result?.text || item.partial || "";
    const copyText = item.name === "edit" && result?.diff ? result.diff : output;
    const isError = result?.isError ?? false;
    const { label, detail } = toolMeta(item.name, item.args);
    const finished = Boolean(result || item.done);
    const StatusIcon = isError ? XMarkIcon : CheckIcon;

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
                        <code className="block truncate rounded bg-phi-overlay-code px-1.5 py-0.5 pr-7 font-mono text-[11px] text-phi-text-tertiary">{detail}</code>
                        {["read", "write", "edit", "ls"].includes(item.name) && typeof item.args.path === "string" && (
                            <button type="button" aria-label="Copy path to prompt" title="Copy to prompt" onClick={(event) => { event.stopPropagation(); addPath(String(item.args.path)); }} className="absolute right-0.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center text-phi-text-muted opacity-0 transition-opacity hover:text-phi-text-primary group-hover/path:opacity-100 group-focus-within/path:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-phi-accent/60">
                                <Square2StackIcon className="size-3" aria-hidden="true" />
                            </button>
                        )}
                    </span>
                )}
            </button>
            <div className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="min-h-0 overflow-hidden">
                    <div className="ml-1 border-l border-phi-border-strong py-1 pl-2">
                        <div className="relative">
                            {item.name === "edit" && result?.diff ? (
                                <DiffOutput diff={result.diff} isError={isError} />
                            ) : (
                                <pre className={`max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-phi-bg-sunken px-1.5 py-2 pr-9 font-mono text-[11px] leading-5 ${isError ? "text-phi-error-text" : "text-phi-text-tertiary"}`}>{output || "No output"}</pre>
                            )}
                            {copyText && <button type="button" aria-label="Copy output" title={copied ? "Copied" : "Copy output"} onClick={() => void copy(copyText)} className="absolute right-1.5 top-1.5 grid size-5 place-items-center text-white opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70">{copied ? <CheckIcon className="size-3.5" /> : <Square2StackIcon className="size-3.5" />}</button>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
