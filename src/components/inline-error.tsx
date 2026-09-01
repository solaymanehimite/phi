import { useCallback, useState } from "react";

export type InlineErrorReason = "Abort" | "Interruption" | "Auth" | "Rate limit" | "Provider down" | "Error";

export type InlineError = {
  id: string;
  reason: InlineErrorReason;
  message: string;
  time: string;
  canContinue: boolean;
};

type Props = {
  error: InlineError;
  onContinue?: () => void;
  onDismiss: () => void;
  archived?: boolean;
};

export function InlineErrorBlock({ error, onContinue, onDismiss, archived }: Props) {
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
      className={`mx-auto mt-3 flex w-full max-w-3xl items-start gap-3 rounded-lg border px-3 py-2.5 text-[13px] leading-5 transition-opacity ${archived ? "border-phi-border bg-phi-overlay opacity-60" : "border-phi-error-border bg-phi-error-bg text-phi-error-text"}`}
    >
      <span className={`mt-0.5 shrink-0 ${archived ? "text-phi-text-muted" : "text-phi-error"}`}>⚠</span>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[12.5px] font-medium ${archived ? "text-phi-text-muted" : "text-phi-error-text"}`}>
          {error.reason} · <span className="font-normal opacity-80">{error.time}</span>
        </div>
        <div className={`mt-0.5 break-words text-[12px] leading-5 ${archived ? "text-phi-text-muted" : "text-phi-error-text/90"}`}>{error.message}</div>
        {!archived && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={onContinue}
              disabled={!error.canContinue || !onContinue}
              title={!error.canContinue ? "Cannot continue this stop reason" : undefined}
              className="inline-flex h-7 items-center rounded-md bg-phi-bg-inverse px-3 text-[12px] font-medium text-phi-text-inverse hover:bg-phi-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
            <button onClick={onDismiss} className="inline-flex h-7 items-center rounded-md border border-phi-border bg-transparent px-3 text-[12px] font-medium text-phi-text-secondary hover:bg-phi-overlay">
              Dismiss
            </button>
            <button onClick={handleCopy} className="inline-flex h-7 items-center rounded-md border border-transparent px-2 text-[12px] text-phi-text-muted hover:text-phi-text-secondary">
              {copied ? "Copied!" : "Copy error"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
