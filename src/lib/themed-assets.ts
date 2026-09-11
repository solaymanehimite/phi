export type EffectiveTheme = "light" | "dark";

/** Theme-aware provider mark. Returns undefined for providers without a logo file. */
export function providerIconUrl(
  provider: string,
  theme: EffectiveTheme,
): string | undefined {
  const p = provider.toLowerCase();
  const base = import.meta.env.BASE_URL || "./";
  if (p === "openai" || p === "openai-codex") return `${base}providers/${theme}/openai.svg`;
  if (p === "opencode") return `${base}providers/${theme}/opencode.svg`;
  return undefined;
}

/** Theme-aware branding asset (`logo.svg` | `logo_small.svg`). */
export function brandingUrl(
  name: "logo.svg" | "logo_small.svg",
  theme: EffectiveTheme,
): string {
  const base = import.meta.env.BASE_URL || "./";
  return `${base}branding/${theme}/${name}`;
}

/** Favicon URL — the small logo for the given theme. */
export function faviconUrl(theme: EffectiveTheme): string {
  return brandingUrl("logo_small.svg", theme);
}

/** Point the tab favicon at the themed small logo (creates the link if missing). */
export function syncFavicon(theme: EffectiveTheme): void {
  if (typeof document === "undefined") return;
  const href = faviconUrl(theme);
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}
