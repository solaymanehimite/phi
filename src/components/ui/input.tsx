import type { InputHTMLAttributes, Ref } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: "search" | "inline" | "default";
  ref?: Ref<HTMLInputElement>;
};

const variants = {
  search:
    "h-8 w-full rounded-lg border border-phi-input-border bg-phi-input-bg px-3 text-[13px] text-phi-text-primary placeholder:text-phi-text-muted outline-none focus:border-phi-input-border-focus focus:bg-phi-input-bg-focus",
  inline:
    "min-w-0 flex-1 rounded border border-phi-accent/40 bg-phi-bg-elevated px-1 py-0 text-[13px] text-phi-text-primary outline-none",
  // Form fields — project name/path, provider label/url/key.
  default:
    "w-full rounded-lg border border-phi-input-border bg-phi-input-bg px-2 py-1.5 text-[12px] text-phi-text-primary placeholder:text-phi-text-muted outline-none focus:border-phi-input-border-focus",
};

export function Input({ variant = "search", className = "", ref, ...props }: InputProps) {
  return <input ref={ref} className={`${variants[variant]} ${className}`} {...props} />;
}
