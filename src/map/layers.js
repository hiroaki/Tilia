import { FeatureGroup, Marker, Polyline, LatLngBounds } from "leaflet";
import { getTrackStylePreset } from "./track-style-presets.js";
import { countTrackPoints, getTrackModeCoordinates } from "../gpx/interpretation.js";

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
    rows.push(["Track points", String(countTrackPoints(parsed))]);
    rows.push(["Waypoints", String(parsed?.waypoints?.length || 0)]);
  }

  return createPopupContent(parsed?.name || "Track", rows);
}

export function buildGpxOverlay(parsed, options = {}) {
  const group = new FeatureGroup();
  const trackLayers = [];
  const waypoints = [];
  const trackStyle = options.trackStyle || getTrackStylePreset(0);

  for (let trackIndex = 0; trackIndex < (parsed.tracks || []).length; trackIndex += 1) {
    const coordinates = getTrackModeCoordinates(parsed.tracks[trackIndex]);
    if (coordinates.length < 2) continue;
    const layer = new Polyline(coordinates, trackStyle);
    group.addLayer(layer);
    trackLayers.push({ layer, trackIndex });
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
      trackLayers,
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
