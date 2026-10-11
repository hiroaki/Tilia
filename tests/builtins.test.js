import { describe, expect, it } from "vitest";
import { builtinPluginCatalog, builtins } from "../src/builtins.js";

describe("Phase 4B built-in catalog", () => {
  it("contains unique immutable metadata without eager implementations", () => {
    expect(builtins).toBe(builtinPluginCatalog);
    expect(Object.isFrozen(builtinPluginCatalog)).toBe(true);
    expect(new Set(builtinPluginCatalog.map(({ id }) => id)).size).toBe(builtinPluginCatalog.length);
    for (const entry of builtinPluginCatalog) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.requires)).toBe(true);
      expect(entry.load).toEqual(expect.any(Function));
      expect(entry).not.toHaveProperty("setup");
    }
  });

  it("preserves hard panel dependency metadata", () => {
    const byId = new Map(builtinPluginCatalog.map((entry) => [entry.id, entry]));
    expect(byId.get("tilia-layers").requires).toEqual(["tilia-panel", "tilia-toolbar"]);
    expect(byId.get("tilia-elevation").requires).toEqual(["tilia-panel", "tilia-toolbar", "tilia-gpx-domain"]);
    expect(byId.get("tilia-settings").requires).toEqual(["tilia-panel", "tilia-toolbar"]);
  });

  it("publishes GPX and Photo domain metadata through literal lazy loaders", () => {
    const byId = new Map(builtinPluginCatalog.map((entry) => [entry.id, entry]));
    expect(byId.get("tilia-gpx-domain")).toMatchObject({ id: "tilia-gpx-domain", requires: [] });
    expect(byId.get("tilia-photo-domain")).toMatchObject({ id: "tilia-photo-domain", requires: [] });
  });
});
