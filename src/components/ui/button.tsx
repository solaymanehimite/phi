import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
    "ghost" | "icon" | "primary" | "secondary" | "danger" | "mini";
type ButtonSize = "icon" | "xs" | "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    variant?: ButtonVariant;
    /** Overrides the variant's default sizing. */
    size?: ButtonSize;
};

const base =
    "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
    // Muted text button — sidebar "New chat", dialog Cancel, compaction Abort.
    ghost:
        "rounded-lg text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary disabled:opacity-40",
    // Icon-only square — tab bar, composer attach, palette trigger.
    icon: "shrink-0 rounded-lg text-phi-text-tertiary hover:bg-phi-overlay hover:text-phi-text-primary disabled:opacity-40",
    // Inverted action — Send, Retry, Save, Continue. Hover dims instead of
    // flipping to pure white (which inverts in light theme).
    primary:
        "shrink-0 rounded-lg bg-phi-bg-inverse text-phi-text-inverse hover:opacity-90 disabled:cursor-default disabled:bg-phi-bg-disabled disabled:text-phi-text-disabled disabled:opacity-100",
    // Bordered action — Test connection, form buttons, chip triggers (code theme
    // picker). Opaque elevated fill so content never shows through; hover lifts
    // the border toward accent and the text to primary.
    secondary:
        "rounded-lg border border-phi-border-strong bg-phi-bg-elevated text-phi-text-secondary hover:bg-phi-overlay-active hover:text-phi-text-primary disabled:opacity-50",
    // Destructive action — Stop button. White text on saturated red is correct
    // in both themes (phi-white is a fixed #fff, not theme text).
    danger:
        "shrink-0 rounded-lg bg-phi-error text-phi-white hover:opacity-90 disabled:opacity-50",
    // Tiny ghost icon — copy buttons, clear buttons inside menus and code.
    mini: "shrink-0 rounded-lg text-phi-text-muted opacity-70 hover:bg-phi-overlay-hover hover:text-phi-text-primary hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40",
};

const sizes: Record<ButtonSize, string> = {
    icon: "size-8 text-[13px]",
    xs: "h-7 px-2.5 text-[12px]",
    sm: "h-8 px-3 text-[13px]",
    md: "h-8 px-2.5 text-[13px]",
};

const defaultSize: Record<ButtonVariant, ButtonSize> = {
    ghost: "md",
    icon: "icon",
    primary: "icon",
    secondary: "sm",
    danger: "icon",
    mini: "icon",
};

/** Class string behind {@link Button} — reuse for Headless triggers that
 *  must wear button styles without nesting a `<button>`. */
export function buttonClass(
    variant: ButtonVariant = "ghost",
    size?: ButtonSize,
    className = "",
) {
    const resolved = size ?? defaultSize[variant];
    const sizeClass = variant === "mini" ? "size-5" : sizes[resolved];
    return `${base} ${variants[variant]} ${sizeClass} ${className}`;
}

export function Button({
    children,
    className = "",
    type = "button",
    variant = "ghost",
    size,
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            className={buttonClass(variant, size, className)}
            {...props}
        >
            {children}
        </button>
    );
}
