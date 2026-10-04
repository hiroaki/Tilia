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

    getBounds() {
      return new MockLatLngBounds(this.layers.length > 0);
    }
  }

  class MockDivIcon {
    constructor(options) {
      this.options = options;
    }
  }

  class MockMarker {
    constructor(latlng, options) {
      this.latlng = latlng;
      this.options = options;
    }
  }

  class MockPolyline {
    constructor(latlngs, options) {
      this.latlngs = latlngs;
      this.options = options;
    }
  }

  class MockLatLngBounds {
    constructor(valid = false) {
      this.valid = valid;
    }

    isValid() {
      return this.valid;
    }

    pad(value) {
      this.padding = value;
      return this;
    }
  }

  return {
    MockFeatureGroup,
    MockDivIcon,
    MockMarker,
    MockPolyline,
    MockLatLngBounds,
  };
});

vi.mock("leaflet", () => ({
  DivIcon: leafletMocks.MockDivIcon,
  FeatureGroup: leafletMocks.MockFeatureGroup,
  Marker: leafletMocks.MockMarker,
  Polyline: leafletMocks.MockPolyline,
  LatLngBounds: leafletMocks.MockLatLngBounds,
}));

import {
  buildGpxOverlay,
  createRoutePointPopupContent,
  createTrackPointPopupContent,
  createWaypointPopupContent,
  fitMapToGroup,
} from "../src/map/layers.js";
import { getTrackStylePreset } from "../src/map/track-style-presets.js";

describe("buildGpxOverlay", () => {
  it("applies the provided track style preset to the polyline", () => {
    const overlay = buildGpxOverlay({
      tracks: [{ segments: [{ points: [{ lat: 35, lon: 135 }, { lat: 35.1, lon: 135.1 }] }] }, { segments: [{ points: [{ lat: 36, lon: 136 }, { lat: 36.1, lon: 136.1 }] }] }],
      routes: [],
      waypoints: [{ lat: 35.0, lon: 135.0, name: "Start" }],
    }, {
      trackStyle: getTrackStylePreset(4),
    });

    expect(overlay.interactions.trackLayers.map(({ layer }) => layer.options)).toEqual([getTrackStylePreset(4), getTrackStylePreset(4)]);
    expect(overlay.interactions.trackLayers.map(({ trackIndex }) => trackIndex)).toEqual([0, 1]);
    expect(overlay.layer.layers).toHaveLength(3);
  });

  it("renders empty, single-point, and multi-point routes with internal locators", () => {
    const trackStyle = getTrackStylePreset(4);
    const routes = [
      { name: "Empty", points: [] },
      { name: "Single", points: [{ lat: 35, lon: 135, name: "Only" }] },
      {
        name: "Multiple",
        points: [
          { lat: 36, lon: 136, name: "Start" },
          { lat: 36.1, lon: 136.1, name: "Via" },
          { lat: 36.2, lon: 136.2, name: "Goal" },
        ],
      },
    ];
    const overlay = buildGpxOverlay({ tracks: [], routes, waypoints: [] }, { trackStyle });

    expect(overlay.interactions.routeLayers).toHaveLength(1);
    expect(overlay.interactions.routeLayers[0]).toMatchObject({ routeIndex: 2 });
    expect(overlay.interactions.routeLayers[0].layer.latlngs).toEqual([
      [36, 136],
      [36.1, 136.1],
      [36.2, 136.2],
    ]);
    expect(overlay.interactions.routeLayers[0].layer.options).toEqual({
      color: trackStyle.color,
      weight: trackStyle.weight - 2,
      opacity: trackStyle.opacity,
      dashArray: "8 6",
    });
    expect(overlay.interactions.routePoints).toHaveLength(4);
    expect(overlay.interactions.routePoints.map(({ routeIndex, pointIndex }) => ({ routeIndex, pointIndex }))).toEqual([
      { routeIndex: 1, pointIndex: 0 },
      { routeIndex: 2, pointIndex: 0 },
      { routeIndex: 2, pointIndex: 1 },
      { routeIndex: 2, pointIndex: 2 },
    ]);
    expect(overlay.layer.layers).toHaveLength(5);
  });

  it("numbers route-point DivIcons from one independently for each route", () => {
    const routePoints = [
      { lat: 35, lon: 135, name: "First" },
      { lat: 35.1, lon: 135.1, name: "Second" },
      { lat: 35.2, lon: 135.2, name: "Third" },
    ];
    const waypoint = { lat: 35.1, lon: 135.1, name: "Waypoint" };
    const overlay = buildGpxOverlay({
      tracks: [],
      routes: [
        { name: "Single", points: [routePoints[0]] },
        { name: "Two points", points: routePoints.slice(0, 2) },
        { name: "Three points", points: routePoints },
      ],
      waypoints: [waypoint],
    });

    const routeMarkers = overlay.interactions.routePoints.map(({ layer }) => layer);
    const waypointMarker = overlay.interactions.waypoints[0].layer;
    expect(routeMarkers.every(({ options }) => options.icon instanceof leafletMocks.MockDivIcon)).toBe(true);
    expect(routeMarkers.map(({ options }) => options.icon.options.html)).toEqual(["1", "1", "2", "1", "2", "3"]);
    expect(routeMarkers.every(({ options }) => options.icon.options.className === "tilia-route-point-marker")).toBe(true);
    expect(waypointMarker.options).toBeUndefined();
  });

  it("includes route layers in the existing feature-group bounds flow", () => {
    const overlay = buildGpxOverlay({
      tracks: [],
      routes: [{ name: "Single", points: [{ lat: 35, lon: 135, name: "Only" }] }],
      waypoints: [],
    });
    const map = { fitBounds: vi.fn() };

    fitMapToGroup(map, overlay.layer);

    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds.mock.calls[0][0]).toBeInstanceOf(leafletMocks.MockLatLngBounds);
    expect(map.fitBounds.mock.calls[0][0].padding).toBe(0.1);
  });
});

function createDocumentStub() {
  return {
    createElement(tagName) {
      return {
        tagName,
        className: "",
        textContent: "",
        children: [],
        appendChild(child) {
          this.children.push(child);
          return child;
        },
      };
    },
  };
}

function getPopupText(node) {
  return [node.textContent, ...node.children.flatMap(getPopupText)].filter(Boolean);
}

describe("GPX point popup terminology", () => {
  it("uses human-readable feature names for waypoint, route-point, and track-point types", () => {
    const originalDocument = globalThis.document;
    globalThis.document = createDocumentStub();
    try {
      expect(getPopupText(createWaypointPopupContent("waypoints.gpx", {
        name: "Start",
        lat: 35,
        lon: 135,
      }))).toEqual(expect.arrayContaining(["Type", "Waypoint"]));

      expect(getPopupText(createRoutePointPopupContent(
        { name: "routes.gpx", routes: [{ name: "Scenic route" }] },
        { name: "Viewpoint", lat: 35, lon: 135 },
        { routeIndex: 0, pointIndex: 0 },
      ))).toEqual(expect.arrayContaining(["Type", "Route point"]));

      expect(getPopupText(createTrackPointPopupContent(
        { name: "tracks.gpx", tracks: [] },
        { lat: 35, lon: 135, distanceMeters: 0, elevation: null, timestamp: null },
      ))).toEqual(expect.arrayContaining(["Type", "Track point"]));
    } finally {
      if (originalDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = originalDocument;
      }
    }
  });

  it("shows route-point details using human-readable terminology", () => {
    const originalDocument = globalThis.document;
    globalThis.document = createDocumentStub();
    try {
      const content = createRoutePointPopupContent(
        { name: "routes.gpx", routes: [{ name: "Scenic route" }] },
        { name: "Viewpoint", lat: 35.1234567, lon: 135.7654321 },
        { routeIndex: 0, pointIndex: 1 },
      );

      expect(getPopupText(content)).toEqual([
        "routes.gpx",
        "Type", "Route point",
        "Route", "Scenic route",
        "Name", "Viewpoint",
        "Latitude", "35.123457",
        "Longitude", "135.765432",
      ]);
    } finally {
      if (originalDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = originalDocument;
      }
    }
  });

  it("uses indexed route and unnamed route-point fallbacks", () => {
    const originalDocument = globalThis.document;
    globalThis.document = createDocumentStub();
    try {
      const content = createRoutePointPopupContent(
        { name: "routes.gpx", routes: [{}, {}] },
        { lat: 35, lon: 135 },
        { routeIndex: 1, pointIndex: 0 },
      );

      expect(getPopupText(content)).toContain("Route #2");
      expect(getPopupText(content)).toContain("Unnamed route point");
    } finally {
      if (originalDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = originalDocument;
      }
    }
  });
});
