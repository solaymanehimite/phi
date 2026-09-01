import { Popover as HeadlessPopover, PopoverButton, PopoverPanel } from "@headlessui/react";
import type { ComponentProps } from "react";

type PopoverProps = ComponentProps<typeof HeadlessPopover>;
export function Popover({ className = "", ...props }: PopoverProps) {
    return <HeadlessPopover className={className} {...props} />;
}

type PopoverTriggerProps = ComponentProps<typeof PopoverButton>;
export function PopoverTrigger({ className = "", children, ...props }: PopoverTriggerProps) {
    return (
        <PopoverButton className={className} {...props}>
            {children}
        </PopoverButton>
    );
}

type PopoverContentProps = ComponentProps<typeof PopoverPanel>;
export function PopoverContent({ className = "", children, ...props }: PopoverContentProps) {
    return (
        <PopoverPanel
            transition
            className={`z-20 origin-bottom rounded-2xl border border-phi-border-faint bg-phi-bg-elevated shadow-[0_16px_48px_var(--color-phi-shadow),0_0_0_1px_var(--color-phi-border)] transition duration-100 ease-out [--anchor-gap:8px] focus:outline-none data-closed:scale-95 data-closed:opacity-0 ${className}`}
            {...props}
        >
            {children}
        </PopoverPanel>
    );
}
