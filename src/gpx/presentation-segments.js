// Keep original segment indices even when empty segments intervene.
export function* getTrackPresentationSegments(track, mode = "track") {
  let previousEnd = null;
  for (const [segmentIndex, segment] of (track?.segments ?? []).entries()) {
    const points = segment.points;
    if (!points.length) continue;
    yield { segmentIndex, points, gapFrom: mode === "track" ? previousEnd : null };
    previousEnd = points.at(-1);
  }
}
