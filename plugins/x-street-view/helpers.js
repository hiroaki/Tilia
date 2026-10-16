export function normalizeCoordinate(value) {
  if (!Number.isFinite(value?.lat) || !Number.isFinite(value?.lng)
      || value.lat < -90 || value.lat > 90) return null;
  const lng = ((value.lng % 360) + 540) % 360 - 180;
  return Object.freeze({ lat: value.lat, lng });
}

export function normalizeHeading(value) {
  return Number.isFinite(value) ? ((value % 360) + 360) % 360 : null;
}

// Keep an unavailable tracker heading distinct from the effective viewing direction.
export function effectiveViewingHeading(trackerHeading) {
  return normalizeHeading(trackerHeading) ?? 0;
}

export function createStreetViewUrl(coordinate, heading) {
  const point = normalizeCoordinate(coordinate);
  if (!point) throw new TypeError("A valid Street View coordinate is required");
  const url = new URL("https://www.google.com/maps/@");
  url.searchParams.set("api", "1");
  url.searchParams.set("map_action", "pano");
  url.searchParams.set("viewpoint", `${point.lat},${point.lng}`);
  const bearing = effectiveViewingHeading(heading);
  url.searchParams.set("heading", String(bearing));
  return url.href;
}

// Place the panel outside the arrow tip using its measured, unrotated bounds.
export function streetViewButtonOffset(heading, width, height) {
  const bearing = effectiveViewingHeading(heading), gap = 8;
  const radians = bearing * Math.PI / 180;
  const x = Math.sin(radians), y = -Math.cos(radians);
  const clearance = Math.min(
    (width / 2 + gap) / Math.abs(x),
    (height / 2 + gap) / Math.abs(y),
  );
  return { x: x * (52 + clearance), y: y * (52 + clearance) };
}
