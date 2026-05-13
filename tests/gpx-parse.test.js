import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { parseGpxText } from "../src/gpx/parse.js";

const sampleGpx = readFileSync(resolve(import.meta.dirname, "fixtures/sample-track.gpx"), "utf8");

function createXmldomParser({ onError } = {}) {
  return new DOMParser({
    errorHandler: {
      warning: onError,
      error: onError,
      fatalError: onError,
    },
  });
}

describe("parseGpxText", () => {
  it("parses points, waypoints, sorted timeline, and elevation profile from GPX text", () => {
    const parsed = parseGpxText(sampleGpx, {
      fileName: "sample-track.gpx",
      createDomParser: createXmldomParser,
    });

    expect(parsed.type).toBe("gpx");
    expect(parsed.name).toBe("sample-track.gpx");
    expect(parsed.trackPoints).toEqual([
      [35.2, 135.2],
      [35.1, 135.1],
      [35.3, 135.3],
    ]);
    expect(parsed.trackTimeline.map((point) => point.timestamp)).toEqual([
      Date.parse("2024-01-01T00:00:00Z"),
      Date.parse("2024-01-01T00:10:00Z"),
    ]);
    expect(parsed.trackTimeline.map((point) => [point.lat, point.lon])).toEqual([
      [35.1, 135.1],
      [35.2, 135.2],
    ]);
    expect(parsed.trackPointDetails).toHaveLength(3);
    expect(parsed.trackPointDetails[0]).toMatchObject({
      lat: 35.2,
      lon: 135.2,
      elevation: 120.5,
      timestamp: Date.parse("2024-01-01T00:10:00Z"),
      distanceMeters: 0,
    });
    expect(parsed.trackPointDetails[1].elevation).toBeNull();
    expect(parsed.trackPointDetails[1].timestamp).toBe(Date.parse("2024-01-01T00:00:00Z"));
    expect(parsed.trackPointDetails[1].distanceMeters).toBeGreaterThan(0);
    expect(parsed.trackPointDetails[2].timestamp).toBeNull();
    expect(parsed.trackPointDetails[2].distanceMeters).toBeGreaterThan(parsed.trackPointDetails[1].distanceMeters);
    expect(parsed.elevationProfile).toEqual([
      expect.objectContaining({ lat: 35.2, lon: 135.2, elevation: 120.5 }),
      expect.objectContaining({ lat: 35.3, lon: 135.3, elevation: 130 }),
    ]);
    expect(parsed.waypoints).toEqual([
      {
        lat: 35.01,
        lon: 135.01,
        name: "Start marker",
      },
    ]);
  });

  it("throws a file-scoped error for invalid GPX XML", () => {
    expect(() => parseGpxText("<gpx><trk>", {
      fileName: "broken.gpx",
      createDomParser: createXmldomParser,
    })).toThrow("Invalid GPX XML: broken.gpx");
  });
});