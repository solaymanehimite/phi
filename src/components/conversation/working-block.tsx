import { useEffect, useState } from "react";
import { ChevronDownIcon } from "../ui/icons";

function getToolDisplay(name: string, args: Record<string, unknown>): { label: string; detail: string | null } {
  const a = args as Record<string, string>;
  if (name === "read" && a.path) return { label: "read", detail: a.path };
  if (name === "write" && a.path) return { label: "write", detail: a.path };
  if (name === "edit" && a.path) return { label: "edit", detail: a.path };
  if (name === "bash" && a.command) return { label: "bash", detail: String(a.command).slice(0, 80) };
  if (name === "grep" && a.pattern) return { label: "grep", detail: a.pattern + (a.path ? ` ${a.path}` : "") };
  if (name === "find" && a.pattern) return { label: "find", detail: a.pattern };
  if (name === "ls" && a.path) return { label: "ls", detail: a.path };
  const first = Object.values(args).find((v) => typeof v === "string" && v.length > 0) as string | undefined;
  return first ? { label: name, detail: first.slice(0, 80) } : { label: name, detail: null };
}

type WorkingTool = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: { text: string; isError: boolean };
  partial?: string;
};

type Props = {
  thinking?: string;
  tools: WorkingTool[];
  isStreaming?: boolean;
  elapsedMs?: number | null;
  variant: "streaming" | "history";
};

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (rem === 0) return `${m} minute${m === 1 ? "" : "s"}`;
  return `${m}m ${rem}s`;
}

export function WorkingBlock({ thinking, tools, isStreaming, elapsedMs, variant }: Props) {
  const isStreamingVariant = variant === "streaming";
  const hasThinking = Boolean(thinking && thinking.trim().length > 0);
  const hasTools = tools.length > 0;
  if (!hasThinking && !hasTools && !(isStreamingVariant && isStreaming)) return null;

  const [open, setOpen] = useState(() => (isStreamingVariant ? Boolean(isStreaming) : false));

  useEffect(() => {
    if (!isStreamingVariant) return;
    if (isStreaming) setOpen(true);
    else if (elapsedMs != null) setOpen(false);
  }, [isStreaming, elapsedMs, isStreamingVariant]);

  let title: string;
  if (isStreamingVariant) {
    if (isStreaming) title = "Working on it";
    else if (elapsedMs != null) title = `Spent ${formatElapsed(elapsedMs)}`;
    else title = "Working";
  } else {
    title = "Show work";
  }

  return (
    <div className="w-full">
      {/* muted label — no border/background container */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 py-1 text-left text-[12px] leading-none text-phi-text-muted hover:text-phi-text-tertiary transition-colors"
        aria-expanded={open}
      >
        <ChevronDownIcon
          className={`size-3 shrink-0 text-phi-text-muted transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
          aria-hidden
        />
        <span className="font-medium tracking-wide">{title}</span>
        {isStreamingVariant && isStreaming && (
          <span className="ml-1 size-1.5 shrink-0 animate-pulse rounded-full bg-phi-streaming" aria-hidden />
        )}
      </button>

      {/* animated reveal — no border/background */}
      <div
        className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 pb-2 pt-2">
            {hasThinking && (
              <div className="whitespace-pre-wrap break-words text-[13px] leading-6 text-phi-text-tertiary">
                {thinking}
              </div>
            )}
            {hasTools && (
              <div className="space-y-1.5">
                {tools.map((t) => {
                  const { label, detail } = getToolDisplay(t.name, t.args);
                  const isError = !!t.result?.isError;
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-1.5 py-0.5">
                      <span className={`text-xs leading-4 ${isError ? "text-phi-error" : "text-phi-text-secondary"}`}>{label}</span>
                      {detail && (
                        <code className="rounded border border-phi-border-faint bg-phi-bg-sunken px-1.5 py-0.5 font-mono text-[11px] leading-none text-phi-text-tertiary">
                          {detail}
                        </code>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
