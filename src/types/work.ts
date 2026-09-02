export type WorkOrder = {
  message: number;
  content: number;
};

export type WorkItem =
  | {
      kind: "thinking";
      id: string;
      text: string;
      order: WorkOrder;
    }
  | {
      kind: "tool";
      id: string;
      name: string;
      args: Record<string, unknown>;
      result?: { text: string; isError: boolean; diff?: string };
      partial?: string;
      done?: boolean;
      startedAt?: number;
      durationMs?: number;
      order: WorkOrder;
    };
