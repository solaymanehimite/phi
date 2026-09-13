// Characterization tests: thinking-level clamp per model map.
// Covers `server/thinking.ts` (used by /api/models): unsupported levels
// fall back per the model's thinkingLevelMap.

import { describe, expect, test } from "bun:test";
import { clampThinkingLevel, supportedThinkingLevels } from "../thinking";

describe("supportedThinkingLevels", () => {
    test("non-reasoning models only support off", () => {
        expect(supportedThinkingLevels({ reasoning: false })).toEqual(["off"]);
        expect(supportedThinkingLevels(null)).toEqual(["off"]);
    });

    test("reasoning models without a map support off..high, not xhigh/max", () => {
        expect(supportedThinkingLevels({ reasoning: true })).toEqual(["off", "minimal", "low", "medium", "high"]);
    });

    test("null-mapped levels are excluded; xhigh/max need explicit entries", () => {
        const model = {
            reasoning: true,
            thinkingLevelMap: { minimal: "a", low: null, xhigh: "b" },
        };
        const levels = supportedThinkingLevels(model);
        expect(levels).toContain("minimal");
        expect(levels).not.toContain("low");
        expect(levels).toContain("xhigh");
        expect(levels).not.toContain("max");
    });
});

describe("clampThinkingLevel", () => {
    test("supported levels pass through", () => {
        expect(clampThinkingLevel({ reasoning: true }, "medium")).toBe("medium");
    });

    test("unsupported levels prefer the next higher supported level", () => {
        const model = { reasoning: true, thinkingLevelMap: { low: null } };
        expect(clampThinkingLevel(model, "low")).toBe("medium");
    });

    test("falls back downward when nothing higher is supported", () => {
        const model = { reasoning: true, thinkingLevelMap: { high: null } };
        expect(clampThinkingLevel(model, "max")).toBe("medium");
    });

    test("unknown levels and non-reasoning models yield the first supported", () => {
        expect(clampThinkingLevel({ reasoning: true }, "ultra")).toBe("off");
        expect(clampThinkingLevel({ reasoning: false }, "high")).toBe("off");
    });
});
