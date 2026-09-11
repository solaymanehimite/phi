import { useCallback, useState } from "react";
import { IconPlayerPauseFilled } from "@tabler/icons-react";
import { Button } from "./ui/button";

export type InlineErrorReason = "Abort" | "Interruption" | "Auth" | "Rate limit" | "Provider down" | "Error";

export type InlineError = {
  id: string;
  reason: InlineErrorReason;
  message: string;
  time: string;
  canContinue: boolean;
};

export function isInterruption(reason: InlineErrorReason): boolean {
  return reason === "Abort" || reason === "Interruption";
}

type InterruptedProps = {
  onContinue?: () => void;
};

/** Minimal inline row for user interrupts — no card, no dismiss. Cleared on next send. */
export function InterruptedBlock({ onContinue }: InterruptedProps) {
  return (
    <div className="flex w-full items-center gap-3 py-1 pb-6">
      <span className="flex items-center gap-1.5 text-[12px] text-phi-text-muted">
        <IconPlayerPauseFilled className="size-3.5" aria-hidden />
        Interrupted
      </span>
      <Button onClick={onContinue} variant="ghost" size="xs" className="!text-[12px]">
        Continue?
      </Button>
    </div>
  );
}

type Props = {
  error: InlineError;
  onContinue?: () => void;
  onDismiss: () => void;
};

export function InlineErrorBlock({ error, onContinue, onDismiss }: Props) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(error.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = error.message;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  }, [error.message]);

  return (
    <div
      className="mx-auto mt-3 flex w-full max-w-4xl items-start gap-3 rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2.5 text-[13px] leading-5 text-phi-error-text"
    >
      <span className="mt-0.5 shrink-0 text-phi-error">⚠</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium text-phi-error-text">
          {error.reason} · <span className="font-normal opacity-80">{error.time}</span>
        </div>
        <div className="mt-0.5 break-words text-[12px] leading-5 text-phi-error-text/90">{error.message}</div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            onClick={onContinue}
            disabled={!error.canContinue || !onContinue}
            title={!error.canContinue ? "Cannot continue this stop reason" : undefined}
            variant="primary"
            size="xs"
            className="!rounded-md"
          >
            Continue
          </Button>
          <Button onClick={onDismiss} variant="secondary" size="xs" className="!rounded-md !border-phi-border !bg-transparent">
            Dismiss
          </Button>
          <Button onClick={handleCopy} variant="ghost" size="xs" className="!text-phi-text-muted hover:!text-phi-text-secondary">
            {copied ? "Copied!" : "Copy error"}
          </Button>
        </div>
      </div>
    </div>
  );
}
