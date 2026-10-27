import { IconChevronDown, IconCircleFilled } from "@tabler/icons-react";
import type { ComponentProps, ReactNode } from "react";
import { Children, Fragment, cloneElement, isValidElement } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";

const classes = (...values: Array<string | undefined>) => values.filter(Boolean).join(" ");

export function ChainOfThoughtItem({ children, className, ...props }: ComponentProps<"div">) {
    return <div className={classes("text-[14px] text-phi-text-muted", className)} {...props}>{children}</div>;
}

type TriggerProps = Omit<ComponentProps<typeof CollapsibleTrigger>, "children"> & {
    children: ReactNode;
    leftIcon?: ReactNode;
    swapIconOnHover?: boolean;
};

export function ChainOfThoughtTrigger({
    children,
    className,
    leftIcon,
    swapIconOnHover = true,
    ...props
}: TriggerProps) {
    return (
        <CollapsibleTrigger
            className={classes("group flex cursor-pointer items-center justify-start gap-1 text-left text-[14px] leading-5 text-phi-text-muted transition-colors hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-phi-accent/50", className)}
            {...props}
        >
            <div className="flex min-w-0 items-center gap-2">
                {leftIcon ? (
                    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
                        <span className={classes("transition-opacity", swapIconOnHover ? "group-hover:opacity-0" : undefined)}>{leftIcon}</span>
                        {swapIconOnHover && <IconChevronDown className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100 group-data-open:rotate-180" />}
                    </span>
                ) : (
                    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
                        <IconCircleFilled className="size-2" />
                    </span>
                )}
                <span className="min-w-0">{children}</span>
            </div>
            {!leftIcon && <IconChevronDown className="size-4 shrink-0 transition-transform group-data-open:rotate-180" />}
        </CollapsibleTrigger>
    );
}

type ContentProps = Omit<ComponentProps<typeof CollapsibleContent>, "children"> & { children: ReactNode };

export function ChainOfThoughtContent({ children, className, ...props }: ContentProps) {
    return (
        <CollapsibleContent className={classes("overflow-hidden text-phi-text-secondary", className)} {...props}>
            <div className="grid grid-cols-[min-content_minmax(0,1fr)] gap-x-4">
                <div className="ml-1.75 h-full w-px bg-phi-border-faint group-data-[last=true]:hidden" />
                <div className="ml-1.75 h-full w-px bg-transparent group-data-[last=false]:hidden" />
                <div className="mt-2 min-w-0 space-y-2">{children}</div>
            </div>
        </CollapsibleContent>
    );
}

type StepProps = ComponentProps<typeof Collapsible> & {
    children: ReactNode;
    isLast?: boolean;
};

export function ChainOfThoughtStep({ children, className, isLast = false, ...props }: StepProps) {
    return (
        <Collapsible as="div" className={classes("group", className)} data-last={isLast} {...props}>
            {children}
            <div className="flex justify-start group-data-[last=true]:hidden">
                <div className="ml-1.75 h-4 w-px bg-phi-border-faint" />
            </div>
        </Collapsible>
    );
}

export function ChainOfThought({ children, className }: { children: ReactNode; className?: string }) {
    const items = Children.toArray(children);
    return (
        <div className={classes("space-y-0", className)}>
            {items.map((child, index) => (
                <Fragment key={index}>
                    {isValidElement<StepProps>(child)
                        ? cloneElement(child, { isLast: index === items.length - 1 })
                        : child}
                </Fragment>
            ))}
        </div>
    );
}
