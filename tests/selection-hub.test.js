import { describe, expect, it, vi } from "vitest";

const popupMocks = vi.hoisted(() => ({
  createPhotoPopupContent: vi.fn((photo) => ({ kind: "photo-popup", photo })),
  createRoutePointPopupContent: vi.fn((source, routePoint, locator) => ({
    kind: "route-point-popup",
    source,
    routePoint,
    locator,
  })),
  createTrackPointPopupContent: vi.fn((source, point) => ({ kind: "track-point-popup", source, point })),
  createWaypointPopupContent: vi.fn((sourceName, waypoint) => ({
    kind: "waypoint-popup",
    sourceName,
    waypoint,
  })),
}));

vi.mock("../src/map/layers.js", () => ({
  createPhotoPopupContent: popupMocks.createPhotoPopupContent,
  createRoutePointPopupContent: popupMocks.createRoutePointPopupContent,
  createTrackPointPopupContent: popupMocks.createTrackPointPopupContent,
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

  it("opens a track-point popup and records a structural point selection", () => {
    const map = { panTo: vi.fn(), openPopup: vi.fn() };
    const hub = createSelectionHub(map);
    const entry = { source: { name: "Track" } };
    const point = { lat: 35.0, lon: 135.0, elevation: null, locator: { trackIndex: 1, segmentIndex: 0, pointIndex: 2 } };

    expect(hub.selectTrackPoint(entry, point)).toEqual({ kind: "track-point", entry, point });
    expect(popupMocks.createTrackPointPopupContent).toHaveBeenCalledWith(entry.source, point);
    expect(map.panTo).toHaveBeenCalledWith([35.0, 135.0]);
    expect(map.openPopup).toHaveBeenCalledTimes(1);
  });

  it("opens a route-point popup and records its route locator without panning by default", () => {
    const map = { panTo: vi.fn(), openPopup: vi.fn() };
    const hub = createSelectionHub(map);
    const entry = { id: 7, source: { name: "Routes", routes: [{ name: "First" }, { name: "Second" }] } };
    const routePoint = { name: "Via", lat: 35.0, lon: 135.0 };
    const locator = { routeIndex: 1, pointIndex: 2 };

    const selection = hub.selectRoutePoint(entry, routePoint, locator);

    expect(popupMocks.createRoutePointPopupContent).toHaveBeenCalledWith(entry.source, routePoint, locator);
    expect(map.panTo).not.toHaveBeenCalled();
    expect(map.openPopup).toHaveBeenCalledWith(
      { kind: "route-point-popup", source: entry.source, routePoint, locator },
      [35.0, 135.0],
      {
        className: "tilia-info-popup-window",
        closeOnClick: false,
      },
    );
    expect(selection).toEqual({ kind: "route-point", entry, routePoint, locator });
    expect(hub.getSelection()).toEqual({ kind: "route-point", entry, routePoint, locator });
  });

  it("supports explicit route-point popup and pan options", () => {
    const map = { panTo: vi.fn(), openPopup: vi.fn() };
    const hub = createSelectionHub(map);
    const entry = { source: { name: "Routes", routes: [] } };
    const routePoint = { lat: 35.0, lon: 135.0 };
    const locator = { routeIndex: 0, pointIndex: 0 };

    hub.selectRoutePoint(entry, routePoint, locator, { openPopup: false });
    expect(map.openPopup).not.toHaveBeenCalled();

    hub.selectRoutePoint(entry, routePoint, locator, { panTo: true });
    expect(map.panTo).toHaveBeenCalledWith([35.0, 135.0]);
    expect(map.openPopup).toHaveBeenCalledTimes(1);
  });

  it("clears a route-point selection when its popup closes", () => {
    const popup = {};
    const map = {
      panTo: vi.fn(),
      openPopup: vi.fn(() => popup),
      on: vi.fn(),
    };
    const hub = createSelectionHub(map);
    const entry = { source: { name: "Routes", routes: [{}] } };
    const routePoint = { lat: 35.0, lon: 135.0 };
    const locator = { routeIndex: 0, pointIndex: 0 };

    hub.selectRoutePoint(entry, routePoint, locator);
    map.on.mock.calls.find(([event]) => event === "popupclose")?.[1]({ popup });

    expect(hub.getSelection()).toBeNull();
  });

  it("clears the active selection when the popup that owns it closes", () => {
    const popup = { close: vi.fn() };
    const map = {
      panTo: vi.fn(),
      openPopup: vi.fn(() => popup),
      on: vi.fn(),
    };
    const hub = createSelectionHub(map);
    const entry = { source: { name: "Track" } };
    const point = { lat: 35.0, lon: 135.0, elevation: null, locator: { trackIndex: 1, segmentIndex: 0, pointIndex: 2 } };

    hub.selectTrackPoint(entry, point);
    expect(hub.getSelection()).toEqual({ kind: "track-point", entry, point });

    map.on.mock.calls.find(([event]) => event === "popupclose")?.[1]({ popup });

    expect(hub.getSelection()).toBeNull();
  });

  it("clears an entry-owned selection once when closing its popup emits popupclose synchronously", () => {
    const popup = {};
    let handlePopupClose;
    const map = {
      panTo: vi.fn(),
      openPopup: vi.fn(() => popup),
      closePopup: vi.fn((closedPopup) => handlePopupClose({ popup: closedPopup })),
      on: vi.fn((event, handler) => {
        if (event === "popupclose") handlePopupClose = handler;
      }),
    };
    const hub = createSelectionHub(map);
    const listener = vi.fn();
    const entry = { id: 7, source: { name: "Track" } };
    const waypoint = { lat: 35.0, lon: 135.0 };

    hub.subscribe(listener);
    hub.selectWaypoint(entry, waypoint);

    expect(hub.clearSelectionForEntry(entry.id)).toBe(true);
    expect(map.closePopup).toHaveBeenCalledWith(popup);
    expect(hub.getSelection()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("ignores a delayed popupclose after an entry-owned selection has been cleared", () => {
    const firstPopup = {};
    const secondPopup = {};
    const map = {
      panTo: vi.fn(),
      openPopup: vi.fn()
        .mockReturnValueOnce(firstPopup)
        .mockReturnValueOnce(secondPopup),
      closePopup: vi.fn(),
      on: vi.fn(),
    };
    const hub = createSelectionHub(map);
    const entry = { id: 7, source: { name: "Track" } };
    const firstWaypoint = { lat: 35.0, lon: 135.0 };
    const secondWaypoint = { lat: 35.1, lon: 135.1 };

    hub.selectWaypoint(entry, firstWaypoint);
    hub.clearSelectionForEntry(entry.id);
    hub.selectWaypoint(entry, secondWaypoint);
    map.on.mock.calls.find(([event]) => event === "popupclose")?.[1]({ popup: firstPopup });

    expect(hub.getSelection()).toEqual({ kind: "waypoint", entry, waypoint: secondWaypoint });
  });

  it("preserves a selection and popup owned by another entry", () => {
    const popup = {};
    const map = {
      panTo: vi.fn(),
      openPopup: vi.fn(() => popup),
      closePopup: vi.fn(),
      on: vi.fn(),
    };
    const hub = createSelectionHub(map);
    const selectedEntry = { id: 1, source: { name: "Selected" } };
    const otherEntry = { id: 2, source: { name: "Other" } };
    const waypoint = { lat: 35.0, lon: 135.0 };

    hub.selectWaypoint(selectedEntry, waypoint);

    expect(hub.clearSelectionForEntry(otherEntry.id)).toBe(false);
    expect(map.closePopup).not.toHaveBeenCalled();
    expect(hub.getSelection()).toEqual({ kind: "waypoint", entry: selectedEntry, waypoint });
  });

  it("does nothing when clearing for an entry with no active selection", () => {
    const map = {
      closePopup: vi.fn(),
      on: vi.fn(),
    };
    const hub = createSelectionHub(map);

    expect(hub.clearSelectionForEntry(7)).toBe(false);
    expect(map.closePopup).not.toHaveBeenCalled();
    expect(hub.getSelection()).toBeNull();
  });

  it("clears an entry-owned track selection without closing a popup", () => {
    const map = {
      closePopup: vi.fn(),
      on: vi.fn(),
    };
    const hub = createSelectionHub(map);
    const entry = { id: 7, source: { name: "Track" } };

    hub.selectTrack(entry);

    expect(hub.clearSelectionForEntry(entry.id)).toBe(true);
    expect(map.closePopup).not.toHaveBeenCalled();
    expect(hub.getSelection()).toBeNull();
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
