import { THEME_TOKEN_NAMES } from "./theme-tokens";

export type CustomThemeBase = "light" | "dark";

export type CustomTheme = {
  id: string;
  name: string;
  base: CustomThemeBase;
  /** Full token snapshot (var name -> css value). Only edited tokens need apply, but full keeps copy/paste simple. */
  tokens: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

const THEMES_KEY = "phi:custom-themes-v1";
const ACTIVE_KEY = "phi:active-custom-theme-v1";

function safeId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {}
  return `ct-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function loadCustomThemes(): CustomTheme[] {
  try {
    const raw = localStorage.getItem(THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomTheme[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t) =>
        t &&
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        (t.base === "light" || t.base === "dark") &&
        t.tokens &&
        typeof t.tokens === "object",
    );
  } catch {
    return [];
  }
}

export function persistCustomThemes(themes: CustomTheme[]): void {
  try {
    localStorage.setItem(THEMES_KEY, JSON.stringify(themes));
  } catch {}
}

export function loadActiveCustomThemeId(): string | null {
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    return v || null;
  } catch {
    return null;
  }
}

export function persistActiveCustomThemeId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

export function buildCustomTheme(name: string, base: CustomThemeBase, tokens: Record<string, string>): CustomTheme {
  const now = Date.now();
  return { id: safeId(), name: name.trim() || "Untitled", base, tokens: { ...tokens }, createdAt: now, updatedAt: now };
}

/** Apply tokens as inline overrides on <html>. Inline wins over App.css data-theme rules. */
export function applyCustomTokens(tokens: Record<string, string>): void {
  if (typeof document === "undefined") return;
  for (const [name, value] of Object.entries(tokens)) {
    if (!name.startsWith("--color-phi-")) continue;
    if (typeof value !== "string" || !value) continue;
    document.documentElement.style.setProperty(name, value);
  }
}

/** Remove all known token overrides, revealing the bundled theme underneath. */
export function clearCustomTokens(): void {
  if (typeof document === "undefined") return;
  for (const name of THEME_TOKEN_NAMES) {
    document.documentElement.style.removeProperty(name);
  }
}

export function readLiveTokens(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof document === "undefined") return out;
  const computed = getComputedStyle(document.documentElement);
  for (const name of THEME_TOKEN_NAMES) {
    const inline = document.documentElement.style.getPropertyValue(name).trim();
    // Prefer the live value (inline override wins), fall back to computed.
    const v = inline || computed.getPropertyValue(name).trim();
    if (v) out[name] = v;
  }
  return out;
}

/** CSS ready to paste into App.css. Dark goes in @theme, light in the light block. */
export function formatThemeForAppCss(theme: CustomTheme): string {
  const lines = Object.entries(theme.tokens)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  if (theme.base === "light") {
    return `/* Custom theme "${theme.name}" — paste inside html[data-theme="light"] in App.css */\nhtml[data-theme="light"] {\n${lines}\n}`;
  }
  return `/* Custom theme "${theme.name}" — paste inside @theme in App.css (dark defaults) */\n@theme {\n${lines}\n}`;
}

export function formatThemeJson(theme: CustomTheme): string {
  return JSON.stringify(theme, null, 2);
}

export function parseThemeJson(raw: string): CustomTheme {
  const parsed = JSON.parse(raw) as Partial<CustomTheme>;
  if (!parsed || typeof parsed !== "object") throw new Error("Not a theme object");
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const base = parsed.base === "light" ? "light" : parsed.base === "dark" ? "dark" : null;
  if (!name) throw new Error("Theme is missing a name");
  if (!base) throw new Error('Theme base must be "light" or "dark"');
  const tokens = parsed.tokens as Record<string, string> | undefined;
  if (!tokens || typeof tokens !== "object" || Object.keys(tokens).length === 0) {
    throw new Error("Theme has no tokens");
  }
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(tokens)) {
    if (k.startsWith("--color-phi-") && typeof v === "string" && v.trim()) clean[k] = v.trim();
  }
  if (Object.keys(clean).length === 0) throw new Error("Theme has no usable --color-phi-* tokens");
  const now = Date.now();
  return { id: safeId(), name, base, tokens: clean, createdAt: now, updatedAt: now };
}
