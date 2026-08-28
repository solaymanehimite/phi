import type { HTMLAttributes, ReactNode } from "react";

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Surface({ children, className = "", ...props }: SurfaceProps) {
  return (
    <div className={`rounded-lg border border-white/[0.06] bg-white/[0.02] ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SurfaceContent({ children, className = "", ...props }: SurfaceProps) {
  return (
    <div className={`border-t border-white/[0.04] px-3 py-2.5 ${className}`} {...props}>
      {children}
    </div>
  );
}
