import {
  addEntry,
  claimNextTrackStylePresetIndex,
  clearEntries,
  clearLayers,
  clearSources,
  createAppState,
  removeEntry as removeStateEntry,
  replaceEntryPresentation,
  replaceEntrySource,
} from "./state.js";
import { createInteractionHub } from "./interaction-hub.js";
import { createSelectionHub } from "./selection-hub.js";
import { createInputRegistry } from "./input-registry.js";
import { parseGpxFile } from "../gpx/parse.js";
import { normalizeGpxSource } from "../gpx/source.js";
import { buildGpxOverlay, buildPhotoOverlay, fitMapToGroup } from "../map/layers.js";
import { getTrackStylePreset, TRACK_STYLE_PRESETS } from "../map/track-style-presets.js";
import { parsePhotoFile } from "../photo/exif.js";
import { inferPhotoLocationFromGpx } from "../photo/infer-location.js";
import { assertPhotoTimeMode, formatPhotoTimeModeLabel } from "./photo-time-utils.js";

function revokePhotoPreviewUrls(entries) {
  const revokedUrls = new Set();
  for (const entry of entries) {
    const previewUrl = entry.photoOriginal?.previewUrl || entry.source?.previewUrl;
    if (!previewUrl || revokedUrls.has(previewUrl)) {
      continue;
    }
    URL.revokeObjectURL(previewUrl);
    revokedUrls.add(previewUrl);
  }
}

function resolvePhotoSource(state, photo, options = {}) {
  const requestedPhotoTimeMode = assertPhotoTimeMode(options.photoTimeMode || "auto");

  if (!photo.hasGps) {
    const inferred = inferPhotoLocationFromGpx(state.sources, photo, {
      timeInterpretationMode: requestedPhotoTimeMode,
    });

    return {
      ...photo,
      lat: inferred.lat,
      lon: inferred.lon,
      locationSource: inferred.locationSource,
      locationReason: inferred.locationReason,
      inferenceDetail: inferred.inferenceDetail,
      requestedPhotoTimeMode,
      photoTimeMode: inferred.timeInterpretationMode,
    };
  }

  return {
    ...photo,
    locationSource: "exif-gps",
    locationReason: "Read directly from EXIF GPS",
    requestedPhotoTimeMode: "n/a",
    photoTimeMode: "n/a",
  };
}

function resolveTrackPresentation(state, existingPresentation = null) {
  const trackStylePresetIndex = Number.isInteger(existingPresentation?.trackStylePresetIndex)
    ? existingPresentation.trackStylePresetIndex
    : claimNextTrackStylePresetIndex(state, TRACK_STYLE_PRESETS.length);

  return {
    ...(existingPresentation || {}),
    trackStylePresetIndex,
  };
}

function isLayerAttached(group, layer) {
  if (!group || !layer || typeof group.hasLayer !== "function") {
    return false;
  }
  return group.hasLayer(layer);
}

function setLayerAttached(group, layer, attached) {
  if (!group || !layer) {
    return;
  }

  const currentlyAttached = isLayerAttached(group, layer);
  if (attached && !currentlyAttached && typeof group.addLayer === "function") {
    group.addLayer(layer);
  }
  if (!attached && currentlyAttached && typeof group.removeLayer === "function") {
    group.removeLayer(layer);
  }
}

function applyGpxEntryVisibility(state, entry) {
  if (!entry || entry.kind !== "gpx") {
    return entry;
  }

  const entryVisible = entry.visible !== false;
  const { tracks, waypoints } = state.gpxVisibility;
  const group = entry.layer;
  const trackLayer = entry.interactions?.trackLayer;
  const waypointLayers = entry.interactions?.waypoints || [];

  setLayerAttached(group, trackLayer, entryVisible && tracks !== false);
  for (const waypoint of waypointLayers) {
    setLayerAttached(group, waypoint?.layer, entryVisible && waypoints !== false);
  }

  return entry;
}

function addGpxEntry({ state, map, interactionHub }, source, options = {}) {
  const normalizedSource = normalizeGpxSource(source);
  const presentation = resolveTrackPresentation(state, options.presentation);
  const overlay = buildGpxOverlay(normalizedSource, {
    trackStyle: getTrackStylePreset(presentation.trackStylePresetIndex),
  });
  const entry = addEntry(state, {
    kind: "gpx",
    source: normalizedSource,
    layer: overlay.layer,
    interactions: overlay.interactions,
    presentation,
    visible: options.visible !== false,
  });

  applyGpxEntryVisibility(state, entry);

  if (entry.visible !== false) {
    overlay.layer.addTo(map);
    if (options.fitToView !== false) {
      fitMapToGroup(map, overlay.layer);
    }
  }

  interactionHub.syncEntry(entry);
  return entry;
}

export function createTiliaCore(map, options = {}) {
  const state = createAppState();
  const registry = createInputRegistry();
  const interactionHub = createInteractionHub(() => state.entries);
  const selectionHub = createSelectionHub(map);
  let defaultPhotoTimeMode = assertPhotoTimeMode(options.defaultPhotoTimeMode || "auto");
  const context = { state, map };

  registry.register(
    (input) => input?.name?.toLowerCase().endsWith(".gpx"),
    async (ctx, file) => {
      const parsed = await parseGpxFile(file);
      const entry = addGpxEntry({ state: ctx.state, map: ctx.map, interactionHub }, parsed, {
        fitToView: true,
        visible: true,
      });

      return {
        ...parsed,
        summary: `${parsed.trackPoints.length} track points, ${parsed.waypoints.length} waypoints`,
      };
    },
  );

  registry.register(
    (input) => /\.(jpe?g)$/i.test(input?.name || ""),
    async (ctx, file) => {
      const photo = await parsePhotoFile(file);
      const resolvedPhoto = resolvePhotoSource(ctx.state, photo, {
        photoTimeMode: defaultPhotoTimeMode,
      });

      const overlay = buildPhotoOverlay(resolvedPhoto);
      overlay.layer.addTo(ctx.map);
      fitMapToGroup(ctx.map, overlay.layer);

      const entry = addEntry(ctx.state, {
        kind: "photo",
        layer: overlay.layer,
        interactions: overlay.interactions,
        source: resolvedPhoto,
        photoOriginal: photo,
        requestedPhotoTimeMode: resolvedPhoto.requestedPhotoTimeMode,
        photoTimeMode: resolvedPhoto.photoTimeMode,
        visible: true,
      });
      interactionHub.syncEntry(entry);

      return {
        entryId: entry.id,
        ...resolvedPhoto,
        summary: `photo marker at ${resolvedPhoto.lat.toFixed(6)}, ${resolvedPhoto.lon.toFixed(6)} (${resolvedPhoto.locationSource}, mode=${resolvedPhoto.requestedPhotoTimeMode === "auto" ? `auto->${resolvedPhoto.photoTimeMode}` : formatPhotoTimeModeLabel(resolvedPhoto.photoTimeMode)})`,
      };
    },
  );

  return {
    state,
    registry,
    context,
    getDefaultPhotoTimeMode() {
      return defaultPhotoTimeMode;
    },
    getGpxVisibility() {
      return { ...state.gpxVisibility };
    },
    setDefaultPhotoTimeMode(mode) {
      defaultPhotoTimeMode = assertPhotoTimeMode(mode);
    },
    setGpxTracksVisibility(visible) {
      state.gpxVisibility.tracks = visible !== false;
      for (const entry of state.entries) {
        applyGpxEntryVisibility(state, entry);
      }
      return this.getGpxVisibility();
    },
    setGpxWaypointsVisibility(visible) {
      state.gpxVisibility.waypoints = visible !== false;
      for (const entry of state.entries) {
        applyGpxEntryVisibility(state, entry);
      }
      return this.getGpxVisibility();
    },
    addGpxSource(source, options = {}) {
      return addGpxEntry({ state, map, interactionHub }, source, options);
    },
    updateGpxSource(entryId, nextSource, options = {}) {
      const entry = state.entries.find((candidate) => candidate.id === entryId);
      if (!entry || entry.kind !== "gpx") {
        return null;
      }

      const normalizedSource = normalizeGpxSource(nextSource);
      const presentation = resolveTrackPresentation(state, entry.presentation);
      const nextOverlay = buildGpxOverlay(normalizedSource, {
        trackStyle: getTrackStylePreset(presentation.trackStylePresetIndex),
      });
      const nextVisible = options.visible ?? entry.visible !== false;
      replaceEntryPresentation(state, entryId, {
        visible: nextVisible,
      });
      entry.layer.remove();
      replaceEntryPresentation(state, entryId, {
        layer: nextOverlay.layer,
        interactions: nextOverlay.interactions,
        presentation,
      });
      applyGpxEntryVisibility(state, entry);
      if (nextVisible) {
        nextOverlay.layer.addTo(map);
      }
      replaceEntrySource(state, entryId, normalizedSource);
      interactionHub.syncEntry(entry);

      if (nextVisible && options.fitToView === true) {
        fitMapToGroup(map, nextOverlay.layer);
      }
      return entry;
    },
    updatePhotoTimeMode(entryId, mode) {
      const entry = state.entries.find((candidate) => candidate.id === entryId);
      if (!entry || entry.kind !== "photo" || !entry.photoOriginal || entry.photoOriginal.hasGps) {
        return null;
      }

      const nextSource = resolvePhotoSource(state, entry.photoOriginal, {
        photoTimeMode: mode,
      });
      const nextOverlay = buildPhotoOverlay(nextSource);
      const nextVisible = entry.visible !== false;

      if (nextVisible) {
        nextOverlay.layer.addTo(map);
      }
      entry.layer.remove();

      replaceEntryPresentation(state, entryId, {
        layer: nextOverlay.layer,
        interactions: nextOverlay.interactions,
        visible: nextVisible,
      });
      replaceEntrySource(state, entryId, nextSource);
      entry.requestedPhotoTimeMode = nextSource.requestedPhotoTimeMode;
      entry.photoTimeMode = nextSource.photoTimeMode;
      interactionHub.syncEntry(entry);

      fitMapToGroup(map, nextOverlay.layer);
      return entry;
    },
    setEntryVisibility(entryId, visible) {
      const entry = state.entries.find((candidate) => candidate.id === entryId);
      if (!entry) {
        return null;
      }

      entry.visible = visible;
      applyGpxEntryVisibility(state, entry);
      if (visible) {
        entry.layer.addTo(map);
      } else {
        entry.layer.remove();
      }
      return entry;
    },
    removeEntry(entryId) {
      const selection = selectionHub.getSelection();
      const entry = state.entries.find((candidate) => candidate.id === entryId);
      if (!entry) {
        return null;
      }

      if (selection?.entry?.id === entryId) {
        map.closePopup();
        selectionHub.clearSelection();
      }

      revokePhotoPreviewUrls([entry]);
      entry.layer.remove();
      removeStateEntry(state, entryId);
      return entry;
    },
    fitEntryToView(entryId) {
      const entry = state.entries.find((candidate) => candidate.id === entryId);
      if (!entry) {
        return null;
      }
      fitMapToGroup(map, entry.layer);
      return entry;
    },
    subscribeInteractions(handlers) {
      return interactionHub.subscribe(handlers);
    },
    getSelection() {
      return selectionHub.getSelection();
    },
    subscribeSelection(listener) {
      return selectionHub.subscribe(listener);
    },
    clearSelection() {
      return selectionHub.clearSelection();
    },
    openPopup(options) {
      return selectionHub.openPopup(options);
    },
    selectTrack(entry) {
      return selectionHub.selectTrack(entry);
    },
    selectWaypoint(entry, waypoint, options) {
      return selectionHub.selectWaypoint(entry, waypoint, options);
    },
    selectPhoto(entry, options) {
      return selectionHub.selectPhoto(entry, options);
    },
    clearAll() {
      map.closePopup();
      selectionHub.clearSelection();
      revokePhotoPreviewUrls(state.entries);
      clearLayers(state, (layer) => layer.remove());
      clearSources(state);
      clearEntries(state);
    },
  };
}
