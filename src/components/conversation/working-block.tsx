import { useEffect, useMemo, useState } from "react";
import type { WorkItem } from "../../types/work";
import { ToolLine, type ToolItem } from "./tool-line";
import { InlineMarkdown } from "./markdown";
import {
    ChainOfThought,
    ChainOfThoughtContent,
    ChainOfThoughtItem,
    ChainOfThoughtStep,
    ChainOfThoughtTrigger,
} from "./chain-of-thought";

type Props = {
    items: WorkItem[];
    isStreaming?: boolean;
    variant: "streaming" | "history";
    startedAt?: number | null;
    durationMs?: number | null;
};

type ThoughtGroup = {
    id: string;
    thoughts: string[];
    tools: ToolItem[];
};

function formatDuration(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return seconds % 60 === 0 ? `${minutes}m` : `${minutes}m ${seconds % 60}s`;
}

function groupWork(items: WorkItem[]): ThoughtGroup[] {
    const groups: ThoughtGroup[] = [];
    let current: ThoughtGroup | null = null;

    for (const item of items) {
        if (item.kind === "thinking") {
            // A run of thought with no intervening tool belongs in one step.
            // This avoids empty collapsibles while retaining the full trail.
            if (current && current.tools.length === 0) {
                current.thoughts.push(item.text);
            } else {
                current = { id: item.id, thoughts: [item.text], tools: [] };
                groups.push(current);
            }
            continue;
        }
        if (!current) {
            current = { id: "tools", thoughts: [], tools: [] };
            groups.push(current);
        }
        current.tools.push(item);
    }

    return groups;
}

function ThoughtStep({
    group,
    defaultOpen,
    isStreaming,
    elapsed,
}: {
    group: ThoughtGroup;
    defaultOpen: boolean;
    isStreaming: boolean;
    elapsed: string | null;
}) {
    const hasSeveralThoughts = group.thoughts.length > 1;
    const hasThought = group.thoughts.length > 0;
    const label = hasSeveralThoughts
        ? "Cerebration"
        : hasThought
            ? <InlineMarkdown text={group.thoughts[0]} />
            : isStreaming
                ? "Thinking..."
                : elapsed
                    ? `Worked for ${elapsed}`
                    : "Operations";

    return (
        <ChainOfThoughtStep defaultOpen={defaultOpen}>
            <ChainOfThoughtTrigger className="w-full px-1.5 py-0.5">
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {elapsed && !hasThought && <span className="shrink-0 font-mono text-[11px] tabular-nums text-phi-text-faint">{elapsed}</span>}
            </ChainOfThoughtTrigger>
            <ChainOfThoughtContent>
                {hasSeveralThoughts && group.thoughts.map((thought, index) => (
                    <ChainOfThoughtItem key={`${group.id}-${index}`}>
                        <InlineMarkdown text={thought} />
                    </ChainOfThoughtItem>
                ))}
                {group.tools.map((tool) => <ToolLine key={tool.id} item={tool} />)}
                {group.tools.length === 0 && !hasSeveralThoughts && !isStreaming && (
                    <ChainOfThoughtItem>No tools used.</ChainOfThoughtItem>
                )}
            </ChainOfThoughtContent>
        </ChainOfThoughtStep>
    );
}

export function WorkingBlock({ items, isStreaming, variant, startedAt, durationMs }: Props) {
    const groups = useMemo(() => groupWork(items), [items]);
    const [now, setNow] = useState(() => Date.now());
    const live = variant === "streaming" && Boolean(isStreaming);

    useEffect(() => {
        if (!live || !startedAt) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [live, startedAt]);

    if (groups.length === 0 && !live) return null;

    const elapsed = live && startedAt
        ? formatDuration(Math.max(0, now - startedAt))
        : durationMs != null
            ? formatDuration(durationMs)
            : null;
    const displayGroups = groups.length > 0 ? groups : [{ id: "thinking", thoughts: [], tools: [] }];

    return (
        <ChainOfThought className="w-full py-1">
            {displayGroups.map((group, index) => (
                <ThoughtStep
                    key={group.id}
                    group={group}
                    defaultOpen={live}
                    isStreaming={live}
                    elapsed={index === 0 ? elapsed : null}
                />
            ))}
        </ChainOfThought>
    );
}
