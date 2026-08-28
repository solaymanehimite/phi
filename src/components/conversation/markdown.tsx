import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="prose prose-invert max-w-none text-[14px] leading-6 prose-p:my-2 prose-p:text-[#b9b9be] prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-[#dedee1] prose-headings:tracking-[-0.01em] prose-h1:text-[18px] prose-h2:text-[16px] prose-h3:text-[14px] prose-strong:text-[#dedee1] prose-code:rounded prose-code:bg-white/[0.07] prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:font-normal prose-code:text-[#dedee1] prose-code:before:content-none prose-code:after:content-none prose-pre:my-3 prose-pre:rounded-lg prose-pre:border prose-pre:border-white/[0.06] prose-pre:bg-[#151516] prose-pre:p-3 prose-pre:text-[13px] prose-a:text-[#d6a85f] prose-a:underline-offset-2 hover:prose-a:underline prose-li:marker:text-[#5e5e63] prose-ul:my-2 prose-ol:my-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
