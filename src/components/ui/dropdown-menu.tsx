import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import type { ComponentProps, ReactNode } from "react";

type DropdownMenuProps = ComponentProps<typeof Menu>;
export function DropdownMenu(props: DropdownMenuProps) {
  return <Menu as="div" className="relative shrink-0" {...props} />;
}

type DropdownMenuTriggerProps = ComponentProps<typeof MenuButton>;
export function DropdownMenuTrigger({ className = "", children, ...props }: DropdownMenuTriggerProps) {
  return (
    <MenuButton
      className={`grid size-6 place-items-center rounded text-[#5f5f65] opacity-0 transition-colors hover:bg-white/[0.08] hover:text-[#bdbdc1] focus:opacity-100 focus:outline-none group-hover:opacity-100 data-open:bg-white/[0.08] data-open:text-[#bdbdc1] data-open:opacity-100 ${className}`}
      {...props}
    >
      {children}
    </MenuButton>
  );
}

type DropdownMenuContentProps = ComponentProps<typeof MenuItems>;
export function DropdownMenuContent({ className = "", children, ...props }: DropdownMenuContentProps) {
  return (
    <MenuItems
      transition
      anchor="bottom end"
      className={`z-20 w-40 origin-top-right rounded-xl border border-white/5 bg-[#1b1b1e] p-1 text-sm/6 text-white shadow-xl transition duration-100 ease-out [--anchor-gap:4px] focus:outline-none data-closed:scale-95 data-closed:opacity-0 ${className}`}
      {...props}
    >
      {children}
    </MenuItems>
  );
}

type DropdownMenuItemProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "danger";
  icon?: ReactNode;
};

export function DropdownMenuItem({ children, onClick, variant = "default", icon }: DropdownMenuItemProps) {
  const textColor = variant === "danger" ? "text-red-300" : "text-[#bdbdc1]";
  return (
    <MenuItem>
      <button
        onClick={onClick}
        className={`group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] ${textColor} data-focus:bg-white/10`}
      >
        {icon}
        {children}
      </button>
    </MenuItem>
  );
}
