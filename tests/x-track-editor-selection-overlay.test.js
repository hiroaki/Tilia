import { beforeEach, describe, expect, it, vi } from "vitest";

const leafletMocks = vi.hoisted(() => ({
  groups: [],
  markers: [],
}));

vi.mock("leaflet", () => ({
  DivIcon: class {
    constructor(options) { this.options = options; }
  },
  LayerGroup: class {
    constructor() {
      this.layers = [];
      this.removed = false;
      leafletMocks.groups.push(this);
    }
    addTo(map) { this.map = map; return this; }
    clearLayers() { this.layers = []; return this; }
    remove() { this.removed = true; return this; }
  },
  Marker: class {
    constructor(latlng, options) {
      this.latlng = latlng;
      this.options = options;
      leafletMocks.markers.push(this);
    }
    addTo(group) { group.layers.push(this); return this; }
  },
}));

import { createSelectionOverlay } from "../plugins/x-track-editor/selection-overlay.js";

describe("x-track-editor selection overlay", () => {
  beforeEach(() => {
    leafletMocks.groups.length = 0;
    leafletMocks.markers.length = 0;
  });

  it("renders one non-interactive ring per resolved selected point and replaces stale rings", () => {
    const overlay = createSelectionOverlay({});
    const group = leafletMocks.groups[0];
    overlay.sync([]);
    expect(group.layers).toEqual([]);
    overlay.sync([
      { point: { lat: 35.1, lon: 135.1 } },
      { point: { lat: 35.2, lon: 135.2 } },
      { point: { lat: 35.3, lon: 135.3 } },
    ]);

    expect(group.layers.map((marker) => marker.latlng)).toEqual([
      [35.1, 135.1], [35.2, 135.2], [35.3, 135.3],
    ]);
    for (const marker of group.layers) {
      expect(marker.options).toMatchObject({
        interactive: false,
        keyboard: false,
        bubblingPointerEvents: false,
        zIndexOffset: 1000,
      });
      expect(marker.options.icon.options.className).toBe("tilia-track-editor-selection-ring");
    }

    overlay.sync([{ point: { lat: 36, lon: 136 } }]);
    expect(group.layers).toHaveLength(1);
    expect(group.layers[0].latlng).toEqual([36, 136]);
    overlay.destroy();
    expect(group.layers).toEqual([]);
    expect(group.removed).toBe(true);
  });
});
