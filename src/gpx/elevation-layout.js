// Profiles come from the semantic query; visual gaps never add distance/ascent.
export function elevationLayout(profiles, { width = 320, height = 160, padding = 8, gap = 4 } = {}) {
  const tracks = profiles.filter((p) => p.target.kind === "track");
  let minimum = null, maximum = null;
  for (const profile of tracks) {
    for (const { elevation } of profile.samples) {
      if (!Number.isFinite(elevation)) continue;
      if (minimum === null || elevation < minimum) minimum = elevation;
      if (maximum === null || elevation > maximum) maximum = elevation;
    }
  }
  const distances = tracks.map((p) => p.samples.at(-1)?.distanceMeters ?? 0);
  const weights = distances.map((d) => d > 0 ? d : 1), total = weights.reduce((a, b) => a + b, 0);
  const available = Math.max(1, width - 2 * padding - gap * Math.max(0, tracks.length - 1));
  const range = minimum === maximum ? 1 : maximum - minimum;
  let start = padding, ascent = 0;
  const points = [], strokes = [], spans = [];
  tracks.forEach((profile, index) => {
    const span = available * weights[index] / total; spans.push({ trackIndex: profile.target.trackIndex, start, end: start + span });
    let previous;
    for (const sample of profile.samples) {
      if (!Number.isFinite(sample.elevation)) { previous = null; continue; }
      const x = distances[index] > 0 ? start + span * sample.distanceMeters / distances[index] : start + span / 2;
      const y = minimum === maximum ? height / 2 : height - padding - (sample.elevation - minimum) / range * (height - padding * 2);
      const point = { ...sample, x, y, trackIndex: profile.target.trackIndex }; points.push(point);
      if (previous) {
        const inferred = sample.edgeKind === "inferred-gap";
        strokes.push({ from: previous, to: point, inferred, trackIndex: point.trackIndex });
        if (!inferred) ascent += Math.max(0, sample.elevation - previous.elevation);
      }
      previous = point;
    }
    start += span + gap;
  });
  return { points, strokes, spans, minimum, maximum, ascent, distanceMeters: distances.reduce((a, b) => a + b, 0), width, height };
}
export function nearestElevationSample(layout, x) {
  let match = null, delta = Infinity;
  for (const point of layout.points) { const distance = Math.abs(point.x - x); if (distance < delta) { delta = distance; match = point; } }
  return match;
}
