import { useCallback, useEffect, useState } from "react";
import { listFiles, type ProjectFile } from "../lib/api";

export type UseProjectFilesReturn = {
  files: ProjectFile[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useProjectFiles(cwd?: string): UseProjectFilesReturn {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!cwd) {
      setFiles([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listFiles(cwd);
      setFiles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { files, loading, error, refresh: fetch };
}
