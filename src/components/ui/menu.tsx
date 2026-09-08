import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

/**
 * Floating menu — the single style behind dropdowns, @ file palette and
 * / command palette. Base text is theme primary (never fixed white, which
 * disappears on the light elevated surface); rows opt into muted tones.
 */
export function Menu({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={`rounded-xl border border-phi-border-faint bg-phi-bg-elevated p-1 text-sm/6 text-phi-text-primary shadow-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

type MenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
};

export function MenuItem({ active = false, children, className = "", ...props }: MenuItemProps) {
  return (
    <button
      type="button"
      data-active={active ? "true" : "false"}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] focus:outline-none data-[active=true]:bg-phi-overlay-strong data-[active=true]:text-phi-text-primary ${
        active ? "bg-phi-overlay-strong text-phi-text-primary" : "text-phi-text-secondary hover:bg-phi-overlay-strong"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function MenuEmpty({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-lg px-3 py-1.5 text-[13px] text-phi-text-muted ${className}`} {...props}>
      {children}
    </div>
  );
}

export function MenuLabel({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-2 pb-1 pt-1 text-[10px] font-semibold tracking-[0.12em] text-phi-text-muted ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
