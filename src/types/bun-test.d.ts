// Minimal ambient declarations for `bun:test` so `tsc --noEmit` stays green
// without adding new dependencies. The real runner is `bun test`
// (`bun run test`). Only the matchers used by our characterization tests
// are declared; extend as needed.

declare module "bun:test" {
    export function test(name: string, fn: () => void | Promise<void>): void;
    export function describe(name: string, fn: () => void): void;
    export function beforeEach(fn: () => void | Promise<void>): void;
    export function afterEach(fn: () => void | Promise<void>): void;

    export interface Matchers {
        toBe(expected: unknown): void;
        toEqual(expected: unknown): void;
        toStrictEqual(expected: unknown): void;
        toBeNull(): void;
        toBeUndefined(): void;
        toBeDefined(): void;
        toBeTruthy(): void;
        toBeFalsy(): void;
        toContain(expected: unknown): void;
        toContainEqual(expected: unknown): void;
        toHaveLength(expected: number): void;
        toMatch(expected: string | RegExp): void;
        toThrow(expected?: string | RegExp | (new (...args: Array<never>) => Error)): void;
        not: Matchers;
    }

    export function expect(actual: unknown): Matchers;
}
