import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type CollapsibleTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  open: boolean;
  children: ReactNode;
};

export function CollapsibleTrigger({ open, children, className = "", ...props }: CollapsibleTriggerProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-3 py-2 text-left ${className}`}
      {...props}
    >
      <span className={`text-[11px] text-phi-text-muted transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
      {children}
    </button>
  );
}

type CollapsibleContentProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function CollapsibleContent({ children, className = "", ...props }: CollapsibleContentProps) {
  return (
    <div className={`border-t border-phi-border-faint px-3 py-2.5 ${className}`} {...props}>
      {children}
    </div>
  );
}

type GroupCollapsibleTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  collapsed: boolean;
  children: ReactNode;
};

export function GroupCollapsibleTrigger({ collapsed, children, className = "", ...props }: GroupCollapsibleTriggerProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-medium tracking-wide text-phi-text-muted hover:bg-phi-border-faint hover:text-phi-text-tertiary ${className}`}
      {...props}
    >
      <span className={`inline-block text-[10px] transition-transform ${collapsed ? "-rotate-90" : ""}`}>▾</span>
      {children}
    </button>
  );
}
