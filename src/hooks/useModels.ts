import { useCallback, useEffect, useMemo, useState } from "react";
import { getModels, setModel as apiSetModel, setThinkingLevel as apiSetThinkingLevel } from "../lib/api";
import type { ModelInfo, ThinkingLevel } from "../types/session";

export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; hasAuth: boolean }>>([]);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await getModels();
      setModels(Array.isArray(data.available) ? data.available : []);
      if (Array.isArray((data as any).providers)) setProviders((data as any).providers);
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

  const setModel = useCallback(async (provider: string, modelId: string) => {
    const res = await apiSetModel({ provider, modelId });
    return res;
  }, []);

  const setThinkingLevel = useCallback(async (level: ThinkingLevel) => {
    const res = await apiSetThinkingLevel(level);
    return res;
  }, []);

  const switchModel = useCallback(
    async (provider: string, modelId: string, level?: ThinkingLevel) => {
      if (level) return apiSetModel({ provider, modelId, thinkingLevel: level });
      return apiSetModel({ provider, modelId });
    },
    [],
  );

  return { models, loading, error, providers, providerIds, refresh, setModel, setThinkingLevel, switchModel };
}
