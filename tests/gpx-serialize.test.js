import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { parseGpxText } from "../src/gpx/parse.js";
import { serializeGpxSource } from "../src/gpx/serialize.js";

const createDomParser = ({ onError } = {}) => new DOMParser({ errorHandler: { warning: onError, error: onError, fatalError: onError } });

describe("serializeGpxSource", () => {
  it("serializes routes between waypoints and tracks while preserving order", () => {
    const source = {
      name: "mixed.gpx",
      waypoints: [{ lat: 34.9, lon: 134.9, name: "Standalone" }],
      routes: [
        {
          name: "First & Planned",
          points: [
            { lat: 35, lon: 135, name: "Start <A>" },
            { lat: 35.1, lon: 135.1, name: "Goal" },
          ],
        },
        {
          name: "Second",
          points: [{ lat: 36, lon: 136, name: "" }],
        },
      ],
      tracks: [{
        name: "Recorded",
        segments: [{ points: [{ lat: 37, lon: 137, elevation: null, timestamp: null }] }],
      }],
    };

    const xml = serializeGpxSource(source);
    const waypointPosition = xml.indexOf("<wpt ");
    const routePosition = xml.indexOf("<rte>");
    const trackPosition = xml.indexOf("<trk>");

    expect(waypointPosition).toBeGreaterThan(-1);
    expect(routePosition).toBeGreaterThan(waypointPosition);
    expect(trackPosition).toBeGreaterThan(routePosition);
    expect((xml.match(/<rte>/g) || [])).toHaveLength(2);
    expect((xml.match(/<rtept /g) || [])).toHaveLength(3);
    expect(xml.indexOf('rtept lat="35"')).toBeLessThan(xml.indexOf('rtept lat="35.1"'));
    expect(xml.indexOf('rtept lat="35.1"')).toBeLessThan(xml.indexOf('rtept lat="36"'));
    expect(xml).toContain("<name>First &amp; Planned</name>");
    expect(xml).toContain("<name>Start &lt;A&gt;</name>");
  });

  it("round-trips routes as routes without converting route points to track points", () => {
    const routes = [
      {
        name: "Planned",
        points: [
          { lat: 35, lon: 135, name: "Start" },
          { lat: 35.1, lon: 135.1, name: "Goal" },
        ],
      },
      { name: undefined, points: [{ lat: 36, lon: 136, name: "" }] },
    ];
    const xml = serializeGpxSource({ routes, tracks: [], waypoints: [] });
    const parsed = parseGpxText(xml, { fileName: "routes.gpx", createDomParser });

    expect(parsed.routes).toEqual(routes);
    expect(parsed.tracks).toEqual([]);
    expect((xml.match(/<rte>/g) || [])).toHaveLength(2);
    expect((xml.match(/<rtept /g) || [])).toHaveLength(3);
    expect(xml).not.toContain("<trk>");
    expect(xml).not.toContain("<trkpt ");
  });

  it("preserves empty named and unnamed routes", () => {
    const routes = [
      { name: "Empty", points: [] },
      { name: undefined, points: [] },
    ];
    const xml = serializeGpxSource({ routes });

    expect(xml).toContain("  <rte>\n    <name>Empty</name>\n  </rte>");
    expect(xml).toContain("  <rte>\n  </rte>");
    expect(parseGpxText(xml, { createDomParser }).routes).toEqual(routes);
  });

  it("leaves output unchanged when the routes collection is omitted or empty", () => {
    const source = {
      name: "existing.gpx",
      waypoints: [{ lat: 35, lon: 135, name: "Start" }],
      tracks: [{
        name: "Recorded",
        segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: null }] }],
      }],
    };

    expect(serializeGpxSource(source)).toBe(serializeGpxSource({ ...source, routes: [] }));
  });

  it("round-trips track and segment hierarchy without naming unnamed tracks", () => {
    const source = { name: "exported.gpx", tracks: [{ name: "Named", segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: Date.parse("2024-01-01T00:00:00Z") }] }, { points: [{ lat: 35.1, lon: 135.1, elevation: null, timestamp: null }] }] }, { segments: [{ points: [{ lat: 36, lon: 136, elevation: null, timestamp: null }] }] }], waypoints: [{ lat: 35, lon: 135, name: "Start" }] };
    const xml = serializeGpxSource(source);
    expect((xml.match(/<trk>/g) || [])).toHaveLength(2);
    expect((xml.match(/<trkseg>/g) || [])).toHaveLength(3);
    expect(xml).toContain("<name>Named</name>");
    expect(xml).not.toContain("Track #2");
    expect(parseGpxText(xml, { fileName: "exported.gpx", createDomParser }).tracks).toEqual(source.tracks);
  });
});
