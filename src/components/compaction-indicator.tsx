import { memo } from "react";
import { BarsArrowDownIcon } from "@heroicons/react/24/solid";
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
        className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 border-x border-t border-phi-error-border bg-phi-error-bg px-3 py-2 text-[12.5px] leading-5"
        style={{
          borderBottom: 0,
          borderRadius: "12px 12px 0 0",
          marginBottom: 0,
        }}
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
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-phi-error-border bg-phi-bg-elevated px-2.5 py-1 text-[11px] font-medium text-phi-error-text hover:bg-phi-overlay"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onDismissError}
            className="rounded-md px-2 py-1 text-[11px] text-phi-text-muted hover:bg-phi-overlay"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-compaction-indicator="running"
      className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 border-x border-t border-phi-border-strong bg-phi-bg-surface px-3 py-2 text-[12.5px] leading-5"
      style={{
        borderBottom: 0,
        borderRadius: "12px 12px 0 0",
        marginBottom: 0,
      }}
    >
      <div className="min-w-0 flex items-center gap-2.5">
        <BarsArrowDownIcon
          aria-hidden
          className="size-5 shrink-0 text-phi-text-tertiary"
        />
        <span className="phi-shimmer truncate font-medium tracking-tight text-phi-text-secondary">
          Compacting transcript
          {customInstructions ? (
            <span className="font-normal text-phi-text-muted"> — {customInstructions.slice(0, 80)}</span>
          ) : null}
          …
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        onClick={onAbort}
        className="!h-7 !rounded-full !px-2.5 !text-[11px] !text-phi-text-secondary hover:!bg-phi-overlay hover:!text-phi-text-primary"
      >
        Abort
      </Button>
    </div>
  );
});
