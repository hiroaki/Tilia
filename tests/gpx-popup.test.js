import { describe, expect, it } from "vitest";
import { createWaypointPopupContent, createRoutePointPopupContent, createTrackPointPopupContent } from "../src/gpx/popup.js";

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

it("formats canonical optional fields safely, including zero elevation and epoch time", () => {
  const originalDocument = globalThis.document;
  globalThis.document = createDocumentStub();
  try {
    const text = getPopupText(createWaypointPopupContent("file.gpx", { lat: 0, lon: 0, elevation: 0, timestamp: 0, description: "<script>literal</script>", symbol: "Flag" }));
    expect(text).toContain("0 m");
    expect(text).toContain("<script>literal</script>");
    expect(text).toContain("Flag");
    expect(text.some((value) => value.includes("1970"))).toBe(true);
    expect(getPopupText(createRoutePointPopupContent({ routes: [] }, { lat: 0, lon: 0, elevation: null, timestamp: null }, { routeIndex: 0 }))).toEqual(expect.arrayContaining(["Elevation", "Time", "-"]));
  } finally {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});
