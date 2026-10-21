import { semanticError, semanticErrorCodes } from "../../domains/errors.js";

const fieldsByKind = Object.freeze({
  document: [],
  track: ["trackIndex"],
  segment: ["trackIndex", "segmentIndex"],
  route: ["routeIndex"],
  "track-point": ["trackIndex", "segmentIndex", "pointIndex"],
  "route-point": ["routeIndex", "pointIndex"],
  waypoint: ["waypointIndex"],
});

function invalid() {
  throw semanticError(semanticErrorCodes.selectionReferenceInvalid, "Invalid GPX semantic selection reference", { domainId: "gpx" });
}

function validate(value, { canonical = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || !Object.hasOwn(fieldsByKind, value.kind)) invalid();
  const fields = fieldsByKind[value.kind];
  const keys = ["kind", ...fields, ...(canonical && value.kind !== "document" ? ["revision"] : [])];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) invalid();
  for (const field of fields) if (!Number.isInteger(value[field]) || value[field] < 0) invalid();
  if (canonical && value.kind !== "document" && (!Number.isInteger(value.revision) || value.revision < 1)) invalid();
  return fields;
}

function targetIn(data, ref) {
  switch (ref.kind) {
    case "document": return data;
    case "track": return data.tracks[ref.trackIndex] ?? null;
    case "segment": return data.tracks[ref.trackIndex]?.segments[ref.segmentIndex] ?? null;
    case "track-point": return data.tracks[ref.trackIndex]?.segments[ref.segmentIndex]?.points[ref.pointIndex] ?? null;
    case "route": return data.routes[ref.routeIndex] ?? null;
    case "route-point": return data.routes[ref.routeIndex]?.points[ref.pointIndex] ?? null;
    case "waypoint": return data.waypoints[ref.waypointIndex] ?? null;
    default: return null;
  }
}

export function createGpxSelectionAdapter() {
  return Object.freeze({
    canonicalize({ instance, revision, target }) {
      const fields = validate(target);
      if (targetIn(instance.data, target) === null) invalid();
      return Object.freeze({ kind: target.kind,
        ...(target.kind === "document" ? {} : { revision }),
        ...Object.fromEntries(fields.map((field) => [field, target[field]])),
      });
    },
    equals(left, right) {
      const fields = validate(left, { canonical: true });
      validate(right, { canonical: true });
      return left.kind === right.kind && left.revision === right.revision
        && fields.every((field) => left[field] === right[field]);
    },
    resolve({ instance, revision, ref }) {
      validate(ref, { canonical: true });
      if (ref.kind !== "document" && ref.revision !== revision) return null;
      return targetIn(instance.data, ref);
    },
    reconcile({ previousRevision, nextRevision, command, ref }) {
      validate(ref, { canonical: true });
      if (previousRevision === nextRevision) return Object.freeze({ type: "unchanged" });
      if (ref.kind === "document") return Object.freeze({ type: "refreshed" });
      if (command.type === "replace-data") return Object.freeze({ type: "invalid" });
      return Object.freeze({ type: "remapped", ref: Object.freeze({ ...ref, revision: nextRevision }) });
    },
  });
}
