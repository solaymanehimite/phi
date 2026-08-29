import { memo } from "react";
import type { SlashCommand } from "../../lib/api";

type SlashMenuProps = {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onHover: (idx: number) => void;
};

export const SlashMenu = memo(function SlashMenu({ commands, selectedIndex, onSelect, onHover }: SlashMenuProps) {
  if (commands.length === 0) {
    return (
      <div className="rounded-xl border border-phi-border bg-phi-bg-elevated px-3 py-2.5 text-[12.5px] leading-5 text-phi-text-muted shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        No commands match
      </div>
    );
  }
  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      className="max-h-[min(280px,40vh)] overflow-y-auto rounded-xl border border-phi-border bg-phi-bg-elevated py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
    >
      {commands.map((cmd, idx) => {
        const active = idx === selectedIndex;
        return (
          <button
            key={`${cmd.source}:${cmd.name}`}
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(idx)}
            onMouseDown={(e) => {
              // prevent textarea blur before click
              e.preventDefault();
              onSelect(cmd);
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] leading-5 transition-colors ${
              active ? "bg-phi-overlay-active text-phi-text-primary" : "text-phi-text-secondary hover:bg-phi-overlay-hover"
            }`}
          >
            <span className="shrink-0 text-[13px] font-medium tracking-tight">/{cmd.name}</span>
            {cmd.argumentHint ? (
              <span className="shrink-0 text-[11px] text-phi-text-faint">{cmd.argumentHint}</span>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-[12px] text-phi-text-muted">{cmd.description ?? ""}</span>
          </button>
        );
      })}
    </div>
  );
});
