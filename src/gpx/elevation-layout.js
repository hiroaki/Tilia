// getElevationProfile supplies the same gap-inclusive distance axis in both modes.
export function elevationLayout(profiles, { mode = "track", width = 320, height = 160, padding = 8, gap = 4,
  paddingX = padding, paddingTop = padding, paddingBottom = padding } = {}) {
  const tracks = profiles.filter((p) => p.target.kind === "track");
  let minimum = null, maximum = null;
  for (const profile of tracks) {
    for (const { elevation } of profile.samples) {
      if (!Number.isFinite(elevation)) continue;
      if (minimum === null || elevation < minimum) minimum = elevation;
      if (maximum === null || elevation > maximum) maximum = elevation;
    }
  }
  const axisLengths = tracks.map((p) => p.samples.at(-1)?.distanceMeters ?? 0);
  const weights = axisLengths.map((d) => d > 0 ? d : 1), total = weights.reduce((a, b) => a + b, 0);
  const available = Math.max(1, width - 2 * paddingX - gap * Math.max(0, tracks.length - 1));
  const range = minimum === maximum ? 1 : maximum - minimum;
  let start = paddingX, ascent = 0, distanceMeters = 0;
  const points = [], strokes = [], spans = [];
  tracks.forEach((profile, index) => {
    const span = available * weights[index] / total; spans.push({ trackIndex: profile.target.trackIndex, start, end: start + span });
    let previous, previousAxisDistance = 0, trackDistance = 0;
    for (const sample of profile.samples) {
      const edgeKind = mode === "segment" && sample.edgeKind === "inferred-gap" ? "start" : sample.edgeKind;
      if (mode === "track") trackDistance = sample.distanceMeters;
      else if (edgeKind === "recorded") trackDistance += sample.distanceMeters - previousAxisDistance;
      previousAxisDistance = sample.distanceMeters;
      if (!Number.isFinite(sample.elevation)) { previous = null; continue; }
      const x = axisLengths[index] > 0 ? start + span * sample.distanceMeters / axisLengths[index] : start + span / 2;
      const y = minimum === maximum ? (paddingTop + height - paddingBottom) / 2
        : height - paddingBottom - (sample.elevation - minimum) / range * (height - paddingTop - paddingBottom);
      const point = { ...sample, edgeKind, distanceMeters: trackDistance, x, y, trackIndex: profile.target.trackIndex }; points.push(point);
      if (previous && edgeKind !== "start") {
        const inferred = edgeKind === "inferred-gap";
        strokes.push({ from: previous, to: point, inferred, trackIndex: point.trackIndex });
        if (!inferred) ascent += Math.max(0, sample.elevation - previous.elevation);
      }
      previous = point;
    }
    distanceMeters += trackDistance;
    start += span + gap;
  });
  return { points, strokes, spans, minimum, maximum, ascent, distanceMeters, width, height };
}
export function nearestElevationSample(layout, x) {
  let match = null, delta = Infinity;
  for (const point of layout.points) { const distance = Math.abs(point.x - x); if (distance < delta) { delta = distance; match = point; } }
  return match;
}
