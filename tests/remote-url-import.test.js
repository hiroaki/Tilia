import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processInputItems = vi.hoisted(() => vi.fn());

vi.mock("../src/core/input-processing.js", () => ({
  processInputItems,
}));

import { importRemoteUrl } from "../src/core/remote-url-import.js";

describe("importRemoteUrl", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    processInputItems.mockReset();
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("rejects empty and non-HTTP URLs without fetching", async () => {
    const onStatus = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await importRemoteUrl({ url: "", onStatus, onError: vi.fn() });
    await importRemoteUrl({ url: "ftp://example.com/track.gpx", onStatus, onError: vi.fn() });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenNthCalledWith(1, "URL is empty");
    expect(onStatus).toHaveBeenNthCalledWith(2, "URL import failed: only http:// and https:// URLs are supported");
  });

  it("fetches a valid GPX URL and delegates the resulting file to input processing", async () => {
    const body = new Blob(["<gpx />"], { type: "application/gpx+xml" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "content-type": "application/gpx+xml" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    processInputItems.mockResolvedValue(undefined);
    const registry = { id: "registry" };
    const context = { id: "context" };
    const onStatus = vi.fn();
    const onError = vi.fn();
    const onItemLoaded = vi.fn();

    await importRemoteUrl({
      url: "https://example.com/tracks/sample.gpx",
      registry,
      context,
      onStatus,
      onError,
      onItemLoaded,
    });

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/tracks/sample.gpx", expect.objectContaining({ mode: "cors" }));
    expect(processInputItems).toHaveBeenCalledWith(expect.objectContaining({
      registry, context, onStatus, onError, onItemLoaded, sourceLabel: "url",
      items: [expect.objectContaining({ name: "sample.gpx", type: "application/gpx+xml" })],
    }));
  });

  it("reports remote request failures through the existing callbacks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const onStatus = vi.fn();
    const onError = vi.fn();

    await importRemoteUrl({ url: "https://example.com/missing.gpx", onStatus, onError });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "HTTP 404" }));
    expect(onStatus).toHaveBeenCalledWith("URL import failed: HTTP 404");
  });
});
