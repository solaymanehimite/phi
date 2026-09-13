// Characterization tests: provider input validation.
// Covers `server/providers.ts` (used by /api/auth/providers): missing
// id/baseUrl/key and bad URL schemes are rejected.

import { describe, expect, test } from "bun:test";
import {
    normalizeProviderBaseUrl,
    validateProviderInput,
    validateProviderTestInput,
} from "../providers";

describe("validateProviderInput", () => {
    test("accepts a complete https input", () => {
        expect(
            validateProviderInput({ id: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "k" }),
        ).toBeNull();
    });

    test("rejects missing id, baseUrl, or apiKey", () => {
        expect(validateProviderInput({ baseUrl: "https://x", apiKey: "k" })).toBe("missing id/baseUrl/apiKey");
        expect(validateProviderInput({ id: "x", apiKey: "k" })).toBe("missing id/baseUrl/apiKey");
        expect(validateProviderInput({ id: "x", baseUrl: "https://x" })).toBe("missing id/baseUrl/apiKey");
    });

    test("rejects non-http(s) schemes", () => {
        expect(validateProviderInput({ id: "x", baseUrl: "ftp://x", apiKey: "k" })).toBe(
            "baseUrl must be http(s)://",
        );
        expect(validateProviderInput({ id: "x", baseUrl: "api.example.com", apiKey: "k" })).toBe(
            "baseUrl must be http(s)://",
        );
    });

    test("trailing slashes are normalized", () => {
        expect(normalizeProviderBaseUrl("https://x/v1///")).toBe("https://x/v1");
    });
});

describe("validateProviderTestInput", () => {
    test("requires both baseUrl and apiKey", () => {
        expect(validateProviderTestInput("https://x", "k")).toBeNull();
        expect(validateProviderTestInput(undefined, "k")).toBe("missing baseUrl/apiKey");
        expect(validateProviderTestInput("https://x", undefined)).toBe("missing baseUrl/apiKey");
    });
});
