import { memo, useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconCheckFilled, IconCopyFilled } from "@tabler/icons-react";
import { LazyHighlightedCode } from "../code-theme";
import { Button } from "../ui/button";
import { InlineCode } from "../ui/code";

// Single shared instance so remarkGfm isn't recreated per render
const remarkPlugins = [remarkGfm] as const;

const OUTLIER_THRESHOLD = 3500;
const CHUNK_SIZE = 2500;

function chunkByParagraphs(text: string, max = CHUNK_SIZE): string[] {
    const paras = text.split(/\n\n+/);
    const chunks: string[] = [];
    let cur = "";
    for (const p of paras) {
        if ((cur + "\n\n" + p).length > max && cur) {
            chunks.push(cur);
            cur = p;
        } else {
            cur = cur ? cur + "\n\n" + p : p;
        }
    }
    if (cur) chunks.push(cur);
    return chunks;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const onCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Fallback for older webviews / Tauri where clipboard may be restricted
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    }, [text]);

    return (
        <Button
            onClick={onCopy}
            aria-label={copied ? "Copied" : "Copy code"}
            variant="ghost"
            size="xs"
            className="absolute right-2 top-2 z-10 !gap-1 !text-[11px] !leading-none"
        >
            {copied ? (
                <IconCheckFilled className="size-3 text-phi-thinking-low" />
            ) : (
                <IconCopyFilled className="size-3" />
            )}
            <span>{copied ? "Copied" : "Copy"}</span>
        </Button>
    );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
    return (
        <div className="not-prose group relative my-3 overflow-hidden rounded-lg border border-phi-border bg-phi-bg-surface">
            <CopyButton text={code} />
            <pre className="m-0 overflow-x-auto bg-transparent p-3 pt-9 text-[13px] leading-5">
                <code className="whitespace-pre-wrap break-words bg-transparent p-0 font-mono font-normal text-phi-text-primary before:content-none after:content-none">
                    <LazyHighlightedCode code={code} language={language} />
                </code>
            </pre>
        </div>
    );
}

function renderPlainCodeBlock(block: string) {
    const m = block.match(/^```([\w+-]*)\n([\s\S]*?)```$/);
    const language = m?.[1] || undefined;
    const code = m ? m[2] : block.slice(3, -3);
    return <CodeBlock code={code} language={language} />;
}

// shared markdown components — handles both inline and block code
const mdComponents = {
    pre: ({ children }: any) => <>{children}</>,
    code: ({ inline, className, children, ...props }: any) => {
        const isInline =
            inline ??
            (!String(className ?? "").startsWith("language-") &&
                !String(children).includes("\n"));
        // ReactMarkdown v10 uses `inline` boolean correctly; fallback heuristic for edge cases
        if (isInline && !String(className ?? "").includes("language-")) {
            return <InlineCode {...props}>{children}</InlineCode>;
        }
        const code = String(children).replace(/\n$/, "");
        const langMatch = /language-([\w+-]+)/.exec(String(className ?? ""));
        return <CodeBlock code={code} language={langMatch?.[1]} />;
    },
} as const;

// No `prose-invert` — typography tokens are explicit so light theme keeps
// dark text on light surfaces. Every prose element maps to a phi token.
const PROSE =
    "prose max-w-full min-w-0 text-[14px] leading-6 text-phi-text-secondary prose-p:my-2 prose-p:text-phi-text-secondary prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-phi-text-primary prose-headings:tracking-[-0.01em] prose-h1:text-[22px] prose-h2:text-[18px] prose-h3:text-[15px] prose-strong:text-phi-text-primary prose-em:text-phi-text-secondary prose-code:rounded prose-code:bg-phi-overlay-code prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:font-normal prose-code:text-phi-text-primary prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-a:text-phi-accent prose-a:underline-offset-2 hover:prose-a:underline prose-li:marker:text-phi-text-muted prose-li:text-phi-text-secondary prose-ul:my-2 prose-ol:my-2 prose-blockquote:border-phi-border-strong prose-blockquote:text-phi-text-tertiary prose-hr:border-phi-border prose-table:text-phi-text-secondary prose-th:text-phi-text-primary prose-td:text-phi-text-secondary prose-thead:border-phi-border-strong prose-tr:border-phi-border";

function MarkdownChunk({ text }: { text: string }) {
    return (
        <div className={PROSE}>
            <ReactMarkdown
                remarkPlugins={remarkPlugins as any}
                components={mdComponents}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
    const trimmed = useMemo(() => text.trim(), [text]);
    if (!trimmed) return null;

    // Lighten outlier: huge messages chunked so no single ReactMarkdown parses >3.5KB at once
    if (trimmed.length > OUTLIER_THRESHOLD) {
        const segments = trimmed.split(/(```[\s\S]*?```)/g);
        if (segments.length > 1) {
            return (
                <div className="min-w-0">
                    {segments.map((seg, i) => {
                        if (!seg) return null;
                        if (seg.startsWith("```")) {
                            return <div key={i}>{renderPlainCodeBlock(seg)}</div>;
                        }
                        if (!seg.trim()) return null;
                        if (seg.length > CHUNK_SIZE) {
                            const chunks = chunkByParagraphs(seg);
                            return (
                                <div key={i}>
                                    {chunks.map((c, j) => (
                                        <MarkdownChunk key={`${i}-${j}`} text={c} />
                                    ))}
                                </div>
                            );
                        }
                        return <MarkdownChunk key={i} text={seg} />;
                    })}
                </div>
            );
        }
        if (trimmed.length > 5000) {
            const chunks = chunkByParagraphs(trimmed);
            return (
                <div className="min-w-0">
                    {chunks.map((c, i) => (
                        <MarkdownChunk key={i} text={c} />
                    ))}
                </div>
            );
        }
    }

    return (
        <div className={PROSE}>
            <ReactMarkdown
                remarkPlugins={remarkPlugins as any}
                components={mdComponents}
            >
                {trimmed}
            </ReactMarkdown>
        </div>
    );
});
