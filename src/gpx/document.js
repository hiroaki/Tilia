import { cloneAndFreezePlainData } from "../domains/immutable.js";
import { semanticError, semanticErrorCodes } from "../domains/errors.js";

export function invalidGpx(message, details = {}) {
  throw semanticError(semanticErrorCodes.inputInvalid, message, { domainId: "gpx", ...details });
}
function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidGpx(`Invalid GPX ${path}`, { path });
  return value;
}
function array(value, path) {
  if (!Array.isArray(value)) invalidGpx(`GPX ${path} must be an array`, { path });
  return value;
}
function numeric(value, path, min = -Infinity, max = Infinity, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) invalidGpx(`Invalid GPX ${path}`, { path });
  return value === 0 ? 0 : value;
}
function description(value) {
  return value == null ? "" : String(value).trim();
}
function named(value) {
  return {
    ...(value.name == null || description(value.name) === "" ? {} : { name: description(value.name) }),
    ...(value.description == null || description(value.description) === "" ? {} : { description: description(value.description) }),
  };
}
export function normalizeGpxPoint(value, path = "point", { track = false } = {}) {
  object(value, path);
  return {
    lat: numeric(value.lat, `${path}.lat`, -90, 90),
    lon: numeric(value.lon, `${path}.lon`, -180, 180),
    elevation: numeric(value.elevation, `${path}.elevation`, -Infinity, Infinity, true),
    timestamp: numeric(value.timestamp, `${path}.timestamp`, -Infinity, Infinity, true),
    ...(!track || description(value.name) !== "" ? { name: description(value.name) } : {}),
    ...(description(value.description) === "" ? {} : { description: description(value.description) }),
    ...(description(value.symbol) === "" ? {} : { symbol: description(value.symbol) }),
  };
}

// The provider, parser and serializer share this canonical supported subset.
// Unknown optional fields are ignored; structural arrays are never flattened.
export function normalizeGpxDocument(value = {}) {
  object(value, "document");
  const metadata = object(value.metadata ?? {}, "metadata");
  return cloneAndFreezePlainData({
    name: value.name == null ? "track.gpx" : String(value.name),
    metadata: { ...named(metadata), timestamp: numeric(metadata.timestamp, "metadata.timestamp", -Infinity, Infinity, true) },
    tracks: array(value.tracks ?? [], "tracks").map((track, ti) => {
      object(track, `tracks[${ti}]`);
      return { ...named(track), segments: array(track.segments, `tracks[${ti}].segments`).map((segment, si) => {
        object(segment, `tracks[${ti}].segments[${si}]`);
        return { points: array(segment.points, `tracks[${ti}].segments[${si}].points`)
          .map((point, pi) => normalizeGpxPoint(point, `tracks[${ti}].segments[${si}].points[${pi}]`, { track: true })) };
      }) };
    }),
    routes: array(value.routes ?? [], "routes").map((route, ri) => {
      object(route, `routes[${ri}]`);
      return { ...named(route), points: array(route.points, `routes[${ri}].points`)
        .map((point, pi) => normalizeGpxPoint(point, `routes[${ri}].points[${pi}]`)) };
    }),
    waypoints: array(value.waypoints ?? [], "waypoints").map((point, wi) => normalizeGpxPoint(point, `waypoints[${wi}]`)),
  });
}

const fields = { document: [], track: ["trackIndex"], segment: ["trackIndex", "segmentIndex"],
  route: ["routeIndex"], "track-point": ["trackIndex", "segmentIndex", "pointIndex"],
  "route-point": ["routeIndex", "pointIndex"], waypoint: ["waypointIndex"] };
export function resolveGpxTarget(document, target = { kind: "document" }) {
  const keys = target && typeof target === "object" && !Array.isArray(target) && Object.hasOwn(fields, target.kind)
    ? fields[target.kind] : null;
  if (!keys || Object.keys(target).some((key) => !["kind", ...keys, "revision"].includes(key))
      || keys.some((key) => !Number.isInteger(target[key]) || target[key] < 0)
      || (target.revision !== undefined && (!Number.isInteger(target.revision) || target.revision < 1))) invalidGpx("Invalid GPX target");
  let value;
  switch (target.kind) {
    case "document": value = document; break;
    case "track": value = document.tracks[target.trackIndex]; break;
    case "segment": value = document.tracks[target.trackIndex]?.segments[target.segmentIndex]; break;
    case "route": value = document.routes[target.routeIndex]; break;
    case "track-point": value = document.tracks[target.trackIndex]?.segments[target.segmentIndex]?.points[target.pointIndex]; break;
    case "route-point": value = document.routes[target.routeIndex]?.points[target.pointIndex]; break;
    case "waypoint": value = document.waypoints[target.waypointIndex]; break;
  }
  if (!value) invalidGpx("GPX target does not exist", { target });
  return value;
}

export function updateGpxPoint(document, { target, patch } = {}) {
  if (!["track-point", "route-point", "waypoint"].includes(target?.kind)) invalidGpx("Expected GPX point target");
  resolveGpxTarget(document, target);
  object(patch, "point patch");
  if (Object.keys(patch).some((key) => !["lat", "lon", "elevation", "timestamp"].includes(key))) invalidGpx("Unsupported GPX point patch");
  const next = structuredClone(document);
  if (Object.values(patch).some((value) => value === undefined)) invalidGpx("GPX point patch values must not be undefined");
  Object.assign(resolveGpxTarget(next, target), patch);
  return normalizeGpxDocument(next);
}
