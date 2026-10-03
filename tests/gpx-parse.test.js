import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import {
  MAX_ROUTES_PER_GPX,
  MAX_ROUTE_POINTS_PER_ROUTE,
  parseGpxText,
} from "../src/gpx/parse.js";

function createXmldomParser({ onError } = {}) {
  return new DOMParser({ errorHandler: { warning: onError, error: onError, fatalError: onError } });
}

describe("parseGpxText", () => {
  it("normalizes a GPX document without routes to an empty routes collection", () => {
    const parsed = parseGpxText("<gpx/>", { createDomParser: createXmldomParser });

    expect(parsed.routes).toEqual([]);
  });

  it("preserves route and route-point order with their supported fields", () => {
    const xml = `<gpx><rte><name>First</name><rtept lat="35" lon="135"><name>Start</name></rtept><rtept lat="35.1" lon="135.1"><name>Goal</name></rtept></rte><rte><rtept lat="36" lon="136"/></rte></gpx>`;
    const parsed = parseGpxText(xml, { fileName: "routes.gpx", createDomParser: createXmldomParser });

    expect(parsed.routes).toEqual([
      {
        name: "First",
        points: [
          { lat: 35, lon: 135, name: "Start" },
          { lat: 35.1, lon: 135.1, name: "Goal" },
        ],
      },
      {
        name: undefined,
        points: [{ lat: 36, lon: 136, name: "" }],
      },
    ]);
  });

  it("preserves empty routes while dropping invalid route points", () => {
    const xml = `<gpx><rte><name>Empty</name></rte><rte><rtept lat="NaN" lon="135"/><rtept lat="35" lon="135"/></rte></gpx>`;
    const parsed = parseGpxText(xml, { createDomParser: createXmldomParser });

    expect(parsed.routes).toEqual([
      { name: "Empty", points: [] },
      { name: undefined, points: [{ lat: 35, lon: 135, name: "" }] },
    ]);
  });

  it("accepts the maximum number of routes and rejects one more", () => {
    const route = "<rte/>";
    const accepted = parseGpxText(`<gpx>${route.repeat(MAX_ROUTES_PER_GPX)}</gpx>`, {
      fileName: "twenty.gpx",
      createDomParser: createXmldomParser,
    });

    expect(accepted.routes).toHaveLength(MAX_ROUTES_PER_GPX);
    expect(() => parseGpxText(`<gpx>${route.repeat(MAX_ROUTES_PER_GPX + 1)}</gpx>`, {
      fileName: "twenty-one.gpx",
      createDomParser: createXmldomParser,
    })).toThrow(/Too many GPX routes.*21.*20/);
  });

  it("accepts the maximum route-point count and rejects one more before normalization", () => {
    const validPoint = '<rtept lat="35" lon="135"/>';
    const accepted = parseGpxText(`<gpx><rte>${validPoint.repeat(MAX_ROUTE_POINTS_PER_ROUTE)}</rte></gpx>`, {
      fileName: "one-hundred.gpx",
      createDomParser: createXmldomParser,
    });

    expect(accepted.routes[0].points).toHaveLength(MAX_ROUTE_POINTS_PER_ROUTE);

    const invalidPoint = '<rtept lat="NaN" lon="135"/>';
    expect(() => parseGpxText(`<gpx><rte>${invalidPoint}${validPoint.repeat(MAX_ROUTE_POINTS_PER_ROUTE)}</rte></gpx>`, {
      fileName: "one-hundred-one.gpx",
      createDomParser: createXmldomParser,
    })).toThrow(/Too many route points.*#1.*101.*100/);
  });

  it("applies the route-point limit independently to each route", () => {
    const point = '<rtept lat="35" lon="135"/>';
    const route = `<rte>${point.repeat(MAX_ROUTE_POINTS_PER_ROUTE)}</rte>`;
    const parsed = parseGpxText(`<gpx>${route}${route}</gpx>`, {
      createDomParser: createXmldomParser,
    });

    expect(parsed.routes.map(({ points }) => points.length)).toEqual([100, 100]);
  });

  it("preserves track, segment, and point order while dropping invalid points", () => {
    const xml = `<gpx><trk><name>A</name><trkseg><trkpt lat="35" lon="135"/><trkpt lat="NaN" lon="1"/></trkseg><trkseg><trkpt lat="36" lon="136"><ele>12</ele><time>2024-01-01T00:00:00Z</time></trkpt></trkseg></trk><trk><trkseg><trkpt lat="37" lon="137"/></trkseg></trk></gpx>`;
    const parsed = parseGpxText(xml, { fileName: "many.gpx", createDomParser: createXmldomParser });
    expect(parsed.tracks).toEqual([
      { name: "A", segments: [{ points: [{ lat: 35, lon: 135, elevation: null, timestamp: null }] }, { points: [{ lat: 36, lon: 136, elevation: 12, timestamp: Date.parse("2024-01-01T00:00:00Z") }] }] },
      { name: undefined, segments: [{ points: [{ lat: 37, lon: 137, elevation: null, timestamp: null }] }] },
    ]);
  });
  it("throws a file-scoped error for invalid GPX XML", () => {
    expect(() => parseGpxText("<gpx><trk>", { fileName: "broken.gpx", createDomParser: createXmldomParser })).toThrow("Invalid GPX XML: broken.gpx");
  });
});
