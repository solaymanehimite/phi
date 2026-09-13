import { useCallback, useSyncExternalStore } from "react";

export type Host = {
  id: string;
  name: string;
  /** Base URL of the remote sidecar, e.g. http://192.168.1.10:3001 (no trailing slash). */
  url: string;
  token: string;
};

export type NewHostInput = {
  name: string;
  url: string;
  token?: string;
};

export const LOCAL_HOST_ID = "local";
export const LOCAL_HOST: Host = { id: LOCAL_HOST_ID, name: "Local", url: "", token: "" };

const HOSTS_KEY = "phi:hosts-v1";
const ACTIVE_HOST_KEY = "phi:active-host-v1";

export const HOSTS_CHANGED_EVENT = "phi:hosts-changed";

function notifyHostsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HOSTS_CHANGED_EVENT));
  }
}

export function normalizeHostUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function sanitizeHosts(value: unknown): Host[] {
  if (!Array.isArray(value)) return [];
  const out: Host[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const h = item as Partial<Host>;
    if (typeof h.name !== "string" || !h.name.trim()) continue;
    if (typeof h.url !== "string" || !normalizeHostUrl(h.url)) continue;
    const id = typeof h.id === "string" && h.id && h.id !== LOCAL_HOST_ID ? h.id : createHostId();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: h.name.trim(),
      url: normalizeHostUrl(h.url),
      token: typeof h.token === "string" ? h.token : "",
    });
  }
  return out;
}

export function createHostId(): string {
  return `host_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}

function readStoredHosts(): Host[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HOSTS_KEY);
    if (raw === null) return [];
    return sanitizeHosts(JSON.parse(raw));
  } catch {
    return [];
  }
}

function readStoredActiveHostId(): string {
  if (typeof window === "undefined") return LOCAL_HOST_ID;
  try {
    const raw = window.localStorage.getItem(ACTIVE_HOST_KEY);
    if (!raw) return LOCAL_HOST_ID;
    const id = JSON.parse(raw) as unknown;
    return typeof id === "string" && id ? id : LOCAL_HOST_ID;
  } catch {
    return LOCAL_HOST_ID;
  }
}

function writeStoredHosts(hosts: Host[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HOSTS_KEY, JSON.stringify(hosts));
  } catch (e) {
    console.warn("[phi] failed to persist hosts", e);
  }
}

function writeStoredActiveHostId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_HOST_KEY, JSON.stringify(id));
  } catch (e) {
    console.warn("[phi] failed to persist active host", e);
  }
}

// ---- module-level external store ----
// Both the sidebar popover and Settings read/write through this store, so
// CRUD in one surface is immediately visible in the other (same-tab updates
// don't fire `storage` events, so a plain useState-per-hook would go stale).

let hostsSnapshot: Host[] = readStoredHosts();
let activeHostIdSnapshot: string = readStoredActiveHostId();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
  notifyHostsChanged();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getHostsSnapshot(): Host[] {
  return hostsSnapshot;
}

function getActiveHostIdSnapshot(): string {
  return activeHostIdSnapshot;
}

function refreshFromStorage() {
  hostsSnapshot = readStoredHosts();
  activeHostIdSnapshot = readStoredActiveHostId();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== HOSTS_KEY && e.key !== ACTIVE_HOST_KEY) return;
    refreshFromStorage();
    emit();
  });
}

/** Sync reader for non-React callers (e.g. the API layer). */
export function getStoredHosts(): Host[] {
  refreshFromStorage();
  return hostsSnapshot;
}

/** Sync reader for non-React callers (e.g. the API layer). */
export function getStoredActiveHostId(): string {
  refreshFromStorage();
  return activeHostIdSnapshot;
}

/** Sync reader for non-React callers (e.g. the API layer). */
export function getStoredActiveHost(): Host {
  refreshFromStorage();
  return activeHostIdSnapshot === LOCAL_HOST_ID
    ? LOCAL_HOST
    : (hostsSnapshot.find((h) => h.id === activeHostIdSnapshot) ?? LOCAL_HOST);
}

export function setStoredActiveHostId(id: string) {
  activeHostIdSnapshot = id || LOCAL_HOST_ID;
  writeStoredActiveHostId(activeHostIdSnapshot);
  emit();
}

export function addStoredHost(input: NewHostInput): Host {
  const host: Host = {
    id: createHostId(),
    name: input.name.trim(),
    url: normalizeHostUrl(input.url),
    token: input.token?.trim() ?? "",
  };
  if (!host.name) throw new Error("Host name is required");
  if (!host.url) throw new Error("Host URL is required");
  hostsSnapshot = [...hostsSnapshot, host];
  writeStoredHosts(hostsSnapshot);
  emit();
  return host;
}

export function updateStoredHost(id: string, patch: Partial<Pick<Host, "name" | "url" | "token">>) {
  hostsSnapshot = hostsSnapshot.map((h) => {
    if (h.id !== id) return h;
    return {
      ...h,
      name: patch.name !== undefined ? patch.name.trim() || h.name : h.name,
      url: patch.url !== undefined ? normalizeHostUrl(patch.url) || h.url : h.url,
      token: patch.token !== undefined ? patch.token : h.token,
    };
  });
  writeStoredHosts(hostsSnapshot);
  emit();
}

export function removeStoredHost(id: string) {
  if (id === LOCAL_HOST_ID) return;
  hostsSnapshot = hostsSnapshot.filter((h) => h.id !== id);
  writeStoredHosts(hostsSnapshot);
  if (activeHostIdSnapshot === id) {
    activeHostIdSnapshot = LOCAL_HOST_ID;
    writeStoredActiveHostId(activeHostIdSnapshot);
  }
  emit();
}

export function useHosts() {
  const hosts = useSyncExternalStore(subscribe, getHostsSnapshot, () => [] as Host[]);
  const activeHostId = useSyncExternalStore(subscribe, getActiveHostIdSnapshot, () => LOCAL_HOST_ID);
  const activeHost: Host =
    activeHostId === LOCAL_HOST_ID ? LOCAL_HOST : (hosts.find((h) => h.id === activeHostId) ?? LOCAL_HOST);

  const setActiveHostId = useCallback((id: string) => {
    setStoredActiveHostId(id);
  }, []);

  const addHost = useCallback((input: NewHostInput) => addStoredHost(input), []);
  const updateHost = useCallback(
    (id: string, patch: Partial<Pick<Host, "name" | "url" | "token">>) => updateStoredHost(id, patch),
    [],
  );
  const removeHost = useCallback((id: string) => removeStoredHost(id), []);

  return { hosts, activeHost, activeHostId, setActiveHostId, addHost, updateHost, removeHost };
}
