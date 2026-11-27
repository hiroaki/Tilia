function createIdFactory() {
  let nextId = 1;
  return (kind) => `${kind}-${nextId++}`;
}

export function createDraftDocument(source) {
  const createId = createIdFactory();
  // Canonical node attributes are scalar. Copy each node and replace every child array.
  const copyPoint = (point, kind) => ({ ...point, id: createId(kind) });
  return {
    name: source.name,
    metadata: { ...source.metadata },
    waypoints: source.waypoints.map(point => copyPoint(point, "waypoint")),
    routes: source.routes.map(route => ({
      ...route,
      id: createId("route"),
      points: route.points.map(point => copyPoint(point, "route-point")),
    })),
    tracks: source.tracks.map((track, originalTrackIndex) => ({
      ...track,
      id: createId("track"),
      originalTrackIndex,
      segments: track.segments.map(segment => ({
        id: createId("segment"),
        points: segment.points.map(point => copyPoint(point, "track-point")),
      })),
    })),
    createId,
  };
}

export function findDraftTrack(draft, trackId) {
  return draft?.tracks.find((track) => track.id === trackId) || null;
}

export function findDraftSegment(draft, trackId, segmentId) {
  return findDraftTrack(draft, trackId)?.segments.find((segment) => segment.id === segmentId) || null;
}

export function findDraftPoint(draft, trackId, segmentId, pointId) {
  return findDraftSegment(draft, trackId, segmentId)?.points.find((point) => point.id === pointId) || null;
}

export function createInsertedDraftPoint(draft, latlng) {
  return {
    id: draft.createId("track-point"),
    lat: Number(latlng.lat),
    lon: Number(latlng.lng),
    elevation: null,
    timestamp: null,
  };
}

export function toDraftCoordinates(segment) {
  return (segment?.points || []).map((point) => [point.lat, point.lon]);
}

function toGpxPoint({ id, ...point }) {
  return point;
}

export function toGpxSource(draft, name = draft.name, { tracksOnly = false } = {}) {
  return {
    name,
    metadata: { ...draft.metadata },
    tracks: draft.tracks.map(({ id, originalTrackIndex, segments, ...track }) => ({
      ...track,
      segments: segments.map(segment => ({ points: segment.points.map(toGpxPoint) })),
    })),
    routes: tracksOnly ? [] : draft.routes.map(({ id, points, ...route }) => ({
      ...route,
      points: points.map(toGpxPoint),
    })),
    waypoints: tracksOnly ? [] : draft.waypoints.map(toGpxPoint),
  };
}
