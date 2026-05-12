import { describe, expect, it, vi } from "vitest";

import { installFileImportPlugin, processInputItems } from "../src/plugins/input/file-import.js";

describe("processInputItems", () => {
  it("reports the last successful load summary and item callbacks", async () => {
    const registry = {
      dispatch: vi.fn()
        .mockResolvedValueOnce({ name: "first.gpx", summary: "1 point" })
        .mockResolvedValueOnce({ name: "second.jpg", summary: "photo marker" }),
    };
    const context = {
      state: {
        layers: [{}, {}],
      },
    };
    const onStatus = vi.fn();
    const onError = vi.fn();
    const onItemLoaded = vi.fn();
    const items = [{ name: "first.gpx" }, { name: "second.jpg" }];

    await processInputItems({
      items,
      registry,
      context,
      onStatus,
      onError,
      onItemLoaded,
      sourceLabel: "file",
    });

    expect(registry.dispatch).toHaveBeenNthCalledWith(1, context, items[0]);
    expect(registry.dispatch).toHaveBeenNthCalledWith(2, context, items[1]);
    expect(onItemLoaded).toHaveBeenNthCalledWith(1, { name: "first.gpx", summary: "1 point" });
    expect(onItemLoaded).toHaveBeenNthCalledWith(2, { name: "second.jpg", summary: "photo marker" });
    expect(onError).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith(
      "Loaded 2 file(s) from file. Total layers: 2. Last: second.jpg (photo marker)",
    );
  });

  it("keeps going after item failures and includes the first failure in status", async () => {
    const registry = {
      dispatch: vi.fn()
        .mockRejectedValueOnce(new Error("bad gpx"))
        .mockResolvedValueOnce({ name: "photo.jpg", summary: "photo marker" })
        .mockRejectedValueOnce(new Error("bad jpeg")),
    };
    const context = {
      state: {
        layers: [{}, {}, {}],
      },
    };
    const onStatus = vi.fn();
    const onError = vi.fn();
    const items = [{ name: "broken.gpx" }, { name: "photo.jpg" }, { name: "broken.jpg" }];

    await processInputItems({
      items,
      registry,
      context,
      onStatus,
      onError,
      sourceLabel: "drop",
    });

    expect(onError).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenCalledWith(
      "Loaded 1 file(s) from drop. Total layers: 3. Last: photo.jpg (photo marker). Failed: 2. broken.gpx: bad gpx",
    );
  });

  it("reports an overall failure when nothing could be loaded", async () => {
    const registry = {
      dispatch: vi.fn().mockRejectedValue(new Error("unsupported")),
    };
    const onStatus = vi.fn();
    const onError = vi.fn();

    await processInputItems({
      items: [{ name: "notes.txt" }],
      registry,
      context: { state: { layers: [] } },
      onStatus,
      onError,
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith("Failed: 1 file(s). notes.txt: unsupported");
  });

  it("returns early for an empty queue", async () => {
    const registry = {
      dispatch: vi.fn(),
    };
    const onStatus = vi.fn();

    await processInputItems({
      items: [],
      registry,
      context: { state: { layers: [] } },
      onStatus,
      onError: vi.fn(),
    });

    expect(registry.dispatch).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });
});

describe("installFileImportPlugin", () => {
  it("processes selected files and clears the input value after change", async () => {
    const listeners = new Map();
    const fileInput = {
      value: "selected",
      addEventListener: vi.fn((eventName, handler) => {
        listeners.set(eventName, handler);
      }),
    };
    const registry = {
      dispatch: vi.fn().mockResolvedValue({ name: "track.gpx", summary: "1 point" }),
    };
    const context = {
      state: {
        layers: [{}],
      },
    };
    const onStatus = vi.fn();
    const onError = vi.fn();
    const onItemLoaded = vi.fn();

    installFileImportPlugin({
      fileInput,
      registry,
      context,
      onStatus,
      onError,
      onItemLoaded,
    });

    await listeners.get("change")({
      target: {
        files: [{ name: "track.gpx" }],
        value: "selected",
      },
    });

    expect(onItemLoaded).toHaveBeenCalledWith({ name: "track.gpx", summary: "1 point" });
    expect(onStatus).toHaveBeenCalledWith(
      "Loaded 1 file(s) from file. Total layers: 1. Last: track.gpx (1 point)",
    );
  });

  it("does nothing when no input element is provided", () => {
    expect(() => installFileImportPlugin({})).not.toThrow();
  });
});