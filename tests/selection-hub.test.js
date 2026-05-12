import { describe, expect, it, vi } from "vitest";

const popupMocks = vi.hoisted(() => ({
  createPhotoPopupContent: vi.fn((photo) => ({ kind: "photo-popup", photo })),
  createWaypointPopupContent: vi.fn((sourceName, waypoint) => ({
    kind: "waypoint-popup",
    sourceName,
    waypoint,
  })),
}));

vi.mock("../src/map/layers.js", () => ({
  createPhotoPopupContent: popupMocks.createPhotoPopupContent,
  createWaypointPopupContent: popupMocks.createWaypointPopupContent,
}));

import { createSelectionHub } from "../src/core/selection-hub.js";

describe("createSelectionHub", () => {
  it("notifies subscribers immediately and on subsequent selection changes", () => {
    const map = {
      panTo: vi.fn(),
      openPopup: vi.fn(),
    };
    const hub = createSelectionHub(map);
    const listener = vi.fn();
    const entry = { source: { name: "Track" } };

    const unsubscribe = hub.subscribe(listener);
    hub.selectTrack(entry);
    hub.clearSelection();
    unsubscribe();
    hub.selectTrack(entry);

    expect(listener).toHaveBeenNthCalledWith(1, null);
    expect(listener).toHaveBeenNthCalledWith(2, { kind: "track", entry });
    expect(listener).toHaveBeenNthCalledWith(3, null);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("opens a waypoint popup when selecting a waypoint unless disabled", () => {
    const map = {
      panTo: vi.fn(),
      openPopup: vi.fn(),
    };
    const hub = createSelectionHub(map);
    const entry = { source: { name: "Sample Track" } };
    const waypoint = { name: "Point A", lat: 35.0, lon: 135.0 };

    const selection = hub.selectWaypoint(entry, waypoint, { panTo: true });

    expect(popupMocks.createWaypointPopupContent).toHaveBeenCalledWith("Sample Track", waypoint);
    expect(map.panTo).toHaveBeenCalledWith([35.0, 135.0]);
    expect(map.openPopup).toHaveBeenCalledWith(
      { kind: "waypoint-popup", sourceName: "Sample Track", waypoint },
      [35.0, 135.0],
      {
        className: "tilia-info-popup-window",
        closeOnClick: false,
      },
    );
    expect(selection).toEqual({ kind: "waypoint", entry, waypoint });
    expect(hub.getSelection()).toEqual({ kind: "waypoint", entry, waypoint });
  });

  it("opens a photo popup and pans by default when selecting a photo", () => {
    const map = {
      panTo: vi.fn(),
      openPopup: vi.fn(),
    };
    const hub = createSelectionHub(map);
    const entry = {
      source: {
        name: "photo.jpg",
        lat: 35.2,
        lon: 135.2,
      },
    };

    const selection = hub.selectPhoto(entry);

    expect(popupMocks.createPhotoPopupContent).toHaveBeenCalledWith(entry.source);
    expect(map.panTo).toHaveBeenCalledWith([35.2, 135.2]);
    expect(map.openPopup).toHaveBeenCalledWith(
      { kind: "photo-popup", photo: entry.source },
      [35.2, 135.2],
      {
        className: "tilia-info-popup-window",
        closeOnClick: false,
      },
    );
    expect(selection).toEqual({ kind: "photo", entry });
  });

  it("skips popup opening when openPopup is disabled or when popup inputs are incomplete", () => {
    const map = {
      panTo: vi.fn(),
      openPopup: vi.fn(),
    };
    const hub = createSelectionHub(map);

    hub.selectWaypoint({ source: { name: "Track" } }, { lat: 35.0, lon: 135.0 }, { openPopup: false });
    hub.openPopup({ latlng: null, content: "x" });
    hub.openPopup({ latlng: [35.0, 135.0], content: null });

    expect(map.panTo).not.toHaveBeenCalled();
    expect(map.openPopup).not.toHaveBeenCalled();
  });
});