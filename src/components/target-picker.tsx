import { useCallback, useEffect, useRef, useState } from "react";
import { useClose } from "@headlessui/react";
import {
    IconCheckFilled,
    IconChevronDownFilled,
    IconChevronLeft,
    IconPlusFilled,
} from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { LOCAL_HOST, LOCAL_HOST_ID, type Host } from "../hooks/useHosts";
import { LocalHomeIcon, RemoteCloudIcon } from "./host-picker";

export function TargetIcon({ hostId, className = "size-3.5 shrink-0" }: { hostId?: string | null; className?: string }) {
    return hostId && hostId !== LOCAL_HOST_ID ? (
        <RemoteCloudIcon className={className} />
    ) : (
        <LocalHomeIcon className={className} />
    );
}

type TargetPickerProps = {
    /** All remote hosts. Local is always listed first. */
    hosts: Host[];
    /** Currently selected run target. */
    value: string;
    /** Hosts the active project is set up on. */
    boundHostIds: string[];
    projectName: string;
    onChange: (hostId: string) => void;
    /** Bind an unlisted host to the project, then select it. */
    onBind: (hostId: string, path: string) => void;
    disabled?: boolean;
};

const inputClass =
    "w-full !border-0 !bg-phi-overlay-strong !px-3 !text-[13px] placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40";

export function TargetPicker({
    hosts,
    value,
    boundHostIds,
    projectName,
    onChange,
    onBind,
    disabled,
}: TargetPickerProps) {
    return (
        <Popover className="relative min-w-0 shrink-0">
            <PopoverTrigger
                disabled={disabled}
                data-target-picker-trigger
                className="group inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-phi-text-secondary transition-colors hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-60"
                aria-label={`Change run target${boundHostIds.includes(value) ? `, currently ${hosts.find((h) => h.id === value)?.name ?? (value === LOCAL_HOST_ID ? LOCAL_HOST.name : value)}` : ""}`}
            >
                <TargetIcon hostId={value} className="size-4 shrink-0 text-phi-text-secondary" />
                <span className="min-w-0 truncate text-[12.5px] font-medium">
                    {value === LOCAL_HOST_ID
                        ? LOCAL_HOST.name
                        : (hosts.find((h) => h.id === value)?.name ?? value)}
                </span>
                <IconChevronDownFilled className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
            </PopoverTrigger>
            <PopoverContent
                anchor={{ to: "top start", gap: 12 }}
                className="w-max max-w-[min(360px,calc(100vw-32px))] overflow-hidden p-0"
            >
                <TargetPanel
                    hosts={hosts}
                    value={value}
                    boundHostIds={boundHostIds}
                    projectName={projectName}
                    onChange={onChange}
                    onBind={onBind}
                />
            </PopoverContent>
        </Popover>
    );
}

function TargetPanel({
    hosts,
    value,
    boundHostIds,
    projectName,
    onChange,
    onBind,
}: {
    hosts: Host[];
    value: string;
    boundHostIds: string[];
    projectName: string;
    onChange: (hostId: string) => void;
    onBind: (hostId: string, path: string) => void;
}) {
    const close = useClose();
    const [bindingId, setBindingId] = useState<string | null>(null);
    const [bindPath, setBindPath] = useState("");
    const [bindError, setBindError] = useState<string | null>(null);
    const bindInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (bindingId) {
            setBindPath("");
            setBindError(null);
            const t = window.setTimeout(() => bindInputRef.current?.focus(), 60);
            return () => window.clearTimeout(t);
        }
    }, [bindingId]);

    const all: Host[] = [LOCAL_HOST, ...hosts];
    const boundSet = new Set(boundHostIds);

    const select = useCallback(
        (id: string) => {
            onChange(id);
            close();
        },
        [close, onChange],
    );

    const submitBind = useCallback(() => {
        if (!bindingId) return;
        const path = bindPath.trim();
        if (!path) {
            setBindError("Type the absolute path on that host.");
            return;
        }
        try {
            onBind(bindingId, path);
        } catch (e) {
            setBindError(e instanceof Error ? e.message : String(e));
            return;
        }
        setBindingId(null);
        close();
    }, [bindingId, bindPath, close, onBind]);

    if (bindingId) {
        const host = all.find((h) => h.id === bindingId);
        return (
            <div className="w-[304px]">
                <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                    <Button variant="icon" size="icon" onClick={() => setBindingId(null)} aria-label="Back to targets" className="!size-7">
                        <IconChevronLeft className="size-5 shrink-0" />
                    </Button>
                    <p className="min-w-0 flex-1 truncate text-[13px] text-phi-text-primary">
                        Set up on {host?.name ?? bindingId}
                    </p>
                </div>
                <div className="px-3 py-3">
                    <p className="mb-1.5 text-[12px] leading-5 text-phi-text-muted">
                        {projectName ? `${projectName} isn't` : "This project isn't"} checked out on{" "}
                        {host?.name ?? "that host"} yet. Type its absolute path there.
                    </p>
                    <Input
                        ref={bindInputRef}
                        value={bindPath}
                        onChange={(e) => setBindPath(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                submitBind();
                            }
                        }}
                        placeholder="/home/you/code/project"
                        aria-label="Workspace path on host"
                        spellCheck={false}
                        autoComplete="off"
                        variant="default"
                        className={inputClass}
                    />
                    {bindError && (
                        <p className="mt-1.5 text-[11px] leading-4 text-phi-error-text">{bindError}</p>
                    )}
                </div>
                <div className="flex items-center justify-end gap-1.5 px-2 pb-2 pt-2">
                    <Button variant="ghost" size="xs" onClick={() => setBindingId(null)} className="!text-[12.5px]">
                        Cancel
                    </Button>
                    <Button type="button" variant="primary" size="xs" onClick={submitBind} disabled={!bindPath.trim()} className="!rounded-md !text-[12.5px]">
                        Set up
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-[304px] px-1.5 py-1.5">
            {all.map((host) => {
                const bound = boundSet.has(host.id);
                const selected = host.id === value;
                return (
                    <div
                        key={host.id}
                        className="group flex w-full items-center gap-1 rounded-lg pr-1 hover:bg-phi-overlay-strong focus-within:bg-phi-overlay-strong"
                    >
                        <button
                            type="button"
                            onClick={() => (bound ? select(host.id) : setBindingId(host.id))}
                            title={bound ? `Run on ${host.name}` : `Set ${projectName || "project"} up on ${host.name}`}
                            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-left text-[13px] text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                        >
                            {selected ? (
                                <IconCheckFilled className="size-4 shrink-0 text-phi-text-secondary" />
                            ) : (
                                <span aria-hidden="true" className="size-4 shrink-0" />
                            )}
                            <TargetIcon hostId={host.id} />
                            <span className="min-w-0 flex-1 truncate font-medium">{host.name}</span>
                            {!bound && (
                                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-phi-text-faint">
                                    <IconPlusFilled className="size-3" />
                                    set up
                                </span>
                            )}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
