import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { parseGpxText } from "../src/gpx/parse.js";

function createXmldomParser({ onError } = {}) {
  return new DOMParser({ errorHandler: { warning: onError, error: onError, fatalError: onError } });
}

describe("parseGpxText", () => {
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