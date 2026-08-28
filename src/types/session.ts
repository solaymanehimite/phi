// Mirrors server's SessionManager.SessionInfo + messages context
// Keep in sync with node_modules/@earendil-works/pi-coding-agent session-manager.d.ts

export type SessionInfo = {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: string; // ISO — server serializes Date as string
  modified: string;
  messageCount: number;
  firstMessage: string;
  allMessagesText: string;
};

export type SessionHeader = {
  type: "session";
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
};

export type SessionEntry = {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  // other fields depend on type — keep loose for Phase 1
  [key: string]: unknown;
};

export type SessionContext = {
  messages: AgentMessage[];
  thinkingLevel: string;
  model: { provider: string; modelId: string } | null;
};

export type AgentMessage = {
  role: "user" | "assistant" | "toolResult" | "bashExecution" | "custom" | "branchSummary" | "compactionSummary";
  // SDK's AgentMessage is richer; we keep minimal for Phase 1 read
  content?: unknown;
  text?: string;
  // allow extra
  [key: string]: unknown;
};

export type SessionMessagesResponse = {
  file: string;
  header: SessionHeader | null;
  entries: SessionEntry[];
  context: SessionContext;
  sessionName?: string;
  cwd: string;
};

export type ApiError = { error: string };
