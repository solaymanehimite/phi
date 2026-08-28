import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "./ui/button";
import { ChatIcon, ComposeIcon, PanelLeftIcon } from "./ui/icons";
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
}: SidebarProps) {
  return (
    <aside className="flex w-[268px] shrink-0 flex-col border-r border-white/[0.055] bg-[#0a0a0b] max-sm:absolute max-sm:inset-y-0 max-sm:z-20 max-sm:shadow-[18px_0_50px_rgba(0,0,0,0.45)]">
      <div data-tauri-drag-region className="flex h-13 shrink-0 items-center justify-between px-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex items-center gap-2 rounded-lg p-1 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6a85f]/40"
        >
          <span className="font-serif text-xl text-[#d6a85f]">Φ</span>
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#d6d6d9]">Phi</span>
        </button>
        <Button variant="icon" aria-label="Close sidebar" title="Close sidebar" onClick={onClose}>
          <PanelLeftIcon />
        </Button>
      </div>

      <div className="px-2 pt-2">
        <Button className="w-full justify-start" onClick={onNewChat}>
          <ComposeIcon />
          New chat
        </Button>
      </div>

      <div className="px-2 pt-3">
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
          <p className="px-2 py-6 text-center text-[12px] text-[#5e5e63]">Loading sessions…</p>
        ) : error ? (
          <div className="mx-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] leading-4 text-red-300">
            {error}
          </div>
        ) : groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-[#5e5e63]">
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
}: {
  active: boolean;
  title: string;
  time: string;
  count: number;
  onClick: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
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
      className={`group flex h-8 w-full items-center gap-1 rounded-lg px-1 text-left text-[13px] ${active ? "bg-white/[0.075] text-[#e3e3e5]" : "text-[#79797f] hover:bg-white/[0.045] hover:text-[#bdbdc1]"}`}
    >
      {renaming ? (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 truncate rounded-lg px-1.5 py-1">
          <ChatIcon className={`size-4 shrink-0 ${active ? "text-[#b9b9be]" : "text-[#5f5f65]"}`} />
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
          <span className="shrink-0 text-[11px] text-[#4f4f55]">{time}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-2.5 truncate rounded-lg px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6a85f]/40"
        >
          <ChatIcon className={`size-4 shrink-0 ${active ? "text-[#b9b9be]" : "text-[#5f5f65]"}`} />
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <span className="shrink-0 text-[11px] text-[#4f4f55]">{count > 0 ? `${count}` : ""}</span>
          <span className="shrink-0 text-[11px] text-[#4f4f55]">{time}</span>
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Session actions">
          <Ellipsis size={14} strokeWidth={1.8} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            icon={<Pencil size={14} className="text-white/30" />}
            onClick={() => {
              setDraft(title);
              setRenaming(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="danger"
            icon={<Trash2 size={14} className="text-white/30" />}
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
