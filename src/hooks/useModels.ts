import { useCallback, useEffect, useMemo, useState } from "react";
import { getModels, setModel as apiSetModel, setThinkingLevel as apiSetThinkingLevel } from "../lib/api";
import type { ModelInfo, ThinkingLevel } from "../types/session";

export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; hasAuth: boolean }>>([]);
  // Pi's actual default for a fresh session — used as the new-chat display
  // value so the selector never flashes list[0]. Populated by the same
  // /api/models fetch (no extra request, server-cached).
  const [defaultModel, setDefaultModel] = useState<ModelInfo | null>(null);
  const [defaultThinkingLevel, setDefaultThinkingLevel] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { silent?: boolean; cwd?: string }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await getModels(opts?.cwd);
      setModels(Array.isArray(data.available) ? data.available : []);
      if (Array.isArray((data as any).providers)) setProviders((data as any).providers);
      setDefaultModel(data.default ?? null);
      setDefaultThinkingLevel(data.defaultThinkingLevel ?? null);
      if ((data as any).error) {
        // non-fatal: still show models but surface banner
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // derived grouping helpers for selector categories
  const providerIds = useMemo(() => [...new Set(models.map((m) => m.provider))].sort(), [models]);

  const defaultModelKey = useMemo(
    () => (defaultModel ? `${defaultModel.provider}/${defaultModel.id}` : undefined),
    [defaultModel],
  );

  const setModel = useCallback(async (sessionFile: string, provider: string, modelId: string) => {
    return apiSetModel({ sessionFile, provider, modelId });
  }, []);

  const setThinkingLevel = useCallback(async (sessionFile: string, level: ThinkingLevel) => {
    return apiSetThinkingLevel(sessionFile, level);
  }, []);

  const switchModel = useCallback(
    async (sessionFile: string, provider: string, modelId: string, level?: ThinkingLevel) => {
      if (level) return apiSetModel({ sessionFile, provider, modelId, thinkingLevel: level });
      return apiSetModel({ sessionFile, provider, modelId });
    },
    [],
  );

  return { models, loading, error, providers, providerIds, defaultModel, defaultModelKey, defaultThinkingLevel, refresh, setModel, setThinkingLevel, switchModel };
}
