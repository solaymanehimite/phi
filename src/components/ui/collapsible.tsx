import { IconChevronDownFilled } from "@tabler/icons-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type CollapsibleTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    open: boolean;
    children: ReactNode;
};

export function CollapsibleTrigger({
    open,
    children,
    className = "",
    ...props
}: CollapsibleTriggerProps) {
    return (
        <button
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-2 text-left ${className}`}
            {...props}
        >
            <span
                className={`text-[11px] text-phi-text-muted transition-transform ${open ? "rotate-90" : ""}`}
            >
                ▸
            </span>
            {children}
        </button>
    );
}

type CollapsibleContentProps = HTMLAttributes<HTMLDivElement> & {
    children: ReactNode;
};

export function CollapsibleContent({
    children,
    className = "",
    ...props
}: CollapsibleContentProps) {
    return (
        <div
            className={`border-t border-phi-border-faint px-3 py-2.5 ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}

type GroupCollapsibleTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    collapsed: boolean;
    children: ReactNode;
};

export function GroupCollapsibleTrigger({
    collapsed,
    children,
    className = "",
    ...props
}: GroupCollapsibleTriggerProps) {
    return (
        <button
            type="button"
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-medium tracking-wide text-phi-text-secondary hover:bg-phi-overlay-hover hover:text-phi-text-primary ${className}`}
            {...props}
        >
            <IconChevronDownFilled
                aria-hidden
                className={`size-3 shrink-0 text-current transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? "-rotate-90" : "rotate-0"}`}
            />
            {children}
        </button>
    );
}
