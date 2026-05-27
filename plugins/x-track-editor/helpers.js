function padDateTimeSegment(value) {
  return String(value).padStart(2, "0");
}

export function formatTimestampForDateTimeLocal(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const date = new Date(value);
  return `${date.getFullYear()}-${padDateTimeSegment(date.getMonth() + 1)}-${padDateTimeSegment(date.getDate())}T${padDateTimeSegment(date.getHours())}:${padDateTimeSegment(date.getMinutes())}:${padDateTimeSegment(date.getSeconds())}`;
}

export function parseDateTimeLocalToTimestamp(value) {
  if (!value) {
    return null;
  }

  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hours, minutes, seconds = "00"] = match;
  const timestamp = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
    0,
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function createEditorSourceName(sourceName = "track.gpx") {
  const suffix = " (edited)";
  if (sourceName.toLowerCase().endsWith(".gpx")) {
    const base = sourceName.slice(0, -4);
    return `${base}${suffix}.gpx`;
  }
  return `${sourceName}${suffix}`;
}