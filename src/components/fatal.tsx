import { useCallback, useState } from "react";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { InlineCode } from "./ui/code";

type FatalProps = { error?: string | null; home?: string; port?: number; agentDir?: string; onRetry: () => Promise<void> };

export function FatalState({ error, home, port, agentDir, onRetry }: FatalProps) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => { setRetrying(true); try { await onRetry(); } finally { setRetrying(false); } }, [onRetry]);
  return <div className="flex h-screen w-screen flex-col items-center justify-center bg-phi-bg-app px-6 text-center"><div className="max-w-md space-y-4"><div className="mx-auto grid size-12 place-items-center rounded-xl border border-phi-error-border bg-phi-error-bg text-xl text-phi-error">⚠</div><h1 className="text-[20px] font-semibold tracking-tight text-phi-text-primary">Cannot reach the local sidecar</h1><p className="text-[13px] leading-5 text-phi-text-tertiary">The local sidecar at <InlineCode className="text-[11px]">127.0.0.1:{port ?? 3001}</InlineCode> is unreachable. Check that Phi is running correctly.</p>{error && <Alert variant="error" className="text-left">{error}</Alert>}<div className="flex items-center justify-center gap-2 pt-2"><Button onClick={retry} variant="primary" size="sm" className="!w-auto">{retrying ? "Retrying…" : "Retry"}</Button><Button onClick={() => setShowDiagnostics((visible) => !visible)} variant="ghost">{showDiagnostics ? "Hide diagnostics" : "Show diagnostics"}</Button></div>{showDiagnostics && <div className="rounded-lg border border-phi-border bg-phi-bg-surface p-3 text-left text-[12px] leading-5 text-phi-text-tertiary"><div>Port: <span className="font-mono text-phi-text-secondary">{port ?? 3001}</span></div><div>Agent dir: <span className="font-mono text-phi-text-secondary break-all">{agentDir ?? "~/.pi"}</span></div><div>Home: <span className="font-mono text-phi-text-secondary break-all">{home ?? "~"}</span></div></div>}</div></div>;
}
