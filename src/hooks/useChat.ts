import { useCallback, useState } from "react";
import { getMessages } from "../lib/api";
import type { SessionMessagesResponse } from "../types/session";

export function useChat() {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [data, setData] = useState<SessionMessagesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFile = useCallback(async (file: string) => {
    setActiveFile(file);
    setLoading(true);
    setError(null);
    try {
      const res = await getMessages(file);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setActiveFile(null);
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!activeFile) return;
    await openFile(activeFile);
  }, [activeFile, openFile]);

  return { activeFile, data, loading, error, openFile, clear, refresh, setActiveFile };
}
