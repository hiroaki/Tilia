import { describe, expect, it, vi } from "vitest";
import { Popup } from "leaflet";

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

function createMap({ delayedClose = false } = {}) {
  const eventHandlers = new Map();
  const pendingPopupCloses = [];
  const map = {
    panTo: vi.fn(),
    openPopup: vi.fn(() => map),
    closePopup: vi.fn((popup) => {
      if (delayedClose) {
        pendingPopupCloses.push(popup);
      } else {
        for (const handler of eventHandlers.get("popupclose") || []) {
          handler({ popup });
        }
      }
      return map;
    }),
    on: vi.fn((event, handler) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
      return map;
    }),
    emitPopupClose(popup) {
      for (const handler of eventHandlers.get("popupclose") || []) {
        handler({ popup });
      }
    },
    flushPopupCloses() {
      for (const popup of pendingPopupCloses.splice(0)) {
        for (const handler of eventHandlers.get("popupclose") || []) {
          handler({ popup });
        }
      }
    },
  };
  return map;
}

function getOpenedPopup(map, callIndex = 0) {
  return map.openPopup.mock.calls[callIndex]?.[0];
}

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
    const map = createMap();
    const hub = createSelectionHub(map);
    const entry = { source: { name: "Sample Track" } };
    const waypoint = { name: "Point A", lat: 35.0, lon: 135.0 };

    const selection = hub.selectWaypoint(entry, waypoint, { panTo: true });

    expect(popupMocks.createWaypointPopupContent).toHaveBeenCalledWith("Sample Track", waypoint);
    expect(map.panTo).toHaveBeenCalledWith([35.0, 135.0]);
    const popup = getOpenedPopup(map);
    expect(popup).toBeInstanceOf(Popup);
    expect(popup.getContent()).toEqual({ kind: "waypoint-popup", sourceName: "Sample Track", waypoint });
    expect(popup.getLatLng()).toMatchObject({ lat: 35.0, lng: 135.0 });
    expect(popup.options).toMatchObject({
      className: "tilia-info-popup-window",
      closeOnClick: false,
    });
    expect(map.openPopup).toHaveReturnedWith(map);
    expect(selection).toEqual({ kind: "waypoint", entry, waypoint });
    expect(hub.getSelection()).toEqual({ kind: "waypoint", entry, waypoint });
  });

  it("opens a photo popup and pans by default when selecting a photo", () => {
    const map = createMap();
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
    const popup = getOpenedPopup(map);
    expect(popup).toBeInstanceOf(Popup);
    expect(popup.getContent()).toEqual({ kind: "photo-popup", photo: entry.source });
    expect(popup.getLatLng()).toMatchObject({ lat: 35.2, lng: 135.2 });
    expect(selection).toEqual({ kind: "photo", entry });
  });

  it("opens a track-point popup and records a structural point selection", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const entry = { source: { name: "Track" } };
    const point = { lat: 35.0, lon: 135.0, elevation: null, locator: { trackIndex: 1, segmentIndex: 0, pointIndex: 2 } };

    expect(hub.selectTrackPoint(entry, point)).toEqual({ kind: "track-point", entry, point });
    expect(popupMocks.createTrackPointPopupContent).toHaveBeenCalledWith(entry.source, point);
    expect(map.panTo).toHaveBeenCalledWith([35.0, 135.0]);
    expect(map.openPopup).toHaveBeenCalledTimes(1);
  });

  it("opens a route-point popup and records its route locator without panning by default", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const entry = { id: 7, source: { name: "Routes", routes: [{ name: "First" }, { name: "Second" }] } };
    const routePoint = { name: "Via", lat: 35.0, lon: 135.0 };
    const locator = { routeIndex: 1, pointIndex: 2 };

    const selection = hub.selectRoutePoint(entry, routePoint, locator);

    expect(popupMocks.createRoutePointPopupContent).toHaveBeenCalledWith(entry.source, routePoint, locator);
    expect(map.panTo).not.toHaveBeenCalled();
    const popup = getOpenedPopup(map);
    expect(popup).toBeInstanceOf(Popup);
    expect(popup.getContent()).toEqual({ kind: "route-point-popup", source: entry.source, routePoint, locator });
    expect(popup.getLatLng()).toMatchObject({ lat: 35.0, lng: 135.0 });
    expect(selection).toEqual({ kind: "route-point", entry, routePoint, locator });
    expect(hub.getSelection()).toEqual({ kind: "route-point", entry, routePoint, locator });
  });

  it("supports explicit route-point popup and pan options", () => {
    const map = createMap();
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
    const map = createMap();
    const hub = createSelectionHub(map);
    const entry = { source: { name: "Routes", routes: [{}] } };
    const routePoint = { lat: 35.0, lon: 135.0 };
    const locator = { routeIndex: 0, pointIndex: 0 };

    hub.selectRoutePoint(entry, routePoint, locator);
    map.emitPopupClose(getOpenedPopup(map));

    expect(hub.getSelection()).toBeNull();
  });

  it("clears the active selection when the popup that owns it closes", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const entry = { source: { name: "Track" } };
    const point = { lat: 35.0, lon: 135.0, elevation: null, locator: { trackIndex: 1, segmentIndex: 0, pointIndex: 2 } };

    hub.selectTrackPoint(entry, point);
    expect(hub.getSelection()).toEqual({ kind: "track-point", entry, point });

    map.emitPopupClose(getOpenedPopup(map));

    expect(hub.getSelection()).toBeNull();
  });

  it("clears an entry-owned selection once when closing its popup emits popupclose synchronously", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const listener = vi.fn();
    const entry = { id: 7, source: { name: "Track" } };
    const waypoint = { lat: 35.0, lon: 135.0 };

    hub.subscribe(listener);
    hub.selectWaypoint(entry, waypoint);
    const popup = getOpenedPopup(map);

    expect(hub.clearSelectionForEntry(entry.id)).toBe(true);
    expect(map.closePopup).toHaveBeenCalledWith(popup);
    expect(hub.getSelection()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("ignores a delayed popupclose after an entry-owned selection has been cleared", () => {
    const map = createMap({ delayedClose: true });
    const hub = createSelectionHub(map);
    const entry = { id: 7, source: { name: "Track" } };
    const firstWaypoint = { lat: 35.0, lon: 135.0 };
    const secondWaypoint = { lat: 35.1, lon: 135.1 };

    hub.selectWaypoint(entry, firstWaypoint);
    const firstPopup = getOpenedPopup(map);
    hub.clearSelectionForEntry(entry.id);
    hub.selectWaypoint(entry, secondWaypoint);
    map.flushPopupCloses();

    expect(hub.getSelection()).toEqual({ kind: "waypoint", entry, waypoint: secondWaypoint });
    expect(getOpenedPopup(map, 1)).toBeInstanceOf(Popup);
    expect(firstPopup).not.toBe(getOpenedPopup(map, 1));
  });

  it("preserves a selection and popup owned by another entry", () => {
    const map = createMap();
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
    const map = createMap();
    const hub = createSelectionHub(map);

    expect(hub.clearSelectionForEntry(7)).toBe(false);
    expect(map.closePopup).not.toHaveBeenCalled();
    expect(hub.getSelection()).toBeNull();
  });

  it("clears an entry-owned track selection without closing a popup", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const entry = { id: 7, source: { name: "Track" } };

    hub.selectTrack(entry);

    expect(hub.clearSelectionForEntry(entry.id)).toBe(true);
    expect(map.closePopup).not.toHaveBeenCalled();
    expect(hub.getSelection()).toBeNull();
  });

  it.each(["waypoint", "track-point", "route-point", "photo"])(
    "closes an owned %s popup when replacing it with a track selection",
    (kind) => {
      const map = createMap();
      const hub = createSelectionHub(map);
      const listener = vi.fn();
      const entry = {
        id: 7,
        source: { name: "Track", lat: 35.0, lon: 135.0, routes: [{}] },
      };
      const point = { lat: 35.0, lon: 135.0 };

      hub.subscribe(listener);
      if (kind === "waypoint") hub.selectWaypoint(entry, point);
      if (kind === "track-point") hub.selectTrackPoint(entry, point);
      if (kind === "route-point") hub.selectRoutePoint(entry, point, { routeIndex: 0, pointIndex: 0 });
      if (kind === "photo") hub.selectPhoto(entry);
      const previousPopup = getOpenedPopup(map);

      const selection = hub.selectTrack(entry);

      expect(map.closePopup).toHaveBeenCalledWith(previousPopup);
      expect(selection).toEqual({ kind: "track", entry });
      expect(hub.getSelection()).toEqual({ kind: "track", entry });
      expect(listener.mock.calls).toEqual([
        [null],
        [expect.objectContaining({ kind })],
        [{ kind: "track", entry }],
      ]);
    },
  );

  it("closes the previous popup when the replacement selection disables popup opening", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const entry = { id: 7, source: { name: "Track", routes: [{}] } };
    const waypoint = { lat: 35.0, lon: 135.0 };
    const routePoint = { lat: 35.1, lon: 135.1 };

    hub.selectWaypoint(entry, waypoint);
    const previousPopup = getOpenedPopup(map);
    hub.selectRoutePoint(entry, routePoint, { routeIndex: 0, pointIndex: 0 }, { openPopup: false });

    expect(map.closePopup).toHaveBeenCalledWith(previousPopup);
    expect(map.openPopup).toHaveBeenCalledTimes(1);
    expect(hub.getSelection()).toEqual({
      kind: "route-point",
      entry,
      routePoint,
      locator: { routeIndex: 0, pointIndex: 0 },
    });
  });

  it("replaces waypoint popup ownership with a route-point popup without an intermediate null notification", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const listener = vi.fn();
    const entry = { id: 7, source: { name: "Track", routes: [{}] } };
    const waypoint = { lat: 35.0, lon: 135.0 };
    const routePoint = { lat: 35.1, lon: 135.1 };

    hub.subscribe(listener);
    hub.selectWaypoint(entry, waypoint);
    const firstPopup = getOpenedPopup(map);
    hub.selectRoutePoint(entry, routePoint, { routeIndex: 0, pointIndex: 0 });
    const secondPopup = getOpenedPopup(map, 1);

    expect(map.closePopup).toHaveBeenCalledWith(firstPopup);
    expect(secondPopup).toBeInstanceOf(Popup);
    expect(secondPopup).not.toBe(firstPopup);
    expect(hub.getSelection()).toEqual(expect.objectContaining({ kind: "route-point", entry, routePoint }));
    expect(listener.mock.calls.map(([selection]) => selection?.kind || null)).toEqual([null, "waypoint", "route-point"]);
  });

  it("ignores a delayed old popupclose after replacing a waypoint with a track point", () => {
    const map = createMap({ delayedClose: true });
    const hub = createSelectionHub(map);
    const listener = vi.fn();
    const entry = { id: 7, source: { name: "Track" } };
    const waypoint = { lat: 35.0, lon: 135.0 };
    const point = { lat: 35.1, lon: 135.1 };

    hub.subscribe(listener);
    hub.selectWaypoint(entry, waypoint);
    hub.selectTrackPoint(entry, point);
    const nextSelection = hub.getSelection();
    const nextPopup = getOpenedPopup(map, 1);
    map.flushPopupCloses();

    expect(hub.getSelection()).toBe(nextSelection);
    expect(nextPopup).toBeInstanceOf(Popup);
    expect(listener.mock.calls.map(([selection]) => selection?.kind || null)).toEqual([null, "waypoint", "track-point"]);
  });

  it("closes an owned popup when clearing selection and notifies once", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const listener = vi.fn();
    const entry = { id: 7, source: { name: "Track" } };
    const waypoint = { lat: 35.0, lon: 135.0 };

    hub.subscribe(listener);
    hub.selectWaypoint(entry, waypoint);
    const popup = getOpenedPopup(map);

    expect(hub.clearSelection()).toBeNull();
    expect(map.closePopup).toHaveBeenCalledWith(popup);
    expect(hub.getSelection()).toBeNull();
    expect(listener.mock.calls.map(([selection]) => selection?.kind || null)).toEqual([null, "waypoint", null]);
  });

  it("does not complete an outer clear after a re-entrant clear produces the same state", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const listener = vi.fn();
    const entry = { id: 7, source: { name: "Track" } };
    const waypoint = { lat: 35.0, lon: 135.0 };
    let reentered = false;

    hub.subscribe(listener);
    hub.selectWaypoint(entry, waypoint);
    const popup = getOpenedPopup(map);
    map.on("popupclose", () => {
      if (!reentered) {
        reentered = true;
        hub.clearSelection();
      }
    });
    listener.mockClear();

    expect(hub.clearSelection()).toBeNull();

    expect(map.closePopup).toHaveBeenCalledWith(popup);
    expect(hub.getSelection()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(null);

    listener.mockClear();
    map.emitPopupClose(popup);
    expect(listener).not.toHaveBeenCalled();
  });

  it("clears a non-popup selection without trying to close a popup", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const entry = { id: 7, source: { name: "Track" } };

    hub.selectTrack(entry);
    hub.clearSelection();

    expect(map.closePopup).not.toHaveBeenCalled();
    expect(hub.getSelection()).toBeNull();
  });

  it("drops a failed new popup transition without retaining partial ownership", () => {
    const map = createMap();
    const hub = createSelectionHub(map);
    const listener = vi.fn();
    const entry = { id: 7, source: { name: "Track", routes: [{}] } };
    const waypoint = { lat: 35.0, lon: 135.0 };
    const routePoint = { lat: 35.1, lon: 135.1 };

    hub.subscribe(listener);
    hub.selectWaypoint(entry, waypoint);
    const previousPopup = getOpenedPopup(map);
    map.openPopup.mockImplementationOnce(() => {
      throw new Error("popup opening failed");
    });

    expect(() => hub.selectRoutePoint(entry, routePoint, { routeIndex: 0, pointIndex: 0 }))
      .toThrow("popup opening failed");

    const failedPopup = getOpenedPopup(map, 1);
    expect(map.closePopup).toHaveBeenCalledWith(previousPopup);
    expect(hub.getSelection()).toBeNull();
    expect(hub.clearSelectionForEntry(entry.id)).toBe(false);
    map.emitPopupClose(failedPopup);
    expect(listener.mock.calls.map(([selection]) => selection?.kind || null)).toEqual([null, "waypoint", null]);
  });

  it("returns the Leaflet Map from explicit openPopup while retaining the created Popup", () => {
    const map = createMap();
    const hub = createSelectionHub(map);

    const result = hub.openPopup({ latlng: [35.0, 135.0], content: "Details" });
    const popup = getOpenedPopup(map);

    expect(result).toBe(map);
    expect(popup).toBeInstanceOf(Popup);
    map.emitPopupClose(popup);
    expect(hub.getSelection()).toBeNull();
  });

  it("skips popup opening when openPopup is disabled or when popup inputs are incomplete", () => {
    const map = createMap();
    const hub = createSelectionHub(map);

    hub.selectWaypoint({ source: { name: "Track" } }, { lat: 35.0, lon: 135.0 }, { openPopup: false });
    hub.openPopup({ latlng: null, content: "x" });
    hub.openPopup({ latlng: [35.0, 135.0], content: null });

    expect(map.panTo).not.toHaveBeenCalled();
    expect(map.openPopup).not.toHaveBeenCalled();
  });
});
