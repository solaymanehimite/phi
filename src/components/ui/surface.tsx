import type { HTMLAttributes, ReactNode, Ref } from "react";

type WellProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  as?: "div" | "pre";
  ref?: Ref<HTMLDivElement | HTMLPreElement>;
};

/**
 * Sunken well — tool output, diffs, code blocks. Single source for the
 * recessed `bg-sunken` container repeated across conversation + markdown.
 */
export function Well({ as: Tag = "div", children, className = "", ref, ...props }: WellProps) {
  return (
    <Tag ref={ref as any} className={`rounded-md bg-phi-bg-sunken ${className}`} {...props}>
      {children}
    </Tag>
  );
}
