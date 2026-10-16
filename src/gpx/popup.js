import { countTrackPoints } from "./interpretation.js";

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
  if (value == null) {
    return "-";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
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

function extraPointRows(point) {
  return [
    ...(Object.hasOwn(point ?? {}, "elevation") ? [["Elevation", formatElevation(point.elevation)]] : []),
    ...(Object.hasOwn(point ?? {}, "timestamp") ? [["Time", formatDateTime(point.timestamp)]] : []),
    ...(point?.description ? [["Description", point.description]] : []),
    ...(point?.symbol ? [["Symbol", point.symbol]] : []),
  ];
}

export function createWaypointPopupContent(sourceName, waypoint) {
  return createPopupContent(sourceName || "Waypoint", [
    ["Type", "Waypoint"],
    ["Name", waypoint?.name || "Unnamed waypoint"],
    ["Latitude", formatCoordinate(waypoint?.lat)],
    ["Longitude", formatCoordinate(waypoint?.lon)],
    ...extraPointRows(waypoint),
  ]);
}

export function createRoutePointPopupContent(source, routePoint, locator) {
  const routeIndex = locator?.routeIndex;
  const route = Number.isInteger(routeIndex) ? source?.routes?.[routeIndex] : null;
  return createPopupContent(source?.name || "Route point", [
    ["Type", "Route point"],
    ["Route", route?.name || (Number.isInteger(routeIndex) ? `Route #${routeIndex + 1}` : "Unnamed route")],
    ["Name", routePoint?.name || "Unnamed route point"],
    ["Latitude", formatCoordinate(routePoint?.lat)],
    ["Longitude", formatCoordinate(routePoint?.lon)],
    ...extraPointRows(routePoint),
  ]);
}

export function createTrackPointPopupContent(parsed, point) {
  const rows = [
    ["Type", "Track point"],
    ["Track", parsed?.name || "Track"],
  ];

  if (point) {
    rows.push(["Distance", formatDistance(point.distanceMeters)]);
    rows.push(["Elevation", formatElevation(point.elevation)]);
    rows.push(["Time", formatDateTime(point.timestamp)]);
    rows.push(["Latitude", formatCoordinate(point.lat)]);
    rows.push(["Longitude", formatCoordinate(point.lon)]);
    if (point.name) rows.push(["Name", point.name]);
    if (point.description) rows.push(["Description", point.description]);
    if (point.symbol) rows.push(["Symbol", point.symbol]);
  } else {
    rows.push(["Track points", String(countTrackPoints(parsed))]);
    rows.push(["Waypoints", String(parsed?.waypoints?.length || 0)]);
  }

  return createPopupContent(parsed?.name || "Track", rows);
}
