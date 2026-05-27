export function makeFileName(name) {
  if (!name) {
    return "track.gpx";
  }
  return name.toLowerCase().endsWith(".gpx") ? name : `${name}.gpx`;
}