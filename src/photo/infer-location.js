import { parseFixedOffsetMinutes } from "../core/photo-time-utils.js";

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

  const fixedOffsetMinutes = parseFixedOffsetMinutes(mode);
  if (fixedOffsetMinutes !== null) {
    return Date.UTC(year, month, day, hour, minute, second, ms) - (fixedOffsetMinutes * 60_000);
  }

  if (mode === "utc") {
    return Date.UTC(year, month, day, hour, minute, second, ms);
  }

  throw new Error(`Invalid photo time mode: ${mode}`);
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

function inferPhotoLocationForMode(timeline, photo, mode) {
  const timestamp = toModeAdjustedTimestamp(photo?.dateTimeOriginal, mode);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`No valid photo timestamp: ${photo?.name || "unknown"}`);
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
    _nearestPointDistanceMs: Math.min(timestamp - before.timestamp, after.timestamp - timestamp),
    _segmentSpanMs: totalSpan,
  };
}

export function inferPhotoLocationFromGpx(sources, photo, options = {}) {
  const mode = options.timeInterpretationMode || "auto";

  const timeline = flattenGpxTimeline(sources);
  if (timeline.length < 2) {
    throw new Error("No GPX timeline data for inference");
  }

  if (mode !== "auto") {
    const explicitResult = inferPhotoLocationForMode(timeline, photo, mode);
    delete explicitResult._nearestPointDistanceMs;
    delete explicitResult._segmentSpanMs;
    return explicitResult;
  }

  const attempts = [];
  const errors = [];
  for (const candidateMode of ["local", "utc"]) {
    try {
      attempts.push(inferPhotoLocationForMode(timeline, photo, candidateMode));
    } catch (error) {
      errors.push(error);
    }
  }

  if (attempts.length === 0) {
    throw errors[0] || new Error("Photo timestamp is outside GPX timeline range");
  }

  attempts.sort((left, right) => {
    if (left._nearestPointDistanceMs !== right._nearestPointDistanceMs) {
      return left._nearestPointDistanceMs - right._nearestPointDistanceMs;
    }
    if (left._segmentSpanMs !== right._segmentSpanMs) {
      return left._segmentSpanMs - right._segmentSpanMs;
    }
    if (left.timeInterpretationMode === right.timeInterpretationMode) {
      return 0;
    }
    return left.timeInterpretationMode === "local" ? -1 : 1;
  });

  const best = attempts[0];
  delete best._nearestPointDistanceMs;
  delete best._segmentSpanMs;

  return {
    ...best,
    locationReason: `Inferred from GPX timeline using AUTO photo time resolved to ${best.timeInterpretationMode.toUpperCase()}`,
  };
}
