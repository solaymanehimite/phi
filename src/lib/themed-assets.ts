export type EffectiveTheme = "light" | "dark";

/** Theme-aware provider mark. Returns undefined for providers without a logo file. */
export function providerIconUrl(
  provider: string,
  theme: EffectiveTheme,
): string | undefined {
  const p = provider.toLowerCase();
  if (p === "openai" || p === "openai-codex") return `/providers/${theme}/openai.svg`;
  if (p === "opencode") return `/providers/${theme}/opencode.svg`;
  return undefined;
}

/** Theme-aware branding asset (`logo.svg` | `logo_small.svg`). */
export function brandingUrl(
  name: "logo.svg" | "logo_small.svg",
  theme: EffectiveTheme,
): string {
  return `/branding/${theme}/${name}`;
}
