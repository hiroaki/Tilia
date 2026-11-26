import { cloneAndFreezePlainData } from "../domains/immutable.js";
import { invalidGpx, resolveGpxTarget } from "./document.js";
import { getTrackDistanceSummary, getSourceDistanceSummary, getTrackPresentationPoints, distanceMeters, getTrackPointEntries } from "./interpretation.js";

export function gpxTargetPaths(document, target, mode = "track") {
  const value = resolveGpxTarget(document, target);
  const track = (value, ti) => ({ target: { kind: "track", trackIndex: ti }, points: getTrackPresentationPoints(value, ti, mode).map((p) => ({
    point: p, target: { kind: "track-point", ...p.locator },
  })) });
  const route = (value, ri) => ({ target: { kind: "route", routeIndex: ri }, points: value.points.map((point, pi) => ({ point, target: { kind: "route-point", routeIndex: ri, pointIndex: pi } })) });
  switch (target.kind) {
    case "document": return [...document.tracks.map(track), ...document.routes.map(route), ...document.waypoints.map((point, wi) => ({ target: { kind: "waypoint", waypointIndex: wi }, points: [{ point, target: { kind: "waypoint", waypointIndex: wi } }] }))];
    case "track": return [track(value, target.trackIndex)];
    case "segment": return [{ target, points: value.points.map((point, pi) => ({ point, target: { kind: "track-point", trackIndex: target.trackIndex, segmentIndex: target.segmentIndex, pointIndex: pi } })) }];
    case "route": return [route(value, target.routeIndex)];
    default: return [{ target, points: [{ point: value, target }] }];
  }
}
export function queryGpx(view, method, target = { kind: "document" }, coordinate) {
  const document = view.snapshot.data;
  if (target?.revision !== undefined && target.revision !== view.revision) invalidGpx("Stale GPX query target");
  const value = resolveGpxTarget(document, target);
  const envelope = { entryId: view.entry.id, revision: view.revision };
  if (method === "document") return Object.freeze({ ...envelope, document });
  if (method === "distance") {
    let summary;
    if (target.kind === "document") summary = getSourceDistanceSummary(document);
    else if (target.kind === "track") summary = getTrackDistanceSummary(value);
    else if (["segment", "route"].includes(target.kind)) summary = getTrackDistanceSummary({ segments: [{ points: value.points }] });
    else invalidGpx("Distance requires document, track, segment or route target");
    return Object.freeze({ ...envelope, recordedMeters: summary.recordedDistanceMeters, inferredGapMeters: summary.inferredDistanceMeters, totalMeters: summary.totalDistanceMeters });
  }
  const presentation = method === "presentation";
  const mode = presentation ? view.snapshot.derived.presentationMode : "track";
  const allPaths = gpxTargetPaths(document, target, mode);
  const points = allPaths.flatMap((path) => path.points);
  let result;
  if (method === "extent") result = { bounds: points.length ? {
    southWest: points.reduce((a, { point }) => ({ lat: Math.min(a.lat, point.lat), lon: Math.min(a.lon, point.lon) }), { lat: Infinity, lon: Infinity }),
    northEast: points.reduce((a, { point }) => ({ lat: Math.max(a.lat, point.lat), lon: Math.max(a.lon, point.lon) }), { lat: -Infinity, lon: -Infinity }),
  } : null };
  else if (method === "elevation" || presentation) {
    if (!["document", "track", "segment", "route"].includes(target.kind)) invalidGpx("Elevation requires a path target");
    result = { profiles: allPaths.filter((path) => path.target.kind !== "waypoint").map((path) => {
      let cumulative = 0;
      let previous;
      return { target: path.target, samples: path.points.map(({ point, target: locator }) => {
        const isTrack = path.target.kind === "track";
        if (!isTrack && previous) cumulative += distanceMeters(previous, point);
        const sample = {
          locator, distanceMeters: isTrack ? point.distanceMeters : cumulative,
          elevation: point.elevation, edgeKind: isTrack ? point.edgeKind : previous ? "recorded" : "start",
        };
        previous = point;
        return presentation ? { ...sample, lat: point.lat, lon: point.lon } : sample;
      }) };
    }) };
    if (presentation) result.mode = mode;
  } else if (method === "nearest") {
    if (!["track", "segment", "route"].includes(target.kind)) invalidGpx("Nearest point requires track, segment or route target");
    if (!coordinate || !Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lon)) invalidGpx("Invalid nearest-point coordinate");
    let match = null;
    for (const { point, target: pointTarget } of points) {
      const distanceSquared = (point.lat - coordinate.lat) ** 2 + (point.lon - coordinate.lon) ** 2;
      if (!match || distanceSquared < match.distanceSquared) match = { target: pointTarget, point: resolveGpxTarget(document, pointTarget), distanceSquared };
    }
    result = { match };
  } else invalidGpx("Unknown GPX query");
  return cloneAndFreezePlainData({ ...envelope, ...result });
}
export function captureGpxTimeline(views) {
  const points = views.flatMap((view) => getTrackPointEntries(view.snapshot.data)
    .filter(({ point }) => Number.isFinite(point.timestamp))
    .map(({ point, locator }) => ({ timestamp: point.timestamp, lat: point.lat, lon: point.lon, locator: { entryId: view.entry.id, ...locator } })));
  points.sort((a, b) => a.timestamp - b.timestamp); // Stable sort retains committed entry/traversal order for duplicates.
  return cloneAndFreezePlainData({ points });
}
export function lookupTimestamp(timeline, timestamp) {
  if (!Number.isFinite(timestamp)) invalidGpx("Invalid timeline timestamp");
  let before = null;
  let after = null;
  const exact = [];
  for (const point of timeline.points) {
    if (point.timestamp === timestamp) exact.push(point);
    if (point.timestamp <= timestamp) before = point;
    else { after = point; break; }
  }
  return cloneAndFreezePlainData({ exact, before, after });
}
