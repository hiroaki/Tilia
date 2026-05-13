import { beforeEach, describe, expect, it, vi } from "vitest";

const processInputItems = vi.hoisted(() => vi.fn());

vi.mock("../src/plugins/input/file-import.js", async () => {
  const actual = await vi.importActual("../src/plugins/input/file-import.js");
  return {
    ...actual,
    processInputItems,
  };
});

import { installDropzonePlugin } from "../src/plugins/input/dropzone.js";

function createDropTarget() {
  const listeners = new Map();
  const classList = {
    add: vi.fn(),
    remove: vi.fn(),
  };

  return {
    classList,
    listeners,
    addEventListener: vi.fn((eventName, handler) => {
      listeners.set(eventName, handler);
    }),
    contains: vi.fn((node) => node === "inside"),
  };
}

describe("installDropzonePlugin", () => {
  beforeEach(() => {
    processInputItems.mockReset();
  });

  it("highlights on dragover and keeps the highlight while moving inside the target", async () => {
    const dropTarget = createDropTarget();

    installDropzonePlugin({
      dropTarget,
      registry: {},
      context: {},
      onStatus: vi.fn(),
      onError: vi.fn(),
    });

    const dragoverEvent = { preventDefault: vi.fn() };
    dropTarget.listeners.get("dragover")(dragoverEvent);
    expect(dragoverEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(dropTarget.classList.add).toHaveBeenCalledWith("drop-active");

    dropTarget.listeners.get("dragleave")({ relatedTarget: "inside" });
    expect(dropTarget.classList.remove).not.toHaveBeenCalled();

    dropTarget.listeners.get("dragleave")({ relatedTarget: "outside" });
    expect(dropTarget.classList.remove).toHaveBeenCalledWith("drop-active");
  });

  it("processes dropped files through the shared input pipeline", async () => {
    const dropTarget = createDropTarget();
    const registry = { id: "registry" };
    const context = { id: "context" };
    const onStatus = vi.fn();
    const onError = vi.fn();
    const onItemLoaded = vi.fn();
    processInputItems.mockResolvedValue(undefined);

    installDropzonePlugin({
      dropTarget,
      registry,
      context,
      onStatus,
      onError,
      onItemLoaded,
    });

    const dropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [{ name: "track.gpx" }, { name: "photo.jpg" }],
      },
    };
    await dropTarget.listeners.get("drop")(dropEvent);

    expect(dropEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(dropTarget.classList.remove).toHaveBeenCalledWith("drop-active");
    expect(processInputItems).toHaveBeenCalledWith({
      items: [{ name: "track.gpx" }, { name: "photo.jpg" }],
      registry,
      context,
      onStatus,
      onError,
      sourceLabel: "drop",
      onItemLoaded,
    });
  });

  it("returns early when no drop target is provided", () => {
    expect(() => installDropzonePlugin({ dropTarget: null })).not.toThrow();
    expect(processInputItems).not.toHaveBeenCalled();
  });
});