import { useCallback, useEffect, useMemo, useState } from "react";
import { getCommands, type CommandsResponse, type SlashCommand } from "../lib/api";

export type UseSlashCommandsReturn = {
  commands: SlashCommand[];
  raw: CommandsResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useSlashCommands(cwd?: string): UseSlashCommandsReturn {
  const [raw, setRaw] = useState<CommandsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCommands(cwd);
      setRaw(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const commands = useMemo(() => raw?.commands ?? [], [raw]);

  return { commands, raw, loading, error, refresh: fetch };
}
