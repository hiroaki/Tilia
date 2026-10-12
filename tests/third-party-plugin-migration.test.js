import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { builtinPluginCatalog } from "../src/builtins.js";
import { uiFixture, byClass } from "./helpers/production-ui.js";
let f;
afterEach(async () => { await f?.close(); f = null; });
const migrated = ["x-milestone", "x-track-editor", "x-route-search", "x-gpx-export", "x-gsi-base-maps", "x-opentopomap-base-maps"];
describe("repository third-party plugins install by directory convention", () => {
  it.each(migrated)("installs, removes and reinstalls %s without official metadata", async id => {
    expect(builtinPluginCatalog.some(entry => entry.id === id)).toBe(false);
    f = await uiFixture([id]);
    expect(f.app.hasPlugin(id)).toBe(true);
    if (id === "x-track-editor") expect(byClass(f.map.container, "tilia-track-editor-control").length).toBeGreaterThan(0);
    const providerIds = id === "x-gsi-base-maps" ? ["gsi-std", "gsi-pale"] : id === "x-opentopomap-base-maps" ? ["opentopomap"] : [];
    for (const providerId of providerIds) expect(f.context.baseMaps.get(providerId)).not.toBeNull();
    if (providerIds.length) {
      f.context.baseMaps.select(providerIds[0]);
      expect(f.context.baseMaps.getSelected().id).toBe(providerIds[0]);
    }
    const dependencies = f.app.listPlugins().filter(plugin => plugin.startsWith("tilia-"));
    for (const dependency of dependencies) await expect(f.app.unuse(dependency)).rejects.toMatchObject({ code: "PLUGIN_HAS_DEPENDENTS" });
    await f.app.unuse(id); expect(f.app.hasPlugin(id)).toBe(false);
    if (id === "x-track-editor") expect(byClass(f.map.container, "tilia-track-editor-control")).toHaveLength(0);
    for (const providerId of providerIds) expect(f.context.baseMaps.get(providerId)).toBeNull();
    if (providerIds.length) expect(f.context.baseMaps.getSelected().id).toBe("osm");
    await f.app.use(id); expect(f.app.hasPlugin(id)).toBe(true);
    for (const providerId of providerIds) expect(f.context.baseMaps.get(providerId)).not.toBeNull();
    for (const dependency of dependencies) expect(f.app.hasPlugin(dependency)).toBe(true);
  });
});
