import { normalizeGpxDocument } from "./document.js";

function escapeXml(value, field) {
  const text = String(value);
  for (const character of text) {
    const code = character.codePointAt(0);
    if (!(code === 9 || code === 10 || code === 13 || (code >= 0x20 && code <= 0xd7ff)
        || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff))) {
      throw new Error(`Invalid XML character in GPX ${field}`);
    }
  }
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function formatTimestamp(value, field) {
  if (value === null) return null;
  const date = new Date(value);
  if (!Number.isInteger(value) || !Number.isFinite(date.getTime())
      || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new Error(`GPX ${field} cannot be represented as an ISO timestamp`);
  }
  return date.toISOString();
}

export function formatGpxDecimal(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("GPX decimal must be finite");
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const [signedCoefficient, exponent] = text.toLowerCase().split("e");
  const negative = signedCoefficient.startsWith("-");
  const coefficient = negative ? signedCoefficient.slice(1) : signedCoefficient;
  const digits = coefficient.replace(".", "");
  const position = (coefficient.includes(".") ? coefficient.indexOf(".") : coefficient.length) + Number(exponent);
  const expanded = position <= 0 ? `0.${"0".repeat(-position)}${digits}`
    : position >= digits.length ? digits + "0".repeat(position - digits.length)
      : `${digits.slice(0, position)}.${digits.slice(position)}`;
  return `${negative ? "-" : ""}${expanded}`;
}

// Validate supported raw text before normalization can trim XML-invalid whitespace.
function validateText(source) {
  const check = (value, path, fields) => {
    for (const field of fields) if (value?.[field] != null) escapeXml(value[field], `${path}.${field}`);
  };
  check(source.metadata, "metadata", ["name", "description"]);
  for (const [ti, track] of (source.tracks ?? []).entries()) {
    check(track, `tracks[${ti}]`, ["name", "description"]);
    for (const [si, segment] of (track.segments ?? []).entries()) {
      for (const [pi, point] of (segment.points ?? []).entries()) {
        check(point, `tracks[${ti}].segments[${si}].points[${pi}]`, ["name", "description", "symbol"]);
      }
    }
  }
  for (const [ri, route] of (source.routes ?? []).entries()) {
    check(route, `routes[${ri}]`, ["name", "description"]);
    for (const [pi, point] of (route.points ?? []).entries()) check(point, `routes[${ri}].points[${pi}]`, ["name", "description", "symbol"]);
  }
  for (const [wi, point] of (source.waypoints ?? []).entries()) check(point, `waypoints[${wi}]`, ["name", "description", "symbol"]);
}

export function serializeGpxSource(source, { creator = "Tilia" } = {}) {
  const document = normalizeGpxDocument(source);
  validateText(source);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(creator, "creator")}" xmlns="http://www.topografix.com/GPX/1/1">`];
  const emit = (indent, tag, value, field) => {
    if (value !== null && value !== undefined && value !== "") lines.push(`${indent}<${tag}>${escapeXml(value, field)}</${tag}>`);
  };
  const names = (value, indent, path) => {
    emit(indent, "name", value.name, `${path}.name`);
    emit(indent, "desc", value.description, `${path}.description`);
  };
  const point = (value, indent, tag, path) => {
    lines.push(`${indent}<${tag} lat="${formatGpxDecimal(value.lat)}" lon="${formatGpxDecimal(value.lon)}">`);
    emit(`${indent}  `, "ele", value.elevation === null ? null : formatGpxDecimal(value.elevation), `${path}.elevation`);
    emit(`${indent}  `, "time", formatTimestamp(value.timestamp, `${path}.timestamp`), `${path}.timestamp`);
    names(value, `${indent}  `, path);
    emit(`${indent}  `, "sym", value.symbol, `${path}.symbol`);
    lines.push(`${indent}</${tag}>`);
  };
  if (document.metadata.name || document.metadata.description || document.metadata.timestamp !== null) {
    lines.push("  <metadata>");
    names(document.metadata, "    ", "metadata");
    emit("    ", "time", formatTimestamp(document.metadata.timestamp, "metadata.timestamp"), "metadata.timestamp");
    lines.push("  </metadata>");
  }
  document.waypoints.forEach((value, wi) => point(value, "  ", "wpt", `waypoints[${wi}]`));
  document.routes.forEach((route, ri) => {
    lines.push("  <rte>");
    names(route, "    ", `routes[${ri}]`);
    route.points.forEach((value, pi) => point(value, "    ", "rtept", `routes[${ri}].points[${pi}]`));
    lines.push("  </rte>");
  });
  document.tracks.forEach((track, ti) => {
    lines.push("  <trk>");
    names(track, "    ", `tracks[${ti}]`);
    track.segments.forEach((segment, si) => {
      lines.push("    <trkseg>");
      segment.points.forEach((value, pi) => point(value, "      ", "trkpt", `tracks[${ti}].segments[${si}].points[${pi}]`));
      lines.push("    </trkseg>");
    });
    lines.push("  </trk>");
  });
  lines.push("</gpx>");
  return lines.join("\n");
}
