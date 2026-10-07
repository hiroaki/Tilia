import { Marker } from "leaflet";
const isPhoto = (ref) => ref && ref.kind === "photo" && Object.keys(ref).length === 1;
export function createPhotoRenderer() {
  return Object.freeze({
    planChange: () => "replace",
    build(input) {
      const data = input.semanticSnapshot.data;
      const coordinate = data.coordinate ?? input.semanticSnapshot.derived.inferredLocation;
      if (!coordinate) return {};
      const point = Object.freeze({ lat: coordinate.lat, lng: coordinate.lon });
      const marker = new Marker(point, { title: data.name, alt: data.name || "Photo", keyboard: true });
      input.resources.own(marker, (value) => value.remove(), { label: "photo-marker", retry: "safe" });
      input.map.attachLayer(marker, { band: "markers" });
      const surface = input.interactions.createSurface({ id: "photo-marker", target: marker });
      input.interactions.bind({ id: "photo-select", surface, event: "click", resolve: () => ({ kind: "photo" }) });
      return { presentation: {
        anchor: (ref) => isPhoto(ref) ? point : null,
        bounds: (ref) => ref === undefined || isPhoto(ref) ? Object.freeze({ southWest: point, northEast: point }) : null,
        highlightDescriptor: (ref) => isPhoto(ref) ? Object.freeze({ kind: "point", point }) : null,
      } };
    },
  });
}
