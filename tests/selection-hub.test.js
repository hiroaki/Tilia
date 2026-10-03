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
