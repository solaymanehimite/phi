import {
    ArrowPathIcon,
    ChatBubbleLeftIcon,
    PaperAirplaneIcon,
    XMarkIcon,
} from "@heroicons/react/24/solid";
import { memo, type ReactNode } from "react";
import { useHasDraft } from "../hooks/useHasDraft";

export type ChatTab = {
    id: string | null;
    title: string;
    isRunning?: boolean;
};

type TabsProps = {
    sidebarActions?: ReactNode;
    sidebarCollapsed?: boolean;
    tabs: ChatTab[];
    activeId: string | null;
    onSelect: (id: string | null) => void;
    onClose: (id: string | null) => void;
    hideClose?: boolean;
    tablistLabel?: string;
};

const TabItem = memo(function TabItem({ tab, active, canClose, onSelect, onClose }: { tab: ChatTab; active: boolean; canClose: boolean; onSelect: (id: string | null) => void; onClose: (id: string | null) => void }) {
    const hasDraft = useHasDraft(tab.id);
    return (
        <div
            className={`phi-tab-enter group flex h-8 max-w-[240px] min-w-[132px] shrink-0 items-center rounded-lg ${active ? "phi-tab-active bg-phi-overlay-active text-phi-text-primary" : "text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary"}`}
        >
            <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Open ${tab.title}`}
                onClick={() => onSelect(tab.id)}
                className="flex min-w-0 flex-1 items-center gap-2 self-stretch truncate rounded-tl-lg pl-3 pr-1 text-left text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-phi-accent/50"
            >
                {tab.isRunning ? <ArrowPathIcon className="size-3.5 shrink-0 animate-spin text-phi-accent" /> : tab.id === null ? <ChatBubbleLeftIcon className="size-3.5 shrink-0 text-phi-text-muted" /> : null}
                <span className="min-w-0 truncate">{tab.title}</span>
                {hasDraft && <PaperAirplaneIcon className="size-3 shrink-0 text-phi-text-muted" aria-label="Has draft" title="Draft" />}
            </button>
            {canClose ? (
                <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    title={`Close ${tab.title}`}
                    onClick={() => onClose(tab.id)}
                    className="mr-1.5 flex size-5 shrink-0 items-center justify-center rounded-md text-phi-text-muted opacity-0 hover:bg-phi-overlay-active hover:text-phi-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/50 group-hover:opacity-100"
                >
                    <XMarkIcon className="size-3.5" />
                </button>
            ) : null}
        </div>
    );
});

export const Tabs = memo(function Tabs({
    sidebarActions,
    sidebarCollapsed = false,
    tabs,
    activeId,
    onSelect,
    onClose,
    hideClose = false,
    tablistLabel = "Open chats",
}: TabsProps) {
    return (
        <div
            data-tauri-drag-region
            data-sidebar-collapsed={sidebarActions ? (sidebarCollapsed ? "true" : "false") : undefined}
            className={`phi-tabs-bar mb-2 flex h-10 shrink-0 items-end ${sidebarActions ? "phi-tabs-bar-extended" : "gap-2"}`}
        >
            {sidebarActions && (
                <div className="phi-tabs-sidebar-slot">
                    {sidebarActions}
                </div>
            )}
            <div
                role="tablist"
                aria-label={tablistLabel}
                className="flex min-w-0 flex-1 items-end gap-2 overflow-x-auto px-0 scrollbar-none"
            >
                {tabs.map((tab) => {
                    const active = tab.id === activeId;
                    const canClose = !hideClose && (tab.id !== null || tabs.length > 1);
                    return <TabItem key={tab.id ?? "new-chat"} tab={tab} active={active} canClose={canClose} onSelect={onSelect} onClose={onClose} />;
                })}
            </div>
        </div>
    );
});
