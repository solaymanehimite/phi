import type { HTMLAttributes, ReactNode } from "react";

type AlertVariant = "error" | "warning" | "muted" | "info";

const styles: Record<AlertVariant, string> = {
  error: "border-phi-error-border bg-phi-error-bg text-phi-error-text",
  warning: "border-phi-warning-border bg-phi-warning-bg text-phi-warning-text",
  // Archived / low-emphasis notice.
  muted: "border-phi-border bg-phi-overlay text-phi-text-muted",
  info: "border-phi-border bg-phi-bg-surface text-phi-text-secondary",
};

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
  children: ReactNode;
};

/**
 * Inline banner — model errors, auth warnings, session load failures.
 * One row: rounded box, token border/bg/text. No hardcoded colors.
 */
export function Alert({ variant = "error", children, className = "", ...props }: AlertProps) {
  return (
    <div
      role={variant === "error" || variant === "warning" ? "alert" : undefined}
      className={`rounded-lg border px-3 py-2 text-[12px] leading-5 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
