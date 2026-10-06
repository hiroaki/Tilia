import { cloneAndFreezePlainData, semanticError, semanticErrorCodes } from "../../domains/index.js";
import { createGpxSelectionAdapter } from "./gpx-selection.js";

const categories = new Set(["tracks", "routes", "waypoints"]);

function invalid(message, details = {}) {
  throw semanticError(semanticErrorCodes.inputInvalid, message, { domainId: "gpx", ...details });
}

function number(value, field, minimum, maximum, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) invalid(`Invalid GPX ${field}`, { field });
  return value;
}

function text(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function point(value, path, { route = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`Invalid GPX point at ${path}`, { path });
  const result = {
    lat: number(value.lat, `${path}.lat`, -90, 90),
    lon: number(value.lon, `${path}.lon`, -180, 180),
  };
  if (route) result.name = text(value.name);
  else {
    result.elevation = number(value.elevation, `${path}.elevation`, -Infinity, Infinity, { nullable: true });
    result.timestamp = number(value.timestamp, `${path}.timestamp`, -Infinity, Infinity, { nullable: true });
  }
  return result;
}

function array(value, path) {
  if (!Array.isArray(value)) invalid(`GPX ${path} must be an array`, { path });
  return value;
}

function normalizeData(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("GPX data must be an object");
  return {
    name: text(value.name, "track.gpx"),
    tracks: array(value.tracks, "tracks").map((track, trackIndex) => ({
      ...(track?.name == null ? {} : { name: text(track.name) }),
      segments: array(track?.segments, `tracks[${trackIndex}].segments`).map((segment, segmentIndex) => ({
        points: array(segment?.points, `tracks[${trackIndex}].segments[${segmentIndex}].points`)
          .map((item, pointIndex) => point(item, `tracks[${trackIndex}].segments[${segmentIndex}].points[${pointIndex}]`)),
      })),
    })),
    routes: array(value.routes, "routes").map((route, routeIndex) => ({
      ...(route?.name == null ? {} : { name: text(route.name) }),
      points: array(route?.points, `routes[${routeIndex}].points`)
        .map((item, pointIndex) => point(item, `routes[${routeIndex}].points[${pointIndex}]`, { route: true })),
    })),
    waypoints: array(value.waypoints, "waypoints")
      .map((item, pointIndex) => point(item, `waypoints[${pointIndex}]`, { route: true })),
  };
}

function normalizePreferences(value, trackCount) {
  const preferences = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const trackVisibility = {};
  if (preferences.trackVisibility !== undefined) {
    if (!preferences.trackVisibility || typeof preferences.trackVisibility !== "object" || Array.isArray(preferences.trackVisibility)) {
      invalid("GPX trackVisibility must be an object", { field: "trackVisibility" });
    }
    for (const [key, visible] of Object.entries(preferences.trackVisibility)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= trackCount || typeof visible !== "boolean") {
        invalid("Invalid GPX per-track visibility", { field: "trackVisibility", trackIndex: key });
      }
      trackVisibility[index] = visible;
    }
  }
  return {
    tracksVisible: preferences.tracksVisible ?? true,
    routesVisible: preferences.routesVisible ?? true,
    waypointsVisible: preferences.waypointsVisible ?? true,
    trackVisibility,
    stylePresetId: text(preferences.stylePresetId, "default"),
  };
}

function snapshot(data, preferences) {
  for (const field of ["tracksVisible", "routesVisible", "waypointsVisible"]) {
    if (typeof preferences[field] !== "boolean") invalid(`GPX ${field} must be boolean`, { field });
  }
  return cloneAndFreezePlainData({ data, preferences, derived: {} });
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createGpxProvider() {
  return Object.freeze({
    selection: createGpxSelectionAdapter(),
    async prepareCreate({ value }) {
      const data = normalizeData(value?.data ?? value);
      const nextSnapshot = snapshot(data, normalizePreferences(value?.preferences, data.tracks.length));
      return { instance: nextSnapshot, snapshot: nextSnapshot };
    },
    async prepareMutation({ currentInstance, command }) {
      if (!command || typeof command !== "object") invalid("GPX command must be an object");
      if (command.type === "recompute-derived") return { changed: false };
      let data = currentInstance.data;
      let preferences = currentInstance.preferences;
      if (command.type === "replace-data") {
        data = normalizeData(command.data);
        preferences = normalizePreferences(preferences, data.tracks.length);
      } else if (command.type === "set-category-visibility") {
        if (!categories.has(command.category) || typeof command.visible !== "boolean") invalid("Invalid GPX category visibility command");
        preferences = { ...preferences, [`${command.category}Visible`]: command.visible };
      } else if (command.type === "set-track-visibility") {
        if (!Number.isInteger(command.trackIndex) || command.trackIndex < 0 || command.trackIndex >= data.tracks.length
            || typeof command.visible !== "boolean") invalid("Invalid GPX track visibility command");
        preferences = { ...preferences, trackVisibility: { ...preferences.trackVisibility, [command.trackIndex]: command.visible } };
      } else if (command.type === "set-style-preset") {
        if (typeof command.stylePresetId !== "string" || command.stylePresetId.length === 0) invalid("Invalid GPX style preset");
        preferences = { ...preferences, stylePresetId: command.stylePresetId };
      } else invalid(`Unknown GPX command "${command.type}"`);
      const nextSnapshot = snapshot(data, preferences);
      if (same(nextSnapshot, currentInstance)) return { changed: false };
      return {
        changed: true,
        nextInstance: nextSnapshot,
        nextSnapshot,
        change: cloneAndFreezePlainData({ type: command.type }),
      };
    },
    getSnapshot(instance) { return instance; },
  });
}
