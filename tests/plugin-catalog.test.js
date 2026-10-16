import { describe, expect, it, vi } from "vitest";
import { normalizeCatalog, createPluginRuntime } from "../src/plugins/runtime/index.js";

describe("plugin catalog and lazy resolution", () => {
  it("validates metadata without invoking implementation loaders", () => {
    const load = vi.fn();
    normalizeCatalog([{ id: "tilia-example", requires: [], load }]);
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: "Bad", load() {} }, "PLUGIN_ID_INVALID"],
    [{ id: "x-one", requires: ["x-dep", "x-dep"], load() {} }, "PLUGIN_DESCRIPTOR_INVALID"],
    [{ id: "x-one", optionalRequires: ["x-dep"], load() {} }, "PLUGIN_DESCRIPTOR_INVALID"],
    [{ id: "x-one", stylesheets: ["x.css"], load() {} }, "PLUGIN_DESCRIPTOR_INVALID"],
  ])("rejects invalid catalog metadata", (entry, code) => {
    expect(() => normalizeCatalog([entry])).toThrowError(expect.objectContaining({ code }));
  });

  it("caches successful resolution and deduplicates concurrent resolution", async () => {
    let release;
    const load = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const runtime = createPluginRuntime({ catalog: [{ id: "x-lazy", load }] });
    const first = runtime.use("x-lazy");
    const second = runtime.use("x-lazy");
    while (!release) await Promise.resolve();
    release({ default: { id: "x-lazy", setup() {} } });
    await expect(Promise.all([first, second])).resolves.toEqual([{ id: "x-lazy" }, { id: "x-lazy" }]);
    await runtime.unuse("x-lazy");
    await runtime.use("x-lazy");
    expect(load).toHaveBeenCalledOnce();
  });

  it("does not cache failed resolution", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ default: { id: "x-retry", setup() {} } });
    const runtime = createPluginRuntime({ catalog: [{ id: "x-retry", load }] });
    await expect(runtime.use("x-retry")).rejects.toMatchObject({ code: "PLUGIN_RESOLUTION_FAILED" });
    await expect(runtime.use("x-retry")).resolves.toEqual({ id: "x-retry" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("clears pending resolution after implementation validation failure", async () => {
    const load = vi.fn().mockResolvedValueOnce({ default: { id: "vendor-other", setup() {} } })
      .mockResolvedValueOnce({ default: { id: "vendor-retry", setup() {} } });
    const runtime = createPluginRuntime({ catalog: [{ id: "vendor-retry", load }] });
    await expect(runtime.use("vendor-retry")).rejects.toMatchObject({ code: "PLUGIN_IMPLEMENTATION_INVALID" });
    await expect(runtime.use("vendor-retry")).resolves.toEqual({ id: "vendor-retry" });
    expect(load).toHaveBeenCalledTimes(2);
    await runtime.destroy();
  });

  it("validates the resolved implementation ID and shape", async () => {
    const runtime = createPluginRuntime({
      catalog: [{ id: "x-expected", load: () => ({ default: { id: "x-other", setup() {} } }) }],
    });
    await expect(runtime.use("x-expected")).rejects.toMatchObject({ code: "PLUGIN_IMPLEMENTATION_INVALID" });
  });
});
