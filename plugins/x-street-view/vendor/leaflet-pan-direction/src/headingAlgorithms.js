import { calculateBearing } from "./bearing.js";

const DEFAULT_MIN_SIGNIFICANT_MOVEMENT = 1;

/**
 * Returns the total sampled path length in projected pixels.
 */
function calculatePathLength(samples, endIndex = samples.length - 1) {
  let distance = 0;

  for (let index = 1; index <= endIndex; index += 1) {
    distance += pointDistance(
      samples[index - 1],
      samples[index],
    );
  }

  return distance;
}

/**
 * Returns the projected pixel distance between two samples.
 */
function pointDistance(a, b) {
  return Math.hypot(
    b.point.x - a.point.x,
    b.point.y - a.point.y,
  );
}

/**
 * Finds the final adjacent sample pair whose projected movement is at
 * least minMovement pixels.
 */
function findLastSignificantSegment(
  samples,
  minMovement = DEFAULT_MIN_SIGNIFICANT_MOVEMENT,
) {
  for (
    let index = samples.length - 1;
    index > 0;
    index -= 1
  ) {
    const from = samples[index - 1];
    const to = samples[index];

    if (pointDistance(from, to) >= minMovement) {
      return {
        from,
        to,
        fromIndex: index - 1,
        toIndex: index,
      };
    }
  }

  return null;
}

/**
 * Linearly interpolates the geographic coordinate between two samples.
 *
 * This is used only to locate a point within one short sampled segment.
 * The final heading itself is still calculated geographically by
 * calculateBearing().
 */
function interpolateLatLng(from, to, ratio) {
  return {
    lat:
      from.latlng.lat +
      (to.latlng.lat - from.latlng.lat) * ratio,
    lng:
      from.latlng.lng +
      (to.latlng.lng - from.latlng.lng) * ratio,
  };
}

/**
 * Heading from the beginning of the gesture to its final sample.
 *
 * This measures total displacement, not the final direction of travel.
 */
export function calculateWholeGestureHeading(samples) {
  if (samples.length < 2) {
    return null;
  }

  return calculateBearing(
    samples[0].latlng,
    samples.at(-1).latlng,
  );
}

/**
 * Heading over the final portion of the trajectory whose sampled path
 * length is `distance` projected pixels.
 *
 * The endpoint is the end of the last significant movement, so stationary
 * samples before dragend do not affect the result.
 *
 * When the requested distance boundary falls inside a sampled segment,
 * its geographic coordinate is interpolated so that the window represents
 * the requested distance rather than the nearest available sample.
 *
 * If the entire moving trajectory is shorter than `distance`, the start
 * of the gesture is used.
 */
export function calculateRecentDistanceHeading(
  samples,
  distance,
  {
    minMovement = DEFAULT_MIN_SIGNIFICANT_MOVEMENT,
  } = {},
) {
  if (!(distance > 0)) {
    return null;
  }

  const lastSegment = findLastSignificantSegment(
    samples,
    minMovement,
  );

  if (lastSegment === null) {
    return null;
  }

  const end = lastSegment.to;
  const endIndex = lastSegment.toIndex;

  let accumulatedDistance = 0;

  for (let index = endIndex; index > 0; index -= 1) {
    const from = samples[index - 1];
    const to = samples[index];
    const segmentDistance = pointDistance(from, to);

    if (segmentDistance === 0) {
      continue;
    }

    if (
      accumulatedDistance + segmentDistance >=
      distance
    ) {
      const distanceIntoSegment =
        distance - accumulatedDistance;

      /*
       * Walking backward from `to`, so convert the backward distance
       * into a forward interpolation ratio from `from` to `to`.
       */
      const ratio =
        1 - distanceIntoSegment / segmentDistance;

      const startLatLng = interpolateLatLng(
        from,
        to,
        ratio,
      );

      return calculateBearing(
        startLatLng,
        end.latlng,
      );
    }

    accumulatedDistance += segmentDistance;
  }

  return calculateBearing(
    samples[0].latlng,
    end.latlng,
  );
}

/**
 * Heading over the final `duration` milliseconds of actual movement.
 *
 * The time window ends at the final significant movement rather than at
 * dragend, so a stationary hold before pointer release does not consume
 * the window.
 *
 * If the moving gesture is shorter than the requested duration, the
 * gesture start is used.
 */
export function calculateRecentTimeHeading(
  samples,
  duration,
  {
    minMovement = DEFAULT_MIN_SIGNIFICANT_MOVEMENT,
  } = {},
) {
  if (!(duration > 0)) {
    return null;
  }

  const lastSegment = findLastSignificantSegment(
    samples,
    minMovement,
  );

  if (lastSegment === null) {
    return null;
  }

  const end = lastSegment.to;
  const endIndex = lastSegment.toIndex;
  const targetTime = end.time - duration;

  let candidate = samples[0];

  for (
    let index = endIndex - 1;
    index >= 0;
    index -= 1
  ) {
    candidate = samples[index];

    if (candidate.time <= targetTime) {
      break;
    }
  }

  if (pointDistance(candidate, end) < minMovement) {
    return null;
  }

  return calculateBearing(
    candidate.latlng,
    end.latlng,
  );
}

/**
 * Heading of the final significant adjacent sample pair.
 */
export function calculateLastSegmentHeading(
  samples,
  {
    minMovement = DEFAULT_MIN_SIGNIFICANT_MOVEMENT,
  } = {},
) {
  const segment = findLastSignificantSegment(
    samples,
    minMovement,
  );

  if (segment === null) {
    return null;
  }

  return calculateBearing(
    segment.from.latlng,
    segment.to.latlng,
  );
}

/**
 * Experimental adaptive algorithm.
 *
 * If the final significant segment accounts for at least `threshold`
 * of the total sampled path length, use that segment's heading.
 * Otherwise fall back to a recent-distance heading.
 *
 * Example:
 *
 *   threshold = 0.05
 *
 * means that Last Segment is used when its length is at least 5% of
 * the complete sampled trajectory.
 */
export function calculateAdaptiveHeading(
  samples,
  {
    threshold = 0.05,
    fallbackDistance = 40,
    minMovement = DEFAULT_MIN_SIGNIFICANT_MOVEMENT,
  } = {},
) {
  if (!(threshold >= 0) || !(fallbackDistance > 0)) {
    return null;
  }

  const lastSegment = findLastSignificantSegment(
    samples,
    minMovement,
  );

  if (lastSegment === null) {
    return null;
  }

  const totalDistance = calculatePathLength(
    samples,
    lastSegment.toIndex,
  );

  if (totalDistance === 0) {
    return null;
  }

  const lastSegmentDistance = pointDistance(
    lastSegment.from,
    lastSegment.to,
  );

  const lastSegmentRatio =
    lastSegmentDistance / totalDistance;

  if (lastSegmentRatio >= threshold) {
    return calculateBearing(
      lastSegment.from.latlng,
      lastSegment.to.latlng,
    );
  }

  return calculateRecentDistanceHeading(
    samples,
    fallbackDistance,
    {
      minMovement,
    },
  );
}

