function distanceMeters(from, to) {
  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLon = toRadians(to.lon - from.lon);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getTrackDisplayName(track, trackIndex) {
  return track?.name || `Track #${trackIndex + 1}`;
}

export function countTrackPoints(source) {
  return (source?.tracks || []).reduce((total, track) =>
    total + (track.segments || []).reduce((segmentTotal, segment) => segmentTotal + segment.points.length, 0), 0);
}

export function getTrackPointEntries(source) {
  const entries = [];
  for (let trackIndex = 0; trackIndex < (source?.tracks || []).length; trackIndex += 1) {
    const track = source.tracks[trackIndex];
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex += 1) {
      const segment = track.segments[segmentIndex];
      for (let pointIndex = 0; pointIndex < segment.points.length; pointIndex += 1) {
        entries.push({ point: segment.points[pointIndex], locator: { trackIndex, segmentIndex, pointIndex } });
      }
    }
  }
  return entries;
}

export function getTrackModeCoordinates(track) {
  return (track?.segments || []).flatMap((segment) => segment.points.map((point) => [point.lat, point.lon]));
}

export function getTrackDistanceSummary(track) {
  let recordedDistanceMeters = 0;
  let inferredDistanceMeters = 0;
  let previousSegmentEnd = null;

  for (const segment of track?.segments || []) {
    const points = segment.points || [];
    if (points.length === 0) {
      continue;
    }
    if (previousSegmentEnd) {
      inferredDistanceMeters += distanceMeters(previousSegmentEnd, points[0]);
    }
    for (let index = 1; index < points.length; index += 1) {
      recordedDistanceMeters += distanceMeters(points[index - 1], points[index]);
    }
    previousSegmentEnd = points[points.length - 1];
  }

  return {
    recordedDistanceMeters,
    inferredDistanceMeters,
    totalDistanceMeters: recordedDistanceMeters + inferredDistanceMeters,
  };
}

export function getSourceDistanceSummary(source) {
  return (source?.tracks || []).reduce((summary, track) => {
    const trackSummary = getTrackDistanceSummary(track);
    return {
      recordedDistanceMeters: summary.recordedDistanceMeters + trackSummary.recordedDistanceMeters,
      inferredDistanceMeters: summary.inferredDistanceMeters + trackSummary.inferredDistanceMeters,
      totalDistanceMeters: summary.totalDistanceMeters + trackSummary.totalDistanceMeters,
    };
  }, { recordedDistanceMeters: 0, inferredDistanceMeters: 0, totalDistanceMeters: 0 });
}

export function getTrackModeProfile(track, trackIndex) {
  return getTrackModePointDetails(track, trackIndex).filter((point) => point.elevation !== null);
}

export function getTrackModePointDetails(track, trackIndex) {
  const profile = [];
  let previousPoint = null;
  let distanceFromStart = 0;

  for (let segmentIndex = 0; segmentIndex < (track?.segments || []).length; segmentIndex += 1) {
    const segment = track.segments[segmentIndex];
    for (let pointIndex = 0; pointIndex < segment.points.length; pointIndex += 1) {
      const point = segment.points[pointIndex];
      if (previousPoint) {
        distanceFromStart += distanceMeters(previousPoint, point);
      }
      profile.push({
        ...point,
        distanceMeters: distanceFromStart,
        locator: { trackIndex, segmentIndex, pointIndex },
      });
      previousPoint = point;
    }
  }
  return profile;
}

export function getNearestTrackModePoint(track, trackIndex, latlng) {
  const points = getTrackModePointDetails(track, trackIndex);
  if (!latlng || points.length === 0) {
    return points[0] || null;
  }

  let nearestPoint = points[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const deltaLat = point.lat - latlng.lat;
    const deltaLon = point.lon - latlng.lng;
    const distance = (deltaLat * deltaLat) + (deltaLon * deltaLon);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPoint = point;
    }
  }
  return nearestPoint;
}

export function getTrackModeElevationLayout(source) {
  let distanceOffsetMeters = 0;
  const tracks = (source?.tracks || []).map((track, trackIndex) => {
    const distanceSummary = getTrackDistanceSummary(track);
    const distanceStartMeters = distanceOffsetMeters;
    const distanceEndMeters = distanceStartMeters + distanceSummary.totalDistanceMeters;
    distanceOffsetMeters = distanceEndMeters;
    return {
      trackIndex,
      distanceStartMeters,
      distanceEndMeters,
      points: getTrackModeProfile(track, trackIndex).map((point) => ({
        ...point,
        profileDistanceMeters: distanceStartMeters + point.distanceMeters,
      })),
    };
  });

  return {
    totalDistanceMeters: distanceOffsetMeters,
    tracks,
  };
}

export function getSourceTimeline(source) {
  const timeline = [];
  let traversalIndex = 0;
  for (let trackIndex = 0; trackIndex < (source?.tracks || []).length; trackIndex += 1) {
    const track = source.tracks[trackIndex];
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex += 1) {
      const segment = track.segments[segmentIndex];
      for (let pointIndex = 0; pointIndex < segment.points.length; pointIndex += 1) {
        const point = segment.points[pointIndex];
        if (Number.isFinite(point.timestamp) && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
          timeline.push({ ...point, locator: { trackIndex, segmentIndex, pointIndex }, traversalIndex });
        }
        traversalIndex += 1;
      }
    }
  }
  return timeline;
}

export function getGlobalTimeline(sources) {
  let traversalIndex = 0;
  const timeline = (sources || []).flatMap((source) => {
    if (source?.type !== "gpx") {
      return [];
    }
    const points = getSourceTimeline(source);
    return points.map((point) => ({ ...point, traversalIndex: traversalIndex++ }));
  });
  return timeline.sort((left, right) => left.timestamp - right.timestamp || left.traversalIndex - right.traversalIndex);
}