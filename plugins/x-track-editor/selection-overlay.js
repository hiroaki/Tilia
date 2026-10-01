import { DivIcon, LayerGroup, Marker } from "leaflet";

const selectionIcon = new DivIcon({
  className: "tilia-track-editor-selection-ring",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export function createSelectionOverlay(map) {
  const group = new LayerGroup().addTo(map);

  return {
    sync(selectedPoints) {
      group.clearLayers();
      for (const { point } of selectedPoints) {
        new Marker([point.lat, point.lon], {
          icon: selectionIcon,
          interactive: false,
          keyboard: false,
          bubblingPointerEvents: false,
          zIndexOffset: 1000,
        }).addTo(group);
      }
    },
    destroy() {
      group.clearLayers();
      group.remove();
    },
  };
}
