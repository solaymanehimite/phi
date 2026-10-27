import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { IconChevronDownFilled } from "@tabler/icons-react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

export const Collapsible = Disclosure;
export const CollapsibleTrigger = DisclosureButton;
export const CollapsibleContent = DisclosurePanel;

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
            className={`group flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-medium text-phi-text-tertiary hover:text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 ${className}`}
            {...props}
        >
            {children}
            <IconChevronDownFilled
                aria-hidden
                className={`ml-1 size-3.5 shrink-0 text-current transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "opacity-100 -rotate-90" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
            />
        </button>
    );
}

export type CollapsibleProps = ComponentProps<typeof Disclosure>;
