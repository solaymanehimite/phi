import { IconChevronDownFilled } from "@tabler/icons-react";
import type { ReactNode, SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
  /** Width of the floating select (code theme uses a fixed narrow chip). */
  className?: string;
};

/** Bordered select chip with chevron — code theme picker. */
export function Select({ children, className = "", ...props }: SelectProps) {
  // A consumer-passed position (e.g. `absolute` for floating overlays) must
  // win over the default `relative` chevron anchor — both classes on one
  // element would conflict and `relative` would win the cascade.
  const positioned = /\b(absolute|fixed|sticky)\b/.test(className);
  return (
    <label className={`inline-flex ${positioned ? "" : "relative "}${className}`}>
      <span className="sr-only">Select option</span>
      <select
        className="h-7 w-full appearance-none rounded-lg border border-phi-border-strong bg-phi-bg-elevated py-0 pl-2.5 pr-7 text-[11px] font-medium text-phi-text-secondary shadow-[0_2px_8px_var(--color-phi-shadow)] outline-none transition-colors hover:border-phi-accent/50 hover:text-phi-text-primary focus-visible:border-phi-accent/70 focus-visible:ring-1 focus-visible:ring-phi-accent/40"
        {...props}
      >
        {children}
      </select>
      <IconChevronDownFilled
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-phi-text-muted"
      />
    </label>
  );
}
