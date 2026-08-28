import { useState } from "react";

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`text-[11px] text-[#5e5e63] transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        <span className="text-[12px] font-medium tracking-wide text-[#6b6b71]">Thinking</span>
        {!open && <span className="min-w-0 flex-1 truncate text-[12px] text-[#4f4f55]">{preview}…</span>}
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-3 py-2.5 text-[13px] leading-6 whitespace-pre-wrap text-[#8b8b91]">
          {text}
        </div>
      )}
    </div>
  );
}
