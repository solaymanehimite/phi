import { useCallback, useState } from "react";
import { Button } from "./ui/button";

type FatalProps = {
  error?: string | null;
  home?: string;
  port?: number;
  agentDir?: string;
  onRetry: () => Promise<void>;
};

export function FatalState({ error, home, port, agentDir, onRetry }: FatalProps) {
  const [showDiag, setShowDiag] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  }, [onRetry]);
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-phi-bg-app px-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-phi-error-bg border border-phi-error-border text-phi-error">
          <span className="text-xl">⚠</span>
        </div>
        <h1 className="text-[20px] font-semibold tracking-tight text-phi-text-primary">Cannot reach Phi sidecar</h1>
        <p className="text-[13px] leading-5 text-phi-text-tertiary">
          The local sidecar at <code className="rounded bg-phi-overlay px-1 py-0.5 font-mono text-[11px] text-phi-text-secondary">127.0.0.1:{port ?? 3001}</code> is unreachable. Check that <code className="rounded bg-phi-overlay px-1 py-0.5 font-mono text-[11px]">bun run dev:server</code> is running.
        </p>
        {error && <p className="rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-left text-[12px] text-phi-error-text">{error}</p>}
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button onClick={handleRetry} variant="primary" className="!h-8 !w-auto !px-4 !text-[13px] !bg-phi-bg-inverse !text-phi-text-inverse hover:!bg-phi-white">
            {retrying ? "Retrying…" : "Retry"}
          </Button>
          <Button onClick={() => setShowDiag((v) => !v)} variant="ghost">
            {showDiag ? "Hide diagnostics" : "Show diagnostics"}
          </Button>
        </div>
        {showDiag && (
          <div className="rounded-lg border border-phi-border bg-phi-bg-surface p-3 text-left text-[12px] leading-5 text-phi-text-tertiary">
            <div>Port: <span className="font-mono text-phi-text-secondary">{port ?? 3001}</span></div>
            <div>Agent dir: <span className="font-mono text-phi-text-secondary break-all">{agentDir ?? "~/.pi"}</span></div>
            <div>Home: <span className="font-mono text-phi-text-secondary break-all">{home ?? "~"}</span></div>
            <div className="mt-2 text-[11px] text-phi-text-muted">Polling every ~3s + manual Retry. Sidecar must be reachable on 127.0.0.1.</div>
          </div>
        )}
      </div>
    </div>
  );
}
