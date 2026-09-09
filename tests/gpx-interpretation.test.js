import { describe, expect, it } from "vitest";
import {
  getSourceDistanceSummary,
  getNearestTrackModePoint,
  getTrackModeCoordinates,
  getTrackModeElevationLayout,
  getTrackModeProfile,
} from "../src/gpx/interpretation.js";

describe("Track-mode GPX interpretation", () => {
  it("joins segments within a track while keeping tracks independent", () => {
    const source = { tracks: [{ segments: [{ points: [{ lat: 35, lon: 135, elevation: 1 }, { lat: 35.01, lon: 135.01, elevation: 2 }] }, { points: [{ lat: 35.02, lon: 135.02, elevation: 3 }] }] }, { segments: [{ points: [{ lat: 40, lon: 140, elevation: 4 }, { lat: 40.01, lon: 140.01, elevation: 5 }] }] }] };
    expect(getTrackModeCoordinates(source.tracks[0])).toHaveLength(3);
    const summary = getSourceDistanceSummary(source);
    expect(summary.recordedDistanceMeters).toBeGreaterThan(0);
    expect(summary.inferredDistanceMeters).toBeGreaterThan(0);
    expect(summary.totalDistanceMeters).toBe(summary.recordedDistanceMeters + summary.inferredDistanceMeters);
    expect(getTrackModeProfile(source.tracks[0], 0)).toHaveLength(3);
    expect(getTrackModeProfile(source.tracks[1], 1)).toHaveLength(2);
  });

  it("lays out tracks sequentially without adding an inter-track geographic distance", () => {
    const source = {
      tracks: [
        { segments: [{ points: [{ lat: 35, lon: 135, elevation: 1 }, { lat: 35.01, lon: 135.01, elevation: 2 }] }] },
        { segments: [{ points: [{ lat: 45, lon: 145, elevation: 3 }, { lat: 45.02, lon: 145.02, elevation: 4 }] }] },
      ],
    };
    const layout = getTrackModeElevationLayout(source);

    expect(layout.tracks).toHaveLength(2);
    expect(layout.tracks[0].distanceStartMeters).toBe(0);
    expect(layout.tracks[1].distanceStartMeters).toBe(layout.tracks[0].distanceEndMeters);
    expect(layout.totalDistanceMeters).toBe(layout.tracks[1].distanceEndMeters);
    expect(layout.tracks[1].points[0]).toMatchObject({
      profileDistanceMeters: layout.tracks[1].distanceStartMeters,
      locator: { trackIndex: 1, segmentIndex: 0, pointIndex: 0 },
    });
  });

  it("resolves map coordinates to canonical Track-mode points within the specified track", () => {
    const source = {
      tracks: [
        { segments: [{ points: [{ lat: 35, lon: 135, elevation: null }, { lat: 35.01, lon: 135.01, elevation: 10 }] }, { points: [{ lat: 35.02, lon: 135.02, elevation: null }] }] },
        { segments: [{ points: [{ lat: 35.02, lon: 135.02, elevation: 20 }] }] },
      ],
    };
    expect(getNearestTrackModePoint(source.tracks[0], 0, { lat: 35.02, lng: 135.02 })).toMatchObject({
      elevation: null,
      locator: { trackIndex: 0, segmentIndex: 1, pointIndex: 0 },
    });
    expect(getNearestTrackModePoint(source.tracks[1], 1, { lat: 35.02, lng: 135.02 }).locator).toEqual({
      trackIndex: 1, segmentIndex: 0, pointIndex: 0,
    });
  });
});