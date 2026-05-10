import { FeatureGroup, Marker, Polyline, LatLngBounds } from "leaflet";

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : "-";
}

function formatDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "-";
  }
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(distanceMeters)} m`;
}

function formatElevation(elevation) {
  return Number.isFinite(elevation) ? `${Math.round(elevation)} m` : "-";
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

export function createPhotoThumbnailNode(photo, className = "tilia-photo-thumbnail") {
  if (!photo?.previewUrl) {
    return null;
  }

  const image = document.createElement("img");
  image.className = className;
  image.src = photo.previewUrl;
  image.alt = photo.name || "Photo";
  image.loading = "lazy";
  image.decoding = "async";
  return image;
}

function createPopupContent(title, rows, detail = "") {
  const root = document.createElement("div");
  root.className = "tilia-popup";

  const heading = document.createElement("div");
  heading.className = "tilia-popup-title";
  heading.textContent = title;
  root.appendChild(heading);

  const body = document.createElement("div");
  body.className = "tilia-popup-body";
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "tilia-popup-row";

    const labelNode = document.createElement("span");
    labelNode.className = "tilia-popup-label";
    labelNode.textContent = label;

    const valueNode = document.createElement("strong");
    valueNode.className = "tilia-popup-value";
    valueNode.textContent = value;

    row.appendChild(labelNode);
    row.appendChild(valueNode);
    body.appendChild(row);
  }
  root.appendChild(body);

  if (detail) {
    const detailNode = document.createElement("div");
    detailNode.className = "tilia-popup-detail";
    detailNode.textContent = detail;
    root.appendChild(detailNode);
  }

  return root;
}

function getNearestProfilePoint(profile, latlng) {
  if (!latlng || profile.length === 0) {
    return profile[0] || null;
  }

  let nearestPoint = profile[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of profile) {
    const deltaLat = point.lat - latlng.lat;
    const deltaLon = point.lon - latlng.lng;
    const distance = (deltaLat * deltaLat) + (deltaLon * deltaLon);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPoint = point;
    }
  }

  return nearestPoint;
}

function getNearestTrackPoint(trackPointDetails, latlng) {
  if (!latlng || trackPointDetails.length === 0) {
    return trackPointDetails[0] || null;
  }

  let nearestPoint = trackPointDetails[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of trackPointDetails) {
    const deltaLat = point.lat - latlng.lat;
    const deltaLon = point.lon - latlng.lng;
    const distance = (deltaLat * deltaLat) + (deltaLon * deltaLon);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPoint = point;
    }
  }

  return nearestPoint;
}

export function createWaypointPopupContent(sourceName, waypoint) {
  return createPopupContent(sourceName || "Waypoint", [
    ["Type", "Waypoint"],
    ["Name", waypoint?.name || "Unnamed waypoint"],
    ["Latitude", formatCoordinate(waypoint?.lat)],
    ["Longitude", formatCoordinate(waypoint?.lon)],
  ]);
}

export function createPhotoPopupContent(photo) {
  const camera = `${photo.make || ""} ${photo.model || ""}`.trim() || "-";
  const content = createPopupContent(photo.name || "Photo", [
    ["Captured", formatDateTime(photo.dateTimeOriginal)],
    ["Camera", camera],
    ["Latitude", formatCoordinate(photo.lat)],
    ["Longitude", formatCoordinate(photo.lon)],
    ["Location", photo.locationSource || "-"],
  ], photo.locationReason || photo.inferenceDetail || "");
  const thumbnail = createPhotoThumbnailNode(photo, "tilia-popup-thumbnail");
  if (thumbnail) {
    content.insertBefore(thumbnail, content.firstChild?.nextSibling || null);
  }
  return content;
}

export function createTrackPopupContent(parsed, latlng = null) {
  const trackPointDetails = parsed?.trackPointDetails || [];
  const nearestPoint = getNearestTrackPoint(trackPointDetails, latlng)
    || getNearestProfilePoint(parsed?.elevationProfile || [], latlng);
  return createTrackPointPopupContent(parsed, nearestPoint);
}

export function createTrackPointPopupContent(parsed, point) {
  const rows = [
    ["Type", "trkpt"],
    ["Track", parsed?.name || "Track"],
  ];

  if (point) {
    rows.push(["Distance", formatDistance(point.distanceMeters)]);
    rows.push(["Elevation", formatElevation(point.elevation)]);
    rows.push(["Time", formatDateTime(point.timestamp)]);
    rows.push(["Latitude", formatCoordinate(point.lat)]);
    rows.push(["Longitude", formatCoordinate(point.lon)]);
  } else {
    rows.push(["Track points", String(parsed?.trackPoints?.length || 0)]);
    rows.push(["Waypoints", String(parsed?.waypoints?.length || 0)]);
  }

  return createPopupContent(parsed?.name || "Track", rows);
}

export function buildGpxOverlay(parsed) {
  const group = new FeatureGroup();
  let trackLayer = null;
  const waypoints = [];

  if (parsed.trackPoints.length > 1) {
    trackLayer = new Polyline(parsed.trackPoints, {
      color: "#0f766e",
      weight: 4,
      opacity: 0.9,
    });
    group.addLayer(trackLayer);
  }

  for (const wpt of parsed.waypoints) {
    const marker = new Marker([wpt.lat, wpt.lon]);
    group.addLayer(marker);
    waypoints.push({
      layer: marker,
      waypoint: wpt,
    });
  }

  return {
    layer: group,
    interactions: {
      kind: "gpx",
      trackLayer,
      waypoints,
    },
  };
}

export function fitMapToGroup(map, group) {
  const bounds = group.getBounds();
  if (bounds instanceof LatLngBounds && bounds.isValid()) {
    map.fitBounds(bounds.pad(0.1));
  }
}

export function buildPhotoOverlay(photo) {
  const group = new FeatureGroup();
  const marker = new Marker([photo.lat, photo.lon]);
  group.addLayer(marker);
  return {
    layer: group,
    interactions: {
      kind: "photo",
      marker,
    },
  };
}
