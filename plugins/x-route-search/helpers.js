import { isValidLatitude, isValidLongitude, parseCoordinateValue } from "./coordinates.js";
import { isKnownRouteProfileId, normalizeProfileId } from "./profiles.js";

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

function formatRouteNameDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return null;
  }
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(distanceMeters)}m`;
}

function formatRouteNameDuration(durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  const roundedMinutes = Math.max(1, Math.round(durationSeconds / 60));
  if (roundedMinutes < 60) {
    return `${roundedMinutes}min`;
  }
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
}

export function normalizeRouteResponse(payload, maxRoutes = 3) {
  const normalizedMaxRoutes = Number.isFinite(Number(maxRoutes))
    ? Math.max(0, Math.floor(Number(maxRoutes)))
    : 0;
  if (normalizedMaxRoutes === 0) {
    return [];
  }

  const routes = Array.isArray(payload?.routes)
    ? payload.routes
    : payload?.route
      ? [payload.route]
      : [];

  return routes
    .map(normalizeSingleRoute)
    .filter(Boolean)
    .slice(0, normalizedMaxRoutes);
}

function createRouteSourceName({ profile, routeIndex, routeCount, distanceMeters, durationSeconds }) {
  const suffix = routeCount > 1 ? ` ${routeIndex + 1}` : "";
  const details = [profile, formatRouteNameDistance(distanceMeters), formatRouteNameDuration(durationSeconds)]
    .filter(Boolean)
    .join("-");
  const detailSuffix = details ? ` (${details})` : "";
  return `Route${suffix}${detailSuffix}.gpx`;
}

function normalizeWaypointPoint(point) {
  const lat = parseCoordinateValue(point?.lat);
  const lon = parseCoordinateValue(point?.lon);
  if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
    return null;
  }
  return { lat, lon };
}

function buildRouteWaypoints(points = []) {
  return points
    .map((point, index) => {
      const normalizedPoint = normalizeWaypointPoint(point);
      if (!normalizedPoint) {
        return null;
      }

      let name = "Via";
      if (index === 0) {
        name = "Start";
      } else if (index === points.length - 1) {
        name = "Goal";
      } else {
        name = `Via ${index}`;
      }

      return {
        ...normalizedPoint,
        name,
      };
    })
    .filter(Boolean);
}

export function createImportedRouteSource(route, { profile = "", routeIndex = 0, routeCount = 1, waypoints = [] } = {}) {
  const normalizedRoute = normalizeSingleRoute(route);
  if (!normalizedRoute) {
    return null;
  }

  return {
    type: "gpx",
    name: createRouteSourceName({
      profile,
      routeIndex,
      routeCount,
      distanceMeters: normalizedRoute.distanceMeters,
      durationSeconds: normalizedRoute.durationSeconds,
    }),
    trackPointDetails: normalizedRoute.geometry.coordinates.map((coordinate) => ({
      lat: coordinate.lat,
      lon: coordinate.lon,
      elevation: null,
      timestamp: null,
    })),
    waypoints: buildRouteWaypoints(waypoints),
    routeSummary: {
      provider: normalizedRoute.provider,
      distanceMeters: normalizedRoute.distanceMeters,
      durationSeconds: normalizedRoute.durationSeconds,
      warnings: normalizedRoute.warnings,
    },
  }
}

export function createPhloemRequestBody({ profile, points, options = {} }) {
  const normalizedProfile = normalizeProfileId(profile);
  if (!isKnownRouteProfileId(normalizedProfile)) {
    throw new Error("Invalid route profile");
  }

  if (!Array.isArray(points)) {
    throw new Error("Route points must be an array");
  }

  const normalizedPoints = points.map((point, index) => {
    const lat = parseCoordinateValue(point?.lat);
    const lon = parseCoordinateValue(point?.lon);
    if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
      throw new Error(`Invalid route point at index ${index}`);
    }
    return { lat, lon };
  });

  return {
    profile: normalizedProfile,
    points: normalizedPoints,
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