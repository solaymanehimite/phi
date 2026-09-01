import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme, type Theme } from "../hooks/useTheme";
import { ChevronLeftIcon, Cog6ToothIcon, KeyIcon, PaintBrushIcon } from "@heroicons/react/24/solid";
import { Tabs } from "./tabs";
import { listProviders, upsertProvider, deleteProvider, testProvider, type ProviderRow } from "../lib/api";


type SettingsSection = "appearance" | "providers";

const sections: { id: SettingsSection; label: string; description: string; icon: typeof PaintBrushIcon }[] = [
  { id: "appearance", label: "Appearance", description: "Theme and colors", icon: PaintBrushIcon },
  { id: "providers", label: "Providers / Auth", description: "Models and API keys", icon: KeyIcon },
];

export function SettingsPage({ onClose, onProvidersChanged }: { onClose: () => void; onProvidersChanged?: () => void }) {
  const [section, setSection] = useState<SettingsSection>("appearance");
  const active = sections.find((item) => item.id === section)!;

  return (
    <div className="phi-layout text-phi-text-primary antialiased selection:bg-phi-accent/25">
      <div className="phi-sidebar-wrap" data-collapsed="false">
        <aside className="flex h-full w-[268px] min-w-[268px] shrink-0 flex-col bg-phi-bg-sidebar">
          <div data-tauri-drag-region className="mb-4 mt-2 flex shrink-0 items-center px-4 py-3">
            <div className="flex items-center gap-2 text-[15px] font-semibold leading-none text-phi-text-primary">
              <Cog6ToothIcon className="size-4 shrink-0" />
              <span>Settings</span>
            </div>
          </div>
          <nav aria-label="Settings sections" className="space-y-0.5 px-2">
            <button onClick={onClose} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-[13px] text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40">
              <ChevronLeftIcon className="size-3.5 shrink-0" />
              <span className="truncate">Return to home</span>
            </button>
            {sections.map((item) => {
              const Icon = item.icon;
              const selected = item.id === section;
              return (
                <button key={item.id} onClick={() => setSection(item.id)} aria-current={selected ? "page" : undefined} className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-[13px] ${selected ? "bg-phi-overlay-active text-phi-text-primary" : "text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-primary"}`}>
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      </div>

      <main className="phi-main bg-phi-bg-sidebar px-2 pb-2">
        <Tabs tabs={[{ id: section, title: active.label }]} activeId={section} onSelect={() => {}} onClose={() => {}} hideClose tablistLabel="Settings section" />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-phi-border-subtle bg-phi-bg-main shadow-[0_8px_30px_var(--color-phi-shadow)]">
          <header className="shrink-0 border-b border-phi-border px-6 py-5">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-phi-text-primary">{active.label}</h1>
            <p className="mt-1 text-[12px] text-phi-text-muted">{active.description}</p>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {section === "appearance" ? <AppearanceTab /> : <ProvidersTab onChanged={onProvidersChanged} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [previewTokens, setPreviewTokens] = useState<Record<string, string>>({});
  const [exportJson, setExportJson] = useState<string | null>(null);
  const resetPreview = useCallback(() => {
    for (const k of Object.keys(previewTokens)) document.documentElement.style.removeProperty(k);
    setPreviewTokens({});
    setExportJson(null);
  }, [previewTokens]);
  useEffect(() => () => resetPreview(), [resetPreview]);
  const handleExport = useCallback(() => {
    const obj: Record<string, string> = {};
    for (const [k, v] of Object.entries(previewTokens)) obj[k] = v;
    if (Object.keys(obj).length === 0) {
      // fallback to computed styles
      const styles = getComputedStyle(document.documentElement);
      // sample few tokens
      const sample = ["--color-phi-bg-app", "--color-phi-text-primary", "--color-phi-accent"];
      for (const s of sample) obj[s] = styles.getPropertyValue(s).trim();
    }
    const json = JSON.stringify(obj, null, 2);
    setExportJson(json);
    navigator.clipboard.writeText(json).catch(() => {});
  }, [previewTokens]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[12px] font-semibold tracking-wide text-phi-text-muted">Theme</h3>
        <div className="mt-2 inline-flex rounded-lg border border-phi-border bg-phi-bg-surface p-1">
          {(["light", "dark", "system"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium capitalize transition ${theme === t ? "bg-phi-bg-inverse text-phi-text-inverse shadow-sm" : "text-phi-text-muted hover:text-phi-text-secondary"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-phi-border bg-phi-bg-surface p-3">
        <button onClick={() => setPlaygroundOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
          <span className="text-[13px] font-medium text-phi-text-primary">Advanced → Theme Playground</span>
          <span className="text-[11px] text-phi-text-muted">{playgroundOpen ? "Close" : "Open"}</span>
        </button>
        {playgroundOpen && (
          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-phi-warning-border bg-phi-warning-bg px-3 py-2 text-[11px] text-phi-warning-text">
              Preview — resets on reload. Mutates currently-applied tokens via <code className="rounded bg-phi-overlay px-1">document.documentElement.style</code>.
            </div>
            <PlaygroundEditor onChange={(k, v) => setPreviewTokens((p) => ({ ...p, [k]: v }))} />
            <div className="flex gap-2">
              <button onClick={resetPreview} className="rounded-lg border border-phi-border bg-phi-overlay px-3 py-1.5 text-[12px] font-medium text-phi-text-secondary hover:bg-phi-overlay-hover">Reset</button>
              <button onClick={handleExport} className="rounded-lg bg-phi-bg-inverse px-3 py-1.5 text-[12px] font-medium text-phi-text-inverse hover:bg-phi-white">Export JSON & Copy</button>
            </div>
            {exportJson && (
              <pre className="max-h-40 overflow-auto rounded-lg border border-phi-border bg-phi-bg-app p-2 font-mono text-[11px] text-phi-text-secondary">{exportJson}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlaygroundEditor({ onChange }: { onChange: (k: string, v: string) => void }) {
  const tokens = useMemo(() => [
    "--color-phi-bg-app", "--color-phi-bg-main", "--color-phi-bg-surface", "--color-phi-bg-elevated",
    "--color-phi-text-primary", "--color-phi-text-secondary", "--color-phi-text-muted",
    "--color-phi-accent", "--color-phi-border", "--color-phi-overlay",
  ], []);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const obj: Record<string, string> = {};
    for (const t of tokens) obj[t] = getComputedStyle(document.documentElement).getPropertyValue(t).trim();
    setValues(obj);
  }, [tokens]);
  const set = (k: string, v: string) => {
    document.documentElement.style.setProperty(k, v);
    setValues((p) => ({ ...p, [k]: v }));
    onChange(k, v);
  };
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {tokens.map((t) => (
        <label key={t} className="flex items-center gap-2 rounded-lg border border-phi-border bg-phi-bg-app px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-phi-text-muted">{t}</span>
          <input type="color" value={toHex(values[t] || "#000000")} onChange={(e) => set(t, e.target.value)} className="size-6 rounded border border-phi-border bg-transparent" />
          <input value={values[t] || ""} onChange={(e) => set(t, e.target.value)} className="w-24 rounded border border-phi-border bg-phi-bg-surface px-1 py-0.5 font-mono text-[10px] text-phi-text-secondary" />
        </label>
      ))}
    </div>
  );
}

function toHex(v: string): string {
  const s = v.trim();
  if (s.startsWith("#")) return s.slice(0, 7);
  const nums = s.match(/\d+/g);
  if (!nums || nums.length < 3) return "#000000";
  const [r, g, b] = nums.slice(0, 3).map(Number);
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function ProvidersTab({ onChanged }: { onChanged?: () => void }) {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", baseUrl: "", apiKey: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const r = await listProviders(); setProviders(r.providers); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const handleSave = useCallback(async () => {
    if (!form.label || !form.baseUrl || !form.apiKey) { setError("label, baseUrl and apiKey required"); return; }
    const baseId = form.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider";
    let id = baseId;
    let suffix = 2;
    while (providers.some((provider) => provider.id === id)) id = `${baseId}-${suffix++}`;
    const provider = { id, ...form };
    setSaving(true);
    setError(null);
    try {
      await testProvider(id, { baseUrl: form.baseUrl, apiKey: form.apiKey });
      await upsertProvider(provider);
      await refresh();
      onChanged?.();
      setForm({ label: "", baseUrl: "", apiKey: "" });
      setDialogOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  }, [form, providers, refresh, onChanged]);

  const handleTest = useCallback(async (id: string) => {
    setTesting(id); setTestResult((p) => ({ ...p, [id]: "" }));
    try { await testProvider(id); setTestResult((p) => ({ ...p, [id]: "OK" })); } catch (e) { setTestResult((p) => ({ ...p, [id]: e instanceof Error ? e.message : String(e) })); } finally { setTesting(null); }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(`Delete provider ${id}?`)) return;
    try { await deleteProvider(id); await refresh(); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [refresh, onChanged]);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-phi-error-border bg-phi-error-bg px-3 py-2 text-[12px] text-phi-error-text">{error}</div>}

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialogOpen(false); }}>
          <div className="w-full max-w-md rounded-xl border border-phi-border bg-phi-bg-surface p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="add-provider-title">
            <div className="flex items-center justify-between">
              <h4 id="add-provider-title" className="text-[14px] font-semibold text-phi-text-primary">Add provider</h4>
              <button onClick={() => setDialogOpen(false)} className="text-[12px] text-phi-text-muted hover:text-phi-text-primary">Cancel</button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <input autoFocus placeholder="Label (e.g. OpenAI)" value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} className="rounded-lg border border-phi-input-border bg-phi-input-bg px-2 py-1.5 text-[12px] text-phi-text-primary placeholder:text-phi-text-muted outline-none focus:border-phi-input-border-focus" />
              <input placeholder="Base URL https://api.openai.com/v1" value={form.baseUrl} onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))} className="rounded-lg border border-phi-input-border bg-phi-input-bg px-2 py-1.5 text-[12px] text-phi-text-primary placeholder:text-phi-text-muted outline-none focus:border-phi-input-border-focus" />
              <input placeholder="API key" type="password" value={form.apiKey} onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))} className="rounded-lg border border-phi-input-border bg-phi-input-bg px-2 py-1.5 text-[12px] text-phi-text-primary placeholder:text-phi-text-muted outline-none focus:border-phi-input-border-focus" />
            </div>
            <button onClick={() => void handleSave()} disabled={saving} className="mt-4 rounded-lg bg-phi-bg-inverse px-3 py-1.5 text-[12px] font-medium text-phi-text-inverse hover:bg-phi-white disabled:opacity-50">{saving ? "Saving…" : "Save (tests connection)"}</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-[12px] font-semibold text-phi-text-primary">Providers</h4>
        {loading ? <p className="text-[12px] text-phi-text-muted">Loading…</p> : (
          <div className="space-y-2">
            {providers.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-phi-border bg-phi-bg-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-phi-text-primary">{p.label || p.id}</div>
                  <div className="truncate font-mono text-[11px] text-phi-text-muted">{p.baseUrl}</div>
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="font-mono text-phi-text-muted">{showKey[p.id] ? (p.maskedKey ? p.maskedKey.replace(/•/g, "•") : "no key") : p.maskedKey || "••••"}</span>
                    <button onClick={() => setShowKey((m) => ({ ...m, [p.id]: !m[p.id] }))} className="text-phi-text-tertiary hover:text-phi-text-secondary underline">{showKey[p.id] ? "Hide" : "Show"}</button>
                  </div>
                  {testResult[p.id] && <div className={`mt-1 text-[11px] ${testResult[p.id] === "OK" ? "text-phi-thinking-low" : "text-phi-error-text"}`}>{testResult[p.id]}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => void handleTest(p.id)} disabled={testing === p.id} className="rounded-md border border-phi-border px-2 py-1 text-[11px] font-medium text-phi-text-secondary hover:bg-phi-overlay disabled:opacity-50">{testing === p.id ? "Testing…" : "Test connection"}</button>
                  <button onClick={() => void handleDelete(p.id)} className="rounded-md border border-phi-error-border bg-phi-error-bg px-2 py-1 text-[11px] font-medium text-phi-error-text hover:bg-phi-error-bg">Delete</button>
                </div>
              </div>
            ))}
            <button onClick={() => { setError(null); setForm({ label: "", baseUrl: "", apiKey: "" }); setDialogOpen(true); }} className="w-full rounded-lg border border-dashed border-phi-border px-3 py-3 text-left text-[12px] font-medium text-phi-text-muted hover:border-phi-input-border-focus hover:text-phi-text-primary">+ Add provider</button>
          </div>
        )}
      </div>
    </div>
  );
}
