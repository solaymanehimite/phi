import {
    IconComponents,
    IconSendFilled,
    IconSettingsFilled,
    IconXFilled,
} from "@tabler/icons-react";
import { Orb } from "@aicss/react";
import { memo, useEffect, useState, type ReactNode } from "react";
import { useHasDraft } from "../hooks/useHasDraft";

export const SETTINGS_TAB_ID = "phi:settings";
export const UI_DEMO_TAB_ID = "phi:ui-demo";

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

/* Same orb spinner as the working block, with a scale pop on appear/disappear.
   The wrapper stays mounted and animates its width so the title slides
   instead of snapping when the orb arrives/leaves. */
function TabRunningOrb({ running }: { running?: boolean }) {
    const [renderOrb, setRenderOrb] = useState(Boolean(running));
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        if (running) {
            setRenderOrb(true);
            setLeaving(false);
            return;
        }
        if (!renderOrb) return;
        setLeaving(true);
        const t = window.setTimeout(() => {
            setRenderOrb(false);
            setLeaving(false);
        }, 200);
        return () => window.clearTimeout(t);
    }, [running, renderOrb]);

    // Wrapper stays expanded while the shrink-out plays, then collapses.
    const open = Boolean(running) || leaving;
    return (
        <span
            aria-hidden
            className={`flex shrink-0 items-center overflow-hidden transition-all duration-200 ease-out ${open ? "mr-2 w-[18px] opacity-100" : "mr-0 w-0 opacity-0"}`}
        >
            {renderOrb && (
                <span className={`flex shrink-0 ${leaving ? "phi-orb-exit" : "phi-orb-enter"}`}>
                    <Orb variant="S3" size={18} />
                </span>
            )}
        </span>
    );
}

const TabItem = memo(function TabItem({ tab, active, canClose, onSelect, onClose }: { tab: ChatTab; active: boolean; canClose: boolean; onSelect: (id: string | null) => void; onClose: (id: string | null) => void }) {
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
                {isSettings ? <IconSettingsFilled className="mr-2 size-3.5 shrink-0 text-phi-text-muted" /> : isUiDemo ? <IconComponents className="mr-2 size-3.5 shrink-0 text-phi-text-muted" /> : <TabRunningOrb running={tab.isRunning} />}
                <span className="min-w-0 truncate">{tab.title}</span>
                {!isSpecial && hasDraft && <IconSendFilled className="ml-2 size-3 shrink-0 text-phi-text-muted" aria-label="Has draft" title="Draft" />}
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
                    const chatTabCount = tabs.filter((t) => t.id !== SETTINGS_TAB_ID && t.id !== UI_DEMO_TAB_ID).length;
                    // Settings + UI demo behave like any other tab (always closable). The sole
                    // new-chat draft is never closable — special tabs don't count toward that minimum.
                    const canClose = !hideClose && (tab.id !== null || chatTabCount > 1);
                    return <TabItem key={tab.id ?? "new-chat"} tab={tab} active={active} canClose={canClose} onSelect={onSelect} onClose={onClose} />;
                })}
            </div>
        </div>
    );
});
