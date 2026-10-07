import { describe, expect, it, vi } from "vitest";

import { createInteractionHub } from "../src/core/interaction-hub.js";

function createGpxEntry(overrides = {}) {
  return {
    kind: "gpx",
    interactions: {
      trackLayers: [{ layer: { id: "track-layer-1" }, trackIndex: 0 }, { layer: { id: "track-layer-2" }, trackIndex: 1 }],
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

describe("createInteractionHub", () => {
  it("binds existing GPX interactions when a subscriber registers", () => {
    const entries = [createGpxEntry()];
    const hub = createInteractionHub(() => entries);
    const onTrackLayer = vi.fn();
    const onWaypointLayer = vi.fn();

    hub.subscribe({ onTrackLayer, onWaypointLayer });

    expect(onTrackLayer).toHaveBeenCalledTimes(2);
    expect(onTrackLayer).toHaveBeenNthCalledWith(1, {
      entry: entries[0],
      layer: entries[0].interactions.trackLayers[0].layer,
      trackIndex: 0,
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

  });

  it("deduplicates layers per subscriber across repeated syncEntry calls", () => {
    const entry = createGpxEntry();
    const hub = createInteractionHub(() => []);
    const onTrackLayer = vi.fn();
    const onWaypointLayer = vi.fn();

    hub.subscribe({ onTrackLayer, onWaypointLayer });
    hub.syncEntry(entry);
    hub.syncEntry(entry);

    expect(onTrackLayer).toHaveBeenCalledTimes(2);
    expect(onWaypointLayer).toHaveBeenCalledTimes(2);
  });

  it("stops notifying a subscriber after unsubscribe", () => {
    const entry = createGpxEntry();
    const hub = createInteractionHub(() => []);
    const onTrackLayer = vi.fn();

    const unsubscribe = hub.subscribe({ onTrackLayer });
    unsubscribe();
    hub.syncEntry(entry);

    expect(onTrackLayer).not.toHaveBeenCalled();
  });

  it("ignores missing handlers and incomplete interaction handles", () => {
    const entry = createGpxEntry({
      interactions: {
        trackLayers: [{ layer: null, trackIndex: 0 }],
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