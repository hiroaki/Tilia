function coerceTimestamp(value) {
  if (value == null || value === "") {
    return null;
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function coerceElevation(value) {
  if (value == null || value === "") {
    return null;
  }
  const elevation = Number(value);
  return Number.isFinite(elevation) ? elevation : null;
}

function coerceCoordinate(value) {
  if (value == null || value === "") {
    return null;
  }
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function normalizeWaypoint(waypoint) {
  const lat = Number(waypoint?.lat);
  const lon = Number(waypoint?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon, name: waypoint?.name ? String(waypoint.name) : "" };
}

function normalizePoint(point) {
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return {
    lat,
    lon,
    elevation: coerceElevation(point?.elevation),
    timestamp: coerceTimestamp(point?.timestamp),
  };
}

function normalizeSegment(segment) {
  const points = Array.isArray(segment?.points) ? segment.points.map(normalizePoint).filter(Boolean) : [];
  return points.length > 0 ? { points } : null;
}

function normalizeTrack(track) {
  const segments = Array.isArray(track?.segments) ? track.segments.map(normalizeSegment).filter(Boolean) : [];
  if (segments.length === 0) {
    return null;
  }
  return {
    name: track?.name == null || track.name === "" ? undefined : String(track.name),
    segments,
  };
}

export function normalizeGpxSource(source = {}) {
  return {
    type: "gpx",
    name: source?.name ? String(source.name) : "track.gpx",
    tracks: Array.isArray(source.tracks) ? source.tracks.map(normalizeTrack).filter(Boolean) : [],
    waypoints: Array.isArray(source.waypoints) ? source.waypoints.map(normalizeWaypoint).filter(Boolean) : [],
  };
}

export function cloneGpxSource(source = {}) {
  return normalizeGpxSource({
    ...source,
    tracks: Array.isArray(source.tracks) ? source.tracks.map((track) => ({
      name: track?.name,
      segments: Array.isArray(track?.segments) ? track.segments.map((segment) => ({
        points: Array.isArray(segment?.points) ? segment.points.map((point) => ({ ...point })) : [],
      })) : [],
    })) : [],
    waypoints: Array.isArray(source.waypoints) ? source.waypoints.map((waypoint) => ({ ...waypoint })) : [],
  });
}

export function updateTrackPoint(source, locator, patch = {}) {
  const normalized = normalizeGpxSource(source);
  const { trackIndex, segmentIndex, pointIndex } = locator || {};
  if (!normalized.tracks[trackIndex]?.segments[segmentIndex]?.points[pointIndex]) {
    return normalized;
  }

  const nextLat = Object.hasOwn(patch, "lat") ? coerceCoordinate(patch.lat) : null;
  const nextLon = Object.hasOwn(patch, "lon") ? coerceCoordinate(patch.lon) : null;
  const tracks = normalized.tracks.map((track, currentTrackIndex) => ({
    ...track,
    segments: track.segments.map((segment, currentSegmentIndex) => ({
      ...segment,
      points: segment.points.map((point, currentPointIndex) => {
        if (currentTrackIndex !== trackIndex || currentSegmentIndex !== segmentIndex || currentPointIndex !== pointIndex) {
          return point;
        }
        return {
          ...point,
          ...(nextLat !== null ? { lat: nextLat } : {}),
          ...(nextLon !== null ? { lon: nextLon } : {}),
          ...(Object.hasOwn(patch, "elevation") ? { elevation: coerceElevation(patch.elevation) } : {}),
          ...(Object.hasOwn(patch, "timestamp") ? { timestamp: coerceTimestamp(patch.timestamp) } : {}),
        };
      }),
    })),
  }));
  return normalizeGpxSource({ ...normalized, tracks });
}