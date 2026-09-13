// Pure provider-input validation, extracted from the `/api/auth/providers`
// routes in `server/index.ts`. Returns an error message, or null when the
// input is acceptable. Callers throw their own `ApiError`.

export type ProviderInput = {
    id?: string;
    label?: string;
    baseUrl?: string;
    apiKey?: string;
};

export function validateProviderInput(input: ProviderInput): string | null {
    const { id, baseUrl, apiKey } = input;
    if (!id || !baseUrl || !apiKey) return "missing id/baseUrl/apiKey";
    if (!/^https?:\/\//.test(baseUrl)) return "baseUrl must be http(s)://";
    return null;
}

export function validateProviderTestInput(baseUrl?: string, apiKey?: string): string | null {
    if (!baseUrl || !apiKey) return "missing baseUrl/apiKey";
    return null;
}

export function normalizeProviderBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, "");
}
