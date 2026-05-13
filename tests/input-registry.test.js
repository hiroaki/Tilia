import { describe, expect, it, vi } from "vitest";

import { createInputRegistry } from "../src/core/input-registry.js";

describe("createInputRegistry", () => {
  it("dispatches to the first matching handler with the provided context and input", async () => {
    const registry = createInputRegistry();
    const firstHandler = vi.fn(async (context, input) => ({
      context,
      input,
      handledBy: "first",
    }));
    const secondHandler = vi.fn(async () => ({ handledBy: "second" }));
    const context = { app: "tilia" };
    const input = { name: "track.gpx", kind: "gpx" };

    registry.register((candidate) => candidate.kind === "gpx", firstHandler);
    registry.register((candidate) => candidate.name.endsWith(".gpx"), secondHandler);

    const result = await registry.dispatch(context, input);

    expect(result).toEqual({
      context,
      input,
      handledBy: "first",
    });
    expect(firstHandler).toHaveBeenCalledWith(context, input);
    expect(secondHandler).not.toHaveBeenCalled();
  });

  it("skips non-matching handlers until it finds a match", async () => {
    const registry = createInputRegistry();
    const skippedHandler = vi.fn();
    const matchedHandler = vi.fn(async () => "ok");

    registry.register((input) => input.kind === "photo", skippedHandler);
    registry.register((input) => input.kind === "gpx", matchedHandler);

    await expect(registry.dispatch({}, { name: "track.gpx", kind: "gpx" })).resolves.toBe("ok");
    expect(skippedHandler).not.toHaveBeenCalled();
    expect(matchedHandler).toHaveBeenCalledTimes(1);
  });

  it("throws a descriptive error for unsupported input", async () => {
    const registry = createInputRegistry();

    await expect(registry.dispatch({}, { name: "notes.txt" })).rejects.toThrow("Unsupported input: notes.txt");
    await expect(registry.dispatch({}, null)).rejects.toThrow("Unsupported input: unknown");
  });
});