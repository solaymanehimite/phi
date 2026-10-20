import { describe, expect, test } from "bun:test";
import { createStreamStore } from "../stream-store";

describe("Session stream store", () => {
  test("keeps a stable empty snapshot and updates only the selected session", () => {
    const store = createStreamStore();
    const empty = store.get("a");
    expect(store.get("a")).toBe(empty);
    expect(store.get(null)).toBe(empty);

    let aUpdates = 0;
    let bUpdates = 0;
    const unsubscribeA = store.subscribe("a", () => aUpdates++);
    store.subscribe("b", () => bUpdates++);

    store.update("b", (current) => ({ ...current, text: "background" }));
    expect(aUpdates).toBe(0);
    expect(bUpdates).toBe(1);
    expect(store.get("a")).toBe(empty);
    expect(store.get("b").text).toBe("background");

    store.update("a", (current) => ({ ...current, text: "visible" }));
    expect(aUpdates).toBe(1);
    expect(bUpdates).toBe(1);
    expect(store.get("a").text).toBe("visible");

    unsubscribeA();
    store.remove("a");
    expect(aUpdates).toBe(1);
    expect(store.get("a")).toBe(empty);
    expect(store.get("b").text).toBe("background");
  });

  test("notifies subscribers when a finished stream clears", () => {
    const store = createStreamStore();
    let updates = 0;
    store.subscribe("a", () => updates++);
    store.update("a", (current) => ({ ...current, text: "done" }));
    store.update("a", (current) => current);
    expect(updates).toBe(1);
    store.remove("a");
    expect(updates).toBe(2);
    expect(store.get("a").text).toBe("");
  });
});
