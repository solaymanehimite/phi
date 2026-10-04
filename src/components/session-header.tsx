import { memo, type ReactNode } from "react";

type SessionHeaderProps = {
    projectName?: string;
    sessionTitle: string;
    contextIndicator?: ReactNode;
};

export const SessionHeader = memo(function SessionHeader({
    projectName,
    sessionTitle,
    contextIndicator,
}: SessionHeaderProps) {
    return (
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-phi-border-subtle pl-4 pr-1 sm:pl-5 sm:pr-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[12.5px]">
                <span className="max-w-[min(32vw,240px)] truncate text-phi-text-muted">
                    {projectName || "Choose a Project"}
                </span>
                <span aria-hidden="true" className="shrink-0 text-phi-text-muted">/</span>
                <h1 className="min-w-0 max-w-[min(36vw,220px)] truncate font-semibold text-phi-text-primary">
                    {sessionTitle}
                </h1>
            </div>
            {contextIndicator}
        </header>
    );
});
