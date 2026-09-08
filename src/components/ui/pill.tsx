import type { ButtonHTMLAttributes, ReactNode } from "react";

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
};

/** Small filter pill — model rail filters, effort presets. */
export function Pill({ active = false, children, className = "", ...props }: PillProps) {
  return (
    <button
      type="button"
      data-active={active ? "true" : "false"}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/30 ${
        active
          ? "border-phi-accent/20 bg-phi-accent/10 text-phi-accent"
          : "border-phi-border-faint bg-phi-bg-sunken text-phi-text-tertiary hover:bg-phi-overlay-strong hover:text-phi-text-secondary"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Muted count / hint chip shown at the right of palette rows. */
export function Hint({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`shrink-0 text-[11px] text-phi-text-faint ${className}`}>{children}</span>;
}
