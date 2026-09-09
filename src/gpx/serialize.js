import { normalizeGpxSource } from "./source.js";

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function formatTimestamp(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function serializeGpxSource(source, { creator = "Tilia" } = {}) {
  const normalized = normalizeGpxSource(source);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(creator)}" xmlns="http://www.topografix.com/GPX/1/1">`,
  ];
  for (const waypoint of normalized.waypoints) {
    lines.push(`  <wpt lat="${waypoint.lat}" lon="${waypoint.lon}">`);
    if (waypoint.name) lines.push(`    <name>${escapeXml(waypoint.name)}</name>`);
    lines.push("  </wpt>");
  }
  for (const track of normalized.tracks) {
    lines.push("  <trk>");
    if (track.name !== undefined) lines.push(`    <name>${escapeXml(track.name)}</name>`);
    for (const segment of track.segments) {
      lines.push("    <trkseg>");
      for (const point of segment.points) {
        lines.push(`      <trkpt lat="${point.lat}" lon="${point.lon}">`);
        if (point.elevation !== null) lines.push(`        <ele>${point.elevation}</ele>`);
        const time = formatTimestamp(point.timestamp);
        if (time) lines.push(`        <time>${time}</time>`);
        lines.push("      </trkpt>");
      }
      lines.push("    </trkseg>");
    }
    lines.push("  </trk>");
  }
  lines.push("</gpx>");
  return lines.join("\n");
}