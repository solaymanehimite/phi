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
      <div className="rounded-xl border border-phi-border-faint bg-phi-bg-elevated p-1 text-sm/6 text-phi-white shadow-xl">
        <div className="rounded-lg px-3 py-1 text-[13px] text-phi-text-muted">
          No commands match
        </div>
      </div>
    );
  }
  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      className="max-h-[min(280px,40vh)] overflow-y-auto rounded-xl border border-phi-border-faint bg-phi-bg-elevated p-1 text-sm/6 text-phi-white shadow-xl transition duration-100 ease-out"
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
            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-1 text-left text-[13px] transition-colors focus:outline-none ${
              active
                ? "bg-phi-overlay-strong text-phi-text-primary"
                : "text-phi-text-secondary hover:bg-phi-overlay-strong"
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
