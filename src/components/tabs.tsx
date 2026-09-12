import {
    IconComponents,
    IconSendFilled,
    IconSettingsFilled,
    IconXFilled,
} from "@tabler/icons-react";
import { memo, type ReactNode } from "react";
import { useHasDraft } from "../hooks/useHasDraft";
import { RunningOrb } from "./running-orb";

export const SETTINGS_TAB_ID = "phi:settings";
export const UI_DEMO_TAB_ID = "phi:ui-demo";
export const NEW_TAB_PREFIX = "phi:new:";

export function isNewTabId(id: string | null): boolean {
    return typeof id === "string" && id.startsWith(NEW_TAB_PREFIX);
}

export type ChatTab = {
    id: string;
    title: string;
    isRunning?: boolean;
};

type TabsProps = {
    sidebarActions?: ReactNode;
    sidebarCollapsed?: boolean;
    tabs: ChatTab[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    hideClose?: boolean;
    tablistLabel?: string;
};

const TabItem = memo(function TabItem({ tab, active, canClose, onSelect, onClose }: { tab: ChatTab; active: boolean; canClose: boolean; onSelect: (id: string) => void; onClose: (id: string) => void }) {
    const hasDraft = useHasDraft(tab.id);
    const isSettings = tab.id === SETTINGS_TAB_ID;
    const isUiDemo = tab.id === UI_DEMO_TAB_ID;
    const isSpecial = isSettings || isUiDemo;
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
                className="flex min-w-0 flex-1 items-center self-stretch truncate rounded-tl-lg pl-3 pr-1 text-left text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-phi-accent/50"
            >
                {isSettings ? <IconSettingsFilled className="mr-2 size-3.5 shrink-0 text-phi-text-muted" /> : isUiDemo ? <IconComponents className="mr-2 size-3.5 shrink-0 text-phi-text-muted" /> : <RunningOrb running={tab.isRunning} size={18} gap={8} />}
                <span className="min-w-0 truncate">{tab.title}</span>
                {!isSpecial && hasDraft && <IconSendFilled className="ml-2 size-3 shrink-0 rotate-45 text-phi-text-muted" aria-label="Has draft" title="Draft" />}
            </button>
            {canClose ? (
                <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    title={`Close ${tab.title}`}
                    onClick={() => onClose(tab.id)}
                    className="mr-1.5 flex size-5 shrink-0 items-center justify-center rounded-md text-phi-text-muted opacity-0 hover:bg-phi-overlay-active hover:text-phi-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/50 group-hover:opacity-100"
                >
                    <IconXFilled className="size-3.5" />
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
    const chatTabCount = tabs.filter((t) => t.id !== SETTINGS_TAB_ID && t.id !== UI_DEMO_TAB_ID).length;
    return (
        <div
            data-tauri-drag-region
            data-sidebar-collapsed={sidebarActions ? (sidebarCollapsed ? "true" : "false") : undefined}
            className={`phi-tabs-bar mb-2 flex h-10 shrink-0 items-end ${sidebarActions ? "phi-tabs-bar-extended" : "gap-2"}`}
        >
            {sidebarActions && (
                <div className="phi-tab-sidebar-slot">
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
                    // Settings + UI demo are always closable. Chat tabs (sessions and
                    // new-chat drafts) are closable unless it's the last one — there is
                    // always at least one chat tab; specials don't count toward that minimum.
                    const isSpecialTab = tab.id === SETTINGS_TAB_ID || tab.id === UI_DEMO_TAB_ID;
                    const canClose = !hideClose && (isSpecialTab || chatTabCount > 1);
                    return <TabItem key={tab.id} tab={tab} active={active} canClose={canClose} onSelect={onSelect} onClose={onClose} />;
                })}
            </div>
        </div>
    );
});
