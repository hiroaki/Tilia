import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { parseGpxText } from "../src/gpx/parse.js";
import { serializeGpxSource } from "../src/gpx/serialize.js";

function createXmldomParser({ onError } = {}) {
  return new DOMParser({
    errorHandler: {
      warning: onError,
      error: onError,
      fatalError: onError,
    },
  });
}

describe("serializeGpxSource", () => {
  it("serializes a normalized source into GPX that can be parsed again", () => {
    const xml = serializeGpxSource({
      name: "exported.gpx",
      trackPointDetails: [
        { lat: 35.0, lon: 135.0, elevation: 10, timestamp: Date.parse("2024-01-01T00:00:00Z") },
        { lat: 35.1, lon: 135.1, elevation: null, timestamp: null },
      ],
      waypoints: [{ lat: 35.0, lon: 135.0, name: "Start" }],
    });

    const parsed = parseGpxText(xml, {
      fileName: "exported.gpx",
      createDomParser: createXmldomParser,
    });

    expect(parsed.name).toBe("exported.gpx");
    expect(parsed.trackPoints).toEqual([[35.0, 135.0], [35.1, 135.1]]);
    expect(parsed.trackPointDetails[0]).toMatchObject({
      elevation: 10,
      timestamp: Date.parse("2024-01-01T00:00:00Z"),
    });
    expect(parsed.trackPointDetails[1]).toMatchObject({
      elevation: null,
      timestamp: null,
    });
    expect(parsed.waypoints).toEqual([{ lat: 35.0, lon: 135.0, name: "Start" }]);
  });
});