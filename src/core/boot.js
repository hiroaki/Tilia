import {
  addEntry,
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
import { buildGpxOverlay, buildPhotoOverlay, fitMapToGroup } from "../map/layers.js";
import { parsePhotoFile } from "../photo/exif.js";
import { inferPhotoLocationFromGpx } from "../photo/infer-location.js";

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
  const photoTimeMode = options.photoTimeMode || "local";

  if (!photo.hasGps) {
    const inferred = inferPhotoLocationFromGpx(state.sources, photo, {
      timeInterpretationMode: photoTimeMode,
    });

    return {
      ...photo,
      lat: inferred.lat,
      lon: inferred.lon,
      locationSource: inferred.locationSource,
      locationReason: inferred.locationReason,
      inferenceDetail: inferred.inferenceDetail,
      photoTimeMode: inferred.timeInterpretationMode,
    };
  }

  return {
    ...photo,
    locationSource: "exif-gps",
    locationReason: "Read directly from EXIF GPS",
    photoTimeMode: "n/a",
  };
}

export function createTiliaCore(map, options = {}) {
  const state = createAppState();
  const registry = createInputRegistry();
  const interactionHub = createInteractionHub(() => state.entries);
  const selectionHub = createSelectionHub(map);
  let defaultPhotoTimeMode = options.defaultPhotoTimeMode || "local";
  const context = { state, map };

  registry.register(
    (input) => input?.name?.toLowerCase().endsWith(".gpx"),
    async (ctx, file) => {
      const parsed = await parseGpxFile(file);
      const overlay = buildGpxOverlay(parsed);
      overlay.layer.addTo(ctx.map);
      fitMapToGroup(ctx.map, overlay.layer);

      const entry = addEntry(ctx.state, {
        kind: "gpx",
        source: parsed,
        layer: overlay.layer,
        interactions: overlay.interactions,
        visible: true,
      });
      interactionHub.syncEntry(entry);

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
        photoTimeMode: resolvedPhoto.photoTimeMode,
        visible: true,
      });
      interactionHub.syncEntry(entry);

      return {
        entryId: entry.id,
        ...resolvedPhoto,
        summary: `photo marker at ${resolvedPhoto.lat.toFixed(6)}, ${resolvedPhoto.lon.toFixed(6)} (${resolvedPhoto.locationSource}, mode=${resolvedPhoto.photoTimeMode})`,
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
    setDefaultPhotoTimeMode(mode) {
      defaultPhotoTimeMode = mode;
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
