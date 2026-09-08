import type { ReactNode } from "react";

/** Muted count / hint chip shown at the right of palette rows. */
export function Hint({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`shrink-0 text-[11px] text-phi-text-faint ${className}`}>{children}</span>;
}
