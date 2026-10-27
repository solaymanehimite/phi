import { useEffect, useState } from "react";
import {
    IconCopyFilled,
    IconFile,
    IconFilePlus,
    IconFolder,
    IconPencil,
    IconSearch,
    IconTerminal2,
    IconTool,
    IconXFilled,
} from "@tabler/icons-react";
import { Button } from "../ui/button";
import { Well } from "../ui/surface";
import type { WorkItem } from "../../types/work";
import { LazyHighlightedCode, detectLanguage } from "../code-theme";
import { FileChip } from "../ui/file-chip";

export type ToolItem = Extract<WorkItem, { kind: "tool" }>;

type ToolLineProps = {
    item: ToolItem;
};

function toolMeta(name: string, args: Record<string, unknown>) {
    const a = args as Record<string, string>;
    const pretty = name.replace(/[-_]/g, " ");
    if (name === "read") return { label: "Read", detail: a.path ?? null };
    if (name === "write") return { label: "Write", detail: a.path ?? null };
    if (name === "edit") return { label: "Edit", detail: a.path ?? null };
    if (name === "bash" || name === "powershell") return { label: "Run", detail: a.command ?? null };
    if (name === "grep") return { label: "Search", detail: a.pattern ?? null };
    if (name === "find") return { label: "Find", detail: a.pattern ?? a.path ?? null };
    if (name === "ls") return { label: "List", detail: a.path ?? null };
    return { label: pretty.charAt(0).toUpperCase() + pretty.slice(1), detail: null };
}

function ToolIcon({ name, error }: { name: string; error: boolean }) {
    if (error) return <IconXFilled className="size-3.5 text-phi-error" aria-label="Failed" />;
    const className = "size-3.5 text-phi-text-muted";
    if (name === "read") return <IconFile className={className} />;
    if (name === "write") return <IconFilePlus className={className} />;
    if (name === "edit") return <IconPencil className={className} />;
    if (name === "bash" || name === "powershell") return <IconTerminal2 className={className} />;
    if (name === "grep" || name === "find") return <IconSearch className={className} />;
    if (name === "ls") return <IconFolder className={className} />;
    return <IconTool className={className} />;
}

function ToolResultBody({ item }: { item: ToolItem }) {
    const result = item.result;
    const output = result?.diff ?? result?.text ?? item.partial ?? "";
    const copyText = output;
    const isError = result?.isError ?? false;
    const filePath = typeof item.args.path === "string" ? item.args.path : undefined;
    const language =
        filePath && (item.name === "read" || item.name === "write" || item.name === "edit")
            ? detectLanguage({ path: filePath })
            : undefined;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(copyText);
        } catch {
            // Clipboard permissions are optional.
        }
    };

    return (
        <div className="relative pt-1">
            <Well as="pre" className={`max-h-64 overflow-auto whitespace-pre-wrap break-words px-2 py-2 pr-8 font-mono text-[11px] leading-5 ${isError ? "text-phi-error-text" : "text-phi-text-primary"}`}>
                {output ? <LazyHighlightedCode code={output} language={isError ? undefined : language} /> : "No output"}
            </Well>
            {copyText && (
                <span className="absolute right-1.5 top-2.5">
                    <Button type="button" variant="mini" aria-label="Copy output" title="Copy output" onClick={() => void copy()}>
                        <IconCopyFilled className="size-3.5" />
                    </Button>
                </span>
            )}
        </div>
    );
}

export function ToolLine({ item }: ToolLineProps) {
    const [open, setOpen] = useState(false);
    const [hasOpened, setHasOpened] = useState(false);
    useEffect(() => {
        if (open) setHasOpened(true);
    }, [open]);

    const { label, detail } = toolMeta(item.name, item.args);
    const isError = item.result?.isError ?? false;
    const hasOutput = Boolean(item.result?.text || item.result?.diff || item.partial);
    const path = typeof item.args.path === "string" && item.args.path.trim() ? item.args.path : null;
    const expandable = hasOutput || Boolean(item.result);

    const row = (
        <>
            <span className="grid size-5 shrink-0 place-items-center">
                <ToolIcon name={item.name} error={isError} />
            </span>
            <span className={`shrink-0 font-medium ${isError ? "text-phi-error" : "text-phi-text-secondary"}`}>{label}</span>
            {path && (item.name === "read" || item.name === "write" || item.name === "edit" || item.name === "ls") ? (
                <span className="min-w-0" onClick={(event) => event.stopPropagation()}><FileChip path={path} /></span>
            ) : detail ? (
                <code className="min-w-0 truncate rounded bg-phi-overlay-code px-1.5 py-0.5 font-mono text-[11px] text-phi-text-tertiary">{detail}</code>
            ) : null}
        </>
    );

    return (
        <div className="min-w-0">
            {expandable ? (
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                    className="flex min-h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-[12px] hover:bg-phi-overlay-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-phi-accent/50"
                >
                    {row}
                </button>
            ) : (
                <div className="flex min-h-7 max-w-full min-w-0 items-center gap-1.5 px-1.5 text-[12px]">{row}</div>
            )}
            {expandable && (
                <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <div className="min-h-0 overflow-hidden">
                        {hasOpened && <ToolResultBody item={item} />}
                    </div>
                </div>
            )}
        </div>
    );
}
