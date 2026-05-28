function isFiniteCoordinate(value) {
  return Number.isFinite(value);
}

function normalizeCoordinates(coordinates) {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  const normalized = [];
  for (const pair of coordinates) {
    if (pair && typeof pair === "object" && !Array.isArray(pair)) {
      const lat = Number(pair.lat);
      const lon = Number(pair.lon);
      if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lon)) {
        continue;
      }
      normalized.push({ lat, lon });
      continue;
    }
    if (!Array.isArray(pair) || pair.length < 2) {
      continue;
    }
    const lon = Number(pair[0]);
    const lat = Number(pair[1]);
    if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lon)) {
      continue;
    }
    normalized.push({ lat, lon });
  }
  return normalized;
}

function normalizeSingleRoute(route) {
  const geometry = route?.geometry;
  const coordinates = geometry?.type === "LineString"
    ? normalizeCoordinates(geometry.coordinates)
    : [];
  if (coordinates.length < 2) {
    return null;
  }

  return {
    geometry: {
      type: "LineString",
      coordinates,
    },
    distanceMeters: Number(route?.distance_meters) || 0,
    durationSeconds: Number(route?.duration_seconds) || 0,
    provider: route?.provider ? String(route.provider) : "unknown",
    warnings: Array.isArray(route?.warnings) ? route.warnings.map((warning) => String(warning)) : [],
  };
}

export function normalizeRouteResponse(payload, maxRoutes = 3) {
  const routes = Array.isArray(payload?.routes)
    ? payload.routes
    : payload?.route
      ? [payload.route]
      : [];

  return routes
    .map(normalizeSingleRoute)
    .filter(Boolean)
    .slice(0, Math.max(1, maxRoutes));
}

function createRouteSourceName({ profile, routeIndex, routeCount }) {
  const suffix = routeCount > 1 ? ` ${routeIndex + 1}` : "";
  const profileSuffix = profile ? ` (${profile})` : "";
  return `Route${suffix}${profileSuffix}.gpx`;
}

export function createImportedRouteSource(route, { profile = "", routeIndex = 0, routeCount = 1 } = {}) {
  const normalizedRoute = normalizeSingleRoute(route);
  if (!normalizedRoute) {
    return null;
  }

  return {
    type: "gpx",
    name: createRouteSourceName({ profile, routeIndex, routeCount }),
    trackPointDetails: normalizedRoute.geometry.coordinates.map((coordinate) => ({
      lat: coordinate.lat,
      lon: coordinate.lon,
      elevation: null,
      timestamp: null,
    })),
    waypoints: [],
    routeSummary: {
      provider: normalizedRoute.provider,
      distanceMeters: normalizedRoute.distanceMeters,
      durationSeconds: normalizedRoute.durationSeconds,
      warnings: normalizedRoute.warnings,
    },
  }
}

export function createPhloemRequestBody({ profile, points, options = {} }) {
  return {
    profile,
    points: points.map((point) => ({
      lat: Number(point.lat),
      lon: Number(point.lon),
    })),
    options,
  };
}

export function createPhloemHeaders({ apiKey } = {}) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}