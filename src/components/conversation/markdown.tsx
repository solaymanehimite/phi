import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

function renderPlainCodeBlock(block: string) {
  // block is ```lang\ncode\n``` or ```\ncode\n```
  const m = block.match(/^```(\w*)\n([\s\S]*?)```$/);
  const code = m ? m[2] : block.slice(3, -3);
  return (
    <pre className="my-3 max-w-full whitespace-pre-wrap break-words rounded-lg border border-phi-border bg-phi-bg-surface p-3 text-[13px] font-mono leading-5 text-phi-text-primary">
      <code>{code}</code>
    </pre>
  );
}

function MarkdownChunk({ text }: { text: string }) {
  return (
    <div className="prose prose-invert max-w-full min-w-0 text-[14px] leading-6 prose-p:my-2 prose-p:text-phi-text-secondary prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-phi-text-primary prose-headings:tracking-[-0.01em] prose-h1:text-[22px] prose-h2:text-[18px] prose-h3:text-[15px] prose-strong:text-phi-text-primary prose-em:text-phi-text-secondary prose-code:rounded prose-code:bg-phi-overlay-code prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:font-normal prose-code:text-phi-text-primary prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-pre:my-3 prose-pre:max-w-full prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:rounded-lg prose-pre:border prose-pre:border-phi-border prose-pre:bg-phi-bg-surface prose-pre:p-3 prose-pre:text-[13px] prose-a:text-phi-accent prose-a:underline-offset-2 hover:prose-a:underline prose-li:marker:text-phi-text-muted prose-ul:my-2 prose-ol:my-2">
      <ReactMarkdown remarkPlugins={remarkPlugins as any}>{text}</ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const trimmed = useMemo(() => text.trim(), [text]);
  if (!trimmed) return null;

  // Lighten outlier: huge messages chunked so no single ReactMarkdown parses >3.5KB at once
  // The 100ms outlier is almost always one massive fenced code block or 10KB paragraph
  if (trimmed.length > OUTLIER_THRESHOLD) {
    // Split by fenced code blocks — keep code blocks as cheap <pre>, markdown the rest
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
            // Large non-code segment still chunked by paragraphs so each parse <2.5KB
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
    // No code fences — just paragraph-chunk the big text
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
    <div className="prose prose-invert max-w-full min-w-0 text-[14px] leading-6 prose-p:my-2 prose-p:text-phi-text-secondary prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-phi-text-primary prose-headings:tracking-[-0.01em] prose-h1:text-[22px] prose-h2:text-[18px] prose-h3:text-[15px] prose-strong:text-phi-text-primary prose-em:text-phi-text-secondary prose-code:rounded prose-code:bg-phi-overlay-code prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:font-normal prose-code:text-phi-text-primary prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-pre:my-3 prose-pre:max-w-full prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:rounded-lg prose-pre:border prose-pre:border-phi-border prose-pre:bg-phi-bg-surface prose-pre:p-3 prose-pre:text-[13px] prose-a:text-phi-accent prose-a:underline-offset-2 hover:prose-a:underline prose-li:marker:text-phi-text-muted prose-ul:my-2 prose-ol:my-2">
      <ReactMarkdown remarkPlugins={remarkPlugins as any}>{trimmed}</ReactMarkdown>
    </div>
  );
});
