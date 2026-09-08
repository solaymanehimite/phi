import type { HTMLAttributes, ReactNode } from "react";

/** Inline code span — single token source for backticked text. */
export function InlineCode({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <code
      className={`break-words rounded bg-phi-overlay-code px-1 py-0.5 font-mono text-[13px] font-normal text-phi-text-primary ${className}`}
      {...props}
    >
      {children}
    </code>
  );
}
