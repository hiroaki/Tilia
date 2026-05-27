import { normalizeGpxSource } from "./source.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

export function serializeGpxSource(source, { creator = "Tilia" } = {}) {
  const normalized = normalizeGpxSource(source);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(creator)}" xmlns="http://www.topografix.com/GPX/1/1">`,
  ];

  for (const waypoint of normalized.waypoints) {
    lines.push(`  <wpt lat="${waypoint.lat}" lon="${waypoint.lon}">`);
    if (waypoint.name) {
      lines.push(`    <name>${escapeXml(waypoint.name)}</name>`);
    }
    lines.push("  </wpt>");
  }

  lines.push("  <trk>");
  lines.push(`    <name>${escapeXml(normalized.name)}</name>`);
  lines.push("    <trkseg>");

  for (const detail of normalized.trackPointDetails) {
    lines.push(`      <trkpt lat="${detail.lat}" lon="${detail.lon}">`);
    if (Number.isFinite(detail.elevation)) {
      lines.push(`        <ele>${detail.elevation}</ele>`);
    }
    const time = formatTimestamp(detail.timestamp);
    if (time) {
      lines.push(`        <time>${time}</time>`);
    }
    lines.push("      </trkpt>");
  }

  lines.push("    </trkseg>");
  lines.push("  </trk>");
  lines.push("</gpx>");
  return lines.join("\n");
}