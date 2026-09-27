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
            className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-medium text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary ${className}`}
            {...props}
        >
            <IconChevronDownFilled
                aria-hidden
                className={`size-3.5 shrink-0 text-current transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "-rotate-90" : ""}`}
            />
            {children}
        </button>
    );
}
