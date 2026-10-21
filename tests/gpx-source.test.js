import { describe, expect, it } from "vitest";
import { cloneGpxSource, normalizeGpxSource, updateTrackPoint } from "../src/gpx/source.js";

const sourceInput = { name: "route.gpx", tracks: [{ segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: 1000 }, { lat: 35.1, lon: 135.1, elevation: null, timestamp: null }] }] }] };

describe("GPX source helpers", () => {
  it("accepts omitted routes and always returns the canonical collections", () => {
    const source = normalizeGpxSource({ tracks: [], waypoints: [] });

    expect(source).toMatchObject({ tracks: [], routes: [], waypoints: [] });
  });

  it("normalizes routes without conflating route points with track points", () => {
    const source = normalizeGpxSource({
      routes: [
        { name: "Planned", points: [{ lat: "35", lon: "135", name: "Start" }, { lat: "bad", lon: 136 }] },
        { name: "", points: [] },
      ],
    });

    expect(source.routes).toEqual([
      { name: "Planned", points: [{ lat: 35, lon: 135, name: "Start" }] },
      { name: undefined, points: [] },
    ]);
    expect(source.tracks).toEqual([]);
  });

  it("does not apply XML import limits to programmatically supplied routes", () => {
    const routes = Array.from({ length: 21 }, (_, routeIndex) => ({
      name: `Route ${routeIndex + 1}`,
      points: Array.from({ length: 101 }, (_, pointIndex) => ({
        lat: 35 + (pointIndex / 1000),
        lon: 135,
        name: "",
      })),
    }));

    const source = normalizeGpxSource({ routes });

    expect(source.routes).toHaveLength(21);
    expect(source.routes[0].points).toHaveLength(101);
  });

  it("normalizes hierarchy and leaves unnamed tracks unnamed", () => {
    const source = normalizeGpxSource(sourceInput);
    expect(source.tracks[0].name).toBeUndefined();
    expect(source.tracks[0].segments[0].points).toHaveLength(2);
    expect(source).not.toHaveProperty("trackPoints");
  });
  it("clones nested source objects without retaining point identity", () => {
    const source = normalizeGpxSource({
      ...sourceInput,
      routes: [{ name: "Planned", points: [{ lat: 34.9, lon: 134.9, name: "Start" }] }],
    });
    const cloned = cloneGpxSource(source);
    expect(cloned).toEqual(source);
    expect(cloned.tracks[0].segments[0].points[0]).not.toBe(source.tracks[0].segments[0].points[0]);
    expect(cloned.routes[0]).not.toBe(source.routes[0]);
    expect(cloned.routes[0].points[0]).not.toBe(source.routes[0].points[0]);
  });
  it("updates one point through its structural locator", () => {
    const route = { name: "Planned", points: [{ lat: 34.9, lon: 134.9, name: "Start" }] };
    const updated = updateTrackPoint({ ...sourceInput, routes: [route] }, { trackIndex: 0, segmentIndex: 0, pointIndex: 1 }, { lat: 35.2, elevation: 20, timestamp: 2000 });
    expect(updated.tracks[0].segments[0].points[1]).toEqual({ lat: 35.2, lon: 135.1, elevation: 20, timestamp: 2000 });
    expect(updated.routes).toEqual([route]);
  });
  it("ignores invalid coordinate patches", () => {
    const updated = updateTrackPoint(sourceInput, { trackIndex: 0, segmentIndex: 0, pointIndex: 1 }, { lat: "", lon: "bad" });
    expect(updated.tracks[0].segments[0].points[1]).toMatchObject({ lat: 35.1, lon: 135.1 });
  });
});
