import { describe, expect, it, vi } from "vitest";

const leafletMocks = vi.hoisted(() => {
  class MockFeatureGroup {
    constructor() {
      this.layers = [];
    }

    addLayer(layer) {
      this.layers.push(layer);
      return this;
    }
  }

  class MockMarker {
    constructor(latlng) {
      this.latlng = latlng;
    }
  }

  class MockPolyline {
    constructor(latlngs, options) {
      this.latlngs = latlngs;
      this.options = options;
    }
  }

  class MockLatLngBounds {}

  return {
    MockFeatureGroup,
    MockMarker,
    MockPolyline,
    MockLatLngBounds,
  };
});

vi.mock("leaflet", () => ({
  FeatureGroup: leafletMocks.MockFeatureGroup,
  Marker: leafletMocks.MockMarker,
  Polyline: leafletMocks.MockPolyline,
  LatLngBounds: leafletMocks.MockLatLngBounds,
}));

import { buildGpxOverlay } from "../src/map/layers.js";
import { getTrackStylePreset } from "../src/map/track-style-presets.js";

describe("buildGpxOverlay", () => {
  it("applies the provided track style preset to the polyline", () => {
    const overlay = buildGpxOverlay({
      tracks: [{ segments: [{ points: [{ lat: 35, lon: 135 }, { lat: 35.1, lon: 135.1 }] }] }, { segments: [{ points: [{ lat: 36, lon: 136 }, { lat: 36.1, lon: 136.1 }] }] }],
      waypoints: [{ lat: 35.0, lon: 135.0, name: "Start" }],
    }, {
      trackStyle: getTrackStylePreset(4),
    });

    expect(overlay.interactions.trackLayers.map(({ layer }) => layer.options)).toEqual([getTrackStylePreset(4), getTrackStylePreset(4)]);
    expect(overlay.interactions.trackLayers.map(({ trackIndex }) => trackIndex)).toEqual([0, 1]);
    expect(overlay.layer.layers).toHaveLength(3);
  });
});