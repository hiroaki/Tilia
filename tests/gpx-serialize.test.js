import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { parseGpxText } from "../src/gpx/parse.js";
import { serializeGpxSource } from "../src/gpx/serialize.js";

const createDomParser = ({ onError } = {}) => new DOMParser({ errorHandler: { warning: onError, error: onError, fatalError: onError } });

describe("serializeGpxSource", () => {
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