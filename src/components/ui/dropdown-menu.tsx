import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import type { ComponentProps, ReactNode } from "react";

type DropdownMenuProps = ComponentProps<typeof Menu>;
export function DropdownMenu(props: DropdownMenuProps) {
    return <Menu as="div" className="relative shrink-0" {...props} />;
}

type DropdownMenuTriggerProps = ComponentProps<typeof MenuButton>;
export function DropdownMenuTrigger({
    className = "",
    children,
    ...props
}: DropdownMenuTriggerProps) {
    return (
        <MenuButton
            className={`grid size-6 place-items-center rounded text-phi-icon opacity-0 transition-colors hover:bg-phi-overlay-strong hover:text-phi-text-secondary focus:opacity-100 focus:outline-none group-hover:opacity-100 data-open:bg-phi-overlay-strong data-open:text-phi-text-secondary data-open:opacity-100 ${className}`}
            {...props}
        >
            {children}
        </MenuButton>
    );
}

type DropdownMenuContentProps = ComponentProps<typeof MenuItems>;
export function DropdownMenuContent({
    className = "",
    children,
    ...props
}: DropdownMenuContentProps) {
    return (
        <MenuItems
            transition
            anchor="bottom end"
            className={`z-20 w-40 origin-top-right rounded-xl border border-phi-border-faint bg-phi-bg-elevated p-1 text-sm/6 text-phi-white shadow-xl transition duration-100 ease-out [--anchor-gap:4px] focus:outline-none data-closed:scale-95 data-closed:opacity-0 ${className}`}
            {...props}
        >
            {children}
        </MenuItems>
    );
}

type DropdownMenuItemProps = {
    children: ReactNode;
    onClick?: () => void;
    icon?: ReactNode;
};

export function DropdownMenuItem({
    children,
    onClick,
    icon,
}: DropdownMenuItemProps) {
    return (
        <MenuItem>
            <button
                onClick={onClick}
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-1 text-left text-[13px] text-phi-text-secondary data-focus:bg-phi-overlay-strong"
            >
                {icon ? <span className="shrink-0 text-phi-text-tertiary group-hover:text-phi-text-secondary group-data-[focus]:text-phi-text-secondary">{icon}</span> : null}
                {children}
            </button>
        </MenuItem>
    );
}
