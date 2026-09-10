import { IconFolderFilled, IconFolderOpenFilled } from "@tabler/icons-react";
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
            {collapsed ? (
                <IconFolderFilled aria-hidden className="size-4 shrink-0 text-current" />
            ) : (
                <IconFolderOpenFilled aria-hidden className="size-4 shrink-0 text-current" />
            )}
            {children}
        </button>
    );
}
