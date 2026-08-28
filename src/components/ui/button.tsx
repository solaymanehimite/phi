import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "ghost" | "icon" | "primary";
};

const styles = {
  ghost:
    "inline-flex h-8 items-center justify-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-[#99999f] transition-colors hover:bg-white/[0.055] hover:text-[#dedee1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6a85f]/40",
  icon:
    "inline-grid size-8 shrink-0 place-items-center rounded-lg text-[#818187] transition-colors hover:bg-white/[0.06] hover:text-[#dedee1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6a85f]/40",
  primary:
    "inline-grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#dedee1] text-[#111113] transition-colors hover:bg-white disabled:cursor-default disabled:bg-[#2a2a2d] disabled:text-[#66666c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
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
