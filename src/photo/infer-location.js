function flattenGpxTimeline(sources) {
  const timeline = [];

  for (const source of sources) {
    if (source?.type !== "gpx") {
      continue;
    }

    const points = Array.isArray(source.trackTimeline) ? source.trackTimeline : [];
    for (const point of points) {
      if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
        continue;
      }
      timeline.push(point);
    }
  }

  timeline.sort((a, b) => a.timestamp - b.timestamp);
  return timeline;
}

function toModeAdjustedTimestamp(dateValue, mode) {
  if (!(dateValue instanceof Date)) {
    return NaN;
  }

  if (mode === "local") {
    return dateValue.getTime();
  }

  const year = dateValue.getFullYear();
  const month = dateValue.getMonth();
  const day = dateValue.getDate();
  const hour = dateValue.getHours();
  const minute = dateValue.getMinutes();
  const second = dateValue.getSeconds();
  const ms = dateValue.getMilliseconds();

  if (mode === "jst") {
    return Date.UTC(year, month, day, hour - 9, minute, second, ms);
  }

  if (mode === "utc") {
    return Date.UTC(year, month, day, hour, minute, second, ms);
  }

  return dateValue.getTime();
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

function interpolatePoint(before, after, targetTimestamp) {
  if (after.timestamp === before.timestamp) {
    return {
      lat: before.lat,
      lon: before.lon,
    };
  }

  const ratio = (targetTimestamp - before.timestamp) / (after.timestamp - before.timestamp);
  return {
    lat: before.lat + (after.lat - before.lat) * ratio,
    lon: before.lon + (after.lon - before.lon) * ratio,
  };
}

export function inferPhotoLocationFromGpx(sources, photo, options = {}) {
  const mode = options.timeInterpretationMode || "local";
  const timestamp = toModeAdjustedTimestamp(photo?.dateTimeOriginal, mode);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`No valid photo timestamp: ${photo?.name || "unknown"}`);
  }

  const timeline = flattenGpxTimeline(sources);
  if (timeline.length < 2) {
    throw new Error("No GPX timeline data for inference");
  }

  let before = null;
  let after = null;
  for (const point of timeline) {
    if (point.timestamp <= timestamp) {
      before = point;
      continue;
    }
    after = point;
    break;
  }

  if (!before || !after) {
    throw new Error("Photo timestamp is outside GPX timeline range");
  }

  const inferred = interpolatePoint(before, after, timestamp);
  const totalSpan = after.timestamp - before.timestamp;
  const ratio = totalSpan === 0 ? 0 : (timestamp - before.timestamp) / totalSpan;

  return {
    lat: inferred.lat,
    lon: inferred.lon,
    locationSource: "gpx-time-inference",
    locationReason: `Inferred from GPX timeline using ${mode.toUpperCase()} photo time`,
    inferenceDetail: `photo=${formatTimestamp(timestamp)} between ${formatTimestamp(before.timestamp)} and ${formatTimestamp(after.timestamp)} ratio=${ratio.toFixed(3)}`,
    timeInterpretationMode: mode,
  };
}
