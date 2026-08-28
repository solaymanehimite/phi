import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "ghost" | "icon" | "primary";
};

const styles = {
  ghost:
    "inline-flex h-8 items-center justify-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-phi-text-tertiary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40",
  icon:
    "inline-grid size-8 shrink-0 place-items-center rounded-lg text-phi-text-tertiary transition-colors hover:bg-phi-overlay hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40",
  primary:
    "inline-grid size-8 shrink-0 place-items-center rounded-[10px] bg-phi-bg-inverse text-phi-text-inverse transition-colors hover:bg-phi-white disabled:cursor-default disabled:bg-phi-bg-disabled disabled:text-phi-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-white/40",
};

export function Button({
  children,
  className = "",
  type = "button",
  variant = "ghost",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
