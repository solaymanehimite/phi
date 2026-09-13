import { IconCheckFilled, IconChevronLeft, IconPlus, IconSearch, IconXFilled } from "@tabler/icons-react";
import { Command } from "cmdk";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
    answerOAuthLogin,
    getOAuthLogin,
    listProviders,
    listProviderPresets,
    startOAuthLogin,
    testProvider,
    upsertProvider,
    type OAuthLoginEvent,
    type ProviderPreset,
} from "../lib/api";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Input } from "./ui/input";
import { ProviderLogo } from "./provider-logo";

// Same treatment as the popover forms (host creator, project creator).
const providerInputClass =
    "w-full !border-0 !bg-phi-overlay-strong !px-3 !text-[13px] placeholder:!text-phi-text-tertiary focus-visible:ring-2 focus-visible:ring-phi-accent/40";

const itemClass =
    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-phi-text-secondary outline-none data-[selected=true]:bg-phi-overlay-active data-[selected=true]:text-phi-text-primary";

const blankForm = { label: "", baseUrl: "", apiKey: "" };

type OAuthPhase = "starting" | "running" | "done" | "error" | "cancelled" | null;

function openUrl(url: string) {
    if (window.phi) window.phi.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Provider menu on the same cmdk primitives as the Cmd+K palette, so it can
 * open from Settings and from the palette with identical chrome and keys.
 * The list morphs into an API-key form or an OAuth sign-in view, like the
 * picker popovers. OAuth-only providers never see the key form.
 */
export function ProviderMenuDialog({ open, onOpenChange, onSaved }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const [mode, setMode] = useState<"list" | "key" | "oauth">("list");
    const [preset, setPreset] = useState<ProviderPreset | null>(null);
    const [query, setQuery] = useState("");
    const [presets, setPresets] = useState<ProviderPreset[]>([]);
    const [presetsLoading, setPresetsLoading] = useState(false);
    const [presetsFailed, setPresetsFailed] = useState(false);
    const [form, setForm] = useState(blankForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [loginId, setLoginId] = useState<string | null>(null);
    const [oauthPhase, setOauthPhase] = useState<OAuthPhase>(null);
    const [oauthEvents, setOauthEvents] = useState<OAuthLoginEvent[]>([]);
    const [oauthPrompt, setOauthPrompt] = useState<{ message: string; placeholder?: string; secret: boolean } | null>(null);
    const [oauthError, setOauthError] = useState<string | null>(null);
    const [answerValue, setAnswerValue] = useState("");

    const listRef = useRef<HTMLDivElement>(null);
    const keyRef = useRef<HTMLDivElement>(null);
    const oauthRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const formFocusRef = useRef<HTMLInputElement>(null);
    const answerRef = useRef<HTMLInputElement>(null);
    const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

    // Fresh state + catalog on every open.
    useEffect(() => {
        if (!open) return;
        setMode("list");
        setPreset(null);
        setQuery("");
        setForm(blankForm);
        setError(null);
        setLoginId(null);
        setOauthPhase(null);
        setOauthEvents([]);
        setOauthPrompt(null);
        setOauthError(null);
        setAnswerValue("");
        setPresetsLoading(true);
        setPresetsFailed(false);
        listProviderPresets()
            .then((r) => setPresets(r.presets))
            .catch(() => { setPresets([]); setPresetsFailed(true); })
            .finally(() => setPresetsLoading(false));
    }, [open ]);

    // Morph the dialog height to fit the active view.
    useLayoutEffect(() => {
        if (!open) return;
        const el = mode === "list" ? listRef.current : mode === "key" ? keyRef.current : oauthRef.current;
        if (!el) return;
        const update = () => setContentHeight(el.offsetHeight);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [open, mode, preset?.id]);

    // Keep focus on the active view's input across the morph.
    useEffect(() => {
        if (!open) return;
        if (mode === "list") searchInputRef.current?.focus();
        else if (mode === "key") formFocusRef.current?.focus();
        else if (oauthPrompt) answerRef.current?.focus();
    }, [open, mode, oauthPrompt]);

    const cancelSignIn = useCallback(async () => {
        if (loginId) {
            try { await answerOAuthLogin(loginId, { cancel: true }); } catch {
                // Best effort — the server settles the login on its own.
            }
        }
        setLoginId(null);
        setOauthPhase(null);
        setMode("list");
    }, [loginId]);

    // Closing mid-sign-in cancels it server-side.
    const handleOpenChange = useCallback((next: boolean) => {
        if (!next && loginId && oauthPhase === "running") {
            void answerOAuthLogin(loginId, { cancel: true }).catch(() => {});
        }
        onOpenChange(next);
    }, [loginId, oauthPhase, onOpenChange]);

    const startSignIn = useCallback(async (p: ProviderPreset) => {
        setError(null);
        setPreset(p);
        setMode("oauth");
        setOauthEvents([]);
        setOauthPrompt(null);
        setOauthError(null);
        setAnswerValue("");
        setOauthPhase("starting");
        try {
            const { loginId: id } = await startOAuthLogin(p.id);
            setLoginId(id);
            setOauthPhase("running");
        } catch (e) {
            setOauthPhase("error");
            setOauthError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    // Poll the sign-in while it runs.
    useEffect(() => {
        if (!open || mode !== "oauth" || !loginId || oauthPhase !== "running") return;
        let cancelled = false;
        const poll = async () => {
            try {
                const s = await getOAuthLogin(loginId);
                if (cancelled) return;
                if (s.events.length > 0) setOauthEvents((prev) => [...prev.slice(-7), ...s.events]);
                setOauthPrompt(s.prompt);
                if (s.status !== "running") {
                    setOauthPhase(s.status);
                    if (s.status === "done") {
                        onSaved();
                        window.setTimeout(() => { if (!cancelled) onOpenChange(false); }, 900);
                    } else {
                        setOauthError(s.error ?? "Sign-in ended.");
                    }
                }
            } catch (e) {
                if (!cancelled) setOauthError(e instanceof Error ? e.message : String(e));
            }
        };
        void poll();
        const t = window.setInterval(poll, 1500);
        return () => { cancelled = true; window.clearInterval(t); };
    }, [open, mode, loginId, oauthPhase, onSaved, onOpenChange]);

    const submitAnswer = useCallback(async () => {
        if (!loginId || !answerValue) return;
        const value = answerValue;
        setAnswerValue("");
        try {
            await answerOAuthLogin(loginId, { value });
        } catch (e) {
            setOauthError(e instanceof Error ? e.message : String(e));
        }
    }, [loginId, answerValue]);

    const useKeyInstead = useCallback(() => {
        if (!preset) return;
        setError(null);
        setForm({ label: preset.name, baseUrl: preset.baseUrl, apiKey: "" });
        setMode("key");
    }, [preset]);

    const q = query.trim().toLowerCase();
    const filtered = q ? presets.filter((p) => `${p.name} ${p.id}`.toLowerCase().includes(q)) : presets;

    const pickPreset = useCallback((p: ProviderPreset) => {
        // OAuth-only providers never see the API-key form — a key is
        // meaningless there (e.g. OpenAI Codex).
        if (p.oauth && !p.apiKey) { void startSignIn(p); return; }
        setError(null);
        setPreset(p);
        setForm({ label: p.name, baseUrl: p.baseUrl, apiKey: "" });
        setMode("key");
    }, [startSignIn]);

    const pickCustom = useCallback(() => {
        setError(null);
        setPreset(null);
        setForm(blankForm);
        setMode("key");
    }, []);

    const handleSave = useCallback(async () => {
        if (!form.label || !form.baseUrl || !form.apiKey) { setError("label, baseUrl and apiKey required"); return; }
        setSaving(true);
        setError(null);
        try {
            const existing = await listProviders().catch(() => null);
            const taken = new Set(existing?.providers.map((p) => p.id) ?? []);
            const baseId = form.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider";
            let id = baseId;
            let suffix = 2;
            while (taken.has(id)) id = `${baseId}-${suffix++}`;
            await testProvider(id, { baseUrl: form.baseUrl, apiKey: form.apiKey });
            await upsertProvider({ id, ...form });
            onSaved();
            onOpenChange(false);
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
    }, [form, onSaved, onOpenChange]);

    const activeClass = (active: boolean) =>
        `w-full transition-opacity duration-150 motion-reduce:transition-none ${active ? "relative opacity-100" : "pointer-events-none absolute inset-x-0 top-0 opacity-0"}`;

    const reversed = [...oauthEvents].reverse();
    const deviceCode = reversed.find((e): e is Extract<OAuthLoginEvent, { type: "device_code" }> => e.type === "device_code");
    const authUrl = reversed.find((e): e is Extract<OAuthLoginEvent, { type: "auth_url" }> => e.type === "auth_url");
    const notes = oauthEvents.filter((e): e is Extract<OAuthLoginEvent, { type: "info" | "progress" }> => e.type === "info" || e.type === "progress").slice(-3);
    const signInLabel = preset?.loginLabel || (preset ? `Sign in with ${preset.name}` : "Sign in");

    return (
        <Command.Dialog
            open={open}
            onOpenChange={handleOpenChange}
            label="Providers"
            overlayClassName="session-command-overlay"
            contentClassName="session-command-content"
            loop
            // Manual substring filtering (cheap at ~40 rows) instead of
            // cmdk's per-keystroke scoring.
            shouldFilter={false}
        >
            <div
                className="relative overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
                style={contentHeight !== undefined ? { height: contentHeight } : undefined}
            >
                <div
                    ref={listRef}
                    inert={mode !== "list"}
                    aria-hidden={mode !== "list"}
                    className={activeClass(mode === "list")}
                >
                    <div className="flex items-center gap-3 border-b border-phi-border-subtle px-4">
                        <IconSearch className="size-4 shrink-0 text-phi-text-muted" />
                        <input
                            ref={searchInputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search providers…"
                            aria-label="Search providers"
                            spellCheck={false}
                            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-phi-text-primary outline-none placeholder:text-phi-text-muted"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                className="shrink-0 text-phi-text-muted hover:text-phi-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40"
                                aria-label="Clear search"
                            >
                                <IconXFilled className="size-3.5" />
                            </button>
                        )}
                    </div>
                    <Command.List label="Providers" className="max-h-[min(50vh,420px)] overflow-y-auto p-2">
                        {presetsLoading ? (
                            <Command.Loading className="px-3 py-8 text-center text-[12px] text-phi-text-muted">
                                Loading providers…
                            </Command.Loading>
                        ) : (
                            <>
                                {filtered.length > 0 ? (
                                    <Command.Group>
                                        {filtered.map((p) => (
                                            <Command.Item
                                                key={p.id}
                                                value={`${p.name} ${p.id}`}
                                                keywords={[p.name, p.id]}
                                                onSelect={() => pickPreset(p)}
                                                className={itemClass}
                                            >
                                                <ProviderLogo id={p.id} name={p.name} />
                                                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                ) : presetsFailed || presets.length === 0 ? (
                                    <div className="px-3 py-8 text-center text-[12px] text-phi-text-muted">
                                        Couldn&apos;t load the provider list — add a custom provider below.
                                    </div>
                                ) : (
                                    <EmptyState compact title="No results found." />
                                )}
                                <div className="mt-1 border-t border-phi-border-faint pt-1.5">
                                    <Command.Item
                                        value="custom provider proxy endpoint"
                                        keywords={["custom", "proxy", "endpoint", "key"]}
                                        onSelect={pickCustom}
                                        className={itemClass}
                                    >
                                        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center">
                                            <IconPlus className="size-5" />
                                        </span>
                                        <span className="min-w-0 flex-1 truncate">Custom provider</span>
                                    </Command.Item>
                                </div>
                            </>
                        )}
                    </Command.List>
                </div>
                <div
                    ref={keyRef}
                    inert={mode !== "key"}
                    aria-hidden={mode !== "key"}
                    className={activeClass(mode === "key")}
                >
                    <div className="flex h-14 items-center gap-2 border-b border-phi-border-subtle px-3">
                        <Button onClick={() => setMode("list")} variant="ghost" size="xs" aria-label="Back to providers" className="!px-1.5">
                            <IconChevronLeft className="size-4" />
                        </Button>
                        {preset ? (
                            <>
                                <ProviderLogo id={preset.id} name={preset.name} />
                                <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-phi-text-primary">{preset.name}</div>
                            </>
                        ) : (
                            <div className="min-w-0 flex-1 truncate px-1 text-[13px] font-medium text-phi-text-primary">Custom provider</div>
                        )}
                    </div>
                    <div className="space-y-2 px-4 py-3">
                    {!preset && (
                        <Input ref={formFocusRef} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label (e.g. My proxy)" aria-label="Provider label" variant="default" className={providerInputClass} />
                    )}
                    <Input ref={preset ? formFocusRef : undefined} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="Base URL https://api.openai.com/v1" aria-label="Provider base URL" spellCheck={false} variant="default" className={providerInputClass} />
                    <Input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="API key" aria-label="Provider API key" type="password" variant="default" className={providerInputClass} />
                    {error && <Alert variant="error">{error}</Alert>}
                    <div className="flex items-center justify-between gap-2">
                        {preset?.oauth ? (
                            <button onClick={() => void startSignIn(preset)} className="text-[12px] text-phi-text-muted underline-offset-2 hover:text-phi-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40">{signInLabel} instead</button>
                        ) : <span />}
                        <Button onClick={() => void handleSave()} disabled={saving} variant="primary" size="xs" className="!text-[12px]">{saving ? "Saving…" : "Save Provider"}</Button>
                    </div>
                    </div>
                </div>
                <div
                    ref={oauthRef}
                    inert={mode !== "oauth"}
                    aria-hidden={mode !== "oauth"}
                    className={activeClass(mode === "oauth")}
                >
                    <div className="flex h-14 items-center gap-2 border-b border-phi-border-subtle px-3">
                        <Button onClick={() => void cancelSignIn()} variant="ghost" size="xs" aria-label="Back to providers" className="!px-1.5">
                            <IconChevronLeft className="size-4" />
                        </Button>
                        {preset && (
                            <>
                                <ProviderLogo id={preset.id} name={preset.name} />
                                <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-phi-text-primary">{signInLabel}</div>
                            </>
                        )}
                    </div>
                    <div className="space-y-3 px-4 py-3">
                        {oauthPhase === "starting" && (
                            <p className="text-[12px] text-phi-text-muted">Starting sign-in…</p>
                        )}
                        {deviceCode && oauthPhase === "running" && (
                            <div className="rounded-lg border border-phi-border bg-phi-bg-surface p-3 text-center">
                                <p className="text-[11px] text-phi-text-muted">Enter this code in your browser</p>
                                <p className="mt-1 font-mono text-[22px] font-semibold tracking-[0.2em] text-phi-text-primary">{deviceCode.userCode}</p>
                                {deviceCode.verificationUri && (
                                    <button onClick={() => openUrl(deviceCode.verificationUri!)} className="mt-2 text-[12px] text-phi-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40">{deviceCode.verificationUri}</button>
                                )}
                            </div>
                        )}
                        {authUrl && oauthPhase === "running" && (
                            <div className="space-y-2">
                                {authUrl.instructions && <p className="text-[12px] text-phi-text-muted">{authUrl.instructions}</p>}
                                <div className="flex items-center gap-2">
                                    <Button onClick={() => openUrl(authUrl.url)} variant="primary" size="xs" className="!text-[12px]">Open in browser</Button>
                                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-phi-text-muted">{authUrl.url}</span>
                                </div>
                            </div>
                        )}
                        {notes.length > 0 && (
                            <div className="space-y-1">
                                {notes.map((n, i) => (
                                    <p key={i} className="text-[11px] text-phi-text-muted">{n.message}</p>
                                ))}
                            </div>
                        )}
                        {oauthPhase === "running" && oauthPrompt && (
                            <form
                                onSubmit={(e) => { e.preventDefault(); void submitAnswer(); }}
                                className="flex items-center gap-1.5"
                            >
                                <Input
                                    ref={answerRef}
                                    value={answerValue}
                                    onChange={(e) => setAnswerValue(e.target.value)}
                                    placeholder={oauthPrompt.placeholder ?? oauthPrompt.message}
                                    aria-label={oauthPrompt.message}
                                    type={oauthPrompt.secret ? "password" : "text"}
                                    variant="default"
                                    className={providerInputClass}
                                />
                                <Button type="submit" disabled={!answerValue} variant="primary" size="xs" className="!text-[12px]">Continue</Button>
                            </form>
                        )}
                        {oauthPhase === "done" && (
                            <p className="flex items-center gap-1.5 text-[12px] text-phi-thinking-low">
                                <IconCheckFilled className="size-4" /> Signed in — refreshing models…
                            </p>
                        )}
                        {(oauthPhase === "error" || oauthPhase === "cancelled") && (
                            <Alert variant="error">{oauthError ?? "Sign-in ended."}</Alert>
                        )}
                        <div className="flex items-center justify-between gap-2">
                            {preset?.apiKey ? (
                                <button onClick={useKeyInstead} className="text-[12px] text-phi-text-muted underline-offset-2 hover:text-phi-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40">Use an API key instead</button>
                            ) : <span />}
                            <Button onClick={() => void cancelSignIn()} variant="ghost" size="xs" className="!text-[12px]">Cancel</Button>
                        </div>
                    </div>
                </div>
            </div>
        </Command.Dialog>
    );
}
