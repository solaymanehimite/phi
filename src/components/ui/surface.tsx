import type { HTMLAttributes, ReactNode } from "react";

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Surface({ children, className = "", ...props }: SurfaceProps) {
  return (
    <div className={`rounded-lg border border-phi-border bg-phi-overlay-muted ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SurfaceContent({ children, className = "", ...props }: SurfaceProps) {
  return (
    <div className={`border-t border-phi-border-faint px-3 py-2.5 ${className}`} {...props}>
      {children}
    </div>
  );
}

/**
 * Sunken well — tool output, diffs, code blocks. Single source for the
 * recessed `bg-sunken` container repeated across conversation + markdown.
 */
export function Well({ children, className = "", ...props }: SurfaceProps) {
  return (
    <div className={`rounded-md bg-phi-bg-sunken ${className}`} {...props}>
      {children}
    </div>
  );
}
