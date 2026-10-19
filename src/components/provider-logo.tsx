import { PROVIDER_MARKS } from "./provider-marks";

// Pi provider id → baked brand mark. Marks without an explicit fill inherit
// currentColor (correct for monochrome brands); colored brands carry their
// own fills. Unlisted ids fall back to a monogram.
const MARKS: Record<string, string> = {
    "openai": "openai",
    "openai-codex": "openai",
    "azure-openai-responses": "openai",
    "anthropic": "anthropic",
    "google": "gemini",
    "google-vertex": "gemini",
    "github-copilot": "githubcopilot",
    "xai": "xai",
    "kimi-coding": "kimi",
    "moonshotai": "moonshot",
    "moonshotai-cn": "moonshot",
    "opencode": "opencode",
    "opencode-go": "opencode",
    "deepseek": "deepseek",
    "minimax": "minimax",
    "minimax-cn": "minimax",
    "mistral": "mistral",
    "openrouter": "openrouter",
    "vercel-ai-gateway": "vercel",
    "nvidia": "nvidia",
    "huggingface": "huggingface",
    "cloudflare-workers-ai": "cloudflare",
    "cloudflare-ai-gateway": "cloudflare",
    "qwen-token-plan": "qwen",
    "qwen-token-plan-cn": "qwen",
    "qwen-token-plan-individual": "qwen",
    "xiaomi": "xiaomimo",
    "xiaomi-token-plan-cn": "xiaomimo",
    "xiaomi-token-plan-ams": "xiaomimo",
    "xiaomi-token-plan-sgp": "xiaomimo",
    "amazon-bedrock": "bedrock",
    "groq": "groq",
    "cerebras": "cerebras",
    "together": "together",
    "fireworks": "fireworks",
    "zai": "zhipu",
    "zai-coding-cn": "zhipu",
};

export function ProviderLogo({ id, name, size = 24 }: { id: string; name: string; size?: number }) {
    const key = MARKS[id];
    const mark = key ? PROVIDER_MARKS[key] : undefined;
    const markSize = Math.round(size * (20 / 24));
    return (
        <span aria-hidden="true" className="grid shrink-0 place-items-center text-phi-text-primary" style={{ width: size, height: size }}>
            {mark ? (
                <svg viewBox={mark.viewBox} fill="currentColor" width={markSize} height={markSize} dangerouslySetInnerHTML={{ __html: mark.body }} />
            ) : (
                <span className="font-semibold leading-none" style={{ fontSize: Math.round(size * (15 / 24)) }}>{name.charAt(0).toUpperCase()}</span>
            )}
        </span>
    );
}
