import type { ComponentType, ReactNode } from "react";

type NavItemProps = {
  active?: boolean;
  label?: string;
  children?: ReactNode;
  onClick: () => void;
  icon?: ComponentType<{ className?: string }>;
  /** Extra classes applied to the icon (e.g. hover animations). */
  iconClassName?: string;
  className?: string;
  title?: string;
  ariaLabel?: string;
  ariaCurrent?: boolean | "page";
};

/**
 * Sidebar / settings navigation row. One hover, one active, one focus ring.
 * Replaces the one-off row styles in sidebar, settings and tabs.
 */
export function NavItem({
  active = false,
  label,
  children,
  onClick,
  icon: Icon,
  iconClassName = "",
  className = "",
  title,
  ariaLabel,
  ariaCurrent,
}: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={`group flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 ${
        active
          ? "bg-phi-overlay-active text-phi-text-primary"
          : "text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-secondary"
      } ${className}`}
    >
      {Icon && (
        <Icon
          className={`size-4 shrink-0 ${active ? "text-phi-icon-active" : "text-phi-icon group-hover:text-phi-text-secondary"} ${iconClassName}`}
        />
      )}
      {label != null ? <span className="min-w-0 flex-1 truncate">{label}</span> : children}
    </button>
  );
}
