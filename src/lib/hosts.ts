import { LOCAL_HOST, LOCAL_HOST_ID } from "../hooks/useHosts";
import type { Host } from "../hooks/useHosts";
import type { SessionInfo } from "../types/session";

/** Display name for a host id. Unknown ids fall back to the id itself. */
export function hostName(hosts: Host[], hostId?: string | null): string {
  if (!hostId || hostId === LOCAL_HOST_ID) return LOCAL_HOST.name;
  return hosts.find((h) => h.id === hostId)?.name ?? hostId;
}

/** Which run target a session lives on. Sessions without a tag are local. */
export function hostOfSession(session: Pick<SessionInfo, "hostId">): string {
  return session.hostId || LOCAL_HOST_ID;
}
