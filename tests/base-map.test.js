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
      baseLayers: [
        {
          id: "gsi-pale",
          label: "GSI Pale",
          provider: "gsi",
          category: "street",
          url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
          visibleInSelector: true,
        },
      ],
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

  it("keeps tileOptions working with the default OSM URL", () => {
    const baseMap = createBaseMap("map-root", {
      tileOptions: {
        maxZoom: 22,
      },
    });

    expect(baseMap.tileLayer.url).toBe(defaultBaseLayerDefinition.url);
    expect(baseMap.tileLayer.options).toEqual(expect.objectContaining({
      attribution: defaultBaseLayerDefinition.options.attribution,
      maxZoom: 22,
    }));
  });

  it("does not inherit OSM attribution when a custom tileUrl is provided", () => {
    const baseMap = createBaseMap("map-root", {
      tileUrl: "https://example.com/tiles/{z}/{x}/{y}.png",
    });

    expect(baseMap.tileLayer.url).toBe("https://example.com/tiles/{z}/{x}/{y}.png");
    expect(baseMap.tileLayer.options.attribution).toBeUndefined();
    expect(baseMap.baseLayer).toEqual(expect.objectContaining({
      id: "custom",
      label: "Custom",
      provider: "custom",
      attributionLabel: null,
    }));
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

  it("derives the current definition from selectedBaseLayerId when an existing layer is already attached", () => {
    const existingLayer = { id: "existing-layer" };
    const manager = createBaseLayerManager({
      map: { id: "map" },
      currentLayer: existingLayer,
      selectedBaseLayerId: "gsi-std",
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

    expect(manager.getCurrentLayer()).toBe(existingLayer);
    expect(manager.getCurrent()).toEqual(expect.objectContaining({ id: "gsi-std" }));
  });

  it("creates the missing tile layer when only the current definition is provided", () => {
    const manager = createBaseLayerManager({
      map: { id: "map" },
      currentDefinition: {
        id: "gsi-std",
        label: "GSI Standard",
        provider: "gsi",
        category: "street",
        url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
      },
      definitions: [
        {
          id: "gsi-std",
          label: "GSI Standard",
          provider: "gsi",
          category: "street",
          url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
        },
      ],
    });

    expect(manager.getCurrent()).toEqual(expect.objectContaining({ id: "gsi-std" }));
    expect(manager.getCurrentLayer()).toEqual(expect.objectContaining({
      url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
    }));
    expect(manager.getCurrentLayer().addTo).toHaveBeenCalledWith({ id: "map" });
  });

  it("throws the intended validation error for non-object registrations", () => {
    const manager = createBaseLayerManager({
      map: { id: "map" },
      definitions: [],
    });

    expect(() => manager.register(null)).toThrow("Base layer definitions must be objects");
  });

  it("throws the intended validation error when baseLayers contain non-objects and overrides are enabled", () => {
    expect(() => createBaseMap("map-root", {
      baseLayers: [null],
      baseLayerOverrides: {
        anything: {
          label: "Ignored",
        },
      },
    })).toThrow("Base layer definitions must be objects");
  });

  it("rejects duplicate base-layer ids instead of overwriting the active state", () => {
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
      ],
    });

    expect(() => manager.register({
      id: "osm",
      label: "Replaced OSM",
      provider: "osm",
      category: "street",
      url: "https://example.com/osm/{z}/{x}/{y}.png",
    })).toThrow("Base layer already registered: osm");
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