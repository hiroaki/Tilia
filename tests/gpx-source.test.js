import { describe, expect, it } from "vitest";
import { cloneGpxSource, normalizeGpxSource, updateTrackPoint } from "../src/gpx/source.js";

const sourceInput = { name: "route.gpx", tracks: [{ segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: 1000 }, { lat: 35.1, lon: 135.1, elevation: null, timestamp: null }] }] }] };

describe("GPX source helpers", () => {
  it("normalizes hierarchy and leaves unnamed tracks unnamed", () => {
    const source = normalizeGpxSource(sourceInput);
    expect(source.tracks[0].name).toBeUndefined();
    expect(source.tracks[0].segments[0].points).toHaveLength(2);
    expect(source).not.toHaveProperty("trackPoints");
  });
  it("clones nested source objects without retaining point identity", () => {
    const source = normalizeGpxSource(sourceInput);
    const cloned = cloneGpxSource(source);
    expect(cloned).toEqual(source);
    expect(cloned.tracks[0].segments[0].points[0]).not.toBe(source.tracks[0].segments[0].points[0]);
  });
  it("updates one point through its structural locator", () => {
    const updated = updateTrackPoint(sourceInput, { trackIndex: 0, segmentIndex: 0, pointIndex: 1 }, { lat: 35.2, elevation: 20, timestamp: 2000 });
    expect(updated.tracks[0].segments[0].points[1]).toEqual({ lat: 35.2, lon: 135.1, elevation: 20, timestamp: 2000 });
  });
  it("ignores invalid coordinate patches", () => {
    const updated = updateTrackPoint(sourceInput, { trackIndex: 0, segmentIndex: 0, pointIndex: 1 }, { lat: "", lon: "bad" });
    expect(updated.tracks[0].segments[0].points[1]).toMatchObject({ lat: 35.1, lon: 135.1 });
  });
});