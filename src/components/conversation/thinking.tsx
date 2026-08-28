import { useState } from "react";
import { CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Surface } from "../ui/surface";

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
  return (
    <Surface>
      <CollapsibleTrigger open={open} onClick={() => setOpen((v) => !v)}>
        <span className="text-[12px] font-medium tracking-wide text-phi-text-faint">Thinking</span>
        {!open && <span className="min-w-0 flex-1 truncate text-[12px] text-phi-text-faint">{preview}…</span>}
      </CollapsibleTrigger>
      {open && (
        <CollapsibleContent className="text-[13px] leading-6 whitespace-pre-wrap text-phi-text-tertiary">
          {text}
        </CollapsibleContent>
      )}
    </Surface>
  );
}
