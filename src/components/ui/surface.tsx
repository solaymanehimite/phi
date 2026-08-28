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
