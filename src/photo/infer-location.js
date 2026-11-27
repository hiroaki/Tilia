import { parseFixedOffsetMinutes } from "../core/photo-time-utils.js";

export class PhotoInferenceNoMatchError extends Error {
  constructor(message) { super(message); this.name = "PhotoInferenceNoMatchError"; }
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

function validPoint(point) {
  return Number.isFinite(point?.timestamp) && Math.abs(point.timestamp) <= 8.64e15
    && Number.isFinite(point.lat) && Number.isFinite(point.lon);
}

function considerBracket(best, a, b, timestamp) {
  if (!a) return;
  const left = timestamp - a.timestamp;
  const right = timestamp - b.timestamp;
  if (!((left > 0 && right < 0) || (left < 0 && right > 0))) return;
  const nearest = Math.min(Math.abs(left), Math.abs(right));
  const span = Math.abs(a.timestamp - b.timestamp);
  if (nearest < best.nearest || (nearest === best.nearest && span < best.span)) {
    best.nearest = nearest;
    best.span = span;
    best.before = left > 0 ? a : b;
    best.after = left > 0 ? b : a;
  }
}

function emptyBracket() {
  return { before: null, after: null, nearest: Infinity, span: Infinity };
}

function findTrackBracket(sources, timestamp) {
  const best = emptyBracket();
  for (const source of sources) {
    if (source?.type !== undefined && source.type !== "gpx") continue;
    for (const track of source?.tracks ?? []) {
      let previousEnd = null;
      for (const { points } of track.segments) {
        let previous = previousEnd;
        for (let index = 0; index < points.length; index++) {
          const point = points[index];
          if (!validPoint(point)) {
            if (index === 0) previous = null;
            continue;
          }
          if (point.timestamp === timestamp) return { before: point, after: point };
          considerBracket(best, previous, point, timestamp);
          previous = point;
        }
        // Only actual endpoints can bridge consecutive segments.
        const end = points.at(-1);
        previousEnd = validPoint(end) ? end : null;
      }
    }
  }
  return best;
}

function findTimelineBracket(points, timestamp) {
  const best = emptyBracket();
  const unlocated = emptyBracket();
  const previousByEntry = new Map();
  let hasLocators = false;
  let previousUnlocated;
  for (const point of points) {
    const locator = point?.locator;
    hasLocators ||= locator != null;
    if (!validPoint(point)) continue;
    if (point.timestamp === timestamp) return { before: point, after: point };
    if (locator == null) {
      considerBracket(unlocated, previousUnlocated, point, timestamp);
      previousUnlocated = point;
      continue;
    }
    const { entryId, trackIndex, segmentIndex } = locator;
    // Segment endpoints cannot be recovered from this filtered stream.
    const validEntryId = typeof entryId === "string" || (Number.isSafeInteger(entryId) && entryId >= 0);
    if (!validEntryId || ![trackIndex, segmentIndex].every(value => Number.isSafeInteger(value) && value >= 0)) continue;
    let previousBySegment = previousByEntry.get(entryId);
    if (!previousBySegment) {
      previousBySegment = new Map();
      previousByEntry.set(entryId, previousBySegment);
    }
    const key = `${trackIndex}:${segmentIndex}`;
    considerBracket(best, previousBySegment.get(key), point, timestamp);
    previousBySegment.set(key, point);
  }
  return hasLocators ? best : unlocated;
}

function inferPhotoLocationForMode(timeline, photo, mode) {
  const timestamp = toModeAdjustedTimestamp(photo?.dateTimeOriginal, mode);
  if (!Number.isFinite(timestamp)) {
    throw new PhotoInferenceNoMatchError(`No valid photo timestamp: ${photo?.name || "unknown"}`);
  }

  const { before, after } = timeline.sources
    ? findTrackBracket(timeline.sources, timestamp)
    : findTimelineBracket(timeline.points, timestamp);
  if (!before || !after) {
    throw new PhotoInferenceNoMatchError("Photo timestamp is outside GPX timeline range");
  }

  const inferred = interpolatePoint(before, after, timestamp);
  const totalSpan = after.timestamp - before.timestamp;
  const ratio = totalSpan === 0 ? 0 : (timestamp - before.timestamp) / totalSpan;

  return {
    inferredTimestamp: timestamp,
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

export function inferPhotoLocationFromTimeline(capturedTimeline, photo, options = {}) {
  const mode = options.timeInterpretationMode || "auto";

  const timeline = capturedTimeline;
  if (!timeline.sources && timeline.points.length === 0) {
    throw new PhotoInferenceNoMatchError("No GPX timeline data for inference");
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
      if (!(error instanceof PhotoInferenceNoMatchError)) throw error;
      errors.push(error);
    }
  }

  if (attempts.length === 0) {
    throw errors[0] || new PhotoInferenceNoMatchError("Photo timestamp is outside GPX timeline range");
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

export function inferPhotoLocationFromGpx(sources, photo, options = {}) {
  return inferPhotoLocationFromTimeline({ sources: sources ?? [] }, photo, options);
}
