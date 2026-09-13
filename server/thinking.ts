// Pure thinking-level helpers, extracted verbatim from `server/index.ts`.
// Mirrors pi-ai's getSupportedThinkingLevels / clampThinkingLevel so the
// reported default thinking level matches what a fresh Pi session would use.

export const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export function supportedThinkingLevels(model: any): string[] {
    if (!model?.reasoning) return ["off"];
    const map = model.thinkingLevelMap as Record<string, string | null> | undefined;
    return EXTENDED_THINKING_LEVELS.filter((level) => {
        const mapped = map?.[level];
        if (mapped === null) return false;
        if (level === "xhigh" || level === "max") return mapped !== undefined;
        return true;
    });
}

export function clampThinkingLevel(model: any, level: string): string {
    const supported = supportedThinkingLevels(model);
    if (supported.includes(level)) return level;
    const idx = EXTENDED_THINKING_LEVELS.indexOf(level);
    if (idx === -1) return supported[0] ?? "off";
    for (let i = idx; i < EXTENDED_THINKING_LEVELS.length; i++) {
        if (supported.includes(EXTENDED_THINKING_LEVELS[i])) return EXTENDED_THINKING_LEVELS[i];
    }
    for (let i = idx - 1; i >= 0; i--) {
        if (supported.includes(EXTENDED_THINKING_LEVELS[i])) return EXTENDED_THINKING_LEVELS[i];
    }
    return supported[0] ?? "off";
}
