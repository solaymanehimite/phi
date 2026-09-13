import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useClose } from "@headlessui/react";
import {
    IconCheckFilled,
    IconChevronDownFilled,
    IconChevronLeft,
    IconPencilFilled,
    IconPlusFilled,
    IconSearch,
    IconTrashFilled,
    IconXFilled,
} from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { LOCAL_HOST_ID, useHosts, type Host, type NewHostInput } from "../hooks/useHosts";
import { health } from "../lib/api";

async function probeHost(host: Host): Promise<boolean> {
    if (host.id === LOCAL_HOST_ID) {
        try {
            await health();
            return true;
        } catch {
            return false;
        }
    }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            const res = await fetch(`${host.url.replace(/\/+$/, "")}/api/health`, { signal: controller.signal });
            return res.ok;
        } finally {
            clearTimeout(timer);
        }
    } catch {
        return false;
    }
}

function useHostReachability(hosts: Host[]): Record<string, boolean> {
    const [status, setStatus] = useState<Record<string, boolean>>({});
    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const entries = await Promise.all(hosts.map(async (host) => [host.id, await probeHost(host)] as const));
            if (cancelled) return;
            setStatus(Object.fromEntries(entries));
        };
        void run();
        const id = window.setInterval(() => void run(), 15000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [hosts]);
    return status;
}

function HostForm({
    nameInputRef,
    title,
    submitLabel,
    initialName = "",
    initialUrl = "",
    initialToken = "",
    onBack,
    onSubmit,
}: {
    nameInputRef: React.RefObject<HTMLInputElement | null>;
    title: string;
    submitLabel: string;
    initialName?: string;
    initialUrl?: string;
    initialToken?: string;
    onBack: () => void;
    onSubmit: (input: NewHostInput) => void;
}) {
    const [name, setName] = useState(initialName);
    const [url, setUrl] = useState(initialUrl);
    const [token, setToken] = useState(initialToken);

    const handleSubmit = useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!name.trim() || !url.trim()) return;
            onSubmit({ name: name.trim(), url: url.trim(), token: token.trim() });
        },
        [name, onSubmit, url, token],
    );

    const canSubmit = name.trim().length > 0 && url.trim().length > 0;
    const inputClass =
        "w-full !border-0 !bg-phi-overlay-strong !px-3 !text-[13px] placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40";

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                <Button variant="icon" size="icon" onClick={onBack} aria-label="Back to hosts" className="!size-7">
                    <IconChevronLeft className="size-5 shrink-0" />
                </Button>
                <p className="min-w-0 flex-1 truncate text-[13px] text-phi-text-primary">{title}</p>
            </div>

            <div className="px-3 py-3">
                <label htmlFor="host-name" className="mb-1.5 block text-[13px] font-medium text-phi-text-primary">
                    Name
                </label>
                <Input
                    id="host-name"
                    ref={nameInputRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Studio machine"
                    aria-label="Host name"
                    spellCheck={false}
                    autoComplete="off"
                    variant="default"
                    className={inputClass}
                />

                <label htmlFor="host-url" className="mb-1.5 mt-3 block text-[13px] font-medium text-phi-text-primary">
                    URL
                </label>
                <Input
                    id="host-url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="http://host:port"
                    aria-label="Host URL"
                    spellCheck={false}
                    autoComplete="off"
                    variant="default"
                    className={inputClass}
                />

                <label htmlFor="host-token" className="mb-1.5 mt-3 block text-[13px] font-medium text-phi-text-primary">
                    Token
                </label>
                <Input
                    id="host-token"
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Sidecar PHI_TOKEN (optional)"
                    aria-label="Host token"
                    spellCheck={false}
                    autoComplete="off"
                    variant="default"
                    className={inputClass}
                />
            </div>

            <div className="flex items-center justify-end gap-1.5 px-2 pb-2 pt-2">
                <Button variant="ghost" size="xs" onClick={onBack} className="!text-[12.5px]">
                    Cancel
                </Button>
                <Button type="submit" variant="primary" size="xs" disabled={!canSubmit} className="!rounded-md !text-[12.5px]">
                    {submitLabel}
                </Button>
            </div>
        </form>
    );
}

type PanelMode = "list" | "create" | "edit";

function StatusDot({ online }: { online: boolean | undefined }) {
    return (
        <span
            aria-hidden
            title={online === undefined ? "Checking…" : online ? "Reachable" : "Unreachable"}
            className={`size-1.5 shrink-0 rounded-full ${
                online === undefined ? "bg-phi-text-faint" : online ? "bg-phi-thinking-low" : "bg-phi-error-text"
            }`}
        />
    );
}

// Local-host mark: Tabler's filled home with the door split into its own
// path so it can slide open (pocket-door collapse into the left jamb) when
// the picker row is hovered. Resting pixels match IconHomeFilled exactly.
const HOME_BODY_D =
    "M12.707 2.293l9 9c.63 .63 .184 1.707 -.707 1.707h-1v6a3 3 0 0 1 -3 3h-1v-7a3 3 0 0 0 -2.824 -2.995l-.176 -.005h-2a3 3 0 0 0 -3 3v7h-1a3 3 0 0 1 -3 -3v-6h-1c-.89 0 -1.337 -1.077 -.707 -1.707l9 -9a1 1 0 0 1 1.414 0";
const HOME_DOOR_D = "M13 14a1 1 0 0 1 1 1v7h-4v-7a1 1 0 0 1 .883 -.993L11 14z";

// Tabler's filled cloud path, reused for every drift layer.
const CLOUD_D =
    "M10.04 4.305c2.195 -.667 4.615 -.224 6.36 1.176c1.386 1.108 2.188 2.686 2.252 4.34l.003 .212l.091 .003c2.3 .107 4.143 1.961 4.25 4.27l.004 .211c0 2.407 -1.885 4.372 -4.255 4.482l-.21 .005h-11.878l-.222 -.008c-2.94 -.11 -5.317 -2.399 -5.43 -5.263l-.005 -.216c0 -2.747 2.08 -5.01 4.784 -5.417l.114 -.016l.07 -.181c.663 -1.62 2.056 -2.906 3.829 -3.518l.244 -.08z";

export function LocalHomeIcon({ className = "size-4 shrink-0" }: { className?: string }) {
    return (
        <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            className={className}
        >
            <path d={HOME_BODY_D} />
            <path
                d={HOME_DOOR_D}
                className="origin-left [transform-box:fill-box] transition-transform duration-300 ease-out group-hover:scale-x-0 motion-reduce:transition-none"
            />
        </svg>
    );
}

export function RemoteCloudIcon({ className = "size-4 shrink-0" }: { className?: string }) {
    return (
        <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            className={`overflow-hidden ${className}`}
        >
            <g className="phi-cloud-main">
                <path d={CLOUD_D} />
            </g>
            <g className="phi-cloud-puff1 text-phi-text-muted">
                <g transform="translate(12 14.5) scale(0.5) translate(-12 -12)">
                    <path d={CLOUD_D} />
                </g>
            </g>
            <g className="phi-cloud-puff2 text-phi-text-muted">
                <g transform="translate(12 10) scale(0.34) translate(-12 -12)">
                    <path d={CLOUD_D} />
                </g>
            </g>
            <g className="phi-cloud-puff3 text-phi-text-muted">
                <g transform="translate(12 11) scale(0.65) translate(-12 -12)">
                    <path d={CLOUD_D} />
                </g>
            </g>
            <g className="phi-cloud-incoming">
                <path d={CLOUD_D} />
            </g>
        </svg>
    );
}

export function HostPicker({ disabled }: { disabled?: boolean }) {
    return (
        <Popover className="relative min-w-0 w-full">
            <HostTrigger disabled={disabled} />
            <PopoverContent anchor={{ to: "top start", gap: 12 }} className="w-max max-w-[min(360px,calc(100vw-32px))] overflow-hidden p-0">
                <HostPanel />
            </PopoverContent>
        </Popover>
    );
}

function HostTrigger({ disabled }: { disabled?: boolean }) {
    const { activeHost } = useHosts();
    const isLocal = activeHost.id === LOCAL_HOST_ID;
    // One-shot cloud drift: fired on hover, runs to completion on a timer
    // so leaving the row mid-flight never cuts it short.
    const [cloudPlaying, setCloudPlaying] = useState(false);
    const cloudTimer = useRef<number | null>(null);
    useEffect(
        () => () => {
            if (cloudTimer.current != null) window.clearTimeout(cloudTimer.current);
        },
        [],
    );
    const handleMouseEnter = useCallback(() => {
        if (isLocal || cloudPlaying) return;
        setCloudPlaying(true);
        if (cloudTimer.current != null) window.clearTimeout(cloudTimer.current);
        cloudTimer.current = window.setTimeout(() => {
            cloudTimer.current = null;
            setCloudPlaying(false);
        }, 1400);
    }, [isLocal, cloudPlaying]);
    return (
        <PopoverTrigger
            disabled={disabled}
            data-host-picker-trigger
            onMouseEnter={handleMouseEnter}
            className={`group flex w-full min-w-0 items-center gap-2 rounded-lg h-8 px-2.5 text-left text-[13px] font-medium text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60${cloudPlaying ? " phi-cloud-play" : ""}`}
            aria-label={`Change host${activeHost ? `, currently ${activeHost.name}` : ""}`}
        >
            {isLocal ? (
                <LocalHomeIcon />
            ) : (
                <RemoteCloudIcon />
            )}
            <span className="min-w-0 flex-1 truncate text-left">{activeHost.name}</span>
            <IconChevronDownFilled className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
        </PopoverTrigger>
    );
}

function HostPanel() {
    const close = useClose();
    const { hosts, activeHostId, setActiveHostId, addHost, updateHost, removeHost } = useHosts();
    const [mode, setMode] = useState<PanelMode>("list");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const listRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

    const editingHost = editingId ? (hosts.find((h) => h.id === editingId) ?? null) : null;
    const allHosts: Host[] = useMemo(
        () => [{ id: LOCAL_HOST_ID, name: "Local", url: "", token: "" }, ...hosts],
        [hosts],
    );
    const reachability = useHostReachability(allHosts);

    // Morph the popover height to fit the active view.
    useLayoutEffect(() => {
        const el = mode === "list" ? listRef.current : formRef.current;
        if (!el) return;
        const update = () => setContentHeight(el.offsetHeight);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, editingId]);

    // Keep focus on the active view's input across the morph.
    useEffect(() => {
        if (mode === "list") searchInputRef.current?.focus();
        else nameInputRef.current?.focus();
    }, [mode]);

    const filteredHosts = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return allHosts;
        return allHosts.filter(
            (host) => host.name.toLowerCase().includes(term) || host.url.toLowerCase().includes(term),
        );
    }, [allHosts, query]);

    const selectHost = useCallback(
        (id: string) => {
            setActiveHostId(id);
            close();
        },
        [close, setActiveHostId],
    );

    const handleModeChange = useCallback((next: PanelMode) => {
        if (next === "list") setEditingId(null);
        setMode(next);
    }, []);

    const handleEditHost = useCallback((host: Host) => {
        setEditingId(host.id);
        setMode("edit");
    }, []);

    const handleFormSubmit = useCallback(
        (input: NewHostInput) => {
            if (mode === "edit" && editingHost) {
                updateHost(editingHost.id, input);
                setMode("list");
                return;
            }
            const created = addHost(input);
            selectHost(created.id);
        },
        [addHost, editingHost, mode, selectHost, updateHost],
    );

    const handleSearchKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                event.preventDefault();
                if (filteredHosts.length > 0) selectHost(filteredHosts[0].id);
            }
        },
        [filteredHosts, selectHost],
    );

    const listActive = mode === "list";
    return (
        <div
            className={`relative max-w-full overflow-hidden transition-[height,width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${listActive ? "w-[304px]" : "w-[344px]"}`}
            style={contentHeight !== undefined ? { height: contentHeight } : undefined}
        >
            <div
                ref={listRef}
                inert={!listActive}
                aria-hidden={!listActive}
                className={`w-full transition-opacity duration-150 motion-reduce:transition-none ${listActive ? "relative opacity-100" : "pointer-events-none absolute inset-x-0 top-0 opacity-0"}`}
            >
                <div className="flex items-center gap-2 border-b border-phi-border-faint px-3 pb-3 pt-3">
                    <IconSearch className="size-3.5 shrink-0 text-phi-text-muted" />
                    <input
                        ref={searchInputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search hosts"
                        aria-label="Search hosts"
                        spellCheck={false}
                        className="min-w-0 flex-1 bg-transparent text-sm text-phi-text-primary outline-none placeholder:text-phi-text-tertiary"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery("")}
                            className="text-phi-text-muted hover:text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                            aria-label="Clear search"
                        >
                            <IconXFilled className="size-3.5" />
                        </button>
                    )}
                </div>

                <div className="max-h-56 overflow-y-auto px-1.5 pt-1.5">
                    {filteredHosts.length > 0 ? (
                        filteredHosts.map((host) => {
                            const selected = host.id === activeHostId;
                            const isLocal = host.id === LOCAL_HOST_ID;
                            const online = reachability[host.id];
                            return (
                                <div
                                    key={host.id}
                                    className="group flex w-full items-center gap-1 rounded-lg pr-1 hover:bg-phi-overlay-strong focus-within:bg-phi-overlay-strong"
                                >
                                    <button
                                        type="button"
                                        onClick={() => selectHost(host.id)}
                                        title={isLocal ? "Local — this machine" : `${host.name} — ${host.url}`}
                                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-left text-[13px] text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                                    >
                                        {selected ? (
                                            <IconCheckFilled className="size-4 shrink-0 text-phi-text-secondary" />
                                        ) : (
                                            <span aria-hidden="true" className="size-4 shrink-0" />
                                        )}
                                        <span className="min-w-0 flex-1 truncate font-medium">{host.name}</span>
                                        <StatusDot online={online} />
                                    </button>
                                    {!isLocal && (
                                        <button
                                            type="button"
                                            onClick={() => handleEditHost(host)}
                                            title={`Edit ${host.name}`}
                                            aria-label={`Edit ${host.name}`}
                                            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-phi-text-muted opacity-0 hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 group-hover:opacity-100"
                                        >
                                            <IconPencilFilled className="size-3.5" />
                                        </button>
                                    )}
                                    {!isLocal && (
                                        <button
                                            type="button"
                                            onClick={() => removeHost(host.id)}
                                            title={`Remove ${host.name}`}
                                            aria-label={`Remove ${host.name}`}
                                            className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-phi-text-muted opacity-0 hover:bg-phi-overlay-hover hover:text-phi-error-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 group-hover:opacity-100"
                                        >
                                            <IconTrashFilled className="size-3.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="px-2.5 py-6 text-center">
                            <p className="text-[12.5px] font-medium text-phi-text-secondary">No matching hosts</p>
                        </div>
                    )}
                </div>

                <div className="px-1.5 pb-1.5">
                    <button
                        type="button"
                        onClick={() => handleModeChange("create")}
                        className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-phi-text-secondary hover:bg-phi-overlay-strong hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                    >
                        <span className="shrink-0 text-phi-text-tertiary group-hover:text-phi-text-secondary">
                            <IconPlusFilled className="size-4" />
                        </span>
                        New host
                    </button>
                </div>
            </div>
            <div
                ref={formRef}
                inert={listActive}
                aria-hidden={listActive}
                className={`w-full transition-opacity duration-150 motion-reduce:transition-none ${listActive ? "pointer-events-none absolute inset-x-0 top-0 opacity-0" : "relative opacity-100"}`}
            >
                <HostForm
                    key={mode === "edit" ? (editingHost?.id ?? "edit") : "create"}
                    nameInputRef={nameInputRef}
                    title={mode === "edit" ? "Edit host" : "New host"}
                    submitLabel={mode === "edit" ? "Save changes" : "Add host"}
                    initialName={mode === "edit" ? (editingHost?.name ?? "") : ""}
                    initialUrl={mode === "edit" ? (editingHost?.url ?? "") : ""}
                    initialToken={mode === "edit" ? (editingHost?.token ?? "") : ""}
                    onBack={() => handleModeChange("list")}
                    onSubmit={handleFormSubmit}
                />
            </div>
        </div>
    );
}
