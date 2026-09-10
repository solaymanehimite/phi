import { memo } from "react";
import { IconRefresh, IconX } from "@tabler/icons-react";
import { Button } from "./ui/button";

type Props = {
  customInstructions?: string | null;
  error?: string | null;
  canRetry?: boolean;
  onAbort: () => void;
  onRetry?: () => void;
  onDismissError?: () => void;
};

export const CompactionIndicator = memo(function CompactionIndicator({
  customInstructions,
  error,
  canRetry,
  onAbort,
  onRetry,
  onDismissError,
}: Props) {
  if (error) {
    return (
      <div
        data-compaction-indicator="error"
        className="mx-auto flex w-[calc(100%-2rem)] max-w-2xl items-center justify-between gap-2 rounded-b-none rounded-t-xl border-x border-b-0 border-t border-phi-error-border bg-phi-error-bg px-3 py-2 text-[12.5px] leading-5"
      >
        <div className="min-w-0 flex items-center gap-2">
          <span
            aria-hidden
            className="grid size-5 shrink-0 place-items-center text-phi-error-text"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 8v5" strokeLinecap="round" />
              <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
              <path d="M10.9 3.1a1.5 1.5 0 0 1 2.2 0l7 7.6a1.5 1.5 0 0 1 0 2l-7 7.6a1.5 1.5 0 0 1-2.2 0l-7-7.6a1.5 1.5 0 0 1 0-2l7-7.6Z" />
            </svg>
          </span>
          <span className="truncate font-medium text-phi-error-text">Compaction failed</span>
          <span className="hidden truncate text-phi-error-text/80 sm:inline">— {error}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canRetry && onRetry && (
            <Button
              type="button"
              onClick={onRetry}
              variant="secondary"
              size="xs"
              className="!border-phi-error-border !bg-phi-bg-elevated !text-[11px] !text-phi-error-text"
            >
              Retry
            </Button>
          )}
          <Button
            type="button"
            onClick={onDismissError}
            variant="ghost"
            size="xs"
            className="!text-[11px] !text-phi-text-muted"
          >
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-compaction-indicator="running"
      className="mx-auto flex w-[calc(100%-2rem)] max-w-2xl min-w-0 items-center gap-1.5 rounded-b-none rounded-t-xl border-x border-b-0 border-t border-phi-border-strong bg-phi-bg-surface px-3 py-2"
    >
      <IconRefresh
        aria-hidden
        className="size-4 shrink-0 animate-spin text-phi-text-tertiary"
      />
      <span className="min-w-0 flex-1 truncate text-[14px] leading-6 text-phi-text-secondary" title={customInstructions ?? undefined}>
        Compacting transcript
        {customInstructions ? (
          <span className="text-phi-text-muted"> — {customInstructions.slice(0, 80)}</span>
        ) : null}
        …
      </span>
      <Button
        type="button"
        variant="icon"
        aria-label="Abort compaction"
        title="Abort"
        onClick={onAbort}
      >
        <IconX className="size-4" />
      </Button>
    </div>
  );
});
