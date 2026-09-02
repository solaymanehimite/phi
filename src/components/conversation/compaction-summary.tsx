import { memo, useId, useMemo, useState } from "react";
import { BarsArrowDownIcon } from "@heroicons/react/24/solid";
import { ChevronDownIcon } from "../ui/icons";
import { Markdown } from "./markdown";

type Props = {
  summary: string;
  tokensBefore?: number;
  timestamp?: string;
  fromHook?: boolean;
};

type FileAppendices = {
  summary: string;
  readFiles: string[];
  modifiedFiles: string[];
};

function readAppendix(value: string): FileAppendices {
  const sections: Record<"readFiles" | "modifiedFiles", string[]> = {
    readFiles: [],
    modifiedFiles: [],
  };

  const withoutAppendices = value.replace(
    /<(read-files|modified-files)>\s*([\s\S]*?)\s*<\/(read-files|modified-files)>/gi,
    (_match, openingTag: string, files: string, closingTag: string) => {
      const key = openingTag.toLowerCase() === "read-files" ? "readFiles" : "modifiedFiles";
      // Ignore malformed pairs rather than accidentally assigning a section to
      // the wrong appendix.
      if (openingTag.toLowerCase() !== closingTag.toLowerCase()) return _match;
      sections[key].push(...files.trim().split(/\s+/).filter(Boolean));
      return "";
    },
  );

  return {
    summary: withoutAppendices.replace(/\n{3,}/g, "\n\n").trim(),
    readFiles: [...new Set(sections.readFiles)],
    modifiedFiles: [...new Set(sections.modifiedFiles)],
  };
}

function escapeInlineCode(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

function appendicesMarkdown({ readFiles, modifiedFiles }: FileAppendices): string {
  const sections: string[] = [];
  if (readFiles.length > 0) {
    sections.push(`**Read files**\n\n${readFiles.map((file) => `- \`${escapeInlineCode(file)}\``).join("\n")}`);
  }
  if (modifiedFiles.length > 0) {
    sections.push(`**Modified files**\n\n${modifiedFiles.map((file) => `- \`${escapeInlineCode(file)}\``).join("\n")}`);
  }
  return sections.join("\n\n");
}

export const CompactionSummary = memo(function CompactionSummary({ summary }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const content = useMemo(() => readAppendix(summary), [summary]);
  const appendices = useMemo(() => appendicesMarkdown(content), [content]);

  return (
    <div
      data-compaction-summary
      className="w-full rounded-xl bg-phi-overlay-muted px-3 py-2.5"
    >
      <div className="flex justify-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="group inline-flex items-center justify-center gap-2 rounded-full px-3 py-1.5 text-center text-[13px] leading-none text-phi-text-muted transition-colors hover:bg-phi-overlay hover:text-phi-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/20"
        >
          <BarsArrowDownIcon
            className="size-3.5 shrink-0 text-phi-text-muted group-hover:text-phi-text-tertiary"
            aria-hidden
          />
          <span className="font-medium tracking-wide">Compaction summary</span>
          <ChevronDownIcon
            className={`size-3.5 shrink-0 text-phi-text-muted transition-all duration-200 ${open ? "rotate-0" : "-rotate-90"} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100`}
            aria-hidden
          />
        </button>
      </div>

      <div
        id={id}
        className={`grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="pt-3">
            {content.summary && <Markdown text={content.summary} />}
            {appendices && (
              <div className={content.summary ? "mt-4 border-t border-phi-border-faint pt-3" : ""}>
                <Markdown text={appendices} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
