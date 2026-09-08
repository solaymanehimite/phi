import { IconChevronDownFilled } from "@tabler/icons-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

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
