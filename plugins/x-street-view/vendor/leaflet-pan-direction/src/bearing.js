const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Calculates the initial geographic bearing from one coordinate to another.
 *
 * Coordinates must provide numeric `lat` and `lng` properties in degrees.
 * The returned heading is normalized to the range [0, 360).
 *
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @returns {number}
 */
export function calculateBearing(from, to) {
  const lat1 = from.lat * DEG_TO_RAD;
  const lat2 = to.lat * DEG_TO_RAD;
  const deltaLng = (to.lng - from.lng) * DEG_TO_RAD;

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  const bearing = Math.atan2(y, x) * RAD_TO_DEG;

  return (bearing + 360) % 360;
}
