import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: "search" | "inline";
};

const variants = {
  search:
    "h-8 w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-[13px] text-[#dedee1] placeholder:text-[#5e5e63] outline-none focus:border-white/[0.14] focus:bg-white/[0.05]",
  inline:
    "min-w-0 flex-1 rounded border border-[#d6a85f]/40 bg-[#1b1b1e] px-1 py-0 text-[13px] text-[#dedee1] outline-none",
};

export function Input({ variant = "search", className = "", ...props }: InputProps) {
  return <input className={`${variants[variant]} ${className}`} {...props} />;
}
