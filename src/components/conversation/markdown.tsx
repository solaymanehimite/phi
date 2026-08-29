import { memo, useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

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
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : "Copy code"}
      className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-phi-border bg-phi-bg-elevated px-2 py-1 text-[11px] font-medium leading-none tracking-wide text-phi-text-tertiary shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition hover:border-phi-border-strong hover:bg-phi-overlay-hover hover:text-phi-text-secondary active:bg-phi-overlay-active"
    >
      {copied ? (
        <Check size={12} strokeWidth={2.25} className="text-emerald-400" />
      ) : (
        <Copy size={12} strokeWidth={2} />
      )}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="not-prose group relative my-3 overflow-hidden rounded-lg border border-phi-border bg-phi-bg-surface">
      <CopyButton text={code} />
      <pre className="m-0 overflow-x-auto bg-transparent p-3 pt-9 text-[13px] leading-5">
        <code className="whitespace-pre-wrap break-words bg-transparent p-0 font-mono font-normal text-phi-text-primary before:content-none after:content-none">
          {code}
        </code>
      </pre>
    </div>
  );
}

function renderPlainCodeBlock(block: string) {
  const m = block.match(/^```\w*\n([\s\S]*?)```$/);
  const code = m ? m[1] : block.slice(3, -3);
  // language is intentionally ignored — no tag in the corner
  return <CodeBlock code={code} />;
}

// shared markdown components — handles both inline and block code
const mdComponents = {
  pre: ({ children }: any) => <>{children}</>,
  code: ({ inline, className, children, ...props }: any) => {
    const isInline = inline ?? (!String(className ?? "").startsWith("language-") && !String(children).includes("\n"));
    // ReactMarkdown v10 uses `inline` boolean correctly; fallback heuristic for edge cases
    if (isInline && !String(className ?? "").includes("language-")) {
      return (
        <code
          className="rounded bg-phi-overlay-code px-1 py-0.5 text-[13px] font-mono font-normal text-phi-text-primary break-words"
          {...props}
        >
          {children}
        </code>
      );
    }
    const code = String(children).replace(/\n$/, "");
    return <CodeBlock code={code} />;
  },
} as const;

function MarkdownChunk({ text }: { text: string }) {
  return (
    <div className="prose prose-invert max-w-full min-w-0 text-[14px] leading-6 prose-p:my-2 prose-p:text-phi-text-secondary prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-phi-text-primary prose-headings:tracking-[-0.01em] prose-h1:text-[22px] prose-h2:text-[18px] prose-h3:text-[15px] prose-strong:text-phi-text-primary prose-em:text-phi-text-secondary prose-code:rounded prose-code:bg-phi-overlay-code prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:font-normal prose-code:text-phi-text-primary prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-a:text-phi-accent prose-a:underline-offset-2 hover:prose-a:underline prose-li:marker:text-phi-text-muted prose-ul:my-2 prose-ol:my-2">
      <ReactMarkdown remarkPlugins={remarkPlugins as any} components={mdComponents}>
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
    <div className="prose prose-invert max-w-full min-w-0 text-[14px] leading-6 prose-p:my-2 prose-p:text-phi-text-secondary prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-phi-text-primary prose-headings:tracking-[-0.01em] prose-h1:text-[22px] prose-h2:text-[18px] prose-h3:text-[15px] prose-strong:text-phi-text-primary prose-em:text-phi-text-secondary prose-code:rounded prose-code:bg-phi-overlay-code prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:font-normal prose-code:text-phi-text-primary prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-a:text-phi-accent prose-a:underline-offset-2 hover:prose-a:underline prose-li:marker:text-phi-text-muted prose-ul:my-2 prose-ol:my-2">
      <ReactMarkdown remarkPlugins={remarkPlugins as any} components={mdComponents}>
        {trimmed}
      </ReactMarkdown>
    </div>
  );
});
