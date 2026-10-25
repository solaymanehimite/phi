import { useCallback, useEffect, useState, type ReactNode } from "react";
import { IconBox, IconPlus } from "@tabler/icons-react";
import { listProviders, deleteProvider, testProvider, listPiAuth, listSkills, toggleSkill, type ProviderRow, type PiAuthRow, type SkillRow } from "../lib/api";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { ProviderLogo } from "./provider-logo";
import { Switch } from "./ui/switch";

const LIST_ROW_CLASS = "group relative flex min-h-[60px] w-full items-center gap-4 px-4 py-3 text-left hover:bg-phi-overlay-hover";

function ListGroup({ children }: { children: ReactNode }) {
    return <div className="overflow-hidden rounded-2xl bg-phi-bg-surface">{children}</div>;
}

function ListRow({ children }: { children: ReactNode }) {
    return <div className={LIST_ROW_CLASS}>{children}</div>;
}

export function SkillsTab({ cwd }: { cwd?: string }) {
    const [skills, setSkills] = useState<SkillRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toggling, setToggling] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const response = await listSkills(cwd);
            setSkills(response.skills);
            setError(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setLoading(false);
        }
    }, [cwd]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleToggle = useCallback(async (skill: SkillRow) => {
        const enabled = !skill.enabled;
        setToggling(skill.filePath);
        setSkills((current) => current.map((item) => item.filePath === skill.filePath ? { ...item, enabled } : item));
        try {
            await toggleSkill(skill.filePath, enabled, cwd);
        } catch (cause) {
            setSkills((current) => current.map((item) => item.filePath === skill.filePath ? { ...item, enabled: !enabled } : item));
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setToggling(null);
        }
    }, [cwd]);

    if (loading) return <p className="text-[12px] text-phi-text-muted">Loading…</p>;

    return (
        <div>
            {error && <Alert variant="error">{error}</Alert>}
            {skills.length === 0 ? (
                <p className="rounded-lg border border-dashed border-phi-border px-3 py-3 text-[12px] text-phi-text-muted">
                    No skills found. Add SKILL.md files under <span className="font-mono">~/.pi/agent/skills</span>.
                </p>
            ) : (
                <ListGroup>
                    {skills.map((skill) => (
                        <label key={skill.filePath} className={`${LIST_ROW_CLASS} cursor-pointer`}>
                            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center text-phi-text-tertiary"><IconBox className="size-5" /></span>
                            <div className="min-w-0 flex-1" title={skill.filePath}>
                                <div className="truncate text-[13px] font-medium text-phi-text-primary">{skill.name}</div>
                                {skill.description && <div className="mt-0.5 truncate text-[12px] text-phi-text-muted">{skill.description}</div>}
                            </div>
                            <span className="shrink-0 text-[13px] text-phi-text-muted">{skill.scope === "project" ? "Project" : "Personal"}</span>
                            <Switch checked={skill.enabled} disabled={toggling === skill.filePath} label={`${skill.enabled ? "Disable" : "Enable"} skill ${skill.name}`} onClick={() => void handleToggle(skill)} />
                        </label>
                    ))}
                </ListGroup>
            )}
        </div>
    );
}

export function ProvidersTab({
    onChanged,
    onAddProvider,
    providersVersion,
}: {
    onChanged?: () => void;
    onAddProvider: () => void;
    providersVersion: number;
}) {
    const [providers, setProviders] = useState<ProviderRow[]>([]);
    const [piProviders, setPiProviders] = useState<PiAuthRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<Record<string, string>>({});

    const refresh = useCallback(async () => {
        setLoading(true);
        const [customResult, piResult] = await Promise.allSettled([listProviders(), listPiAuth()]);
        if (customResult.status === "fulfilled") {
            setProviders(customResult.value.providers);
            setError(null);
        } else {
            setProviders([]);
            setError(customResult.reason instanceof Error ? customResult.reason.message : String(customResult.reason));
        }
        setPiProviders(piResult.status === "fulfilled" ? piResult.value.providers : []);
        setLoading(false);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh, providersVersion]);

    const handleTest = useCallback(async (id: string) => {
        setTesting(id);
        setTestResult((current) => ({ ...current, [id]: "" }));
        try {
            await testProvider(id);
            setTestResult((current) => ({ ...current, [id]: "OK" }));
        } catch (cause) {
            setTestResult((current) => ({ ...current, [id]: cause instanceof Error ? cause.message : String(cause) }));
        } finally {
            setTesting(null);
        }
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        if (!confirm(`Delete provider ${id}?`)) return;
        try {
            await deleteProvider(id);
            await refresh();
            onChanged?.();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    }, [refresh, onChanged]);

    return (
        <div className="space-y-4">
            {error && <Alert variant="error">{error}</Alert>}
            <ListGroup>
                {piProviders.map((provider) => (
                    <ListRow key={`pi-${provider.id}`}>
                        <ProviderLogo id={provider.id} name={provider.name} />
                        <div className="min-w-0 flex-1" title={provider.source ? `${provider.type} · ${provider.source}` : provider.type}>
                            <div className="truncate text-[13px] font-medium text-phi-text-primary">{provider.name}</div>
                            <div className="mt-0.5 truncate text-[12px] text-phi-text-muted">{provider.source ? `${provider.type} · ${provider.source}` : provider.type}</div>
                        </div>
                    </ListRow>
                ))}
                {loading ? (
                    <ListRow><div className="text-[12px] text-phi-text-muted">Loading…</div></ListRow>
                ) : providers.map((provider) => (
                    <ListRow key={`custom-${provider.id}`}>
                        <ProviderLogo id={provider.id} name={provider.label || provider.id} />
                        <div className="min-w-0 flex-1" title={provider.baseUrl}>
                            <div className="truncate text-[13px] font-medium text-phi-text-primary">{provider.label || provider.id}</div>
                            <div className="mt-0.5 truncate font-mono text-[12px] text-phi-text-muted">{provider.baseUrl}</div>
                            <div className="mt-0.5 font-mono text-[11px] text-phi-text-muted" title="The full key stays on the sidecar. This masked value is all the UI ever sees.">{provider.maskedKey || (provider.hasKey ? "••••" : "no key saved")}</div>
                            {testResult[provider.id] && <div className={`mt-1 text-[11px] ${testResult[provider.id] === "OK" ? "text-phi-thinking-low" : "text-phi-error-text"}`}>{testResult[provider.id]}</div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <Button onClick={() => void handleTest(provider.id)} disabled={testing === provider.id} variant="secondary" size="xs" className="!text-[11px]">{testing === provider.id ? "Testing…" : "Test connection"}</Button>
                            <Button onClick={() => void handleDelete(provider.id)} variant="secondary" size="xs" className="!border-phi-error-border !bg-phi-error-bg !text-[11px] !text-phi-error-text hover:!bg-phi-error-bg">Delete</Button>
                        </div>
                    </ListRow>
                ))}
                {!loading && piProviders.length === 0 && providers.length === 0 && (
                    <ListRow><div className="text-[12px] text-phi-text-muted">No providers yet. Run <span className="font-mono">pi login</span> in the terminal.</div></ListRow>
                )}
                <button
                    onClick={onAddProvider}
                    className="flex min-h-[60px] w-full items-center gap-3 border-t border-phi-border px-6 py-3 text-left text-[13px] font-medium text-phi-text-muted hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-phi-accent/40"
                >
                    <IconPlus className="size-4 shrink-0" />
                    Add provider
                </button>
            </ListGroup>
        </div>
    );
}
