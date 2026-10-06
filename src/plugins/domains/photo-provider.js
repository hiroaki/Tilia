import { cloneAndFreezePlainData, semanticError, semanticErrorCodes } from "../../domains/index.js";
import { createPhotoSelectionAdapter } from "./photo-selection.js";

const timeModes = new Set(["auto", "local", "utc"]);

function invalid(message, details = {}) {
  throw semanticError(semanticErrorCodes.inputInvalid, message, { domainId: "photo", ...details });
}

function normalizeCoordinate(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)
      || typeof value.lat !== "number" || !Number.isFinite(value.lat) || value.lat < -90 || value.lat > 90
      || typeof value.lon !== "number" || !Number.isFinite(value.lon) || value.lon < -180 || value.lon > 180) {
    invalid("Invalid Photo coordinate", { field: "coordinate" });
  }
  return { lat: value.lat, lon: value.lon };
}

function normalizeData(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Photo data must be an object");
  const coordinate = normalizeCoordinate(value.coordinate);
  const capturedAt = value.capturedAt == null ? null : value.capturedAt;
  if (capturedAt !== null && (typeof capturedAt !== "number" || !Number.isFinite(capturedAt))) invalid("Invalid Photo capturedAt", { field: "capturedAt" });
  const size = value.source?.size ?? 0;
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) invalid("Invalid Photo source size", { field: "source.size" });
  return {
    name: String(value.name ?? "photo"),
    coordinate,
    capturedAt,
    hasGps: coordinate !== null,
    make: String(value.make ?? ""),
    model: String(value.model ?? ""),
    source: { mediaType: String(value.source?.mediaType ?? "application/octet-stream"), size },
  };
}

function normalizeMode(value = "auto") {
  if (!timeModes.has(value)) invalid("Invalid Photo requested time mode", { field: "requestedTimeMode" });
  return value;
}

function makeSnapshot(data, requestedTimeMode) {
  return cloneAndFreezePlainData({
    data,
    preferences: { requestedTimeMode },
    derived: {
      resolvedTimeMode: requestedTimeMode === "auto" ? null : requestedTimeMode,
      inferredTimestamp: null,
      inferredLocation: null,
      locationSource: data.coordinate ? "exif-gps" : null,
    },
  });
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createPhotoProvider({
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  prepareGate = null,
  mutationGate = null,
} = {}) {
  function prepare(value, fallbackBlob = null) {
    const data = normalizeData(value?.data ?? value);
    const requestedTimeMode = normalizeMode(value?.preferences?.requestedTimeMode ?? value?.requestedTimeMode);
    const blob = value?.blob ?? fallbackBlob;
    if (blob != null && typeof Blob !== "undefined" && !(blob instanceof Blob)) invalid("Photo blob must be a Blob", { field: "blob" });
    let previewUrl = null;
    let disposed = false;
    if (blob != null) previewUrl = createObjectURL(blob);
    const dispose = previewUrl == null ? null : () => {
      if (disposed) return;
      revokeObjectURL(previewUrl);
      disposed = true;
    };
    const publicSnapshot = makeSnapshot(data, requestedTimeMode);
    return { instance: { publicSnapshot, blob, previewUrl, dispose }, snapshot: publicSnapshot, dispose };
  }

  return Object.freeze({
    selection: createPhotoSelectionAdapter(),
    async prepareCreate({ value, entryScope }) {
      const prepared = prepare(value);
      if (prepared.dispose) entryScope.defer(prepared.dispose, { label: "photo-preview", retry: "safe" });
      if (prepareGate) await prepareGate;
      return { instance: prepared.instance, snapshot: prepared.snapshot, ...(prepared.dispose ? { dispose: prepared.dispose } : {}) };
    },
    async prepareMutation({ currentInstance, command }) {
      if (!command || typeof command !== "object") invalid("Photo command must be an object");
      if (command.type === "recompute-derived") return { changed: false };
      let data;
      let requestedTimeMode;
      let nextBlob = currentInstance.blob;
      let resourceChanged = false;
      if (command.type === "replace-data") {
        data = normalizeData(command.data);
        requestedTimeMode = currentInstance.publicSnapshot.preferences.requestedTimeMode;
        if (Object.hasOwn(command.data ?? {}, "blob")) {
          nextBlob = command.data.blob;
          resourceChanged = nextBlob !== currentInstance.blob;
        }
      } else if (command.type === "set-requested-time-mode") {
        data = currentInstance.publicSnapshot.data;
        requestedTimeMode = normalizeMode(command.requestedTimeMode);
      } else invalid(`Unknown Photo command "${command.type}"`);
      const desired = makeSnapshot(data, requestedTimeMode);
      const semanticChanged = !same(desired, currentInstance.publicSnapshot);
      if (!semanticChanged && !resourceChanged) return { changed: false };
      if (!resourceChanged) {
        return {
          changed: true,
          nextInstance: { ...currentInstance, publicSnapshot: desired },
          nextSnapshot: desired,
          change: cloneAndFreezePlainData({ type: command.type }),
          disposePrevious: null,
          ...(currentInstance.dispose ? { disposeNext: currentInstance.dispose } : {}),
        };
      }
      const prepared = prepare({ data, preferences: { requestedTimeMode }, blob: nextBlob });
      try {
        if (mutationGate) await mutationGate;
      } catch (error) {
        await prepared.dispose?.();
        throw error;
      }
      return {
        changed: true,
        nextInstance: prepared.instance,
        nextSnapshot: semanticChanged ? prepared.snapshot : currentInstance.publicSnapshot,
        revisioned: semanticChanged,
        ...(semanticChanged ? { change: cloneAndFreezePlainData({ type: command.type }) } : {}),
        ...(currentInstance.dispose ? { disposePrevious: currentInstance.dispose } : {}),
        ...(prepared.dispose ? { disposeNext: prepared.dispose } : {}),
      };
    },
    getSnapshot(instance) { return instance.publicSnapshot; },
  });
}
