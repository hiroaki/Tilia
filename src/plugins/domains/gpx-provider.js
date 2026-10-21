import { cloneAndFreezePlainData, semanticError, semanticErrorCodes } from "../../domains/index.js";
import { normalizeGpxDocument, updateGpxPoint } from "../../gpx/document.js";
import { createGpxSelectionAdapter } from "./gpx-selection.js";

const categories = new Set(["tracks", "routes", "waypoints"]);

function invalid(message, details = {}) {
  throw semanticError(semanticErrorCodes.inputInvalid, message, { domainId: "gpx", ...details });
}

function text(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function normalizePreferences(value, trackCount, routeCount) {
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
  const routeVisibility = {};
  if (preferences.routeVisibility !== undefined) {
    if (!preferences.routeVisibility || typeof preferences.routeVisibility !== "object" || Array.isArray(preferences.routeVisibility)) {
      invalid("GPX routeVisibility must be an object", { field: "routeVisibility" });
    }
    for (const [key, visible] of Object.entries(preferences.routeVisibility)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= routeCount || typeof visible !== "boolean") {
        invalid("Invalid GPX per-route visibility", { field: "routeVisibility", routeIndex: key });
      }
      routeVisibility[index] = visible;
    }
  }
  return {
    tracksVisible: preferences.tracksVisible ?? true,
    routesVisible: preferences.routesVisible ?? true,
    waypointsVisible: preferences.waypointsVisible ?? true,
    trackVisibility,
    routeVisibility,
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
      const data = normalizeGpxDocument(value?.data ?? value);
      const nextSnapshot = snapshot(data, normalizePreferences(value?.preferences, data.tracks.length, data.routes.length));
      return { instance: nextSnapshot, snapshot: nextSnapshot };
    },
    async prepareMutation({ currentInstance, command, expectedRevision }) {
      if (!command || typeof command !== "object") invalid("GPX command must be an object");
      if (command.type === "recompute-derived") return { changed: false };
      let data = currentInstance.data;
      let preferences = currentInstance.preferences;
      if (command.type === "replace-data") {
        data = normalizeGpxDocument(command.data);
        preferences = normalizePreferences({ ...preferences, trackVisibility: Object.fromEntries(
          Object.entries(preferences.trackVisibility).filter(([key]) => Number(key) < data.tracks.length),
        ), routeVisibility: Object.fromEntries(
          Object.entries(preferences.routeVisibility).filter(([key]) => Number(key) < data.routes.length),
        ) }, data.tracks.length, data.routes.length);
      } else if (command.type === "update-point") {
        if (command.target?.revision !== undefined && command.target.revision !== expectedRevision) {
          throw semanticError(semanticErrorCodes.entryStaleRevision, "GPX point target revision is stale");
        }
        data = updateGpxPoint(data, command);
      } else if (command.type === "set-category-visibility") {
        if (!categories.has(command.category) || typeof command.visible !== "boolean") invalid("Invalid GPX category visibility command");
        preferences = { ...preferences, [`${command.category}Visible`]: command.visible };
      } else if (command.type === "set-track-visibility") {
        if (!Number.isInteger(command.trackIndex) || command.trackIndex < 0 || command.trackIndex >= data.tracks.length
            || typeof command.visible !== "boolean") invalid("Invalid GPX track visibility command");
        preferences = { ...preferences, trackVisibility: { ...preferences.trackVisibility, [command.trackIndex]: command.visible } };
      } else if (command.type === "set-route-visibility") {
        if (!Number.isInteger(command.routeIndex) || command.routeIndex < 0 || command.routeIndex >= data.routes.length
            || typeof command.visible !== "boolean") invalid("Invalid GPX route visibility command");
        preferences = { ...preferences, routeVisibility: { ...preferences.routeVisibility, [command.routeIndex]: command.visible } };
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
