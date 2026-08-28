import { Ellipsis, LoaderCircle, PencilLine, Plus, Trash } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "./ui/button";
import { PanelLeftIcon } from "./ui/icons";
import { Input } from "./ui/input";
import { GroupCollapsibleTrigger } from "./ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { SessionGroup } from "../hooks/useSessions";

type SidebarProps = {
  groups: SessionGroup[];
  activeFile: string | null;
  onSelect: (file: string) => void;
  onClose: () => void;
  onNewChat: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  collapsed: Set<string>;
  onToggleGroup: (cwd: string) => void;
  onRename: (file: string, name: string) => Promise<void>;
  onDelete: (file: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  isStreaming?: boolean;
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString();
}

function titleFor(s: { name?: string; firstMessage: string }): string {
  if (s.name?.trim()) return s.name.trim();
  const t = s.firstMessage.trim();
  if (!t) return "Untitled session";
  return t.length > 42 ? `${t.slice(0, 42).trim()}…` : t;
}

export const Sidebar = memo(function Sidebar({
  groups,
  activeFile,
  onSelect,
  onClose,
  onNewChat,
  search,
  onSearchChange,
  collapsed,
  onToggleGroup,
  onRename,
  onDelete,
  loading,
  error,
  isStreaming,
}: SidebarProps) {
  return (
    <aside className="flex w-[268px] shrink-0 flex-col border-r border-phi-border-subtle bg-phi-bg-sidebar max-sm:absolute max-sm:inset-y-0 max-sm:z-20 max-sm:shadow-[18px_0_50px_rgba(0,0,0,0.45)]">
      <div data-tauri-drag-region className="flex h-13 shrink-0 items-center justify-between px-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex items-center gap-2 rounded-lg p-1 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
        >
          <span className="font-serif text-xl text-phi-accent">Φ</span>
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-phi-text-brand">Phi</span>
        </button>
        <Button variant="icon" aria-label="Close sidebar" title="Close sidebar" onClick={onClose}>
          <PanelLeftIcon />
        </Button>
      </div>

      <div className="px-2 pt-2">
        <Button
          className="w-full justify-start"
          onClick={onNewChat}
          title={isStreaming ? "A response is streaming — starting a new chat will abort it" : undefined}

        >
          <Plus size={16} strokeWidth={2.25} />
          New chat
        </Button>
      </div>

      <div className="px-4 pt-3">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search sessions…"
          aria-label="Search sessions"
          variant="search"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-4">
        {loading ? (
          <p className="px-2 py-6 text-center text-[12px] text-phi-text-muted">Loading sessions…</p>
        ) : error ? (
          <div className="mx-2 rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[12px] leading-4 text-phi-error-text">
            {error}
          </div>
        ) : groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-phi-text-muted">
            {search ? "No matches" : "No sessions yet"}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.cwd);
              return (
                <div key={group.cwd}>
                  <GroupCollapsibleTrigger collapsed={isCollapsed} onClick={() => onToggleGroup(group.cwd)}>
                    <span className="min-w-0 flex-1 truncate">{group.displayCwd}</span>
                  </GroupCollapsibleTrigger>

                  {!isCollapsed && (
                    <nav aria-label={group.displayCwd} className="mt-1 space-y-0.5">
                      {group.sessions.map((s) => (
                        <SessionRow
                          key={s.path}
                          active={s.path === activeFile}
                          title={titleFor(s)}
                          time={relativeTime(s.modified)}
                          count={s.messageCount}
                          onClick={() => onSelect(s.path)}
                          onRename={(name) => onRename(s.path, name)}
                          onDelete={() => onDelete(s.path)}
                          isStreaming={isStreaming}
                        />
                      ))}
                    </nav>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
});

function SessionRow({
  active,
  title,
  time,
  count,
  onClick,
  onRename,
  onDelete,
  isStreaming,
}: {
  active: boolean;
  title: string;
  time: string;
  count: number;
  onClick: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  isStreaming?: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);

  async function handleRename() {
    const name = draft.trim();
    if (!name) return;
    await onRename(name);
    setRenaming(false);
  }

  return (
    <div
      className={`group flex h-8 w-full items-center gap-1 rounded-lg px-1 text-left text-[13px] ${active ? "bg-phi-overlay-active text-phi-text-primary" : "text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-secondary"}`}
    >
      {renaming ? (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 truncate rounded-lg px-1.5 py-1">
          {isStreaming && active ? <LoaderCircle size={16} strokeWidth={2.25} className="size-4 shrink-0 animate-spin text-phi-text-secondary" /> : null}
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRename();
              }
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={() => setRenaming(false)}
            variant="inline"
          />
          <span className="shrink-0 text-[11px] text-phi-text-faint">{time}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          title={isStreaming && !active ? "A response is streaming — switching will abort it" : undefined}
          className={`flex min-w-0 flex-1 items-center gap-2.5 truncate rounded-lg px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 ${isStreaming && !active ? "opacity-60" : ""}`}
        >
          {isStreaming && active ? <LoaderCircle size={16} strokeWidth={2.25} className="size-4 shrink-0 animate-spin text-phi-text-secondary" /> : null}
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <span className="shrink-0 text-[11px] text-phi-text-faint">{count > 0 ? `${count}` : ""}</span>
          <span className="shrink-0 text-[11px] text-phi-text-faint">{time}</span>
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Session actions">
          <Ellipsis size={14} strokeWidth={2.25} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            icon={<PencilLine size={15} strokeWidth={2.25} />}
            onClick={() => {
              setDraft(title);
              setRenaming(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Trash size={15} strokeWidth={2.25} />}
            onClick={async () => {
              if (!confirm("Delete this session?")) return;
              await onDelete();
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
