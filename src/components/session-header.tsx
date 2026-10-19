import { memo, type ReactNode } from "react";

type SessionHeaderProps = {
    sessionTitle: string;
    contextIndicator?: ReactNode;
};

export const SessionHeader = memo(function SessionHeader({
    sessionTitle,
    contextIndicator,
}: SessionHeaderProps) {
    return (
        <header className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-4 bg-phi-bg-main pl-4 pr-1 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-10 after:bg-gradient-to-b after:from-phi-bg-main after:to-transparent sm:pl-5 sm:pr-1.5">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden text-[12.5px]">
                <h1 className="min-w-0 max-w-[min(60vw,460px)] truncate font-semibold text-phi-text-primary">
                    {sessionTitle}
                </h1>
            </div>
            {contextIndicator}
        </header>
    );
});
