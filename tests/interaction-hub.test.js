import { describe, expect, it, vi } from "vitest";

import { createInteractionHub } from "../src/core/interaction-hub.js";

function createGpxEntry(overrides = {}) {
  return {
    kind: "gpx",
    interactions: {
      trackLayer: { id: "track-layer" },
      waypoints: [
        {
          layer: { id: "waypoint-layer-1" },
          waypoint: { name: "A", lat: 35.0, lon: 135.0 },
        },
        {
          layer: { id: "waypoint-layer-2" },
          waypoint: { name: "B", lat: 35.1, lon: 135.1 },
        },
      ],
    },
    ...overrides,
  };
}

function createPhotoEntry(overrides = {}) {
  return {
    kind: "photo",
    interactions: {
      marker: { id: "photo-marker" },
    },
    ...overrides,
  };
}

describe("createInteractionHub", () => {
  it("binds existing GPX and photo interactions when a subscriber registers", () => {
    const entries = [createGpxEntry(), createPhotoEntry()];
    const hub = createInteractionHub(() => entries);
    const onTrackLayer = vi.fn();
    const onWaypointLayer = vi.fn();
    const onPhotoMarker = vi.fn();

    hub.subscribe({ onTrackLayer, onWaypointLayer, onPhotoMarker });

    expect(onTrackLayer).toHaveBeenCalledTimes(1);
    expect(onTrackLayer).toHaveBeenCalledWith({
      entry: entries[0],
      layer: entries[0].interactions.trackLayer,
    });
    expect(onWaypointLayer).toHaveBeenCalledTimes(2);
    expect(onWaypointLayer).toHaveBeenNthCalledWith(1, {
      entry: entries[0],
      layer: entries[0].interactions.waypoints[0].layer,
      waypoint: entries[0].interactions.waypoints[0].waypoint,
    });
    expect(onWaypointLayer).toHaveBeenNthCalledWith(2, {
      entry: entries[0],
      layer: entries[0].interactions.waypoints[1].layer,
      waypoint: entries[0].interactions.waypoints[1].waypoint,
    });
    expect(onPhotoMarker).toHaveBeenCalledTimes(1);
    expect(onPhotoMarker).toHaveBeenCalledWith({
      entry: entries[1],
      layer: entries[1].interactions.marker,
    });
  });

  it("deduplicates layers per subscriber across repeated syncEntry calls", () => {
    const entry = createGpxEntry();
    const hub = createInteractionHub(() => []);
    const onTrackLayer = vi.fn();
    const onWaypointLayer = vi.fn();

    hub.subscribe({ onTrackLayer, onWaypointLayer });
    hub.syncEntry(entry);
    hub.syncEntry(entry);

    expect(onTrackLayer).toHaveBeenCalledTimes(1);
    expect(onWaypointLayer).toHaveBeenCalledTimes(2);
  });

  it("stops notifying a subscriber after unsubscribe", () => {
    const entry = createPhotoEntry();
    const hub = createInteractionHub(() => []);
    const onPhotoMarker = vi.fn();

    const unsubscribe = hub.subscribe({ onPhotoMarker });
    unsubscribe();
    hub.syncEntry(entry);

    expect(onPhotoMarker).not.toHaveBeenCalled();
  });

  it("ignores missing handlers and incomplete interaction handles", () => {
    const entry = createGpxEntry({
      interactions: {
        trackLayer: null,
        waypoints: [
          { layer: null, waypoint: { name: "missing" } },
        ],
      },
    });
    const hub = createInteractionHub(() => []);

    expect(() => {
      hub.subscribe({});
      hub.syncEntry(entry);
    }).not.toThrow();
  });
});