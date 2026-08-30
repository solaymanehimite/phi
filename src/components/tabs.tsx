import {
    ArrowPathIcon,
    ChatBubbleLeftIcon,
    XMarkIcon,
} from "@heroicons/react/24/solid";
import { memo, type ReactNode } from "react";

export type ChatTab = {
    id: string | null;
    title: string;
    isRunning?: boolean;
};

type TabsProps = {
    leadingAction?: ReactNode;
    tabs: ChatTab[];
    activeId: string | null;
    onSelect: (id: string | null) => void;
    onClose: (id: string | null) => void;
};

export const Tabs = memo(function Tabs({
    leadingAction,
    tabs,
    activeId,
    onSelect,
    onClose,
}: TabsProps) {
    return (
        <div
            data-tauri-drag-region
            className="mb-2 flex h-10 shrink-0 items-end gap-2"
        >
            {leadingAction}
            <div
                role="tablist"
                aria-label="Open chats"
                className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-0 scrollbar-none"
            >
                {tabs.map((tab) => {
                    const active = tab.id === activeId;
                    const canClose = tab.id !== null || tabs.length > 1;

                    return (
                        <div
                            key={tab.id ?? "new-chat"}
                            className={`group flex h-8 max-w-[240px] min-w-[132px] shrink-0 items-center rounded-lg ${active
                                    ? "bg-phi-overlay-active text-phi-text-primary"
                                    : "text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary"
                                }`}
                        >
                            <button
                                type="button"
                                role="tab"
                                aria-selected={active}
                                aria-label={`Open ${tab.title}`}
                                onClick={() => onSelect(tab.id)}
                                className="flex min-w-0 flex-1 items-center gap-2 self-stretch truncate rounded-tl-lg pl-3 pr-1 text-left text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-phi-accent/50"
                            >
                                {tab.isRunning ? (
                                    <ArrowPathIcon className="size-3.5 shrink-0 animate-spin text-phi-accent" />
                                ) : tab.id === null ? (
                                    <ChatBubbleLeftIcon className="size-3.5 shrink-0 text-phi-text-muted" />
                                ) : null}
                                <span className="min-w-0 truncate">{tab.title}</span>
                            </button>
                            {canClose ? (
                                <button
                                    type="button"
                                    aria-label={`Close ${tab.title}`}
                                    title={`Close ${tab.title}`}
                                    onClick={() => onClose(tab.id)}
                                    className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-md text-phi-text-muted opacity-0 hover:bg-phi-overlay-active hover:text-phi-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/50 group-hover:opacity-100"
                                >
                                    <XMarkIcon className="size-3.5" />
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
