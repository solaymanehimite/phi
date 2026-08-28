import { useState } from "react";
import { Button } from "./ui/button";
import { ChatIcon, ComposeIcon, PanelLeftIcon } from "./ui/icons";
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

export function Sidebar({
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
        <div className="relative">
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search sessions…"
            aria-label="Search sessions"
            className="h-8 w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-[13px] text-[#dedee1] placeholder:text-[#5e5e63] outline-none focus:border-white/[0.14] focus:bg-white/[0.05]"
          />
        </div>
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
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.cwd)}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-medium tracking-wide text-[#535359] hover:bg-white/[0.04] hover:text-[#8b8b91]"
                  >
                    <span
                      className={`inline-block text-[10px] transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                    >
                      ▾
                    </span>
                    <span className="min-w-0 flex-1 truncate">{group.displayCwd}</span>
                  </button>

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
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);

  async function handleRename() {
    const name = draft.trim();
    if (!name) return;
    await onRename(name);
    setRenaming(false);
    setMenuOpen(false);
  }

  return (
    <div
      className={`group flex h-8 w-full items-center gap-1 rounded-lg px-1 text-left text-[13px] ${active ? "bg-white/[0.075] text-[#e3e3e5]" : "text-[#79797f] hover:bg-white/[0.045] hover:text-[#bdbdc1]"}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2.5 truncate rounded-lg px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6a85f]/40"
      >
        <ChatIcon className={`size-4 shrink-0 ${active ? "text-[#b9b9be]" : "text-[#5f5f65]"}`} />
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setRenaming(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => setRenaming(false)}
            className="min-w-0 flex-1 rounded border border-[#d6a85f]/40 bg-[#1b1b1e] px-1 py-0 text-[13px] outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{title}</span>
        )}
        <span className="shrink-0 text-[11px] text-[#4f4f55]">{count > 0 ? `${count}` : ""}</span>
        <span className="shrink-0 text-[11px] text-[#4f4f55]">{time}</span>
      </button>

      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Session actions"
          onClick={() => setMenuOpen((v) => !v)}
          className={`grid size-6 place-items-center rounded text-[#5f5f65] hover:bg-white/[0.08] hover:text-[#bdbdc1] ${menuOpen ? "bg-white/[0.08] text-[#bdbdc1]" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
        >
          …
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-7 z-10 w-36 rounded-lg border border-white/[0.08] bg-[#1b1b1e] py-1 shadow-xl">
            {!renaming ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(title);
                  setRenaming(true);
                }}
                className="w-full px-3 py-1.5 text-left text-[13px] text-[#bdbdc1] hover:bg-white/[0.06]"
              >
                Rename
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRename}
                className="w-full px-3 py-1.5 text-left text-[13px] text-[#d6a85f] hover:bg-white/[0.06]"
              >
                Save name
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Delete this session?")) return;
                setMenuOpen(false);
                await onDelete();
              }}
              className="w-full px-3 py-1.5 text-left text-[13px] text-red-300 hover:bg-white/[0.06]"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
