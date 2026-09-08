import type { ButtonHTMLAttributes } from "react";

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  checked: boolean;
  label: string;
};

/** Toggle switch — accent track when on, overlay track when off. */
export function Switch({ checked, label, className = "", ...props }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={className} {...props}>
      <span
        aria-hidden
        style={checked ? { backgroundColor: "var(--color-phi-accent)" } : undefined}
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out ${
          checked ? "" : "bg-phi-overlay-active"
        }`}
      >
        <span
          className={`size-5 rounded-full bg-phi-white shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
