// Geometry is projected once at a fixed zoom so a distance never moves on zoom.
export const DEFAULT_MAX_MARKERS = 100;
export const MAX_MARKERS_LIMIT = 1000;
const LABEL_SPACING = 90;
export const SPACING_PIXELS = Object.freeze({ small: 140, medium: 220, large: 320 });

export function niceInterval(minimum) {
  if (!Number.isFinite(minimum) || minimum <= 0) return Infinity;
  const unit = 10 ** Math.floor(Math.log10(minimum));
  return [1, 2, 5, 10].map(n => n * unit).find(n => n >= minimum);
}

export function buildSeries(track, samples, project) {
  let pixels = 0;
  const points = samples.map(sample => {
    const { segmentIndex, pointIndex } = sample.locator;
    const point = track.segments[segmentIndex].points[pointIndex];
    return { ...project({ lat: point.lat, lng: point.lon }, 0), distance: sample.distanceMeters };
  });
  for (let i = 1; i < points.length; i++) pixels += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return { points, pixels, total: points.at(-1)?.distance ?? 0 };
}

export function placeMarkers(series, zoom, spacingPixels = SPACING_PIXELS.medium, maxMarkers = DEFAULT_MAX_MARKERS) {
  const { points, total, pixels } = series;
  if (!(total > 0) || !(pixels > 0) || !Number.isFinite(zoom)) return [];
  const interval = niceInterval(Math.max(100, total / maxMarkers, spacingPixels * total / (pixels * 2 ** zoom)));
  const count = Math.min(maxMarkers, Math.floor(total / interval));
  const markers = [];
  for (let index = 1; index <= count; index++) {
    const distance = index * interval;
    // First endpoint at/after this threshold. No loop over meters or segment length.
    let low = 1, high = points.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (points[middle].distance < distance) low = middle + 1;
      else high = middle;
    }
    const a = points[low - 1], b = points[low];
    const fraction = (distance - a.distance) / (b.distance - a.distance);
    markers.push({ distance, x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
  }
  return markers;
}

export function visibleMarkers(markers, zoom, bounds = null) {
  const scale = 2 ** zoom;
  const accepted = [];
  for (const marker of markers) {
    if (bounds && (marker.x < bounds.left || marker.x > bounds.right || marker.y < bounds.top || marker.y > bounds.bottom)) continue;
    // Deterministic, cumulative-distance order; suppress labels on tight loops.
    if (accepted.some(p => Math.abs(p.x - marker.x) * scale < LABEL_SPACING && Math.abs(p.y - marker.y) * scale < 30)) continue;
    accepted.push(marker);
  }
  return accepted;
}

export function formatDistance(distance) {
  return distance >= 1000 ? `${distance / 1000} km` : `${distance} m`;
}
