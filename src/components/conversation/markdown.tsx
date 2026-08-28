import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="prose prose-invert max-w-full min-w-0 text-[14px] leading-6 prose-p:my-2 prose-p:text-phi-text-secondary prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-phi-text-primary prose-headings:tracking-[-0.01em] prose-h1:text-[22px] prose-h2:text-[18px] prose-h3:text-[15px] prose-strong:text-phi-text-primary prose-em:text-phi-text-secondary prose-code:rounded prose-code:bg-phi-overlay-code prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:font-normal prose-code:text-phi-text-primary prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-pre:my-3 prose-pre:max-w-full prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:rounded-lg prose-pre:border prose-pre:border-phi-border prose-pre:bg-phi-bg-surface prose-pre:p-3 prose-pre:text-[13px] prose-a:text-phi-accent prose-a:underline-offset-2 hover:prose-a:underline prose-li:marker:text-phi-text-muted prose-ul:my-2 prose-ol:my-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
