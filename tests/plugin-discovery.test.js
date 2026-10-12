import { describe, expect, it } from "vitest";
import { buildPluginLoaderUrl, normalizeDiscoveredDefinition, loadDirectoryDefinition } from "../src/plugins/runtime/discovery.js";

const definition = (id, extra = {}) => ({ id, setup() {}, ...extra });
describe("fixed directory discovery", () => {
  it.each(["x-example", "company-special-plugin", "vendor-routing-tool"])("resolves %s from Tilia's own module", id => {
    expect(buildPluginLoaderUrl(id).href).toBe(new URL(`../plugins/${id}/loader.js`, import.meta.url).href);
  });
  it.each(["tilia-unknown", "Bad", "single", "../vendor-plugin", "vendor/other", "vendor%2fother", "https://example.com/plugin", "vendor-plugin?x", "vendor-plugin#x", "vendor\\plugin", ""])("rejects %s before importing", id => {
    expect(() => buildPluginLoaderUrl(id)).toThrowError(expect.objectContaining({ code: "PLUGIN_ID_INVALID" }));
  });
  it.each([{}, { default: null }, { default: [] }, { default: { id: "company-plugin" } }, { default: definition("vendor-other") }, { named: definition("company-plugin") }])("rejects invalid default exports", module => {
    expect(() => normalizeDiscoveredDefinition(module, "company-plugin")).toThrowError(expect.objectContaining({ code: "PLUGIN_IMPLEMENTATION_INVALID" }));
  });
  it.each([{ requires: "vendor-base" }, { requires: ["vendor-base", "vendor-base"] }, { requires: ["company-plugin"] }, { requires: ["../vendor-base"] }, { optionalRequires: [] }, { stylesheets: [] }, { destroy() {} }, { dispose() {} }])("reuses direct-definition metadata validation", extra => {
    expect(() => normalizeDiscoveredDefinition({ default: definition("company-plugin", extra) }, "company-plugin"))
      .toThrowError(expect.objectContaining({ code: "PLUGIN_DESCRIPTOR_INVALID" }));
  });
  it("normalizes the same definition used by direct installation without invoking setup", () => {
    let setups = 0;
    const plugin = definition("company-plugin", { requires: ["vendor-base"], setup() { setups++; } });
    const entry = normalizeDiscoveredDefinition({ default: plugin }, plugin.id);
    expect(entry.requires).toEqual(["vendor-base"]);
    expect(entry.load()).toBe(plugin);
    expect(setups).toBe(0);
  });
  it("reports the fixed URL and original cause when the loader is absent", async () => {
    await expect(loadDirectoryDefinition("company-missing-loader")).rejects.toMatchObject({
      code: "PLUGIN_RESOLUTION_FAILED", details: { pluginId: "company-missing-loader", url: buildPluginLoaderUrl("company-missing-loader").href }, cause: expect.any(Error),
    });
  });
});
