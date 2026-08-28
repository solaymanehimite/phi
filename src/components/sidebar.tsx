import { Button } from "./ui/button";
import { ComposeIcon, PanelLeftIcon } from "./ui/icons";
import { SidebarItem } from "./ui/sidebar-item";

type SidebarProps = {
    chats: Array<{ id: string; title: string }>;
    activeChatId: string | null;
    onChatSelect: (id: string) => void;
    onClose: () => void;
    onNewChat: () => void;
};

export function Sidebar({
    chats,
    activeChatId,
    onChatSelect,
    onClose,
    onNewChat,
}: SidebarProps) {
    return (
        <aside className="flex w-[228px] shrink-0 flex-col border-r border-white/[0.055] bg-[#0a0a0b] max-sm:absolute max-sm:inset-y-0 max-sm:z-20 max-sm:shadow-[18px_0_50px_rgba(0,0,0,0.45)]">
            <div
                data-tauri-drag-region
                className="flex h-13 shrink-0 items-center justify-between px-3"
            >
                <button
                    type="button"
                    onClick={onNewChat}
                    className="flex items-center gap-2 rounded-lg p-1 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6a85f]/40"
                >
                    <span className="font-serif text-xl text-[#d6a85f]">Φ</span>
                    <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#d6d6d9]">
                        Phi
                    </span>
                </button>
                <Button
                    variant="icon"
                    aria-label="Close sidebar"
                    title="Close sidebar"
                    onClick={onClose}
                >
                    <PanelLeftIcon />
                </Button>
            </div>

            <div className="px-2 pt-2">
                <Button className="w-full justify-start" onClick={onNewChat}>
                    <ComposeIcon />
                    New chat
                </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-6">
                <p className="mb-1.5 px-2 text-[11px] font-medium text-[#535359]">
                    Recent chats
                </p>
                <nav aria-label="Recent chats" className="space-y-0.5">
                    {chats.map((chat) => (
                        <SidebarItem
                            key={chat.id}
                            label={chat.title}
                            active={chat.id === activeChatId}
                            onClick={() => onChatSelect(chat.id)}
                        />
                    ))}
                </nav>
            </div>


        </aside>
    );
}
