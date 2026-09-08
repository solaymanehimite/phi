import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  detail?: string;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
};

/** Centered empty copy — sidebar, palette, model list share one voice. */
export function EmptyState({ title, description, detail, children, className = "", compact = false }: EmptyStateProps) {
  return (
    <div className={`${compact ? "px-3 py-8" : "px-2 py-8"} text-center ${className}`}>
      <p className="text-[12.5px] font-medium text-phi-text-secondary">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-[200px] text-[11.5px] leading-4 text-phi-text-muted">{description}</p>
      )}
      {detail && (
        <p className="mx-auto mt-2 max-w-[200px] text-[11px] leading-4 text-phi-text-faint">{detail}</p>
      )}
      {children}
    </div>
  );
}
