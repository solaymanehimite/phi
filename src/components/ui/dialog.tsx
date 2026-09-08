import type { HTMLAttributes, ReactNode } from "react";

/** Full-screen scrim — always the scrim token, never hardcoded black. */
export function DialogOverlay({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-phi-scrim p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogPanel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`w-full max-w-md rounded-xl border border-phi-border bg-phi-bg-surface p-4 shadow-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogTitle({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { children: ReactNode }) {
  return (
    <h4 className={`text-[14px] font-semibold text-phi-text-primary ${className}`} {...props}>
      {children}
    </h4>
  );
}
