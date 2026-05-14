import { describe, expect, it, vi } from "vitest";

const leafletMocks = vi.hoisted(() => {
  class MockTileLayer {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.addTo = vi.fn((map) => {
        this.map = map;
        return this;
      });
      this.remove = vi.fn(() => this);
    }
  }

  class MockMap {
    constructor(containerId, options) {
      this.containerId = containerId;
      this.options = options;
      this.setView = vi.fn();
    }
  }

  return {
    MockMap,
    MockTileLayer,
  };
});

vi.mock("leaflet", () => ({
  Map: leafletMocks.MockMap,
  TileLayer: leafletMocks.MockTileLayer,
}));

import {
  createBaseLayerManager,
  createBaseMap,
  defaultBaseLayerDefinition,
  defaultBaseLayerDefinitions,
} from "../src/map/base.js";

describe("base-map runtime", () => {
  it("creates a default OSM base layer map", () => {
    const baseMap = createBaseMap("map-root");

    expect(baseMap.map.containerId).toBe("map-root");
    expect(baseMap.baseLayer).toEqual(expect.objectContaining({
      id: "osm",
      label: "OpenStreetMap",
      visibleInSelector: true,
    }));
    expect(baseMap.baseLayers.map((definition) => definition.id)).toEqual(
      defaultBaseLayerDefinitions.map((definition) => definition.id),
    );
    expect(baseMap.tileLayer.url).toBe(defaultBaseLayerDefinition.url);
  });

  it("applies id-based definition overrides without changing the catalog shape", () => {
    const baseMap = createBaseMap("map-root", {
      selectedBaseLayerId: "gsi-pale",
      baseLayerOverrides: {
        "gsi-pale": {
          label: "GSI Pale Custom",
          visibleInSelector: false,
        },
      },
    });

    expect(baseMap.baseLayer).toEqual(expect.objectContaining({
      id: "gsi-pale",
      label: "GSI Pale Custom",
      visibleInSelector: false,
    }));
    expect(baseMap.baseLayers.find((definition) => definition.id === "gsi-pale")).toEqual(
      expect.objectContaining({
        id: "gsi-pale",
        label: "GSI Pale Custom",
        visibleInSelector: false,
      }),
    );
    expect(
      baseMap.baseLayerManager.listVisible().some((definition) => definition.id === "gsi-pale"),
    ).toBe(false);
  });

  it("switches the active base layer and removes the previous tile layer", () => {
    const map = { id: "map" };
    const manager = createBaseLayerManager({
      map,
      definitions: [
        {
          id: "osm",
          label: "OpenStreetMap",
          provider: "osm",
          category: "street",
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          isDefault: true,
        },
        {
          id: "gsi-std",
          label: "GSI Standard",
          provider: "gsi",
          category: "street",
          url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
        },
      ],
    });

    const firstLayer = manager.getCurrentLayer();
    const selection = manager.select("gsi-std");

    expect(firstLayer.remove).toHaveBeenCalledTimes(1);
    expect(selection.definition).toEqual(expect.objectContaining({ id: "gsi-std" }));
    expect(selection.layer.url).toBe("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png");
    expect(selection.layer.addTo).toHaveBeenCalledWith(map);
    expect(manager.getCurrent()).toEqual(expect.objectContaining({ id: "gsi-std" }));
  });

  it("keeps hidden definitions out of selector lists without removing them from the catalog", () => {
    const manager = createBaseLayerManager({
      map: { id: "map" },
      definitions: [
        {
          id: "osm",
          label: "OpenStreetMap",
          provider: "osm",
          category: "street",
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          isDefault: true,
        },
        {
          id: "gsi-hidden",
          label: "Hidden GSI",
          provider: "gsi",
          category: "street",
          url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
          visibleInSelector: false,
        },
      ],
    });

    expect(manager.list().map((definition) => definition.id)).toEqual(["osm", "gsi-hidden"]);
    expect(manager.listVisible().map((definition) => definition.id)).toEqual(["osm"]);
    expect(manager.get("gsi-hidden")).toEqual(expect.objectContaining({
      id: "gsi-hidden",
      visibleInSelector: false,
    }));
  });
});