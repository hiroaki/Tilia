function distanceMeters(from, to) {
  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLon = toRadians(to.lon - from.lon);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

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
  return {
    lat,
    lon,
    name: waypoint?.name ? String(waypoint.name) : "",
  };
}

function detailFromTrackPoint(trackPoint, index) {
  const lat = Number(trackPoint?.[0]);
  const lon = Number(trackPoint?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return {
    lat,
    lon,
    elevation: null,
    distanceMeters: index === 0 ? 0 : null,
    timestamp: null,
  };
}

export function buildDerivedTrackFields(trackPointDetails = []) {
  const nextDetails = [];
  const trackPoints = [];
  const trackTimeline = [];
  const elevationProfile = [];
  let previousPoint = null;
  let cumulativeDistance = 0;

  for (const detail of trackPointDetails) {
    const lat = Number(detail?.lat);
    const lon = Number(detail?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const currentPoint = { lat, lon };
    if (previousPoint) {
      cumulativeDistance += distanceMeters(previousPoint, currentPoint);
    }
    previousPoint = currentPoint;

    const elevation = coerceElevation(detail?.elevation);
    const timestamp = coerceTimestamp(detail?.timestamp);
    const normalizedDetail = {
      lat,
      lon,
      elevation,
      distanceMeters: cumulativeDistance,
      timestamp,
    };

    nextDetails.push(normalizedDetail);
    trackPoints.push([lat, lon]);

    if (timestamp !== null) {
      trackTimeline.push({ timestamp, lat, lon });
    }
    if (normalizedDetail.elevation !== null) {
      elevationProfile.push({
        lat,
        lon,
        elevation: normalizedDetail.elevation,
        distanceMeters: cumulativeDistance,
        timestamp,
      });
    }
  }

  trackTimeline.sort((left, right) => left.timestamp - right.timestamp);

  return {
    trackPoints,
    trackPointDetails: nextDetails,
    trackTimeline,
    elevationProfile,
  };
}

export function normalizeGpxSource(source = {}) {
  const sourceDetails = Array.isArray(source.trackPointDetails) && source.trackPointDetails.length > 0
    ? source.trackPointDetails
    : Array.isArray(source.trackPoints)
      ? source.trackPoints.map(detailFromTrackPoint).filter(Boolean)
      : [];
  const derived = buildDerivedTrackFields(sourceDetails);

  return {
    type: "gpx",
    name: source?.name ? String(source.name) : "track.gpx",
    ...derived,
    waypoints: Array.isArray(source.waypoints)
      ? source.waypoints.map(normalizeWaypoint).filter(Boolean)
      : [],
  };
}

export function cloneGpxSource(source = {}) {
  return normalizeGpxSource({
    ...source,
    trackPointDetails: Array.isArray(source.trackPointDetails)
      ? source.trackPointDetails.map((detail) => ({
        lat: detail?.lat,
        lon: detail?.lon,
        elevation: detail?.elevation,
        distanceMeters: detail?.distanceMeters,
        timestamp: detail?.timestamp,
      }))
      : undefined,
    waypoints: Array.isArray(source.waypoints)
      ? source.waypoints.map((waypoint) => ({
        lat: waypoint?.lat,
        lon: waypoint?.lon,
        name: waypoint?.name,
      }))
      : undefined,
  });
}

export function updateTrackPoint(source, index, patch = {}) {
  const normalized = normalizeGpxSource(source);
  if (!Number.isInteger(index) || index < 0 || index >= normalized.trackPointDetails.length) {
    return normalized;
  }

  const nextLat = Object.hasOwn(patch, "lat") ? coerceCoordinate(patch.lat) : null;
  const nextLon = Object.hasOwn(patch, "lon") ? coerceCoordinate(patch.lon) : null;

  const nextDetails = normalized.trackPointDetails.map((detail, detailIndex) => {
    if (detailIndex !== index) {
      return { ...detail };
    }
    return {
      ...detail,
      ...(nextLat !== null ? { lat: nextLat } : {}),
      ...(nextLon !== null ? { lon: nextLon } : {}),
      ...(Object.hasOwn(patch, "elevation") ? { elevation: patch.elevation } : {}),
      ...(Object.hasOwn(patch, "timestamp") ? { timestamp: patch.timestamp } : {}),
    };
  });

  return normalizeGpxSource({
    ...normalized,
    trackPointDetails: nextDetails,
  });
}