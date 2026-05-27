import { beforeEach, describe, expect, it, vi } from "vitest";

const bootMocks = vi.hoisted(() => ({
  syncEntry: vi.fn(),
  selectionState: null,
  subscribeInteractions: vi.fn(() => () => {}),
  subscribeSelection: vi.fn(() => () => {}),
  parseGpxFile: vi.fn(),
  parsePhotoFile: vi.fn(),
  inferPhotoLocationFromGpx: vi.fn(),
  buildGpxOverlay: vi.fn(),
  buildPhotoOverlay: vi.fn(),
  fitMapToGroup: vi.fn(),
  closePopup: vi.fn(),
  clearSelection: vi.fn(() => {
    bootMocks.selectionState = null;
    return null;
  }),
  getSelection: vi.fn(() => bootMocks.selectionState),
  selectTrack: vi.fn((entry) => ({ kind: "track", entry })),
  selectWaypoint: vi.fn((entry, waypoint) => ({ kind: "waypoint", entry, waypoint })),
  selectPhoto: vi.fn((entry) => ({ kind: "photo", entry })),
  openPopup: vi.fn(),
}));

vi.mock("../src/gpx/parse.js", () => ({
  parseGpxFile: bootMocks.parseGpxFile,
}));

vi.mock("../src/photo/exif.js", () => ({
  parsePhotoFile: bootMocks.parsePhotoFile,
}));

vi.mock("../src/photo/infer-location.js", () => ({
  inferPhotoLocationFromGpx: bootMocks.inferPhotoLocationFromGpx,
}));

vi.mock("../src/map/layers.js", () => ({
  buildGpxOverlay: bootMocks.buildGpxOverlay,
  buildPhotoOverlay: bootMocks.buildPhotoOverlay,
  fitMapToGroup: bootMocks.fitMapToGroup,
}));

vi.mock("../src/core/interaction-hub.js", () => ({
  createInteractionHub: vi.fn(() => ({
    subscribe: bootMocks.subscribeInteractions,
    syncEntry: bootMocks.syncEntry,
  })),
}));

vi.mock("../src/core/selection-hub.js", () => ({
  createSelectionHub: vi.fn(() => ({
    getSelection: bootMocks.getSelection,
    subscribe: bootMocks.subscribeSelection,
    clearSelection: bootMocks.clearSelection,
    openPopup: bootMocks.openPopup,
    selectTrack: bootMocks.selectTrack,
    selectWaypoint: bootMocks.selectWaypoint,
    selectPhoto: bootMocks.selectPhoto,
  })),
}));

import { createTiliaCore } from "../src/core/boot.js";

function createLayer(id) {
  return {
    id,
    addTo: vi.fn(),
    remove: vi.fn(),
  };
}

describe("createTiliaCore", () => {
  beforeEach(() => {
    bootMocks.syncEntry.mockClear();
    bootMocks.subscribeInteractions.mockClear();
    bootMocks.subscribeSelection.mockClear();
    bootMocks.parseGpxFile.mockReset();
    bootMocks.parsePhotoFile.mockReset();
    bootMocks.inferPhotoLocationFromGpx.mockReset();
    bootMocks.buildGpxOverlay.mockReset();
    bootMocks.buildPhotoOverlay.mockReset();
    bootMocks.fitMapToGroup.mockReset();
    bootMocks.closePopup.mockReset();
    bootMocks.clearSelection.mockClear();
    bootMocks.getSelection.mockClear();
    bootMocks.selectTrack.mockClear();
    bootMocks.selectWaypoint.mockClear();
    bootMocks.selectPhoto.mockClear();
    bootMocks.openPopup.mockClear();
    bootMocks.selectionState = null;
  });

  it("dispatches GPX files through the registry and records the resulting entry", async () => {
    const gpxSource = {
      type: "gpx",
      name: "sample.gpx",
      trackPoints: [[35.0, 135.0], [35.1, 135.1]],
      trackPointDetails: [],
      trackTimeline: [],
      elevationProfile: [],
      waypoints: [{ name: "Start", lat: 35.0, lon: 135.0 }],
    };
    const overlay = {
      layer: createLayer("gpx-layer"),
      interactions: { trackLayer: { id: "track" }, waypoints: [] },
    };
    bootMocks.parseGpxFile.mockResolvedValue(gpxSource);
    bootMocks.buildGpxOverlay.mockReturnValue(overlay);
    const map = { closePopup: bootMocks.closePopup };
    const core = createTiliaCore(map);

    const result = await core.registry.dispatch(core.context, { name: "sample.gpx" });

    expect(bootMocks.parseGpxFile).toHaveBeenCalledWith({ name: "sample.gpx" });
    expect(bootMocks.buildGpxOverlay).toHaveBeenCalledWith(expect.objectContaining({
      name: "sample.gpx",
      type: "gpx",
      trackPoints: [[35.0, 135.0], [35.1, 135.1]],
    }));
    expect(overlay.layer.addTo).toHaveBeenCalledWith(map);
    expect(bootMocks.fitMapToGroup).toHaveBeenCalledWith(map, overlay.layer);
    expect(result.summary).toBe("2 track points, 1 waypoints");
    expect(core.state.entries).toHaveLength(1);
    expect(core.state.entries[0]).toMatchObject({
      kind: "gpx",
      source: expect.objectContaining({
        name: "sample.gpx",
        type: "gpx",
        trackPoints: [[35.0, 135.0], [35.1, 135.1]],
      }),
      layer: overlay.layer,
      interactions: overlay.interactions,
      visible: true,
    });
    expect(bootMocks.syncEntry).toHaveBeenCalledWith(core.state.entries[0]);
  });

  it("dispatches JPEG files, infers location for non-GPS photos, and tracks the selected mode", async () => {
    const photo = {
      name: "photo.jpg",
      hasGps: false,
      dateTimeOriginal: new Date("2024-01-01T00:05:00Z"),
      previewUrl: "blob:photo-preview",
    };
    const inferred = {
      lat: 35.5,
      lon: 135.5,
      locationSource: "gpx-time-inference",
      locationReason: "Interpolated from GPX",
      inferenceDetail: "between points",
      timeInterpretationMode: "utc",
    };
    const overlay = {
      layer: createLayer("photo-layer"),
      interactions: { marker: { id: "marker-1" } },
    };
    bootMocks.parsePhotoFile.mockResolvedValue(photo);
    bootMocks.inferPhotoLocationFromGpx.mockReturnValue(inferred);
    bootMocks.buildPhotoOverlay.mockReturnValue(overlay);
    const map = { closePopup: bootMocks.closePopup };
    const core = createTiliaCore(map, { defaultPhotoTimeMode: "utc" });

    const result = await core.registry.dispatch(core.context, { name: "photo.jpg" });

    expect(core.getDefaultPhotoTimeMode()).toBe("utc");
    expect(bootMocks.parsePhotoFile).toHaveBeenCalledWith({ name: "photo.jpg" });
    expect(bootMocks.inferPhotoLocationFromGpx).toHaveBeenCalledWith(core.state.sources, photo, {
      timeInterpretationMode: "utc",
    });
    expect(overlay.layer.addTo).toHaveBeenCalledWith(map);
    expect(result).toMatchObject({
      entryId: 1,
      lat: 35.5,
      lon: 135.5,
      locationSource: "gpx-time-inference",
      photoTimeMode: "utc",
    });
    expect(core.state.entries[0]).toMatchObject({
      kind: "photo",
      photoOriginal: photo,
      photoTimeMode: "utc",
      visible: true,
    });
  });

  it("passes explicit fixed offsets through photo inference", async () => {
    const photo = {
      name: "photo.jpg",
      hasGps: false,
      dateTimeOriginal: new Date("2024-01-01T00:05:00Z"),
      previewUrl: "blob:photo-preview",
    };
    bootMocks.parsePhotoFile.mockResolvedValue(photo);
    bootMocks.inferPhotoLocationFromGpx.mockReturnValue({
      lat: 35.5,
      lon: 135.5,
      locationSource: "gpx-time-inference",
      locationReason: "Interpolated from GPX",
      inferenceDetail: "between points",
      timeInterpretationMode: "+09:00",
    });
    bootMocks.buildPhotoOverlay.mockReturnValue({
      layer: createLayer("photo-layer-offset"),
      interactions: { marker: { id: "marker-offset" } },
    });

    const core = createTiliaCore({ closePopup: bootMocks.closePopup }, { defaultPhotoTimeMode: "+09:00" });

    const result = await core.registry.dispatch(core.context, { name: "photo.jpg" });

    expect(core.getDefaultPhotoTimeMode()).toBe("+09:00");
    expect(bootMocks.inferPhotoLocationFromGpx).toHaveBeenCalledWith(core.state.sources, photo, {
      timeInterpretationMode: "+09:00",
    });
    expect(result).toMatchObject({
      photoTimeMode: "+09:00",
    });
    expect(core.state.entries[0]).toMatchObject({
      requestedPhotoTimeMode: "+09:00",
      photoTimeMode: "+09:00",
    });
  });

  it("defaults non-GPS photo inference to auto mode", async () => {
    const photo = {
      name: "photo.jpg",
      hasGps: false,
      dateTimeOriginal: new Date("2024-01-01T00:05:00Z"),
      previewUrl: "blob:photo-preview",
    };
    bootMocks.parsePhotoFile.mockResolvedValue(photo);
    bootMocks.inferPhotoLocationFromGpx.mockReturnValue({
      lat: 35.5,
      lon: 135.5,
      locationSource: "gpx-time-inference",
      locationReason: "Interpolated from GPX",
      inferenceDetail: "between points",
      timeInterpretationMode: "local",
    });
    bootMocks.buildPhotoOverlay.mockReturnValue({
      layer: createLayer("photo-layer-auto"),
      interactions: { marker: { id: "marker-auto" } },
    });

    const core = createTiliaCore({ closePopup: bootMocks.closePopup });

    await core.registry.dispatch(core.context, { name: "photo.jpg" });

    expect(core.getDefaultPhotoTimeMode()).toBe("auto");
    expect(bootMocks.inferPhotoLocationFromGpx).toHaveBeenCalledWith(core.state.sources, photo, {
      timeInterpretationMode: "auto",
    });
    expect(core.state.entries[0]).toMatchObject({
      requestedPhotoTimeMode: "auto",
      photoTimeMode: "local",
    });
  });

  it("updates a non-GPS photo entry when the photo time mode changes", async () => {
    const originalPhoto = {
      name: "photo.jpg",
      hasGps: false,
      dateTimeOriginal: new Date("2024-01-01T00:05:00Z"),
      previewUrl: "blob:photo-preview",
    };
    const firstOverlay = {
      layer: createLayer("photo-layer-1"),
      interactions: { marker: { id: "marker-1" } },
    };
    const secondOverlay = {
      layer: createLayer("photo-layer-2"),
      interactions: { marker: { id: "marker-2" } },
    };
    bootMocks.parsePhotoFile.mockResolvedValue(originalPhoto);
    bootMocks.inferPhotoLocationFromGpx
      .mockReturnValueOnce({
        lat: 35.5,
        lon: 135.5,
        locationSource: "gpx-time-inference",
        locationReason: "Interpolated",
        inferenceDetail: "local",
        timeInterpretationMode: "local",
      })
      .mockReturnValueOnce({
        lat: 35.6,
        lon: 135.6,
        locationSource: "gpx-time-inference",
        locationReason: "Interpolated",
        inferenceDetail: "utc",
        timeInterpretationMode: "utc",
      });
    bootMocks.buildPhotoOverlay
      .mockReturnValueOnce(firstOverlay)
      .mockReturnValueOnce(secondOverlay);
    const map = { closePopup: bootMocks.closePopup };
    const core = createTiliaCore(map);

    await core.registry.dispatch(core.context, { name: "photo.jpg" });
    const updatedEntry = core.updatePhotoTimeMode(1, "utc");

    expect(bootMocks.inferPhotoLocationFromGpx).toHaveBeenNthCalledWith(2, core.state.sources, originalPhoto, {
      timeInterpretationMode: "utc",
    });
    expect(firstOverlay.layer.remove).toHaveBeenCalledTimes(1);
    expect(secondOverlay.layer.addTo).toHaveBeenCalledWith(map);
    expect(bootMocks.fitMapToGroup).toHaveBeenLastCalledWith(map, secondOverlay.layer);
    expect(updatedEntry.requestedPhotoTimeMode).toBe("utc");
    expect(updatedEntry.photoTimeMode).toBe("utc");
    expect(updatedEntry.source).toMatchObject({ lat: 35.6, lon: 135.6, photoTimeMode: "utc" });
    expect(updatedEntry.layer).toBe(secondOverlay.layer);
  });

  it("toggles entry visibility and fits an entry back into view", async () => {
    const gpxSource = {
      type: "gpx",
      name: "sample.gpx",
      trackPoints: [[35.0, 135.0], [35.1, 135.1]],
      trackPointDetails: [],
      trackTimeline: [],
      elevationProfile: [],
      waypoints: [],
    };
    const overlay = {
      layer: createLayer("gpx-layer"),
      interactions: { trackLayer: { id: "track" }, waypoints: [] },
    };
    bootMocks.parseGpxFile.mockResolvedValue(gpxSource);
    bootMocks.buildGpxOverlay.mockReturnValue(overlay);
    const map = { closePopup: bootMocks.closePopup };
    const core = createTiliaCore(map);

    await core.registry.dispatch(core.context, { name: "sample.gpx" });

    expect(core.setEntryVisibility(1, false)).toMatchObject({ id: 1, visible: false });
    expect(overlay.layer.remove).toHaveBeenCalledTimes(1);
    expect(core.setEntryVisibility(1, true)).toMatchObject({ id: 1, visible: true });
    expect(overlay.layer.addTo).toHaveBeenNthCalledWith(2, map);
    expect(core.fitEntryToView(1)).toMatchObject({ id: 1 });
    expect(bootMocks.fitMapToGroup).toHaveBeenLastCalledWith(map, overlay.layer);
    expect(core.setEntryVisibility(999, false)).toBeNull();
    expect(core.fitEntryToView(999)).toBeNull();
  });

  it("adds and updates normalized GPX sources without going through file dispatch", () => {
    const firstOverlay = {
      layer: createLayer("gpx-layer-1"),
      interactions: { trackLayer: { id: "track-1" }, waypoints: [] },
    };
    const secondOverlay = {
      layer: createLayer("gpx-layer-2"),
      interactions: { trackLayer: { id: "track-2" }, waypoints: [] },
    };
    bootMocks.buildGpxOverlay
      .mockReturnValueOnce(firstOverlay)
      .mockReturnValueOnce(secondOverlay);
    const map = { closePopup: bootMocks.closePopup };
    const core = createTiliaCore(map);

    const entry = core.addGpxSource({
      name: "draft.gpx",
      trackPointDetails: [
        { lat: 35.0, lon: 135.0, elevation: 10, timestamp: Date.parse("2024-01-01T00:00:00Z") },
        { lat: 35.1, lon: 135.1, elevation: null, timestamp: null },
      ],
    }, { fitToView: false });

    expect(entry).toMatchObject({ kind: "gpx", visible: true });
    expect(entry.source.trackPoints).toEqual([[35.0, 135.0], [35.1, 135.1]]);
    expect(firstOverlay.layer.addTo).toHaveBeenCalledWith(map);
    expect(bootMocks.fitMapToGroup).not.toHaveBeenCalled();

    const updated = core.updateGpxSource(entry.id, {
      ...entry.source,
      trackPointDetails: [
        { lat: 35.0, lon: 135.0, elevation: 10, timestamp: Date.parse("2024-01-01T00:00:00Z") },
        { lat: 35.2, lon: 135.2, elevation: 20, timestamp: Date.parse("2024-01-01T00:05:00Z") },
      ],
    }, { fitToView: true });

    expect(updated).toBe(entry);
    expect(firstOverlay.layer.remove).toHaveBeenCalledTimes(1);
    expect(secondOverlay.layer.addTo).toHaveBeenCalledWith(map);
    expect(updated.source.trackPoints).toEqual([[35.0, 135.0], [35.2, 135.2]]);
    expect(bootMocks.fitMapToGroup).toHaveBeenCalledWith(map, secondOverlay.layer);
    expect(core.updateGpxSource(999, entry.source)).toBeNull();
  });

  it("removes selected entries and clears all layers, sources, and photo previews", async () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const gpxSource = {
      type: "gpx",
      name: "sample.gpx",
      trackPoints: [[35.0, 135.0], [35.1, 135.1]],
      trackPointDetails: [],
      trackTimeline: [],
      elevationProfile: [],
      waypoints: [],
    };
    const photo = {
      name: "photo.jpg",
      hasGps: true,
      lat: 35.5,
      lon: 135.5,
      previewUrl: "blob:photo-preview",
    };
    const gpxOverlay = {
      layer: createLayer("gpx-layer"),
      interactions: { trackLayer: { id: "track" }, waypoints: [] },
    };
    const photoOverlay = {
      layer: createLayer("photo-layer"),
      interactions: { marker: { id: "marker-1" } },
    };
    bootMocks.parseGpxFile.mockResolvedValue(gpxSource);
    bootMocks.parsePhotoFile.mockResolvedValue(photo);
    bootMocks.buildGpxOverlay.mockReturnValue(gpxOverlay);
    bootMocks.buildPhotoOverlay.mockReturnValue(photoOverlay);
    const map = {
      closePopup: bootMocks.closePopup,
    };
    const core = createTiliaCore(map);

    await core.registry.dispatch(core.context, { name: "sample.gpx" });
    await core.registry.dispatch(core.context, { name: "photo.jpg" });
    bootMocks.selectionState = { entry: { id: 2 } };

    const removedEntry = core.removeEntry(2);

    expect(removedEntry).toMatchObject({ id: 2, kind: "photo" });
    expect(map.closePopup).toHaveBeenCalledTimes(1);
    expect(bootMocks.clearSelection).toHaveBeenCalledTimes(1);
    expect(photoOverlay.layer.remove).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:photo-preview");
    expect(core.state.entries).toHaveLength(1);

    core.clearAll();

    expect(map.closePopup).toHaveBeenCalledTimes(2);
    expect(gpxOverlay.layer.remove).toHaveBeenCalledTimes(1);
    expect(core.state.entries).toEqual([]);
    expect(core.state.sources).toEqual([]);
    expect(core.state.layers).toEqual([]);

    revokeSpy.mockRestore();
  });
});