import { describe, expect, it } from "vitest";

import { cloneGpxSource, normalizeGpxSource, updateTrackPoint } from "../src/gpx/source.js";

describe("GPX source helpers", () => {
  it("normalizes derived fields from track point details", () => {
    const source = normalizeGpxSource({
      name: "route.gpx",
      trackPointDetails: [
        { lat: 35.0, lon: 135.0, elevation: 10, timestamp: "2024-01-01T00:00:00Z" },
        { lat: 35.1, lon: 135.1, elevation: null, timestamp: null },
      ],
      waypoints: [{ lat: 35.0, lon: 135.0, name: "Start" }],
    });

    expect(source.type).toBe("gpx");
    expect(source.trackPoints).toEqual([[35.0, 135.0], [35.1, 135.1]]);
    expect(source.trackPointDetails[0].distanceMeters).toBe(0);
    expect(source.trackPointDetails[1].distanceMeters).toBeGreaterThan(0);
    expect(source.trackTimeline).toEqual([
      {
        timestamp: Date.parse("2024-01-01T00:00:00Z"),
        lat: 35.0,
        lon: 135.0,
      },
    ]);
    expect(source.elevationProfile).toEqual([
      expect.objectContaining({ lat: 35.0, lon: 135.0, elevation: 10 }),
    ]);
    expect(source.waypoints).toEqual([{ lat: 35.0, lon: 135.0, name: "Start" }]);
  });

  it("clones sources without retaining object identity", () => {
    const source = normalizeGpxSource({
      name: "sample.gpx",
      trackPointDetails: [{ lat: 35.0, lon: 135.0, elevation: 5, timestamp: 1000 }],
    });

    const cloned = cloneGpxSource(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned.trackPointDetails[0]).not.toBe(source.trackPointDetails[0]);
  });

  it("updates one point and rebuilds distances, timeline, and elevation profile", () => {
    const source = normalizeGpxSource({
      name: "edit.gpx",
      trackPointDetails: [
        { lat: 35.0, lon: 135.0, elevation: 10, timestamp: 1000 },
        { lat: 35.1, lon: 135.1, elevation: 20, timestamp: 2000 },
      ],
    });

    const updated = updateTrackPoint(source, 1, {
      lat: 35.2,
      elevation: null,
      timestamp: null,
    });

    expect(updated.trackPoints[1]).toEqual([35.2, 135.1]);
    expect(updated.trackPointDetails[1].elevation).toBeNull();
    expect(updated.trackPointDetails[1].timestamp).toBeNull();
    expect(updated.trackTimeline).toEqual([
      expect.objectContaining({ timestamp: 1000, lat: 35.0, lon: 135.0 }),
    ]);
    expect(updated.elevationProfile).toEqual([
      expect.objectContaining({ lat: 35.0, lon: 135.0, elevation: 10 }),
    ]);
  });
});