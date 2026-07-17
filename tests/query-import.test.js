import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryImportMocks = vi.hoisted(() => ({
  importRemoteUrl: vi.fn(),
}));

vi.mock("../src/plugins/input/url-import.js", () => ({
  importRemoteUrl: queryImportMocks.importRemoteUrl,
}));

import { installQueryImportPlugin } from "../src/plugins/input/query-import.js";

describe("query import plugin", () => {
  const originalWindow = globalThis.window;

  function setSearch(search) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { search },
      },
    });
  }

  beforeEach(() => {
    queryImportMocks.importRemoteUrl.mockReset();
    setSearch("");
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("does nothing when the query parameter is not present", async () => {
    await installQueryImportPlugin({
      registry: { id: "registry" },
      context: { id: "context" },
      onStatus: vi.fn(),
      onError: vi.fn(),
      onItemLoaded: vi.fn(),
    });

    expect(queryImportMocks.importRemoteUrl).not.toHaveBeenCalled();
  });

  it("imports from the default gpx query parameter", async () => {
    setSearch("?gpx=https%3A%2F%2Fexample.com%2Ftracks%2Fsample.gpx");
    const registry = { id: "registry" };
    const context = { id: "context" };
    const onStatus = vi.fn();
    const onError = vi.fn();
    const onItemLoaded = vi.fn();

    await installQueryImportPlugin({
      registry,
      context,
      onStatus,
      onError,
      onItemLoaded,
    });

    expect(queryImportMocks.importRemoteUrl).toHaveBeenCalledTimes(1);
    expect(queryImportMocks.importRemoteUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/tracks/sample.gpx",
        registry,
        context,
        onStatus,
        onError,
        onItemLoaded,
      })
    );
  });

  it("forwards custom parameter and limits to remote import", async () => {
    setSearch("?track=https%3A%2F%2Fexample.com%2Ftracks%2Fcustom.gpx");

    await installQueryImportPlugin({
      registry: { id: "registry" },
      context: { id: "context" },
      onStatus: vi.fn(),
      onError: vi.fn(),
      onItemLoaded: vi.fn(),
      parameterName: "track",
      timeoutMs: 2500,
      maxBytes: 2048,
    });

    expect(queryImportMocks.importRemoteUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/tracks/custom.gpx",
        timeoutMs: 2500,
        maxBytes: 2048,
      })
    );
  });
});
