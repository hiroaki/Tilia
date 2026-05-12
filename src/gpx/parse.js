function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

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

function getElements(node, tagName) {
  return Array.from(node.getElementsByTagNameNS("*", tagName));
}

function getFirstChild(node, tagName) {
  return getElements(node, tagName)[0] || null;
}

function parseTrackPoints(doc) {
  const trkpts = getElements(doc, "trkpt");
  const trackPoints = [];
  const trackPointDetails = [];
  const trackTimeline = [];
  const elevationProfile = [];
  let previousPoint = null;
  let cumulativeDistance = 0;

  for (const node of trkpts) {
    const lat = Number(node.getAttribute("lat"));
    const lon = Number(node.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const currentPoint = { lat, lon };
    if (previousPoint) {
      cumulativeDistance += distanceMeters(previousPoint, currentPoint);
    }
    previousPoint = currentPoint;

    trackPoints.push([lat, lon]);

    const timeNode = getFirstChild(node, "time");
    const rawTime = timeNode ? String(timeNode.textContent || "").trim() : "";
    let timestamp = null;
    if (rawTime) {
      timestamp = Date.parse(rawTime);
      if (Number.isFinite(timestamp)) {
        trackTimeline.push({
          timestamp,
          lat,
          lon,
        });
      }
    }

    const elevationNode = getFirstChild(node, "ele");
    const elevation = elevationNode ? Number(String(elevationNode.textContent || "").trim()) : Number.NaN;
    trackPointDetails.push({
      lat,
      lon,
      elevation: Number.isFinite(elevation) ? elevation : null,
      distanceMeters: cumulativeDistance,
      timestamp,
    });
    if (Number.isFinite(elevation)) {
      elevationProfile.push({
        lat,
        lon,
        elevation,
        distanceMeters: cumulativeDistance,
        timestamp,
      });
    }
  }

  trackTimeline.sort((a, b) => a.timestamp - b.timestamp);

  return {
    trackPoints,
    trackPointDetails,
    trackTimeline,
    elevationProfile,
  };
}

function parseWaypoints(doc) {
  const wpts = getElements(doc, "wpt");
  return wpts
    .map((node) => {
      const lat = Number(node.getAttribute("lat"));
      const lon = Number(node.getAttribute("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }
      const nameNode = getFirstChild(node, "name");
      return {
        lat,
        lon,
        name: nameNode ? nameNode.textContent : "",
      };
    })
    .filter(Boolean);
}

export function parseGpxText(xmlText, options = {}) {
  const {
    fileName = "track.gpx",
    createDomParser = () => new DOMParser(),
  } = options;
  const parseErrors = [];
  const parser = createDomParser({
    onError(message) {
      parseErrors.push(message);
    },
  });
  const doc = parser.parseFromString(xmlText, "application/xml");

  const parserError = doc.querySelector?.("parsererror") || getFirstChild(doc, "parsererror");
  if (parserError || parseErrors.length > 0) {
    throw new Error(`Invalid GPX XML: ${fileName}`);
  }

  const { trackPoints, trackPointDetails, trackTimeline, elevationProfile } = parseTrackPoints(doc);

  return {
    type: "gpx",
    name: fileName,
    trackPoints,
    trackPointDetails,
    trackTimeline,
    elevationProfile,
    waypoints: parseWaypoints(doc),
  };
}

export async function parseGpxFile(file) {
  const xmlText = await readText(file);
  return parseGpxText(xmlText, {
    fileName: file.name,
  });
}
