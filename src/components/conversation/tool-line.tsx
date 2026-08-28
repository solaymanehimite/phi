import { useState } from "react";

type ToolLineProps = {
    name: string;
    args: Record<string, unknown>;
    result?: { text: string; isError: boolean };
};

function toolArgSummary(name: string, args: Record<string, unknown>): string {
    // keep scannable: `read src/app.ts` / `bash npm test` / `edit src/app.ts`
    const a = args as Record<string, string>;
    if (name === "read" && a.path) return `read ${a.path}`;
    if (name === "write" && a.path) return `write ${a.path}`;
    if (name === "edit" && a.path) return `edit ${a.path}`;
    if (name === "bash" && a.command)
        return `bash ${String(a.command).slice(0, 80)}`;
    if (name === "grep" && a.pattern)
        return `grep ${a.pattern}${a.path ? ` ${a.path}` : ""}`;
    if (name === "find" && a.pattern) return `find ${a.pattern}`;
    if (name === "ls" && a.path) return `ls ${a.path}`;
    // fallback: first string value
    const first = Object.values(args).find(
        (v) => typeof v === "string" && v.length > 0,
    ) as string | undefined;
    return first ? `${name} ${first.slice(0, 80)}` : name;
}

export function ToolLine({ name, args, result }: ToolLineProps) {
    const [open, setOpen] = useState(false);
    const isError = result?.isError ?? false;
    const summary = toolArgSummary(name, args);

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-1 text-left"
            >
                <span
                    className={`min-w-0 flex-1 truncate font-mono text-xs leading-4 text-phi-text-secondary ${isError ? "text-phi-error" : ""}`}
                >
                    {summary}
                </span>
                <span
                    className={`shrink-0 text-[11px] text-phi-text-muted transition-transform ${open ? "rotate-180" : ""}`}
                >
                    ▾
                </span>
            </button>
            {open && result?.text && (
                <div className="rounded-md border border-phi-border-faint bg-phi-bg-sunken">
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[12.5px] leading-5 text-phi-text-tertiary">
                        {result.text}
                    </pre>
                </div>
            )}
            {open && !result?.text && (
                <div className="border-t border-phi-border-faint px-3 py-2 text-[12px] text-phi-text-muted">
                    No output
                </div>
            )}
        </div>
    );
}
